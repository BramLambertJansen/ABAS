# Een token van een beëindigde sessie leest en schrijft niets meer ("JWT na afmelden")

**Status: goedgekeurd (2026-10-05), nog te bouwen.** Bram heeft de keuzes
voor deze opdracht bij de Architect gelegd (item M1): de spec geldt als
goedgekeurd zodra hij geschreven is, en elke keuze staat hieronder met
reden. Architectuurbeslissing:
[ADR 0022](../adr/0022-token-van-beeindigde-sessie-leest-en-schrijft-niets.md).
Migratie `0041_sessie_na_afmelden.sql`.

## Aanleiding (geverifieerd in de code)

- Een access token blijft voor PostgREST geldig tot `jwt_expiry` (3600 s,
  `supabase/config.toml:22`), ook als de rij in `auth.sessions` weg is.
- **Lezen.** De leespolicies (`0039`, en `0027:177-206` voor `bar_sessions`,
  `shift_sessions`, `admin_notifications`) kijken naar rol en eigen rij,
  niet naar de sessie. Een bar-rol met een dood token leest alle leden met
  saldo, alle bestellingen en opwaarderingen.
- **`require_session`** (`0028:47-112`) kijkt naar `bar_sessions.ended_at`,
  niet naar `auth.sessions`. Is dat al dicht via het sluiten van
  bar-sessies? **Voor onze eigen paden wel:** `end_bar_session`,
  `admin_end_bar_session`, `end_member_bar_sessions` (archiveren,
  rolwijziging, promotie) en de inactiviteitsjob gaan allemaal via
  `close_bar_session_internal` (`0034:159-194`), die `ended_at` zet én de
  Auth-sessie verwijdert. Koppelen (`0040`, stap 9) verwijdert sessies van
  een account dat tot dan geen lid had, dus zonder `bar_sessions`-rij.
  **Voor paden buiten onze RPC's niet:**
  - wachtwoordherstel: `useWachtwoordHerstellen.ts:122` en
    `usePortalWachtwoordHerstellen.ts:119` roepen `signOut()` aan, standaard
    `scope: global`. Elke Auth-sessie van het lid verdwijnt, ook die van een
    lopende bar-sessie op de tablet;
  - uitloggen op de portal: `usePortalSession.ts:127`, ook globaal;
  - wachtwoord wijzigen in de portal (`usePortalWachtwoordWijzigen.ts:68`):
    GoTrue beëindigt bij `updateUser({ password })` de andere sessies;
  - de Auth-admin-API (gebruiker uitloggen of verwijderen).

  In al die gevallen blijft de `bar_sessions`-rij actief en komt het
  tablet-token tot een uur lang door `require_session`: `place_order`,
  `top_up`, terugdraaien, beheer. De dienst blijft bemand in de database tot
  de inactiviteitsjob na 60 minuten, en pas dan krijgt de beheerder een
  melding (review-bevinding).
- **Guardvrije client-RPC's** (`rpc_catalogus.test.sql:72-83`):
  `update_own_name` (`0026:26`), `list_own_transactions` (`0024:25`),
  `my_bar_state` (`0037:221`), `link_invited_member_account` /
  `link_lid_member_account` (`0040:407-431`, via
  `link_member_account_internal`, `0040:262`) en `log_client_error`
  (`0025:67`) kijken niet naar de sessie. `register_bar_session` en
  `set_own_pin` doen dat sinds `0040` wel (ADR 0020 → Beslissing 8), elk met
  een eigen kopie van de controle.

## Doel

Na afmelden, wachtwoordherstel, wachtwoordwijziging of koppelen kan het oude
token, binnen de rest van zijn looptijd:

| Wat | Vóór `0041` | Na `0041` |
|---|---|---|
| `select` op `members`, `orders`, `order_lines`, `top_ups`, `order_reversals`, `bar_sessions`, `shift_sessions`, `admin_notifications` | wat de rol mag | **0 rijen** |
| `select` op `products`, `app_settings`, `shifts`, `shift_members`, `activity_types` | alles | alles (globaal, keuze 3) |
| elke RPC achter `require_*` (geld, dienst, beheer, hartslag, uitloggen) | werkt zolang `bar_sessions` open is | `session_ended` |
| `update_own_name` | werkt | `actor_not_found` |
| `list_own_transactions` | eigen rijen | 0 rijen |
| `my_bar_state` | eigen bar-sessie | open bar-sessie: `{"session": null}`; gesloten bar-sessie: ongewijzigd (`status: 'ended'` met sluitreden) |
| `link_*_member_account` | koppelt (met mailbewijs) | no-op (`null`) |
| `register_bar_session` / `set_own_pin` | al geweigerd (`0040`) | ongewijzigd, nu via de helper |
| `log_client_error` | werkt | werkt (keuze 6) |

En een bar-sessie waarvan de Auth-sessie verdween, is binnen een minuut
gesloten, met een melding als de dienst daardoor onbemand raakt.

## Betrokken shell(s)

- **Database**: migratie `0041`, de bulk van het werk.
- **`shells/portal`**: `usePortalSession` logt alleen dit apparaat uit
  (keuze 8) en meldt uit bij een dood token (keuze 9). Geen nieuwe tekst of
  UI.
- **`shells/bar`**: `useBeheerSession` meldt uit bij een dood token (keuze 9).
  De bar zelf verandert niet: een dood token krijgt `session_ended` van de
  guards en van `my_bar_state` `{"session": null}` (bar-sessie nog open) of
  de bestaande `status: 'ended'` met sluitreden (keuze 5). Die paden bestaan al
  (`BarSessieProvider.tsx`: melding "Je bent uitgelogd" (`geen_sessie`) en
  lokaal uitloggen).

## Geldlaag en attributie

Raakt de geldlaag alleen door te weigeren: `place_order`, `top_up` en
`reverse_order_*` lopen via `require_session` en weigeren voortaan ook een
token zonder levende Auth-sessie. Geen bedrag, geen `served_by`, geen
signatuur verandert. Geld beweegt nog steeds alleen via die RPC's, en
`served_by` komt nog steeds uit de bezetting (CLAUDE.md →
Architectuurbeslissingen). Dit maakt de eerste beslissing strenger, niet
anders.

## Keuzes

### 1. Database-controle, `jwt_expiry` blijft 3600 s

Een kortere looptijd (300-600 s) verkleint het venster maar sluit het niet,
en `config.toml` geldt alleen voor de lokale stack. Supabase-js ververst
vanzelf, dus de belasting is klein. Het echte nadeel: elke refresh op de
tablet die door een netwerkhapering mislukt, logt de bardienst midden in een
dienst uit. Na keuze 2 t/m 5 blijft er voor PostgREST niets te verkleinen:
Storage heeft geen policies voor `authenticated` (ADR 0018), Realtime wordt
niet gebruikt, en GoTrue weigert het token zelf al bij `/user` en bij
verversen (bewezen in `integration/account-koppeling.test.ts`, scenario 3).
Ook geen combinatie. ADR 0022 → Beslissing 7.

### 2. Eén helper: `caller_session_alive()`

`returns boolean`, `language plpgsql`, `stable`, `security definer`,
`set search_path = public`. Leest de `session_id`-claim met hetzelfde
`invalid_text_representation`-vangnet als `register_bar_session`. Ontbreekt de
claim, is ze leeg of geen uuid, dan `false`, nooit een fout. Anders `exists
(select 1 from auth.sessions where id = <claim> and user_id = auth.uid())`.

- `grant execute ... to authenticated`: een policy wordt geëvalueerd met de
  rechten van de aanroeper (zelfde reden als `caller_has_bar_role`, `0039`).
  `revoke ... from public, anon`.
- Catalogus: client, guardvrij, reden "RLS-helper: zegt alleen iets over
  de aanroeper zelf". Als RPC aanroepbaar, maar dan zegt ze alleen of de
  eigen sessie bestaat.
- `auth.sessions.not_after` en `aal` tellen niet (ADR 0022 → Verworpen).
- Geen andere definitie van "levend" in de codebase. `register_bar_session`
  en `set_own_pin` krijgen hun inline-`exists` vervangen door de helper,
  met dezelfde foutcodes en volgorde.

### 3. Leespolicies: conjunctie vóóraan, initplan; globale tabellen blijven open

Alle acht leespolicies die niet `using (true)` zijn, worden:

```sql
using ((select caller_session_alive()) and (<huidige expressie, ongewijzigd>))
```

`members_select`, `orders_select`, `order_lines_select`, `top_ups_select`,
`order_reversals_select` (huidige expressie uit `0039`), en
`bar_sessions_select`, `shift_sessions_select`, `admin_notifications_select`
(huidige `exists (...)` uit `0027`). `(select ...)` maakt er een initplan van:
één evaluatie per statement, niet per rij, net als `caller_has_bar_role`.

Niet in `caller_has_bar_role()` / `caller_member_id()` /
`caller_owns_order()`. De laatste twee worden per rij geëvalueerd, dus dat
zou per rij een lookup op `auth.sessions` worden, en elke helper zou twee
betekenissen krijgen. Wel opgenomen in de policies, waar het in
`pg_policies` zichtbaar is.

De globale tabellen (`products`, `app_settings`, `shifts`, `shift_members`,
`activity_types`) houden `using (true)`. Daar staan geen namen of bedragen per
lid in (ADR 0019 → keuze 6), en de `using (true)`-gate blijft ongewijzigd.

### 4. `require_session`: `session_ended` bij een dode Auth-sessie

Nieuwe controle direct ná de bestaande `ended_at`-check en vóór
`session_inactive`: `if not caller_session_alive() then raise exception
'session_ended'`. Bestaande code, met centrale afhandeling op de client
(`SESSION_ERROR_CODES`, `src/lib/barSessie.ts:44`). Volgorde van de codes
blijft: `no_bar_session` (geen claim of geen rij), `session_ended`,
`session_inactive`, `wrong_mode`, `no_bar_role`. Elke RPC met een `require_*`
erft dit, ook `touch_bar_session`, `end_bar_session` en `check_beheer_session`.

Gevolg: `end_bar_session(true)` met een dood token kan de dienst niet meer
sluiten. De cron-job (keuze 7) sluit de koppeling, de dienst blijft open en
de beheerder krijgt een melding. Dat kan alleen gebeuren als de Auth-sessie
al elders beëindigd is, en het is dezelfde uitkomst als "uitgelogd zonder af
te sluiten".

### 5. Guardvrije RPC's die een levende sessie eisen

| RPC | Bij dode sessie | Waarom deze uitkomst |
|---|---|---|
| `update_own_name` | `raise 'actor_not_found'`, als eerste controle | Bestaande code; `usePortalUpdateOwnName.ts:19` handelt hem af. Geen nieuwe tekst. |
| `list_own_transactions` | 0 rijen: `and (select caller_session_alive())` in beide `where`-clausules | Zelfde uitkomst als RLS: een lege lijst, geen fout. |
| `my_bar_state` | Bar-sessie nog open (`ended_at is null`): `{"session": null}`, zonder naam of rol. Bar-sessie al gesloten: ongewijzigd t.o.v. vóór `0041`, dus `session` met `status: 'ended'`, `end_reason`, `left_shift_open` en de overige sessievelden, zonder `shift`, `other_shift` of `notifications` | Open: zelfde als "geen claim"; de bar toont "Je bent uitgelogd" en logt lokaal uit (`BarSessieProvider.tsx`, `sessieWeg`). Gesloten: `close_bar_session_internal` verwijdert bij **elke** sluiting de Auth-sessie (`0034`), dus elk token van een gesloten bar-sessie is dood. Een kale `null` daar zou de sluitreden-meldingen op de tablet (afgemeld, inactief, `geen_bar_rol`, `beheerder_geworden`, "de dienst loopt nog") wegvagen, terwijl Randgevallen die "ongewijzigd" noemt. Wat terugkomt is de eigen bar-sessie van de tokenhouder (gevonden via de door GoTrue getekende `session_id`), dezelfde velden als vóór `0041`, zonder dienst- of beheergegevens (`status <> 'active'`). ADR 0022 → Beslissing 4 ("of heeft een reden waarom niet") dekt deze gedeeltelijke uitzondering. |
| `link_member_account_internal` (dus beide `link_*`) | `return null`, als stap 2b (na het lezen van `v_session_id`) | Koppelen maakt iets dat langer leeft dan het token (ADR 0020 → Beslissing 8). Stille no-op, zoals elke andere afwijking daar. |
| `register_bar_session` | `session_ended` (ongewijzigd) | Refactor naar de helper. |
| `set_own_pin` | `actor_not_found` (ongewijzigd) | Refactor naar de helper. |

### 6. Bewust zonder sessie-eis: `log_client_error` en de RLS-helpers

- `log_client_error`: elke zelf-aangemelde sessie kan haar aanroepen
  (`enable_signup = true`, ADR 0013/0015). Een dood token kan daar niets mee
  dat een vers token niet ook kan. Weigeren zou juist de foutmeldingen rond
  een beëindigde sessie onzichtbaar maken.
- `caller_has_bar_role`, `caller_member_id`, `caller_owns_order`,
  `is_shift_member`, `caller_session_alive`: helpers die een policy of RPC
  gebruikt. De policy of RPC draagt de sessie-eis.

De catalogus legt dit vast (Tests → Gates).

### 7. Bar-sessie zonder Auth-sessie: sluiten via een cron-job, niet via een trigger

Nieuwe interne functie `close_signed_out_bar_sessions()`, eigen cron-job
`close_signed_out_bar_sessions`, elke minuut (`* * * * *`, met jobnaam,
zelfde patroon als `close_inactive_bar_sessions`, `0028:778-782`). Voor elke
`bar_sessions`-rij met `ended_at is null` zonder rij in `auth.sessions` met
`id = auth_session_id`: `perform close_bar_session_internal(id,
'elders_uitgelogd')`.

- **Sluitreden `elders_uitgelogd`**: nieuw in de check op
  `bar_sessions.end_reason`, zodat de data laat zien dat de sessie niet op de
  bar zelf beëindigd is. `close_bar_session_internal` zet hem voor
  `shift_sessions.left_reason` en `notify_orphan_shift` om naar `uitgelogd`,
  zoals al gebeurt met `niet_hervat`. Daardoor geen wijziging aan
  `shift_sessions`, `admin_notifications` of de client. De melding wordt
  "{naam} is uitgelogd zonder af te sluiten." (`teksten.ts:225`), en dat klopt.
  De tablet ziet `my_bar_state` → `{"session": null}` zolang de job nog
  niet gedraaid heeft, en daarna `status: 'ended'` met `end_reason:
  'elders_uitgelogd'` (keuze 5). Beide komen uit op "Je bent uitgelogd": een
  `endReason` van `elders_uitgelogd` valt via `default` op dezelfde melding
  (`barSessie.ts:259`).
- **Eigen functie, niet in `close_inactive_bar_sessions`**: die naam zou dan
  niet meer kloppen, en de bestaande tests van de inactiviteitsjob hoeven
  niets te weten van `auth.sessions`.
- **Geen trigger op `auth.sessions`** (ADR 0022 → Beslissing 6 en
  Verworpen): een trigger loopt in de transactie van GoTrue, en een fout
  daarin breekt afmelden en wachtwoordherstel. Ze hangt een object aan een
  schema dat Supabase beheert, en vraagt `TRIGGER`-recht op een Auth-tabel.
  De job leest alleen, zoals `0040`. Een minuut vertraging is genoeg, omdat
  de guards meteen weigeren (keuze 4).
- **Geen client-RPC vóór `signOut`**: dekt geen `updateUser`, geen globale
  uitlog vanaf een ander apparaat en geen admin-API.
- Grants: `revoke execute ... from public, anon, authenticated,
  service_role` (intern). `close_bar_session_internal` verwijdert daarna nog
  `auth.sessions where id = ...`; die rij is al weg, dus dat doet niets.

### 8. Portal-uitlog wordt `scope: local`; wachtwoordherstel blijft globaal

`usePortalSession.ts:127`: `signOut({ scope: "local" })`, zoals
`useBeheerSession.ts:166` en `useEndBarSession.ts:67`. Zonder deze wijziging
beëindigt een bardienst die op zijn telefoon uitlogt, met keuze 4 en 7
meteen zijn eigen bar-sessie op de tablet, met melding. Dat gebeurde al,
maar pas na een uur en ongemerkt; nu zou het direct zichtbaar worden. Uitloggen
geldt voor dit apparaat; zo werkt het al op `/beheer` en de bar.

Wachtwoordherstel (`useWachtwoordHerstellen.ts:122`,
`usePortalWachtwoordHerstellen.ts:119`) blijft `signOut()` (globaal): wie
zijn wachtwoord herstelt, wil alle sessies eruit. De bar-sessies van het lid
eindigen daarmee via keuze 4 en 7, met melding. Dat dicht de
review-bevinding. Het commentaar bij beide aanroepen wordt bijgewerkt met
die reden, zodat niemand het "gelijktrekt" naar lokaal.

### 9. Sessie-hooks: lege eigen rij → eerst de sessie controleren

`usePortalSession` en `useBeheerSession` tonen nu "Dit account is niet
gekoppeld aan een lid" als de eigen-rij-lookup niets oplevert. Met een dood
token (een open tabblad na een wachtwoordherstel op een ander apparaat) is
dat voortaan de uitkomst, en die melding klopt dan niet. Nieuw: bij `!data`
eerst `supabase.auth.getUser()`. Geeft die een fout (GoTrue weigert een
token van een verwijderde sessie, bewezen in `account-koppeling.test.ts`
scenario 3), dan `signOut({ scope: "local" })` en state `signed-out`. Het
inlogscherm volgt vanzelf. Slaagt `getUser`, dan `denied` zoals nu. Een
fout van `getUser` die geen sessiefout is (netwerk), behandelen we hetzelfde:
de sessie is niet te bevestigen, dus uitgelogd tonen. Dat is veilig en het
lid logt opnieuw in. Geen `reportClientError` voor dit pad (het is een
verwachte uitkomst); wel `logLocalError` bij een netwerkfout.

Overige leeshooks veranderen niet. Een open portalscherm dat binnen de rest
van de tokenduur opnieuw leest, kan één keer lege gegevens tonen, tot de
volgende auth-gebeurtenis (refresh mislukt → `SIGNED_OUT`) of herladen. Dat
accepteren we: het komt alleen voor direct na een globale uitlog elders, en
er lekt niets.

## Datamodel

- `bar_sessions_end_reason_check`: lijst uit `0037` plus `'elders_uitgelogd'`.
- Geen nieuwe kolommen of tabellen. `shift_sessions` en
  `admin_notifications` ongewijzigd.

## Migratie `0041_sessie_na_afmelden.sql`

Volgorde (een policy verwijst naar de helper, dus die eerst):

1. **`caller_session_alive()`** (keuze 2), met comment en grants.
2. **Policies** (keuze 3): per policy `drop policy` + `create policy` met
   dezelfde naam (check:rls en de tests vinden ze op naam).
   - `members_select`: `using ((select caller_session_alive()) and ((select
     caller_has_bar_role()) or auth_user_id = auth.uid()))`.
   - `orders_select`, `top_ups_select`: idem met `member_id =
     caller_member_id()`.
   - `order_lines_select`, `order_reversals_select`: idem met
     `caller_owns_order(order_id)`.
   - `bar_sessions_select`, `shift_sessions_select`,
     `admin_notifications_select`: `(select caller_session_alive()) and
     exists (...)`, met de `exists` letterlijk uit `0027:177-206`.
3. **`require_session(text[], boolean, boolean)`**: `create or replace`, body
   uit `0028:47-112`, plus de controle uit keuze 4. Grants herhalen
   (intern: revoke van alle API-rollen).
4. **`register_bar_session(text)`**: body uit `0040:448-517`. De inline
   `exists (... auth.sessions ...)` wordt `if not caller_session_alive() then
   raise 'session_ended'`. De claim-parse en `no_bar_session` blijven ervoor.
   Grants herhalen.
5. **`set_own_pin(text)`**: body uit `0040:534-597`. `if v_session_id is null
   or not caller_session_alive() then raise 'actor_not_found'`. Grants
   herhalen.
6. **`update_own_name(text)`**: body uit `0026:26-58`, als eerste regel van
   de body `if not caller_session_alive() then raise exception
   'actor_not_found' using errcode = 'P0001'; end if;`. Grants herhalen.
7. **`list_own_transactions()`**: body uit `0024:25-78`, beide `where`-clausules
   `and (select caller_session_alive())`. Return type ongewijzigd, dus
   `create or replace`. Grants herhalen.
8. **`my_bar_state()`**: body uit `0037:221-457`. Direct na het ophalen van
   de bar-sessie (`if not found then return ...`): `if v_session.ended_at is
   null and not caller_session_alive() then return
   jsonb_build_object('session', null); end if;`. Een gesloten bar-sessie
   loopt door het bestaande pad (keuze 5: sluitreden blijft zichtbaar).
   Grants herhalen.
9. **`link_member_account_internal(text)`**: body uit `0040:262-396`. Na
   stap 2: `if not caller_session_alive() then return null; end if;`. Grants
   herhalen (intern). De wrappers hoeven niet te veranderen.
10. **`bar_sessions_end_reason_check`**: drop en add met
    `'elders_uitgelogd'` erbij.
11. **`close_bar_session_internal(uuid, text, uuid)`**: body uit
    `0034:159-194`. `v_reason := case when p_end_reason in ('niet_hervat',
    'elders_uitgelogd') then 'uitgelogd' else p_end_reason end`. Comment
    bijwerken. Grants herhalen (intern).
12. **`close_signed_out_bar_sessions()`** (keuze 7), intern, plus
    `select cron.schedule('close_signed_out_bar_sessions', '* * * * *',
    'select close_signed_out_bar_sessions()')`.

Niets aan `caller_has_bar_role`, `caller_member_id`, `caller_owns_order`,
`log_client_error`, `register_bar_session_server`, de globale policies of
`supabase/config.toml`.

## TypeScript

- `src/hooks/queries/usePortalSession.ts`: `signOut({ scope: "local" })`
  (keuze 8). Lege eigen rij → `getUser()` → bij fout lokaal uitloggen en
  `signed-out` (keuze 9). Docblock bijwerken.
- `src/hooks/queries/useBeheerSession.ts`: idem keuze 9, alleen bij de tak
  `!data`. De rol-tak (`denied` "geen bardienst- of beheerrechten")
  ongewijzigd: met een dood token is er geen rij, dus die tak wordt niet
  bereikt.
- `src/hooks/queries/useWachtwoordHerstellen.ts`,
  `usePortalWachtwoordHerstellen.ts`: alleen het commentaar bij `signOut()`
  (bewust globaal, ADR 0022).
- Geen wijziging aan `barSessie.ts`, `teksten.ts`, `barState.ts` of de
  bar-hooks.

## Rolzichtbaarheid

Ongewijzigd voor elke levende sessie. Met een dode sessie ziet geen enkele
rol nog iets buiten de globale tabellen.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Lid logt uit op de portal | Alleen deze sessie weg (`local`). Het token van dit apparaat ziet niets meer; andere apparaten van het lid werken door. |
| Bardienst herstelt zijn wachtwoord op de telefoon terwijl hij op de tablet een bar-sessie heeft | Alle Auth-sessies weg (globaal). De volgende RPC op de tablet (hartslag, bestelling) → `session_ended`. `my_bar_state` (poll 30 s) → `{"session": null}`, of na de cron-job `status: 'ended'` met `end_reason: 'elders_uitgelogd'` → in beide gevallen "Je bent uitgelogd", lokaal uitloggen. Binnen een minuut sluit de cron-job de bar-sessie (`elders_uitgelogd`); stond er een dienst open en was dit de laatste koppeling, dan krijgt de beheerder de melding "… is uitgelogd zonder af te sluiten.". |
| Idem, wachtwoord gewijzigd in de portal (`updateUser`) | GoTrue beëindigt de andere sessies. Zelfde verloop als hierboven. |
| Bardienst logt uit op de portal terwijl hij op de tablet een bar-sessie heeft | Na keuze 8 alleen de portalsessie; de bar-sessie loopt door. |
| Beheerder meldt een apparaat af, of de inactiviteitsjob sluit een sessie | Ongewijzigd: `close_bar_session_internal` zet `ended_at` en verwijdert de Auth-sessie. De cron-job uit keuze 7 slaat de rij over (`ended_at` gezet). |
| Bar-sessie inactief én Auth-sessie weg | Wie het eerst draait, sluit: `inactief` of `elders_uitgelogd`. Beide maken dezelfde melding; geen dubbele (`close_bar_session_internal` doet niets bij een al gesloten rij). |
| Uitloggen met "dienst afsluiten" met een al dood token | `session_ended`; de dienst blijft open, de cron-job sluit de koppeling en meldt. Zie keuze 4. |
| Account gekoppeld (ADR 0020) terwijl een aanvaller een token van een verwijderde sessie heeft | Leest nu ook niets meer, `update_own_name` → `actor_not_found`. Het restrisico uit ADR 0020 vervalt. |
| Token zonder `session_id`-claim, of met een misvormde | `caller_session_alive()` = `false`, geen fout. Leest niets, guards → `no_bar_session` (claim leeg) of `session_ended`. GoTrue geeft altijd een claim mee. |
| `service_role`-aanroepen (barLogin, invite, productafbeelding) | Omzeilen RLS en roepen geen client-RPC aan met een gebruikerstoken; ongewijzigd. Server-acties die met de sessieclient de eigen rij lezen (`inviteMember.ts`, `productImage.ts`), weigeren voortaan ook een dood token. Dat is gewenst. |
| Refresh van een levende sessie | Zelfde `session_id`, zelfde rij: blijft levend. MFA-verify houdt het `session_id` ook gelijk (scenario 3, `account-koppeling.test.ts`). |
| Open portaltabblad, sessie elders beëindigd | Bij herladen of een auth-gebeurtenis: uitgelogd (keuze 9). Een herhaalde lezing daarvoor kan één keer leeg zijn. |

## Tests

### pgTAP — nieuw: `supabase/tests/sessie_na_afmelden.test.sql`

Fixtures: per rol (lid, bardienst, beheerder) een `auth.users`-rij, een
gekoppelde `members`-rij, een levende sessie (rij in `auth.sessions`) en een
dode sessie-id (geen rij). Een bestelling, opwaardering en terugdraaiing per
lid, een open dienst met een koppeling, en een openstaande
`admin_notifications`-rij. Leestoetsen draaien met `set local role
authenticated` (RLS geldt niet voor de superuser,
`rls_lid_eigen_rijen.test.sql` → punt 1) en `request.jwt.claims` met `sub` +
`session_id`.

1. **`caller_session_alive()`**: geen claims → `false`; claim zonder
   `session_id` → `false`; `session_id` = `''` → `false`; `session_id` =
   `'geen-uuid'` → `false` (en `lives_ok`); `session_id` zonder rij →
   `false`; `session_id` van een rij van een ander account → `false`;
   levend → `true`.
2. **RLS, dode sessie**: voor elk van de acht tabellen ziet de
   bardienst 0 rijen, en ook de beheerder (incl. `admin_notifications`). Het
   lid ziet 0 eigen rijen in `members`, `orders`, `order_lines`, `top_ups`,
   `order_reversals`.
3. **RLS, levende sessie (controle)**: dezelfde aanroepers zien met de
   levende sessie wat ze vóór `0041` zagen (bar-rol: tabeltotaal, gemeten als
   superuser; lid: precies de eigen rijen). Bewijst dat de conjunctie niets
   wegneemt.
4. **Globale tabellen**: met een dode sessie ziet de bardienst nog
   `products` (> 0). Legt keuze 3 vast.
5. **`require_session`**: een open, actieve `bar_sessions`-rij met een dode
   Auth-sessie →
   `touch_bar_session()` → `session_ended`; `start_shift(null)` →
   `session_ended`; `place_order(...)` → `session_ended`, en `orders` en het
   saldo ongewijzigd; `top_up(...)` → `session_ended`, saldo ongewijzigd;
   beheer: `list_members_admin()` met een modus-`beheer`-rij en `aal2` →
   `session_ended`; `end_bar_session(true)` → `session_ended` en de dienst
   nog open. `last_activity_at` ongewijzigd (geen hartslag bij weigering).
6. **Volgorde**: dode Auth-sessie en een al gesloten `bar_sessions`-rij →
   `session_ended`; dode Auth-sessie zonder `bar_sessions`-rij →
   `no_bar_session`; levende Auth-sessie en inactieve rij →
   `session_inactive` (ongewijzigd).
7. **`update_own_name`**: dode sessie → `actor_not_found`, naam ongewijzigd.
   Levend → slaagt.
8. **`list_own_transactions`**: dode sessie → 0 rijen; levend → de eigen
   rijen.
9. **`my_bar_state`**: dode sessie met een open bar-sessie →
   `{"session": null}` (exact, geen `member_name`). Dode sessie met een
   gesloten bar-sessie (bijv. via `close_bar_session_internal(…, 'afgemeld')`)
   → `session.status = 'ended'`, `session.end_reason = 'afgemeld'`, en geen
   sleutel `shift`, `other_shift` of `notifications`.
10. **`link_invited_member_account`**: uitgenodigd lid, claims met `amr`
    `otp` en een dode `session_id` → `null`, `auth_user_id` blijft leeg, en
    een andere (levende) sessie van het account bestaat nog (stap 9 niet
    uitgevoerd).
11. **`close_signed_out_bar_sessions()`**:
    - open bar-sessie zonder Auth-sessie, met de laatste koppeling aan een
      open dienst → `ended_at` gezet, `end_reason = 'elders_uitgelogd'`,
      koppeling `left_reason = 'uitgelogd'`, één `admin_notifications`-rij
      met `reason = 'uitgelogd'`, de dienst zelf nog open;
    - open bar-sessie mét Auth-sessie → ongemoeid;
    - al gesloten bar-sessie zonder Auth-sessie → ongemoeid (`end_reason`
      blijft, geen tweede melding);
    - tweede aanroep → niets nieuws (idempotent);
    - `cron.job` bevat `close_signed_out_bar_sessions` met schema `* * * * *`.
12. **`close_bar_session_internal`**: `niet_hervat` → `uitgelogd`
    (ongewijzigd), `elders_uitgelogd` → `uitgelogd`, `afgemeld` →
    `afgemeld` (controle dat de mapping niet te breed is).

### Gates (uitbreiding)

- **`rls_leespolicies.test.sql`**, assertie 4 (nieuw): `is_empty` op
  leespolicies in `public` (`cmd in ('SELECT','ALL')`) met `qual <> 'true'`
  en `qual not like '%caller_session_alive()%'`. Zo krijgt een nieuwe tabel
  de vorm uit ADR 0022 → Beslissing 2. Commentaar bovenaan aanvullen. Dat
  het een conjunctie is en geen `or`-tak, bewijzen de gedragstests (blok 2).
- **`rpc_catalogus.test.sql`**:
  - `caller_session_alive` als client, guardvrij ("RLS-helper: zegt alleen
    iets over de aanroeper zelf"); `close_signed_out_bar_sessions` als intern.
  - Nieuwe kolom `zonder_sessie_omdat text` en assertie 8 (nieuw): elke
    client-functie die guardvrij is, roept `caller_session_alive(` aan
    (`prosrc ~ '\mcaller_session_alive\s*\('`) of heeft een
    `zonder_sessie_omdat`. Ingevuld voor `caller_has_bar_role`,
    `caller_member_id`, `caller_owns_order`, `is_shift_member`,
    `caller_session_alive` ("RLS-helper; de policy eist de sessie, ADR 0022"),
    `log_client_error` ("elke zelf-aangemelde sessie kan dit al; een dood
    token wint niets, ADR 0022") en de twee `link_*`-wrappers ("wrapper;
    link_member_account_internal eist de sessie"). `plan` +1.
  - Redenen bij `update_own_name`, `list_own_transactions`, `my_bar_state`
    aanvullen met "eist een levende Auth-sessie (ADR 0022)".
- **`rpc_execute_grants.test.sql`**: dekt anon/PUBLIC voor alle functies al
  generiek. Komt er een expliciete lijst in voor, dan de twee nieuwe functies
  toevoegen.

### Integratietest tegen de echte GoTrue — nieuw: `integration/sessie-na-afmelden.test.ts`

Draait via `npm run test:integration` (glob `integration/**/*.test.ts`, al
in CI). De hulpjes die `account-koppeling.test.ts` nu inline heeft
(`omgeving`, `admin`, `gebruiker`, `metToken`, `tokenClaims`, `sessieId`,
`uniekAdres`, `wachtwoord`, opruimen) gaan naar `integration/hulpjes.ts`,
geïmporteerd met expliciete `.ts`-extensie, en beide bestanden gebruiken ze.
Geen tweede kopie (CLAUDE.md → Componenten zijn herbruikbaar). Opzet per
scenario: een account via `admin.auth.admin.createUser({ email, password,
email_confirm: true })` en een direct via service-role gekoppeld lid
(koppelen zelf is al gedekt), opgeruimd in `after`.

1. **Uitloggen beëindigt alleen deze sessie, en het oude token kan niets meer**
   (lid). Twee wachtwoordlogins P1 en P2. Vooraf, met het token van P1:
   `members` (eigen rij) → 1 rij; `update_own_name` slaagt. Dan
   `P1.auth.signOut({ scope: "local" })`. Met `metToken(P1)`:
   - `from("members").select()` → geen fout, 0 rijen; idem `orders`,
     `top_ups`;
   - `rpc("list_own_transactions")` → `[]`;
   - `rpc("update_own_name", …)` → fout `actor_not_found`; naam ongewijzigd
     (service-role);
   - `rpc("my_bar_state")` → `{ session: null }`;
   - `rpc("link_invited_member_account")` → `null`.
   Met het token van P2: `members` → 1 rij (andere sessie werkt door).
2. **Wachtwoordherstel beëindigt de bar-sessie** (bardienst, exact het pad
   van `useWachtwoordHerstellen.ts`). Tablet T: wachtwoordlogin →
   `register_bar_session('bar')` slaagt → `members` geeft net zoveel rijen
   als service-role telt (> 1). Dan op een tweede client:
   `admin.auth.admin.generateLink({ type: "recovery", email })` →
   `verifyOtp({ token_hash, type: "recovery" })` →
   `updateUser({ password: nieuw })` → `signOut()` (zonder scope, dus
   globaal, zoals de hook). Met `metToken(T)`:
   - `members` → 0 rijen; `bar_sessions` → 0 rijen;
   - `rpc("touch_bar_session")` → `session_ended`.
   Daarna pollt de test via service-role de `bar_sessions`-rij van T (elke
   2 s, hooguit 90 s) tot `ended_at` gezet is, en verwacht `end_reason =
   'elders_uitgelogd'`. **Pas daarna**, met `metToken(T)`:
   `rpc("my_bar_state")` → geen fout, `data.session.status === 'ended'`,
   `data.session.end_reason === 'elders_uitgelogd'`,
   `data.session.left_shift_open === false`, en `data` heeft geen sleutel
   `shift`, `other_shift` of `notifications`. Niet vóór de poll: de cron-job
   draait elke minuut en kan tussen `signOut()` en die aanroep vallen, dan
   komt al `status: 'ended'` terug in plaats van `{ session: null }` (keuze
   5), en de test zou zeldzaam flaky zijn. De `null`-tak bij een open
   bar-sessie is deterministisch gedekt in pgTAP (blok 9). Dit bewijst dat GoTrue de rij echt verwijdert en dat
   de cron-job in de stack draait. Geen dienst starten in dit scenario:
   `start_shift` staat maar één open dienst toe, en CI laat er een open uit
   eerdere stappen. Koppeling en melding zijn met pgTAP gedekt (blok 11).
   Wordt de rij niet binnen 90 s gesloten, dan niet afzwakken maar melden.

### Impact op bestaande tests (inventaris)

Regel voor elke fixture die een ingelogde sessie nabootst: claims via
`request.jwt.claims` met `sub` **en** `session_id`, plus `insert into
auth.sessions (id, user_id, created_at, updated_at) values (<session_id>,
<sub>, now(), now()) on conflict (id) do nothing`. Uitzonderingen zijn alleen
tests die juist "geen claim", "geen sessie" of (nieuw) "dode sessie"
toetsen. Een negatieve test moet falen om de reden die hij noemt, niet omdat
de sessie ontbreekt.

| Groep | Bestanden | Wat |
|---|---|---|
| A. Helper (`act_as_bar`, `act_as_mode`, `act_as`, `act_as_user`) maakt een `bar_sessions`-rij zonder `auth.sessions` | `activiteittypes`, `admin_sessie_rpcs_guards`, `assortimentbeheer`, `bar_sessie_guards`, `beheer_rpcs_modus`, `end_shift`, `geld_rpcs_attributie`, `ledenbeheer`, `negatieve_saldolimiet`, `place_order`, `productafbeeldingen`, `productafbeeldingen_negatief`, `resume_orphan_shift`, `reverse_order`, `shift_members`, `start_shift`, `top_up`, plus `act_as_bar` in `bar_rpcs_lid_en_device` en `bar_sessie_rpcs` (19) | Eén `insert into auth.sessions` in de helper. Losse `insert into bar_sessions` buiten de helper die `session_inactive`, `wrong_mode`, `no_bar_role` of `session_not_on_shift` verwachten, krijgen ook een rij (anders `session_ended`). |
| B. Leestests met alleen `request.jwt.claim.sub` | `rls_lid_eigen_rijen` (9 blokken), `bar_sessies_rls` (7) | Overstappen op `request.jwt.claims` met `session_id`, een `auth.sessions`-rij per account. Asserties ongewijzigd. |
| C. Guardvrije RPC's met alleen `claim.sub` | `update_own_name` (6), `list_own_transactions` (6) | Idem B. |
| D. Koppel-helpers | `link_claims` in `lid_account_koppelen` en `ledenbeheer`; `claims` in `account_koppeling_bewijs` | Een `auth.sessions`-rij voor de `session_id` van elke aanroep die moet koppelen. `account_koppeling_bewijs` heeft er al een paar; de koppelende sessie controleren. |
| E. Al met `auth.sessions`, controleren | `beheer_tweede_factor`, `beheer_tweede_factor_randgevallen`, `promotie_beheerder`, `set_own_pin`, `verify_bar_pin`, `bar_sessie_rpcs` (`act_as_user`) | Waarschijnlijk groen; aanroepen achter `require_session` met een `session_id` zonder rij afvangen. |
| F. Gates | `rls_leespolicies`, `rpc_catalogus` | Zie Gates. |
| G. Niet geraakt | `client_errors`, `login_throttle`, `rls_write_protection`, `rpc_execute_grants` (tenzij expliciete lijst) | Geen wijziging. |

`plan(...)` per bestand bijwerken waar asserties bijkomen. Omvang: ongeveer
25 bestanden, bijna allemaal één regel in een helper of een
claims-omzetting. Draai `npm run db:test` en werk de lijst af: elke rode
test met `session_ended`, `actor_not_found` of 0 rijen waar dat niet de
bedoeling was, is een fixture uit deze tabel.

- **TS-unittests**: geen. Ze dekken `money.ts`, het mandje en contrast.
- **e2e**: `portal-login.spec.ts`, `wachtwoord-vergeten.spec.ts` en
  `a11y.spec.ts` matchen `/auth/v1/logout(\?|$)` en
  `/auth/v1/user` (mock aanwezig, `supabaseMock.ts:172`). Dat blijft werken
  met `scope=local` en de extra `getUser`. De "niet gekoppeld"-scenario's
  (`portal-login.spec.ts:164`, `a11y.spec.ts:381`) moeten een geldige
  `/auth/v1/user` krijgen, anders tonen ze terecht het inlogscherm in plaats
  van `denied`. Nalopen in CI.

## Documentatie

- `docs/ARCHITECTURE.md`: alinea bij "Leespolicies zijn een allowlist"
  (deze spec voegt hem toe).
- ADR 0019 en 0020: verwijzing naar ADR 0022 in de statusregel (deze spec
  voegt die toe). Na de bouw zet Docs status en PR-nummer in ADR 0022 en
  hier.

## Expliciet buiten scope

- **Brede leestoegang koppelen aan een actieve bar-sessie** (bardienst op de
  portal ziet via RLS nog alles): ADR 0019 → Verworpen alternatieven blijft
  staan; portal-hooks scopen expliciet (ADR 0012 → Beslissing 2).
- **`jwt_expiry` wijzigen**, lokaal of op het gehoste project (keuze 1).
- **Globale tabellen afschermen** (keuze 3).
- **Een eigen tekst voor `elders_uitgelogd`** op de tablet of in de melding:
  de bestaande teksten kloppen (keuze 7).
- **Sessie-timebox / inactiviteit van GoTrue** (`not_after`): niet
  geconfigureerd.
- **De leeshooks (anders dan de twee sessie-hooks) laten reageren op een
  dood token**: één lege lezing tot de volgende auth-gebeurtenis is
  geaccepteerd (keuze 9).
- **`caller_has_bar_role` in `bar_sessions_select` e.d. gebruiken** in plaats
  van de inline `exists`: een opschoning, geen onderdeel van dit item.
