# Eigen limiet op de server-side bar-login

Status: **goedgekeurd door Bram (2026-09-30)**, inclusief waarden en teksten.
Gebouwd (2026-09-30, nog niet gemerged; zie "Zoals gebouwd"). **Aangevuld
na de tweede review (Bram, 2026-10-01):** atomair tellen (besloten 5); nog
niet gebouwd. Hoort bij
[ADR 0017](../adr/0017-beheer-eist-tweede-factor-en-eigen-loginlimiet.md) →
Beslissing 3. Vult [`dienst-per-sessie.md`](dienst-per-sessie.md) →
Veiligheid aan ("de rate limit (...) per gebruiker blijft gelden", vraag 25).

## Besloten (Bram, 2026-09-30)

1. **Een eigen limiet vóór Supabase.** CAPTCHA komt pas als dat nodig blijkt.
   `Sb-Forwarded-For` komt later, als Supabase het bevestigt.
2. **Wachtwoord en PIN tellen alleen foute pogingen.** Per IP: 5 foute per 10
   minuten, voor zowel het wachtwoord als de PIN. De overige waarden blijven
   zoals voorgesteld (tabel hieronder).
3. **De teksten zijn goedgekeurd**, ook de eigen tekst bij "vergeten" met
   limiet.
4. **De rolbadge gaat van de openbare namenlijst af** (zie Namenlijst zonder
   rol).
5. **Gelijktijdige verzoeken tellen correct** (2026-10-01). Lezen en daarna
   pas schrijven (`allowed` → poging → `record`) laat parallelle verzoeken
   allemaal door zolang er nog niets geschreven is: met 50 gelijktijdige
   foute wachtwoorden telt de limiet van 5 niet. Een poging wordt daarom in
   één functie atomair gereserveerd en weer vrijgegeven als de uitkomst niet
   telt (zie Functies). "Alleen foute pogingen tellen" blijft gelden.

## Aanleiding (geverifieerd in de code)

- **De wachtwoordlogin op de bar draait op de server.**
  `src/lib/barLogin.ts` → `loginMetWachtwoord` doet `signInWithPassword` op
  Vercel. GoTrue ziet dus het IP-adres van Vercel, niet dat van de
  gebruiker.
- **Eén limiet voor inloggen en verversen.** In GoTrue delen de
  password-grant en de refresh-token-grant dezelfde limiet per IP
  (`Token`-limiter, `token.go`). Een reeks foute wachtwoorden blokkeert dan
  twee dingen:
  - de andere wachtwoordlogins via de bar;
  - de token-verversing die `src/middleware.ts` (`getSession()`) op de
    server doet.
- **De PIN-login zit op een andere limiet.** Die gebruikt `/verify`, en een
  foute PIN bereikt GoTrue niet: `verify_bar_pin` weigert eerst.
- **De limiet grijpt niet bij wisselende IP's.** De IP's van Vercel
  wisselen. Bij spreiding over IP's grijpt de limiet van Supabase dus niet:
  geen rem op brute force tegen een wachtwoord. De namenlijst is openbaar,
  met rol.
- **`POST /inloggen/vergeten` heeft geen eigen limiet.** De verzonden mails
  tellen mee in het e-mailquotum van het hele project. Is dat op, dan komen
  uitnodigingen, herstelmails en portal-magic-links niet meer aan.

## Doel

Pogingen via de routes onder `src/app/(bar)/inloggen/` worden per gebruiker
en per lid geremd, vóór er een aanroep naar Supabase gaat. Zo blijft de
limiet van Supabase voor iedereen samen buiten bereik van één aanvaller.

## Betrokken shell

`shells/bar`, alleen de server-kant: de Route Handlers en
`src/lib/barLogin.ts`. Op het scherm verandert alleen de tekst bij
`rate_limited`. De portal-login en de `/beheer`-login lopen vanuit de
browser rechtstreeks naar GoTrue, en dan telt het IP van de gebruiker al.
Ze vallen buiten deze spec.

## Geldlaag en attributie

Niet geraakt.

## Datamodel (nieuwe migratie)

Tabel `login_throttle`:

| Kolom | Type | |
|---|---|---|
| `id` | `bigint generated always as identity` | PK |
| `bucket` | `text not null` | een van de buckets hieronder (`check`) |
| `key_hash` | `text not null` | sha256 (hex) van de sleutel: IP, `member_id` of `'*'` |
| `at` | `timestamptz not null default now()` | |

Index op `(bucket, key_hash, at)`.

- RLS aan, geen policies.
- `revoke all` voor `anon` en `authenticated`.
- `check:rls` eist een negatieve test.

Opschonen gebeurt met een `pg_cron`-job (patroon uit `0025`): rijen ouder dan
24 uur weg. Er staan geen ruwe IP-adressen in de tabel.

## Functies (alleen `service_role`)

Vervangt `login_throttle_allowed` en `login_throttle_record` (besloten, 5).
Die twee vervallen in de nieuwe migratie (`drop function`), zodat er geen
niet-atomaire weg overblijft.

```sql
login_throttle_reserve(p_buckets text[], p_keys text[])
  returns table (allowed boolean, reservation_ids bigint[])

login_throttle_release(p_reservation_ids bigint[])
  returns void
```

**`login_throttle_reserve`** controleert en reserveert in één transactie
alle buckets van één poging (bij het wachtwoord `wachtwoord_ip` en
`wachtwoord_lid` samen, bij "vergeten" alle drie). `p_buckets[i]` hoort bij
`p_keys[i]`.

1. **Invoer.** Beide arrays even lang, 1 tot 3 elementen, geen bucket
   dubbel, elke bucket bekend (`invalid_bucket`), elke sleutel niet leeg
   (`invalid_key`). Bereken per paar `key_hash` (sha256, zoals nu).
2. **Lock.** Per paar `pg_advisory_xact_lock(hashtextextended('login_throttle:'
   || bucket || ':' || key_hash, 0))`, in een vaste volgorde (gesorteerd op
   bucket, dan `key_hash`), zodat twee aanroepen met dezelfde paren elkaar
   niet deadlocken. Het lock geldt tot het einde van de transactie, dus tot
   de RPC klaar is. Een botsing van de hash betekent alleen dat twee
   sleutels even op elkaar wachten.
3. **Tellen.** Per paar de regel uit de tabel Buckets, over de rijen die er
   al staan, ook de voorlopige rijen van andere pogingen die nog lopen. De
   functie is `volatile` (de standaard) en telt ná het lock, in een eigen
   statement: onder `read committed` ziet die telling dan de rijen van de
   vorige houder van het lock.
4. **Uitkomst.** Is een van de buckets vol: `allowed = false`,
   `reservation_ids = '{}'`, en er wordt niets geschreven. Anders: per paar
   één rij (`at = now()`), `allowed = true` en de ids van die rijen.

**`login_throttle_release`** verwijdert de rijen met die ids. Onbekende of al
verwijderde ids zijn geen fout. Een lege array doet niets.

De limieten staan vast in de functie per bucket. Een aanroeper kiest dus
geen eigen waarde. `EXECUTE` gaat naar `service_role`, en wordt ingetrokken
voor `PUBLIC`, `anon` en `authenticated` (`0018`,
`rpc_execute_grants.test.sql`).

### Buckets en waarden (besloten, Bram 2026-09-30)

| Bucket | Sleutel | Telt | Weigert als |
|---|---|---|---|
| `wachtwoord_ip` | IP | foute wachtwoordpogingen | ≥ 5 in de laatste 10 minuten |
| `pin_ip` | IP | foute PIN-pogingen (`invalid_pin`) | ≥ 5 in de laatste 10 minuten |
| `wachtwoord_lid` | `member_id` | foute wachtwoordpogingen | ≥ 10 in de laatste 15 minuten **én** de laatste minder dan 1 minuut geleden (daarna één poging per minuut) |
| `vergeten_lid` | `member_id` | aanvragen | ≥ 1 in de laatste 15 minuten |
| `vergeten_ip` | IP | aanvragen | ≥ 5 in het laatste uur |
| `vergeten_totaal` | `'*'` | aanvragen | ≥ 20 in het laatste uur |

`wachtwoord_lid` is een rem, geen lockout. Een foute poging blokkeert het lid
nooit langer dan een minuut. Dat past bij vraag 25: een fout wachtwoord mag
iemand niet buitensluiten.

## Server-kant

### IP-adres

Een pure functie in `src/lib/`, met een unit-test: `clientIp(headers)`.

- Eerst `x-real-ip`, daarna de eerste waarde van `x-forwarded-for`. Op
  Vercel zet de proxy beide.
- Geen van beide geldig? Dan de sleutel `'onbekend'` (lokaal en in CI).
- **Te controleren op productie:** dat Vercel deze headers overschrijft en
  de client ze niet kan meesturen.

De Route Handler leest de headers en geeft het IP door aan `barLogin.ts`.
Alle databasetoegang blijft in `src/lib/` (`check:policy`).

### `POST /inloggen/wachtwoord`

1. Reserveer `wachtwoord_ip` en `wachtwoord_lid`
   (`login_throttle_reserve`). Geweigerd: `{ ok: false, code:
   'rate_limited' }`, zonder aanroep naar Supabase.
2. Zoals nu: `signInWithPassword`.
3. Bij `invalid_credentials` blijft de reservering staan: die telt als foute
   poging. Bij elke andere uitkomst (geslaagd, `not_allowed`, `no_account`,
   `unknown`, een uitzondering) volgt `login_throttle_release` met de ids,
   ook in een `finally`-pad.

### `POST /inloggen/vergeten`

1. Reserveer `vergeten_lid`, `vergeten_ip` en `vergeten_totaal`. Geweigerd:
   geen mail, en het antwoord `{ ok: true, limited: true }`. Het scherm
   toont dan de eigen tekst uit Teksten.
2. Anders verstuur zoals nu. De reservering blijft staan: hier telt elke
   aanvraag, er is geen `release`. Het antwoord blijft
   neutraal (ADR 0013), ook voor een lid zonder account: de teller gaat over
   aanvragen, niet over accounts.

### `POST /inloggen/pin`

1. Zoals nu: eerst het apparaatcookie en het formaat van de PIN.
2. Reserveer `pin_ip`. Geweigerd: `{ ok: false, code: 'rate_limited' }`,
   zonder `verify_bar_pin`. Er is dus geen poging op de lockout per lid.
3. Zoals nu: `verify_bar_pin`.
4. Bij `result_code = 'invalid_pin'` blijft de reservering staan.
   `pin_locked`, `pin_not_available`, `pin_needs_mfa`, een geslaagde login,
   een fout en een uitzondering geven `login_throttle_release`.

De lockout per lid (5 foute PIN's) en "alleen op een vertrouwd apparaat"
blijven bestaan (vraag 25). `pin_ip` remt daarbovenop iemand die op één
vertrouwd apparaat de PIN's van meerdere leden probeert.

## Randgevallen

- **Een hele bar achter één IP (wifi van de vereniging).** `wachtwoord_ip`
  telt alleen foute pogingen. Vijf tikfouten in tien minuten blokkeren het
  wachtwoord op de hele bar voor de rest van die tien minuten. Voor de PIN
  (`pin_ip`) geldt hetzelfde, apart geteld. Het ene blokkeert het andere
  niet.
- **Lokaal en in CI:** alle verzoeken hebben de sleutel `'onbekend'`. Een
  e2e-test die foute wachtwoorden probeert, kan de rest van de run raken. De
  Developer maakt de tabel leeg in de setup van die test.
- **De limiet van Supabase blijft eronder.** Wordt die toch geraakt, dan
  blijft `rate_limited` de code, zoals nu.
- **`pg_cron` draait niet:** de tabel groeit, maar de limiet werkt nog
  (telling per venster).
- **Gelijktijdige pogingen (besloten, 5):** het lock zet ze achter elkaar.
  Bij een limiet van 5 komen er hooguit 5 door, ook bij 50 tegelijk.
- **Een poging die nog loopt, telt voor de andere mee.** Een tweede,
  terechte poging kan dus `rate_limited` krijgen terwijl de eerste nog
  wacht op Supabase, als de bucket op één na vol is. Dat venster duurt zo
  lang als één login; voorzichtig, en acceptabel.
- **`release` mislukt** (netwerk, database): de rij blijft staan en telt
  als foute poging tot ze uit het venster valt. Dat wordt gelogd, en de
  gebruiker krijgt gewoon de uitkomst van zijn poging. Mislukt `reserve`,
  dan gooit de login (de route geeft `unknown`), zoals nu bij het lezen.

## Tests

- **pgTAP:**
  - elke bucket weigert bij de grens en laat eronder door;
  - een geweigerde `reserve` schrijft geen rij, ook niet in de buckets die
    nog ruimte hadden;
  - `release` verwijdert alleen de opgegeven rijen, en een vrijgegeven
    reservering telt niet meer;
  - `reserve` weigert ongelijke arrays, een dubbele of onbekende bucket en
    een lege sleutel;
  - de oude `login_throttle_allowed`/`login_throttle_record` bestaan niet
    meer;
  - `wachtwoord_lid` laat na een minuut weer één poging door;
  - de functies zijn niet uitvoerbaar voor `anon`/`authenticated`;
  - de tabel is niet leesbaar of schrijfbaar voor `anon`/`authenticated`
    (negatieve test, `check:rls`).
- **Unit:** `clientIp` (header-volgorde, lijst in `x-forwarded-for`,
  ongeldige waarde). In `test/barLogin.test.ts`: per uitkomst van
  wachtwoord en PIN wel of geen `release` (alleen `invalid_credentials` en
  `invalid_pin` houden de reservering), en "vergeten" nooit.
- **Gelijktijdigheid:** pgTAP kan geen twee sessies tegelijk draaien. Het
  bewijs is daarom: een test die het lock zichtbaar maakt (na `reserve` in
  een open transactie staat er een advisory lock op de verwachte sleutel in
  `pg_locks`), plus de Reviewer die nagaat dat tellen en schrijven na het
  lock in dezelfde functie gebeuren. Kan de Developer een test met twee
  verbindingen toevoegen (bijv. in `test/` tegen de lokale database), dan
  graag, maar geen eis.
- **e2e (gemockt of met een lege tabel):**
  - na 5 foute wachtwoorden de tekst bij `rate_limited`;
  - na 5 foute PIN's (verdeeld over twee leden, zodat de lockout per lid niet
    eerst grijpt) dezelfde tekst;
  - de namenlijst toont geen rol.

## Expliciet buiten scope

- **CAPTCHA** (Turnstile/hCaptcha): pas als dit niet genoeg blijkt.
- **`Sb-Forwarded-For`:** pas als Supabase bevestigt dat het gehoste project
  de header alleen bij de secret key doorlaat. Dan komt er een extra header
  op de server-client, en blijft deze limiet staan.
- **Een limiet op de portal- en `/beheer`-login:** die lopen vanuit de
  browser, dus de limiet per IP van Supabase grijpt daar al.

## Teksten (goedgekeurd door Bram, 2026-09-30)

| Plek | Was | Wordt |
|---|---|---|
| Inlogscherm, `rate_limited` (wachtwoord en PIN, `INLOGGEN.foutRateLimit`) | te veel pogingen — wacht even en probeer het opnieuw | te veel foute pogingen — probeer het over een paar minuten opnieuw |
| Wachtwoord vergeten, `limited` | (bestaat niet) | Er is net al een herstellink aangevraagd. Kijk in je mail, of probeer het over een kwartier opnieuw. |

De tekst bij "vergeten" zegt niets over het bestaan van een account. Hij
verschijnt ook voor een lid zonder account, omdat de teller over aanvragen
gaat.

## Namenlijst zonder rol (besloten, 4)

De openbare namenlijst verklapt niet meer wie beheerder is.

- **`leesNamenlijst`** (`src/lib/barLogin.ts`) selecteert en geeft alleen `id`
  en `name`. Het filter op rol (`bardienst`, `beheerder`) en niet-gearchiveerd
  blijft server-side.
- **`BarNaam`** (`src/lib/barLoginTypes.ts`) wordt `{ id, name }`.
- **`GET /inloggen/namen`** geeft `{ ok, namen: [{ id, name }] }`.
- **`StaffPicker`** (`src/features/dienst-starten/StaffPicker.tsx`, nu alleen
  nog gebruikt door `BarInloggen`):
  - neemt `{ id, name }[]` in plaats van `BarStaffMember[]`;
  - toont geen `RoleBadge` meer;
  - krijgt als `aria-label` alleen de naam.
- **`RoleBadge` en `ROLE_LABELS`** blijven bestaan zolang ze elders gebruikt
  worden. Zijn ze daarna ongebruikt, dan verwijdert de Developer ze.
- **De rest van de login heeft de rol niet nodig.** De inlogopties, de PIN
  (`pin_needs_mfa`) en de wachtwoordlogin kijken server-side naar de rol.
- **Gevolg:** `bar_login_options` geeft `pin_needs_mfa` alleen op een
  vertrouwd apparaat (zonder apparaatcookie is het antwoord altijd "alleen
  wachtwoord"). De rol lekt dus alleen daar, aan wie op dat apparaat al is
  ingelogd geweest. Acceptabel.
- **Tests:** e2e en unit die op de rolbadge in de namenlijst leunen, gaan mee.
  Een test controleert dat de API geen `role` teruggeeft.

## Zoals gebouwd (2026-09-30)

*De punten hieronder gaan over de bouw van 2026-09-30. Besloten 5
(2026-10-01) vervangt `login_throttle_allowed`/`login_throttle_record` door
`reserve`/`release`; de Developer werkt dit bij na de bouw.*

- **Migratie `0035_login_throttle.sql`**: de tabel, `login_throttle_allowed`,
  `login_throttle_record` (alleen `service_role`) en `purge_login_throttle`
  (voor geen API-rol, `pg_cron` elk uur op minuut 23). De sha256 van de
  sleutel rekent de database uit (`pgcrypto`); een lege sleutel of een
  onbekende bucket geeft `invalid_key`/`invalid_bucket`.
- **Volgorde in `src/lib/barLogin.ts`.** De limiet komt vóór elke andere
  aanroep: bij het wachtwoord vóór het opzoeken van het lid, bij de PIN na
  het apparaatcookie en het formaat en vóór `verify_bar_pin`, bij "vergeten"
  vóór alles. Kan de limiet niet gelezen worden, dan gooit de login (de route
  geeft `unknown`); mislukt alleen het registreren, dan wordt dat gelogd en
  krijgt de gebruiker de uitkomst van zijn poging.
- **`clientIp`** staat in `src/lib/clientIp.ts` en gebruikt `node:net` om een
  IP-adres te herkennen.
- **e2e.** De UI-tests (`e2e/login-rate-limit.spec.ts`) mocken de routes
  onder `/inloggen/`: in CI delen alle verzoeken de sleutel `'onbekend'`, en
  echte foute pogingen zouden de rest van de run blokkeren. Er is dus geen
  tabel om leeg te maken. De telling zelf bewijzen
  `supabase/tests/login_throttle.test.sql` en `test/barLogin.test.ts`. Eén
  live test leest `GET /inloggen/namen` en controleert dat er geen `role` in
  staat.
- **`RoleBadge` en `ROLE_LABELS`** blijven: `BezettingOverlay` en
  `LidBestellingenOverlay` gebruiken ze nog.
