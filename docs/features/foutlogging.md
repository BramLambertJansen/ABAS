# Foutlogging (client-fouten centraal i.p.v. alleen in de browserconsole)

Spec voor [issue #94](https://github.com/BramLambertJansen/ABAS/issues/94).
Volgt op [#68](https://github.com/BramLambertJansen/ABAS/issues/68) (PR #93,
`src/lib/loadErrors.ts`); aanleiding is incident
[#67](https://github.com/BramLambertJansen/ABAS/issues/67) (migratie 0019
ontbrak in productie, PostgREST gaf een schemafout).

**Status: Goedgekeurd door Bram (2026-09-28). Gebouwd en gemerged (PR #98,
2026-09-28).** Waar de bouw afwijkt van of invulling geeft aan de spec:
zie "Zoals gebouwd" onderaan.

## Probleem

Sinds #93 toont elke lees-hook een korte foutcode op het scherm, maar de
ruwe fout gaat alleen naar `console.error` (44 aanroepen in
`src/hooks/queries/`), en op een bar-tablet kijkt niemand in die console.
Doel: een fout die een lid of bardienst ziet, is ook zonder melding terug te
vinden — welke hook, welke code, welke build, wanneer.

## Besloten door Bram (2026-09-28)

1. **Bestemming: Supabase-tabel + insert-RPC** (was optie B). Bram koos eerst
   A (Route Handler → Vercel-logs), tot bleek dat productie op Vercel
   **Hobby** draait: runtime-logs ~1 uur, geen log drains. Een fout van
   vrijdagavond is maandag weg, dus A is bijna waardeloos. Het nadeel van B
   blijft: de log deelt het foutdomein met Supabase. Een totale storing of
   een ontbrekende migratie van déze tabel wordt niet gelogd; een
   #67-achtige fout in een *andere* tabel of functie wel.
2. **Geen `message`.** Eerst besloten als "alleen bij schemafouten,
   afgekapt", herzien na review (PR #96): elke ingelogde gebruiker kan de
   RPC zelf aanroepen met een nep-code als `42P01` en vrije tekst (e-mail,
   saldo) in `message` zetten. Een door de client aangeleverde code bewijst
   niet dat de tekst uit een echte schemafout komt. Zonder vrij tekstveld
   klopt "geen PII" wel. Bij een schemafout staan hook en code in de log;
   de details reproduceer je lokaal.
3. **Reikwijdte: lees- én schrijf-hooks, inclusief `usePlaceOrder`/`useTopUp`**,
   alleen onverwachte fouten. Domeinuitkomsten die een RPC bewust teruggeeft
   (`insufficient_balance`, `product_not_available`, `served_by_not_in_roster`
   en dergelijke) zijn geen fout en worden niet gelogd.
4. **Dedupe aan de clientkant**, per (hook, kind, code), venster van 5 minuten, met
   een telling.
5. **`check:policy`-regel "geen kale `console.error` in `src/hooks/queries/`"
   komt mee.**
6. **Retentie: 90 dagen, opruimen via `pg_cron`.** Automatisch, omdat
   handmatig opruimen bij een vrijwilligersclub er niet van komt.
7. **Lezen: alleen Supabase Studio.** Geen leesscherm en geen lees-RPC.
   Een beheerscherm komt pas als Studio in de praktijk te omslachtig blijkt,
   en is dan een aparte feature met een eigen spec.

**Gevolg van 1 (geen nieuwe beslissing):** de RPC is, zoals elke RPC sinds
0018, alleen voor `authenticated`. Fouten van vóór het inloggen worden niet
gelogd en de auth-hooks vallen buiten scope. Bram's "ja" op een sessieloos
endpoint gold voor A en vervalt; `anon` krijgt geen `EXECUTE`.

## Betrokken shell(s)

Beide, via één helper in `src/lib/` die de hooks aanroepen. Geen UI-wijziging;
features en shells merken niets.

## Datamodel — migratie `0025_client_errors.sql`

Tabel `client_errors`, append-only. Alleen allowlist-velden:

| Kolom | Type / grens | Bron |
|---|---|---|
| `id` | `bigint generated always as identity`, pk | db |
| `created_at` | `timestamptz not null default now()` | db (servertijd, niet de klok van de tablet) |
| `hook` | `text not null`, `^use[A-Za-z]{1,60}$` | client; `usePortal*` impliceert de portal, dus geen aparte shell-kolom |
| `kind` | `text not null`, `in ('network','server')` | `classifyLoadError` |
| `code` | `text null`, zelfde regex als `SAFE_CODE_RE` | `classifyLoadError` |
| `path` | `text not null`, `^/[a-z/-]{0,100}$` (geen cijfers, `@` of `.`; geen app-route heeft een dynamisch segment met een id) | `location.pathname`, zonder query-string |
| `occurrences` | `int not null`, 1–10000 | dedupe-telling |
| `build` | `text null`, `^[0-9a-f]{7,40}$` | `NEXT_PUBLIC_BUILD_SHA`, in `next.config.mjs` expliciet gezet uit `process.env.VERCEL_GIT_COMMIT_SHA` (niet vertrouwen op Vercels automatische `NEXT_PUBLIC_`-variant, die is een projectinstelling); leeg lokaal/CI |

Bewust **geen** kolom voor `auth.uid()`, member-id, naam, e-mail, saldo,
RPC-argumenten, `details`/`hint`, stack, IP of user-agent. Rechten volgens
bestaand patroon: RLS aan, **geen policies**, `revoke all on client_errors
from authenticated, anon`; Studio leest als postgres-rol, buiten RLS.

**Opruimen (beslissing 6):** dezelfde migratie doet `create extension if not
exists pg_cron`, maakt een functie `purge_client_errors()` die rijen met
`created_at < now() - interval '90 days'` verwijdert (`security definer`,
`EXECUTE` voor niemand behalve de eigenaar), en plant een dagelijkse job die
alleen `select purge_client_errors()` aanroept. Zo is de opruimlogica
direct testbaar en staat de job-definitie niet los te typen. Er komt een index op `created_at`.
Dit is het eerste gebruik van `pg_cron` in deze codebase. De Developer
controleert dat de lokale Supabase uit `db:test`/CI de extensie heeft,
en meldt het in plaats van eromheen te bouwen als dat niet zo is.

## RPC — `log_client_error`

`log_client_error(p_hook text, p_kind text, p_code text,
p_path text, p_occurrences int, p_build text) returns void` — `security
definer`, `set search_path = public`, `grant execute … to authenticated`,
`revoke … from public, anon` (0018).

- De RPC valideert alle grenzen uit de tabel zelf (de client kapt ook af,
  maar de RPC is de waarheid). Ongeldige invoer: `raise` met een vaste code,
  die de helper negeert. Elk veld heeft een strak formaat (zie Datamodel),
  zodat er via een directe aanroep geen e-mailadres, bedrag of id in kan:
  geen vrij tekstveld. Restrisico, bewust aanvaard: iemand kan letters in
  `hook` of `path` coderen, en dat komt alleen terecht in een log die
  alleen via Studio leesbaar is.
- **Geen `caller_is_lid()`-weigering** (anders dan 0023): een portal-lid
  moet zijn leesfout kunnen melden; geen bar-RPC, lekt niets (`void`).
- RPC i.p.v. `insert`-policy: grenzen op één plek, niet te omzeilen, en
  hetzelfde `REVOKE`-patroon als de rest.

## Client-helper — `src/lib/clientErrors.ts`

- Pure payload-bouwer (hook, err, pathname): allowlist plus
  `classifyLoadError`; geen `message`, geen vrij object.
- Pure dedupe per (hook, kind, code), in geheugen per pagina-load: de eerste
  melding gaat direct, herhalingen binnen 5 minuten tellen op en gaan mee met
  de eerste melding ná het venster. Wat openstaat bij sluiten gaat verloren
  (geen persistente buffer, CLAUDE.md → Shells).
- `reportClientError(client, hook, err)`: `console.error` (voor lokaal
  debuggen) en daarna fire-and-forget de RPC. Blokkeert en gooit nooit, en
  een mislukte melding wordt niet opnieuw gemeld. De hook geeft **zijn eigen
  client** mee: `check:arch` staat `portalClient.ts` alleen in
  portal-bestanden toe (ADR 0009), en `src/lib/` is dat niet. Geen directe
  `@supabase/*`-import, geen `admin.ts`.
- Netwerkfouten: best effort; mislukt de melding, dan loopt de telling door.
- `logLocalError(hook, err)`: alleen `console.error`, voor hooks buiten scope,
  zodat de `check:policy`-regel overal kan gelden.

## Hooks

- **In scope** (`reportClientError`): alle lees-hooks en de onverwachte-fout-tak
  van alle schrijf-hooks, inclusief `usePlaceOrder`/`useTopUp`. De vertakking
  "domeinuitkomst vs. onverwacht" bestaat al per hook; alleen de tweede tak
  meldt. De Reviewer controleert dat, want geen gate kan het zien.
- **Buiten scope** (`logLocalError`): pre-sessie-hooks (`usePortalLogin`,
  `useWachtwoordHerstellen`, `usePortalWachtwoordHerstellen`) en de
  `signOut`-takken. `useBeheerSession`/`usePortalSession` melden alleen in
  de tak mét sessie (rol-lookup); de Developer bepaalt die tak per hook.

## Tests en gates

- **`supabase/tests/client_errors.test.sql`** (pgTAP): als `authenticated`
  faalt `select`/`insert`/`update`/`delete` op `client_errors` met `42501`.
  `anon` heeft geen `EXECUTE` (benoemd in `rpc_execute_grants.test.sql`; de
  tellende assertie dekt het al). Ongeldige `kind`/`code`/`hook`/`occurrences`
  worden geweigerd, net als een `path` met cijfers, `@` of `.` en een `build` die geen hex is. Een
  lid-sessie kán melden (bewust anders dan 0023). Er wordt geen uid opgeslagen.
  Retentie: `purge_client_errors()` verwijdert een rij van 91 dagen oud en
  laat een van 89 dagen staan; `cron.job` bevat precies één job voor deze
  functie met het verwachte schema; `authenticated` kan de functie niet
  uitvoeren.
- **`check:rls`:** vindt de tabel automatisch; geen geldtabel, dus niet in
  `MONEY_TABLES`.
- **`check:policy` (nieuwe regel):** een bestand onder `src/hooks/queries/`
  met `console.error(` faalt, met een verwijzing naar `src/lib/clientErrors.ts`.
  De helper zelf staat in `src/lib/` en valt erbuiten. Werk de kop van
  `check-policy.mjs` en de gate-tabel in CLAUDE.md bij.
- **`test`:** payload-allowlist (geen `message`, `path` zonder query-string en cijfers) en dedupe.
- **Geen wijziging** aan `check:arch` en `src/middleware.ts` (de
  matcher-aanpassing was alleen nodig voor optie A).

## ADR

**Ja: `docs/adr/0015-client-fouten-via-rpc-zonder-actor.md`, samen met de
bouw** (gemerged als 0011, hernummerd omdat #95 dat nummer al had). Het legt drie dingen vast die een volgende feature kan tegenspreken:
een schrijf-RPC zonder geld die open staat voor elke `authenticated`,
inclusief een lid (tegenover 0023); bewust géén actor opslaan (tegenover
ADR 0002), met een vaste allowlist van velden; en bewust géén
`anon`-uitzondering op 0018, met als geaccepteerd gevolg dat fouten van vóór
het inloggen niet gelogd worden.

## Randgevallen

- Een hook die de hele avond faalt: maximaal ~12 rijen per uur per (hook,
  code) per tabblad, elk met een telling. Faalt `log_client_error` zelf, dan
  slikt de helper dat (geen lus). Zonder env (CI, lokaal) faalt de aanroep
  stil en is `build` `null`.
- Geen server-side rate-limit: elke ingelogde sessie, ook die van een lid,
  kan rijen toevoegen binnen de grenzen van de RPC. Bij alleen
  `authenticated` en deze schaal is dat aanvaardbaar; de groei van de tabel
  wordt begrensd door de 90-dagenretentie (beslissing 6).

## Expliciet buiten scope

Fouten van vóór het inloggen, alerting, server-side fouten (Route Handlers,
middleware), statistieken, een offline-buffer, het ombouwen van
`loadErrors.ts`, een leesscherm (zie beslissing 7).

## Open beslissingen voor Bram

Geen.

## Zoals gebouwd (PR #98, 2026-09-28)

- **Cron-job:** naam `purge_client_errors`, schema `0 3 * * *`, dus dagelijks
  om 03:00 UTC (pg_cron rekent in UTC), buiten elke bardienst. Met een
  jobnaam, zodat een herhaalde `cron.schedule` de job bijwerkt in plaats van
  een tweede aan te maken. `purge_client_errors()` heeft ook geen `EXECUTE`
  voor `service_role`.
- **pg_cron:** werkt in de lokale Supabase van `db:test`/CI. Op het gehoste
  productieproject is nog niet aangetoond dat de extensie beschikbaar is en
  de job draait.
- **Ongeldige invoer:** één vaste fout, `invalid_client_error` met errcode
  `P0001`, voor elk veld. Geen code per veld, want niemand handelt die af.
- **Pad:** de client laat een pad met verboden tekens niet vallen, maar
  saneert het (`sanitizePath`): query-string en fragment eraf, kleine
  letters, alles buiten `a-z`, `/` en `-` weg, afgekapt op de tabellengte.
  Blijft er geen geldig pad over, dan gaat `/` mee. Een hooknaam buiten het
  formaat of een `build` die geen hex is, wordt niet verstuurd
  respectievelijk `null`.
- **Client-factory:** `reportClientError` accepteert een client óf de
  `createClient`-functie zelf. In een `catch` kan het aanmaken van de client
  juist de fout zijn geweest; die wordt dan in de helper gevangen in plaats
  van in de hook te gooien.
- **Telling bij mislukken:** geeft de RPC een error terug, wordt de promise
  afgewezen of gooit de factory of `rpc()` synchroon, dan gaat de telling
  terug in de dedupe-state en gaat ze mee met de eerste melding ná het
  venster. Geen herhaalpoging.
- **`no_bar_role`** ([issue #100](https://github.com/BramLambertJansen/ABAS/issues/100)):
  sinds 0023 een bekende code in de zes bar-hooks die hem kunnen krijgen, met
  eigen tekst (`NO_BAR_ROLE_SESSION_MESSAGE`). Als domeinuitkomst wordt hij
  niet gemeld.
