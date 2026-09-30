# Eigen limiet op de server-side bar-login

Status: **concept.** De keuzes zijn gemaakt door Bram (2026-09-30): een eigen
limiet met de voorgestelde waarden, CAPTCHA pas als het nodig blijkt, en
`Sb-Forwarded-For` later als Supabase het bevestigt. Er zijn nog open vragen
(onderaan) en de teksten wachten op goedkeuring. Hoort bij
[ADR 0017](../adr/0017-beheer-eist-tweede-factor-en-eigen-loginlimiet.md) →
Beslissing 3. Vult [`dienst-per-sessie.md`](dienst-per-sessie.md) →
Veiligheid aan: "de rate limit (...) per gebruiker blijft gelden" en vraag
25. Dat bestand wordt nu niet gewijzigd; zie "Later door te voeren" in
[`beheer-tweede-factor.md`](beheer-tweede-factor.md).

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

- `login_throttle_allowed(p_bucket text, p_key text) returns boolean` leest
  alleen, en schrijft niet.
- `login_throttle_record(p_bucket text, p_key text) returns void` voegt een
  rij toe.

De limieten staan vast in de functie per bucket. Een aanroeper kiest dus
geen eigen waarde. `EXECUTE` gaat naar `service_role`, en wordt ingetrokken
voor `PUBLIC`, `anon` en `authenticated` (`0018`,
`rpc_execute_grants.test.sql`).

### Buckets en waarden (besloten, Bram 2026-09-30)

| Bucket | Sleutel | Telt | Weigert als |
|---|---|---|---|
| `wachtwoord_ip` | IP | foute wachtwoordpogingen (zie open vraag 1) | ≥ 10 in de laatste 15 minuten |
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

1. Controleer `wachtwoord_ip` en `wachtwoord_lid`. Een van beide vol:
   `{ ok: false, code: 'rate_limited' }`, zonder aanroep naar Supabase.
2. Zoals nu: `signInWithPassword`.
3. Bij `invalid_credentials`: registreer in beide buckets. Een geslaagde
   login of een andere fout telt niet.

### `POST /inloggen/vergeten`

1. Controleer `vergeten_lid`, `vergeten_ip` en `vergeten_totaal`. Een van de
   drie vol: geen mail, en het antwoord `{ ok: true, limited: true }` (zie
   Teksten en open vraag 2).
2. Anders registreer in alle drie en verstuur zoals nu. Het antwoord blijft
   neutraal (ADR 0013), ook voor een lid zonder account: de teller gaat over
   aanvragen, niet over accounts.

### `POST /inloggen/pin`

Geen eigen bucket. De lockout per lid (5 foute PIN's) en "alleen op een
vertrouwd apparaat" blijven de rem (vraag 25). Een PIN-bucket per IP is
genoemd maar niet besloten; zie open vraag 3.

## Randgevallen

- **Een hele bar achter één IP (wifi van de vereniging).** `wachtwoord_ip`
  telt alleen foute pogingen. Tien tikfouten in een kwartier blokkeren het
  wachtwoord op de hele bar voor de rest van dat kwartier. De PIN-login werkt
  dan nog wel.
- **Lokaal en in CI:** alle verzoeken hebben de sleutel `'onbekend'`. Een
  e2e-test die foute wachtwoorden probeert, kan de rest van de run raken. De
  Developer maakt de tabel leeg in de setup van die test.
- **De limiet van Supabase blijft eronder.** Wordt die toch geraakt, dan
  blijft `rate_limited` de code, zoals nu.
- **`pg_cron` draait niet:** de tabel groeit, maar de limiet werkt nog
  (telling per venster).

## Tests

- **pgTAP:**
  - elke bucket weigert bij de grens en laat eronder door;
  - `wachtwoord_lid` laat na een minuut weer één poging door;
  - de functies zijn niet uitvoerbaar voor `anon`/`authenticated`;
  - de tabel is niet leesbaar of schrijfbaar voor `anon`/`authenticated`
    (negatieve test, `check:rls`).
- **Unit:** `clientIp` (header-volgorde, lijst in `x-forwarded-for`,
  ongeldige waarde).
- **e2e (gemockt of met een lege tabel):** na 10 foute wachtwoorden de tekst
  bij `rate_limited`.

## Expliciet buiten scope

- **CAPTCHA** (Turnstile/hCaptcha): pas als dit niet genoeg blijkt.
- **`Sb-Forwarded-For`:** pas als Supabase bevestigt dat het gehoste project
  de header alleen bij de secret key doorlaat. Dan komt er een extra header
  op de server-client, en blijft deze limiet staan.
- **Een limiet op de portal- en `/beheer`-login:** die lopen vanuit de
  browser, dus de limiet per IP van Supabase grijpt daar al.
- **Een PIN-bucket per IP:** open vraag 3.

## Teksten (voorstel, ter goedkeuring)

| Plek | Nu | Voorstel |
|---|---|---|
| Inlogscherm, `rate_limited` (wachtwoord) | te veel pogingen — wacht even en probeer het opnieuw | te veel foute pogingen — probeer het over een paar minuten opnieuw |
| Wachtwoord vergeten, `limited` | (bestaat niet) | Er is net al een herstellink aangevraagd. Kijk in je mail, of probeer het over een kwartier opnieuw. |

De tekst bij "vergeten" zegt niets over het bestaan van een account. Hij
verschijnt ook voor een lid zonder account, omdat de teller over aanvragen
gaat.

## Open vragen voor Bram

1. **"10 per IP per 15 minuten":** ik lees dat als 10 **foute**
   wachtwoordpogingen, zodat een wisseling van dienst met veel geslaagde
   logins de bar niet blokkeert. Klopt dat, of bedoel je alle pogingen?
2. **Tekst bij `rate_limited` en bij "vergeten" met limiet:** goedkeuren of
   aanpassen (tabel hierboven). En bij "vergeten": de nieuwe tekst tonen, of
   altijd de gewone bevestiging ("Als er een account bij je naam hoort, is de
   mail onderweg.") ook als er niets is verstuurd?
3. **Een PIN-bucket per IP**, bovenop de lockout per lid: wel of niet, en zo
   ja welke waarde?
4. **Rolbadge op de openbare namenlijst:** `GET /inloggen/namen` geeft de rol
   mee, en `StaffPicker` toont die. Daarmee zijn beheerders als doelwit te
   herkennen. Blijft de badge (jouw eerdere keuze, vraag 5), of gaat de rol
   van het startscherm af?
