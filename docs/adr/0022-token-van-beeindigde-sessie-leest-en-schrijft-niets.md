# 0022 — Een access token van een beëindigde Auth-sessie leest en schrijft niets meer

Status: **geaccepteerd (2026-10-05), geïmplementeerd (PR #163)**. Bram heeft de keuzes voor deze opdracht
bij de Architect gelegd (item M1 "JWT na afmelden"); de spec
[`docs/features/sessie-na-afmelden.md`](../features/sessie-na-afmelden.md)
geldt daarmee als goedgekeurd. Gebouwd in migratie `0041` (PR #163,
gemerged in `74737e4`).
**Breidt uit:** [ADR 0020](0020-koppelen-eist-bewijs-van-mailbezit.md) →
Beslissing 8 (gold alleen voor RPC's die iets blijvends maken) naar elke
leespolicy op niet-globale tabellen, `require_session` en de guardvrije
client-RPC's. Sluit het restrisico "lezen tot het token verloopt" uit ADR 0020
→ Restrisico. **Vult aan:** [ADR 0019](0019-leestoegang-is-een-allowlist-op-actieve-bar-rol.md)
→ Beslissing 1: de policy-vorm krijgt een sessievoorwaarde ervoor. Het
verworpen alternatief daar (brede tak alleen met een actieve
**bar**-sessie) blijft verworpen; dit is een andere, kleinere eis.

## Context

Supabase Auth ondertekent een access token voor `jwt_expiry` (3600 s,
`supabase/config.toml`). PostgREST controleert alleen de handtekening en de
vervaltijd, niet of de sessie in `auth.sessions` nog bestaat. Een sessie
verdwijnt op meer manieren dan via onze RPC's:

- afmelden via GoTrue (`signOut`, lokaal of globaal), zoals de
  wachtwoordherstel-hooks doen (`useWachtwoordHerstellen.ts:122`,
  `usePortalWachtwoordHerstellen.ts:119`, standaard `scope: global`) en
  de portal-uitlog (`usePortalSession.ts:127`, ook globaal);
- een wachtwoordwijziging via `updateUser`, waarbij GoTrue de andere sessies
  van het account beëindigt;
- het koppelen van een account (ADR 0020 → Beslissing 4) en
  `close_bar_session_internal` (`0034`), die zelf de rij verwijderen.

Al die tokens konden tot een uur na afloop nog lezen wat de rol mag lezen
(voor een bardienst of beheerder: alle namen, saldi en transacties) en de
guardvrije RPC's aanroepen. Erger: een bar-sessie waarvan de Auth-sessie
buiten onze RPC's om verdween, bleef in `bar_sessions` actief. `require_session`
keek alleen naar `bar_sessions.ended_at`, dus het token op de bartablet kon na
een wachtwoordherstel op een ander apparaat nog een uur bestellen en
opwaarderen. Daarnaast bleef de dienst bemand in de database tot de
inactiviteitsjob na 60 minuten, en kreeg de beheerder pas dan een melding.

## Beslissing

**1. "Levend" is: er bestaat een rij in `auth.sessions` met `id` = de
`session_id`-claim en `user_id` = `auth.uid()`.** Eén helper,
`caller_session_alive()`, is de enige plek waar dat staat. Een ontbrekende,
lege of misvormde claim telt als "niet levend". `register_bar_session` en
`set_own_pin` (ADR 0020 → Beslissing 8) gebruiken dezelfde helper.

**2. Elke leespolicy op een niet-globale tabel eist een levende sessie**, als
voorwaarde vóór de bestaande expressie, als initplan:

```sql
using ((select caller_session_alive()) and (<bestaande expressie>))
```

Dat geldt voor de brede tak én de eigen-rij-tak. De globale tabellen uit
ADR 0019 (`using (true)`) blijven open: daar staan geen namen of bedragen per
lid in. Een gate (`rls_leespolicies`) controleert dat elke leespolicy die niet
`true` is, de helper bevat.

**3. `require_session` eist een levende sessie** (`session_ended`). Daarmee
ook elke geld-, dienst- en beheer-RPC, zonder dat die zelf iets hoeven.

**4. Elke guardvrije client-RPC eist een levende sessie, of heeft een reden
waarom niet.** Een RLS-helper niet: de policy draagt de voorwaarde.
`log_client_error` niet: elke zelf-aangemelde sessie kan haar al aanroepen,
een dood token wint daar niets mee. De `rpc_catalogus`-gate dwingt af dat een
nieuwe guardvrije RPC die keuze zichtbaar maakt.

**5. Een bar-sessie waarvan de Auth-sessie weg is, wordt binnen een minuut
gesloten door een cron-job.** `close_signed_out_bar_sessions()` sluit elke
open `bar_sessions`-rij zonder rij in `auth.sessions`, via
`close_bar_session_internal`, met de nieuwe sluitreden `elders_uitgelogd`.
Voor de koppeling en de beheerdermelding telt dat als `uitgelogd`. Of een
token nog iets mag, hangt niet van die job af (Beslissing 3). De job regelt
alleen de boekhouding: de koppeling sluiten en de melding maken.

**6. Geen object op het `auth`-schema.** Geen trigger op `auth.sessions`, geen
wijziging aan Supabase-beheerde tabellen. We lezen `auth.sessions` (zoals
`0040`) en verwijderen er rijen uit (zoals `0034`). Dat doen we al, en het
werkt op het gehoste project.

**7. `jwt_expiry` blijft 3600 s.** De database-controle sluit PostgREST
volledig. Een kortere looptijd verkleint alleen een venster dat er niet meer
is, en kost op de tablet vaker een refresh die bij een netwerkhapering
mislukt.

## Gevolgen

- Na afmelden, wachtwoordherstel, wachtwoordwijziging of koppelen ziet een
  oud token 0 rijen in `members`, `orders`, `order_lines`, `top_ups`,
  `order_reversals`, `bar_sessions`, `shift_sessions` en
  `admin_notifications`, en krijgt het van elke RPC een weigering of een
  lege uitkomst.
- Wachtwoordherstel beëindigt de bar-sessies van het lid nu echt: de guards
  weigeren meteen, de cron-job sluit de koppeling binnen een minuut en maakt
  bij een open dienst de melding "… is uitgelogd zonder af te sluiten.".
- Uitloggen op de portal wordt `scope: local`, zoals `/beheer` al deed.
  Anders zou een bardienst die op zijn telefoon uitlogt, zijn eigen
  bar-sessie op de tablet beëindigen. Dat gebeurde vóór deze ADR ook al,
  alleen pas na een uur en zonder melding. Wachtwoordherstel blijft
  globaal: dat hoort alles te beëindigen.
- Een open portal- of `/beheer`-scherm met een dood token ziet bij de
  volgende lezing niets. De sessie-hooks controleren daarom bij een lege
  eigen rij eerst de sessie bij GoTrue (`getUser`) en melden uit, in plaats
  van "niet gekoppeld" te tonen.
- Elke pgTAP-fixture die een ingelogde sessie nabootst, heeft voortaan een
  `auth.sessions`-rij en een `session_id`-claim nodig. Dat raakt ongeveer 25
  testbestanden; zie de spec → Impact op bestaande tests.
- Per statement één primaire-sleutel-lookup op `auth.sessions` per tabel met
  een policy, en één per guard-aanroep. Bij deze schaal verwaarloosbaar.
- Een volgende tabel met een leespolicy die niet `true` is, krijgt de vorm uit
  Beslissing 2. Een volgende guardvrije client-RPC roept de helper aan of
  noemt in de catalogus waarom niet.

## Verworpen alternatieven

- **Alleen `jwt_expiry` verlagen (300-600 s).** Verkleint het venster, maar
  sluit het niet. Geldt alleen voor de lokale stack (het gehoste project
  heeft een eigen dashboardinstelling). Kost refreshes: met supabase-js
  weinig belasting, maar een mislukte refresh op de tablet betekent
  uitloggen midden in een dienst.
- **Combinatie: database-controle plus een kortere looptijd.** Na
  Beslissing 2 t/m 4 blijft er voor PostgREST niets te verkleinen. Storage
  heeft geen policies voor `authenticated` (ADR 0018) en Realtime wordt niet
  gebruikt.
- **Trigger op `auth.sessions` (after delete) die de bar-sessie sluit.**
  Sluit direct in plaats van binnen een minuut, maar loopt in de transactie
  van GoTrue. Een fout in de trigger laat het afmelden of het
  wachtwoordherstel zelf falen. Het hangt een eigen object aan een schema dat
  Supabase beheert en steeds verder afschermt, en vraagt een recht
  (`TRIGGER` op een Auth-tabel) dat we nu niet nodig hebben. De cron-job
  ziet hetzelfde (rij weg) zonder die risico's, en omdat de guards meteen
  weigeren, is "binnen een minuut" genoeg.
- **Een client-RPC vóór de `signOut` in de herstel-hooks** (die
  `end_member_bar_sessions` aanroept). Dekt alleen onze eigen client-paden,
  niet een wachtwoordwijziging via `updateUser`, een globale uitlog vanaf
  een ander apparaat of de Auth-admin-API. Bovendien zou een
  herstelsessie (aal1) zo alle bar-sessies van het lid mogen sluiten.
- **De controle in `caller_has_bar_role()`, `caller_member_id()` en
  `caller_owns_order()`.** Dekt ook de eigen-rij-takken, maar
  `caller_owns_order(order_id)` en `member_id = caller_member_id()` worden
  per rij geëvalueerd, dus per rij een lookup op `auth.sessions`. Ook
  krijgt elke helper dan twee betekenissen. Eén conjunctie vóóraan in de
  policy is één initplan per statement, en zichtbaar in `pg_policies`.
- **Ook de globale tabellen afschermen.** Daar staan geen namen of bedragen
  per lid in (ADR 0007 → Reikwijdte, ADR 0019). Het kost een uitzondering in de
  `using (true)`-gate zonder dat het iets beschermt.
- **Brede leestoegang alleen met een actieve bar-sessie** (ADR 0019 →
  Verworpen alternatieven). Blijft verworpen om de redenen daar: een
  bardienst op de portal en een inactieve bar-sessie zouden stil lege
  lijsten zien. Deze ADR eist alleen dat de Auth-sessie bestaat, niet welke
  modus ze heeft.
- **`auth.sessions.not_after` en `aal` meewegen.** We gebruiken geen
  sessie-timebox. Bestaat de rij nog na `not_after`, dan weigert GoTrue de
  refresh en verloopt het token binnen een uur, zoals elk token. `aal`
  controleren de beheerguards al uit het JWT (`0034`).
