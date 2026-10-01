# Beheer met tweede factor, Auth-sessie intrekken, en hervatten per browser

Status: **gebouwd en gemerged
([PR #120](https://github.com/BramLambertJansen/ABAS/pull/120), 2026-10-01,
merge-commit `ae89bd9`; migraties `0034` en `0037`).** Goedgekeurd door Bram
(2026-09-30), inclusief de teksten; aangevuld na de tweede review (Bram,
2026-10-01) met besloten 10–13 en de teksten daarvan, ook gebouwd. Wat bij de
bouw afweek of erbij kwam, staat in "Zoals gebouwd" en gaat voor. De
uitrolstappen (zie Uitrol) staan niet als gedaan in de repo. Hoort bij
[ADR 0017](../adr/0017-beheer-eist-tweede-factor-en-eigen-loginlimiet.md).
Vult [`dienst-per-sessie.md`](dienst-per-sessie.md) aan; de verwijzingen
daar zijn bijgewerkt (zie "Doorgevoerd in bestaande documenten").

Deze spec dekt twee reviewbevindingen op PR #120:

- **A.** Een PIN-login (of een hervatte bar-sessie) kan het wachtwoord
  wijzigen, en daarmee beheer krijgen. Oplossing: tweede factor en Auth-sessie
  intrekken.
- **B.** Een tweede tabblad op `/beheer` beëindigt de beheersessie.
  Oplossing: hervatten per browser.

De eigen loginlimiet staat in [`login-rate-limit.md`](login-rate-limit.md).

## Besloten (Bram, 2026-09-30)

1. **Beheer eist een tweede factor (TOTP, aal2).** Bij het einde van een
   bar-sessie wordt ook de Auth-sessie (`auth.sessions`) verwijderd.
2. **De factor stel je in de portal in.**
3. **De hervat-bevestiging geldt per browser**, via een sessiecookie met het
   `session_id`.
4. **Een verloren factor zet Bram terug via het Supabase-dashboard.** De app
   krijgt daar geen functie voor.
5. **Alleen beheerders** zien en gebruiken de tweede factor.
6. **Het restrisico bij bardienst is geaccepteerd** (zie Randgevallen).
7. **De melding bij inactiviteit mag wegvallen** als het access token ook
   verlopen is. De Auth-sessie wordt bij elke reden ingetrokken.
8. **De beheerdersingrepen vanuit bar-modus vragen geen aal2.**
9. **De teksten zijn goedgekeurd.**

Aanvulling na de tweede review (Bram, 2026-10-01):

10. **Restrisico K1 is geaccepteerd:** PIN + vertrouwd apparaat + factor
    geeft via een wachtwoordwijziging beheer (zie Randgevallen). De regel is
    "een PIN-login geeft zonder tweede factor nooit beheer".
11. **Promotie naar beheerder beëindigt de bar-sessies** van dat lid, en
    daarmee de bijbehorende Auth-sessies (zie RPC's → `set_member_role`).
12. **Focus bij een nieuwe stap** gaat naar de kop van die stap (zie
    Schermflow → Toegankelijkheid).
13. **Geen stille uitlog** als de factorstatus in `ModusKeuze` niet gelezen
    kan worden (zie Schermflow → `/beheer`).

## Doel

- Wie alleen de PIN kent, een bar-sessie hervat of een wachtwoord heeft
  buitgemaakt, komt niet in beheer.
- Een beëindigde bar-sessie is ook voor Supabase Auth beëindigd.
- Twee tabbladen in één browser werken samen, ook op `/beheer`. "Browser
  dicht en weer open" vraagt nog steeds eerst om bevestiging.

## Betrokken shells

| Shell | Wat |
|---|---|
| `shells/portal` | Tweestapsverificatie instellen (tabblad Account). Code vragen bij wachtwoord wijzigen en herstellen, als het account een factor heeft. |
| `shells/bar`, `/beheer` | Code vragen na de login, vóór "Beheer" in `ModusKeuze`. Code vragen op `/beheer/wachtwoord-herstellen` als het account een factor heeft. |
| `shells/bar`, `/` | De PIN weigeren voor een beheerder zonder factor. Een bar-sessie van zo'n beheerder niet hervatten. Hervat-vlag per browser. |

Het invoeren van de code is één gedeeld component, bruikbaar in beide
shells. De functie wordt shell-onwetend: `features/` leest `useShell()`.
Eerst nagaan of `PinPad` (`src/features/dienst-starten/PinPad.tsx`, nu vier
cijfers) een instelbare lengte kan krijgen, vóór er een nieuw component
komt (CLAUDE.md → Componenten).

De hooks voor de factor leven per shell in de datalaag
(`src/hooks/queries/`), met de juiste client: `portalClient` in de portal
en `client` in de bar-shell. Die scheiding eist ADR 0009 en `check:arch`
bewaakt haar.

## Geldlaag en attributie

Geen wijziging. Geen enkele geld-RPC verandert. `served_by`/`reversed_by`
komen nog steeds uit de bezetting, en bar-RPC's kijken niet naar aal. Deze
spec gaat alleen over wie een sessie in modus `beheer` krijgt, en wie het
account kan wijzigen.

## Datamodel

Geen nieuwe tabel. Gelezen wordt `auth.mfa_factors`: een rij met
`user_id = members.auth_user_id`, `factor_type = 'totp'` en
`status = 'verified'`.

Er komt een interne helper `member_has_verified_factor(p_auth_user_id uuid)
returns boolean`: `security definer`, en geen `EXECUTE` voor `PUBLIC`,
`anon`, `authenticated` of `service_role` (patroon uit `0018` en `0028`).

## RPC's en functies (nieuwe migratie)

### `register_bar_session(p_mode)`

Bij `p_mode = 'beheer'` komen er, na de bestaande rolcontrole
(`no_admin_role`), twee controles bij:

1. geen geverifieerde factor → `mfa_not_enrolled`;
2. `coalesce(auth.jwt()->>'aal', '') <> 'aal2'` → `aal2_required`.

`p_mode = 'bar'` blijft zoals het is: geen code nodig voor bar-werk.

### `require_beheer_session()`

Eist daarnaast `aal2`, anders `aal2_required`. De aal van een sessie daalt
niet bij verversen, dus in de praktijk is dit een tweede slot achter
`register_bar_session`. Toch krijgt elke beheer-RPC hiervoor een negatieve
test.

`aal2_required` komt bij de sessiecodes in `src/lib/barSessie.ts`. Die
krijgen dezelfde centrale afhandeling als `wrong_mode`: niet naar
`client_errors`, lokaal uitloggen, en daarna de beheerlogin.

### Ongewijzigd: de beheerdersingrepen in bar-modus

Dat zijn `admin_end_shift`, `admin_take_over_shift` en
`admin_end_bar_session`, besloten 12a en 12c in `dienst-per-sessie.md`. Ze
vragen modus `bar` en rol `beheerder`, geen aal2. Ze geven geen toegang tot
het account en geen beheerschermen. Ze blijven zonder aal2 (besloten, 8).

### `verify_bar_pin` en `bar_login_options`

Een lid met rol `beheerder` zonder geverifieerde factor kan niet met de PIN
inloggen.

- `verify_bar_pin` geeft `result_code = 'pin_needs_mfa'`, zonder de
  foutteller op te hogen.
- `bar_login_options` geeft `pin_available = false` met een extra vlag
  `pin_needs_mfa = true`, zodat het inlogscherm de juiste tekst toont.

Voor een bardienst verandert er niets. De rol is al openbaar via de
namenlijst, dus deze vlag verklapt niets nieuws.

### `my_bar_state()`

`session` krijgt een veld `resumable boolean`. Dat is `false` in twee
gevallen:

- de sessie staat in modus `beheer`;
- de sessie staat in modus `bar` en is van een beheerder zonder
  geverifieerde factor.

In alle andere gevallen is het `true`.

`BarSessieProvider` gebruikt `resumable` in plaats van `mode === 'beheer'`
om te beslissen tussen het hervatscherm en `end_bar_session(false,
'niet_hervat')`.

### `close_bar_session_internal`

Na het sluiten van de `bar_sessions`-rij volgt
`delete from auth.sessions where id = <auth_session_id>`. Dat geldt voor
elke reden, dus ook via `end_member_bar_sessions`, `admin_end_bar_session`
en `close_inactive_bar_sessions`. Ontbreekt de rij, dan is dat geen fout.

**Te controleren op het gehoste project:** mag de eigenaar van de functie
(`postgres`) uit `auth.sessions` verwijderen en `auth.mfa_factors` lezen?
Zo niet, dan terug naar de Architect. De Developer kiest dan geen eigen
omweg.

### `set_member_role`: promotie naar beheerder (besloten, 11)

**Probleem.** Een bardienst heeft geen factor. Een lopende PIN-sessie (aal1,
amr `otp`) van een bardienst die beheerder wordt, is daarna de sessie van een
beheerder zonder factor. Die sessie kan zonder huidig wachtwoord het
wachtwoord wijzigen, of zelf een factor toevoegen, en zo beheer krijgen. Dat
is precies het gat dat Beslissing 1 van ADR 0017 sluit voor nieuwe sessies
(`pin_needs_mfa`, `resumable = false`); voor een sessie die al loopt op het
moment van promotie sluit niemand het.

**Wijziging:**

- Wijzigt `set_member_role` de rol van een lid van iets anders naar
  `beheerder`, dan eindigen diens actieve bar-sessies meteen, met de
  sluitreden **`beheerder_geworden`**. Is de rol al `beheerder`, dan
  gebeurt er niets.
- Mechanisme: hetzelfde als bij archiveren of rol `lid`.
  `end_member_bar_sessions` krijgt de sluitreden als parameter:
  `end_member_bar_sessions(p_member_id uuid, p_reason text)`, met
  `p_reason in ('geen_bar_rol', 'beheerder_geworden')`, anders een fout. De
  oude signatuur met één parameter vervalt (geen overload laten staan).
  Rechten zoals nu: voor geen enkele API-rol uitvoerbaar.
- Via `close_bar_session_internal` verdwijnen daarmee ook de koppelingen
  (`left_reason = 'beheerder_geworden'`, met een melding bij een wees-dienst)
  en de Auth-sessie van elke bar-sessie (Beslissing 2).
- Het PIN-vertrouwen op alle apparaten vervalt ook (`bar_device_members`),
  zoals bij archiveren: hetzelfde mechanisme. De nieuwe beheerder logt na
  het instellen van de factor één keer per apparaat met het wachtwoord in
  via de namenlijst; daarna werkt de PIN weer.
- Alleen de Auth-sessies die bij een bar-sessie horen, worden ingetrokken.
  Een portal-sessie van het lid blijft staan: die komt uit een login met
  wachtwoord of uit een magic link naar het eigen adres, en wie dat heeft,
  kan het wachtwoord sowieso herstellen. Een beheersessie bestaat voor een
  bardienst niet.
- `beheerder_geworden` komt bij de toegestane waarden van
  `bar_sessions.end_reason`, `shift_sessions.left_reason` en
  `admin_notifications.reason`, en overal waar `geen_bar_rol` nu in een
  lijst van sluitredenen staat (o.a. `left_shift_open` in `my_bar_state`).
- Client: `sessieMeldingReden` (`src/lib/barSessie.ts`) geeft bij
  `beheerder_geworden` een eigen reden `beheerder_geworden` (niet
  `rol_gewijzigd`: die tekst zegt "mag niet meer op de bar werken", en dat
  klopt hier niet). `AdminMeldingReden` en `toMelding`
  (`src/lib/barState.ts`) krijgen de waarde erbij, met een eigen tekst in
  `adminMeldingReden`. Teksten: zie Teksten (goedgekeurd 2026-10-01).

**Waarom niet `rol_gewijzigd` als sluitreden?** Die naam bestaat al als
melding-reden aan de client-kant (de vertaling van `geen_bar_rol`). Dezelfde
naam voor een andere sluitreden maakt de mapping dubbelzinnig.

### Rechten

Elke nieuwe of gewijzigde functie trekt `EXECUTE` in voor `PUBLIC`/`anon`,
zoals `0018` eist. `rpc_execute_grants.test.sql` bewaakt dat.

## Config

- **Lokaal en CI:** in `supabase/config.toml` `[auth.mfa.totp]` met
  `enroll_enabled = true` en `verify_enabled = true`.
- **Gehost:** TOTP aan in het dashboard (Auth → MFA). Dit is een
  uitrolstap; zie Uitrol.

## Schermflow

### Portal, tabblad Account (alleen rol `beheerder`)

Een nieuwe rij **Tweestapsverificatie**, onder "Pincode voor de
bar-tablet". Status: "Aan" of "Uit".

- **Uit → instellen.** Een sheet in drie stappen:
  1. `mfa.enroll({ factorType: 'totp' })`. Toon de QR-code en de geheime
     sleutel als tekst, om over te typen.
  2. De gebruiker voert de 6-cijferige code in.
     `mfa.challenge` + `mfa.verify`, of `challengeAndVerify`.
  3. De sheet sluit, met de toast "Tweestapsverificatie ingesteld".

  Een niet-afgemaakte factor (`unverified`) wordt bij een nieuwe poging
  eerst verwijderd, zodat het instellen altijd opnieuw kan.
- **Aan.** Geen knop om de factor uit te zetten (zie Buiten scope; besloten,
  4).

### Portal: wachtwoord wijzigen en herstellen

Heeft het account een geverifieerde factor en is de sessie aal1
(`mfa.getAuthenticatorAssuranceLevel()`: `nextLevel = 'aal2'`,
`currentLevel = 'aal1'`)? Dan vraagt de sheet of het herstelscherm eerst de
code (challenge en verify). Pas daarna volgt `updateUser({ password })`.
Zonder die stap weigert GoTrue met `insufficient_aal`.

### `/beheer`: login en `ModusKeuze`

De login zelf (wachtwoord of magic link) blijft zoals hij is. In
`ModusKeuze` verandert voor een beheerder de tegel "Beheer":

- **Geen factor:** de tegel staat uit, met de uitleg om eerst in de portal
  tweestapsverificatie in te stellen. "Bar" werkt gewoon.
- **Wel een factor, sessie aal1:** een tik op "Beheer" toont eerst de
  code-invoer. Na verify volgt `register_bar_session('beheer')`. Het
  `session_id` blijft na verify hetzelfde; alleen de aal stijgt.
- **Code fout:** foutmelding, opnieuw proberen. De limiet op pogingen is
  die van GoTrue (`FactorVerify`, per IP). Die draait hier in de browser,
  dus per gebruiker.
- **Factorstatus niet te lezen (besloten, 13).** Nu blijft de tegel dan aan
  en gaat een tik direct naar `register_bar_session('beheer')`. Is de sessie
  aal1, dan volgt `aal2_required` en de centrale afhandeling logt stil uit.
  Dat vervalt. Wordt: bij een leesfout toont een tik op "Beheer" de
  code-stap, net als bij een factor met aal1. Verify zoekt de factor zelf op;
  lukt dat niet (geen factor, of opnieuw een leesfout), dan volgt de
  bestaande foutregel "er ging iets mis, probeer het opnieuw", en kan de
  gebruiker met "Annuleren" terug naar de tegels en "Bar" kiezen. Een sessie
  die al aal2 was, voert de code dan één keer te veel in; dat is
  onschuldig. Geen nieuwe tekst nodig.

### Toegankelijkheid: focus bij een nieuwe stap (besloten, 12)

Verschijnt er binnen hetzelfde scherm een nieuwe stap, dan gaat de focus naar
de kop van die stap (een `h1`/`h2` met `tabIndex={-1}`), zoals
`BarInloggen` dat met `focusNaWissel` doet. Alleen bij een wissel door de
gebruiker, niet bij de eerste weergave. Dat geldt voor:

- `ModusKeuze`: tik op "Beheer" → de kop van de code-stap ("Code uit je
  authenticator-app"); "Annuleren" → terug op de tegel "Beheer";
- `/beheer/wachtwoord-herstellen` en `/portal/wachtwoord-herstellen`:
  "Wachtwoord opslaan" → de kop van de code-stap;
- de portal-sheet "Wachtwoord wijzigen": na de code → de kop van de stap met
  de wachtwoordvelden;
- de portal-sheet Tweestapsverificatie: stap 1 → stap 2 (de kop "Code
  invoeren").

Een foutregel na een verkeerde code blijft een `role="alert"`; de focus
blijft dan in de code-invoer.

### `/beheer/wachtwoord-herstellen`

Zelfde regel als bij het herstellen in de portal: heeft het account een
factor, dan eerst de code, dan het nieuwe wachtwoord.

### Bar: inloggen met PIN

Staat `pin_needs_mfa` aan, dan toont het inlogscherm het wachtwoordveld met
de tekst "PIN: beheerder zonder tweede factor" (zie Teksten).

### Bar: hervatten

Staat `resumable = false`, dan is er geen hervatscherm. De app sluit de
sessie met `niet_hervat` en toont het startscherm. Voor modus `beheer` is dat
de beheerlogin, zoals nu.

## B. Hervatten per browser in plaats van per tabblad

**Probleem.** De vlag "hervat bevestigd" (`RESUME_STORAGE_KEY` in
`src/lib/barSessie.ts`) staat in `sessionStorage`, en dat is per tabblad.
Een nieuw tabblad zonder vlag laat `BarSessieProvider` (r.148-158)
`end_bar_session(false, 'niet_hervat')` aanroepen op de sessie die alle
tabbladen delen. Het eerste tabblad krijgt daarna `session_ended`.

**Wijziging:**

- **Een sessiecookie wordt de vlag.** Het heet `abas_bar_bevestigd`, zonder
  `Max-Age`/`Expires`, met `Path=/`, `SameSite=Strict` en `Secure` op https.
  Het is niet `HttpOnly`: het is alleen UX, en de client moet het kunnen
  zetten en lezen.
- **De waarde is het `session_id`** uit het JWT van de huidige sessie.
  Bevestigd betekent: het cookie bestaat én is gelijk aan het huidige
  `session_id`. Een vlag van een vorige sessie bevestigt dus geen nieuwe
  login.
- **`isResumeConfirmed`, `confirmResume` en `clearResume`** krijgen het
  `session_id` mee en lezen of schrijven het cookie. `browserSessionStorage`
  vervalt voor dit doel. De vlaggen "melding gezien" (`abas.bar.melding.*`)
  mogen in `sessionStorage` blijven.
- **Uitloggen en lokaal uitloggen** verwijderen het cookie (`Max-Age=0`).

**Gedrag:**

- **Nieuw tabblad in dezelfde browser:** bevestigd, geen hervatscherm en
  geen `niet_hervat`.
- **Browser dicht en weer open:** het cookie is weg, dus het hervatscherm
  (modus `bar`) of `niet_hervat` (niet te hervatten sessie).
- **Restrisico, gelijk aan nu:** Chrome/Edge met "Doorgaan waar je was
  gebleven" en de iOS-PWA kunnen sessiecookies bewaren, zoals ze nu
  `sessionStorage` herstellen. Dan verschijnt het hervatscherm niet. Testen
  op de echte iPad.

## Rolzichtbaarheid

- **Lid en bardienst:** niets nieuws. De rij Tweestapsverificatie staat er
  alleen voor een beheerder (besloten, 5).
- **Beheerder:** de rij in de portal, de code-stap op `/beheer` en in de
  herstelflows.

## Randgevallen

- **Beheerder na de uitrol, nog zonder factor:** geen beheer (de tegel staat
  uit), geen PIN op de bar, en de bar-sessie wordt niet hervat. Bar-werk met
  het wachtwoord kan gewoon.
- **Telefoon kwijt:** geen beheer tot Bram de factor via het
  Supabase-dashboard verwijdert (Authentication → Users → het account → MFA).
  Daarna stelt de beheerder in de portal een nieuwe in (besloten, 4).
- **Onbeheerde actieve bar-sessie van een beheerder zonder factor:** die
  sessie kan zelf een factor toevoegen, en daarmee aal2 en beheer krijgen.
  Dat is hetzelfde restrisico als een gestolen apparaat, en het verdwijnt
  zodra de beheerder zelf een factor instelt. Daarom zo snel mogelijk
  instellen na de uitrol.
- **Bardienst:** heeft geen factor. Wie diens PIN kent op een vertrouwd
  apparaat, kan het wachtwoord van die bardienst wijzigen. Dat geeft geen
  beheer. Geaccepteerd restrisico (besloten, 6).
- **Een inactieve sessie na 60 minuten:** de Auth-sessie is weg. Is het
  access token nog geldig, dan verschijnt de melding "inactief". Is het
  verlopen, dan kan `my_bar_state` niet meer gelezen worden en volgt het
  startscherm zonder melding. Akkoord (besloten, 7).
- **Afgemelde tablet (`admin_end_bar_session`):** een gekopieerd token kan
  niet meer verversen en geen `/auth/v1/user` meer aanroepen. PostgREST
  accepteert het access token tot het verloopt (`jwt_expiry` 3600); de RPC's
  weigeren al via de guard.
- **Klok van de telefoon loopt verkeerd:** TOTP faalt, met de gewone
  foutmelding.
- **Magic-link-login op `/beheer`:** daarna volgt de code-stap, net als na
  een wachtwoord.
- **K1: PIN + vertrouwd apparaat + factor (besloten, 10).** Wie de PIN van
  een beheerder kent, bij een voor die beheerder vertrouwd apparaat kan én
  diens authenticator heeft, kan in de PIN-sessie de code invoeren (aal2),
  dan zonder huidig wachtwoord een nieuw wachtwoord zetten (GoTrue vraagt
  dat niet bij amr `otp`) en daarmee op `/beheer` beheer krijgen. Dat is
  PIN + apparaat + factor, vergelijkbaar met wachtwoord + factor.
  Geaccepteerd restrisico (Bram, 2026-10-01). Een PIN-login geeft dus
  zonder tweede factor nooit beheer, maar mét factor wel.
- **Bardienst wordt beheerder terwijl diens bar-sessie loopt (besloten,
  11):** de sessie eindigt meteen (`beheerder_geworden`), met de
  Auth-sessie en het PIN-vertrouwen. Het apparaat toont de melding uit
  Teksten. Loopt er een dienst die daardoor zonder apparaat komt, dan
  krijgen de beheerders de gewone melding, met de reden uit Teksten. Daarna
  geldt wat voor elke beheerder zonder factor geldt: geen PIN, wel bar-werk
  met het wachtwoord.
- **Beheerder promoveert een lid zonder bar-sessie** (rol `lid` →
  `beheerder`): er is niets te beëindigen; alleen het PIN-vertrouwen (als
  dat er is) vervalt.

## Tests

**pgTAP (`db:test`):**

- `register_bar_session('beheer')`:
  - weigert zonder factor (`mfa_not_enrolled`);
  - weigert met een factor en aal1 (`aal2_required`);
  - slaagt met aal2;
  - `'bar'` slaagt met aal1.
- Elke beheer-RPC weigert een beheersessie met aal1 (`aal2_required`), in
  een test over alle RPC's (patroon van `rpc_execute_grants.test.sql`).
- `verify_bar_pin`:
  - beheerder zonder factor → `pin_needs_mfa`, teller ongewijzigd;
  - beheerder met factor → `ok`;
  - bardienst ongewijzigd.
- `bar_login_options` geeft `pin_needs_mfa`.
- `my_bar_state().session.resumable` klopt voor de drie gevallen: beheer,
  bar-beheerder zonder factor, en de rest.
- `close_bar_session_internal` verwijdert de `auth.sessions`-rij, voor elke
  reden.
- `member_has_verified_factor` is niet uitvoerbaar voor API-rollen.
- `set_member_role` naar `beheerder` (aanvulling 2026-10-01): sluit de
  actieve bar-sessies met `beheerder_geworden`, verwijdert hun
  `auth.sessions`-rijen, trekt het PIN-vertrouwen in, en maakt bij een
  wees-dienst een melding met die reden; `beheerder` → `beheerder` doet
  niets; `end_member_bar_sessions` weigert een andere reden.

**Unit (`test`):** de cookielogica in `barSessie.ts` (bevestigd alleen bij
een gelijk `session_id`, en wissen); `sessieMeldingReden` en `toMelding` met
`beheerder_geworden`.

**e2e:**

- een tweede tabblad op `/beheer` laat de sessie staan;
- een nieuwe browsercontext toont hervatten of `niet_hervat`;
- de code-stap in `ModusKeuze`, gemockt of met een TOTP-bibliotheek in de
  test (keuze Developer);
- de portal-sheet Tweestapsverificatie;
- de focus na elke stapwissel uit Toegankelijkheid;
- een leesfout van de factorstatus (gemockt) toont na "Beheer" de code-stap
  en logt niet uit.

## Uitrol

Komt bovenop de uitrol van `dienst-per-sessie.md`.

1. TOTP aanzetten op het gehoste project.
2. Controleren of `postgres` `auth.sessions` en `auth.mfa_factors` mag
   gebruiken (zie RPC's).
3. Deployen.
4. Elke beheerder stelt in de portal tweestapsverificatie in, te beginnen
   met Bram. Tot dan is er geen beheer.

## Expliciet buiten scope

- Een tweede factor voor bardienst of lid (besloten, 5 en 6).
- De factor zelf uitzetten of terugzetten in de app (besloten, 4).
- Herstelcodes, WebAuthn en sms.
- aal2 voor de beheerdersingrepen in bar-modus (besloten, 8).
- HttpOnly-sessiecookies (ADR 0017 → Verworpen).

## Teksten (goedgekeurd door Bram, 2026-09-30)

| Plek | Tekst |
|---|---|
| Portal, rij | Tweestapsverificatie |
| Portal, rij, status | Aan / Uit |
| Portal, rij, uitleg | Nodig om in beheer te komen. Je gebruikt een app zoals Google Authenticator of Microsoft Authenticator. |
| Sheet, stap 1, titel | Tweestapsverificatie instellen |
| Sheet, stap 1, uitleg | Scan deze code met je authenticator-app. Lukt scannen niet, typ dan deze sleutel over: |
| Sheet, stap 1, knop | Volgende |
| Sheet, stap 2, titel | Code invoeren |
| Sheet, stap 2, uitleg | Voer de 6 cijfers in die je app nu toont. |
| Sheet, stap 2, knop | Bevestigen |
| Toast | Tweestapsverificatie ingesteld |
| Code-invoer, fout | onjuiste code — probeer het opnieuw |
| Code-invoer, te veel pogingen | te veel pogingen — probeer het over een paar minuten opnieuw |
| `/beheer`, `ModusKeuze`, code-stap titel | Code uit je authenticator-app |
| `/beheer`, tegel Beheer uit (geen factor) | Stel eerst tweestapsverificatie in via de portal (Account). |
| Wachtwoord wijzigen/herstellen, code-stap | Voer eerst de code uit je authenticator-app in. |
| Bar, PIN: beheerder zonder tweede factor | Als beheerder kun je pas met je pincode inloggen als je tweestapsverificatie hebt ingesteld in de portal. |

### Aanvulling 2026-10-01 (goedgekeurd door Bram, 2026-10-01)

| Plek | Tekst |
|---|---|
| Bar, melding na `beheerder_geworden` (`SESSIE_MELDINGEN`), titel | Je bent uitgelogd *(bestaande titel)* |
| Bar, melding na `beheerder_geworden`, uitleg | Je bent nu beheerder. Log opnieuw in om verder te gaan. |
| Beheerdermelding "Dienst zonder apparaat", reden `beheerder_geworden` (`adminMeldingReden`) | {naam} is beheerder geworden en daarom uitgelogd. |

## Doorgevoerd in bestaande documenten (2026-09-30)

- **`docs/features/dienst-per-sessie.md`:**
  - status-regel met een verwijzing naar ADR 0017 en de twee specs;
  - Inloggen op de bar, punt 1 (namenlijst zonder rol) en punt 4 (codes
    `pin_needs_mfa` en `rate_limited`), plus de alinea "Een PIN-login geeft
    geen beheer";
  - Schermflow punt 3 (sessiecookie, `resumable`);
  - Veiligheid (namenlijst, wachtwoordpogingen, PIN-sessie en account,
    verloren apparaat);
  - Rolzichtbaarheid en Randgevallen (twee tabbladen, PWA op iOS);
  - Zoals gebouwd (codes van `register_bar_session`, de rate limit) en de
    uitrolstap op het echte tablet.
- **CLAUDE.md → Auth:** beheer vraagt modus beheer met een tweede factor
  (aal2), en een PIN-login geeft zonder tweede factor nooit beheer (ADR
  0017; bijgesteld 2026-10-01 na K1).
- **ADR 0002, 0003, 0005 en 0016:** een amendementregel met een verwijzing
  naar ADR 0017.

## Zoals gebouwd (2026-09-30 en 2026-10-01, gemerged in PR #120)

Wat er afwijkt van of bijkomt op de spec hierboven, en waarom.

- **Migratie `0034_beheer_tweede_factor.sql`.** `member_has_verified_factor`
  (voor geen API-rol uitvoerbaar), `require_beheer_session` en
  `check_beheer_session` (0031) met `aal2_required` ná de bestaande checks
  (een sessie in de verkeerde modus houdt `wrong_mode`),
  `register_bar_session` met `mfa_not_enrolled` en `aal2_required` direct na
  `no_admin_role`, `close_bar_session_internal` met de `delete from
  auth.sessions`, `bar_pin_state` met `pin_needs_mfa` en `my_bar_state` met
  `session.resumable`.
- **`pin_needs_mfa` staat in `bar_pin_state`, vlak vóór `ok`.** Zo geeft
  `verify_bar_pin` de code terug zonder zelf te veranderen en zonder de
  foutteller te raken, en krijgt `bar_login_options` de vlag uit dezelfde
  bron. Gevolg: de vlag verschijnt alleen als de PIN anders zou werken
  (vertrouwd apparaat, PIN ingesteld, geen lockout); een geblokkeerde PIN
  blijft `pin_locked`. `bar_login_options` is opnieuw aangemaakt (extra
  uitvoerkolom) en krijgt zijn grants opnieuw.
- **Het gedeelde code-component** is `src/components/CodeInvoer.tsx`, een
  schil om `PinToetsenbord`, dat een instelbare lengte en een eigen
  statuslabel kreeg (`PinPad` zelf bleef ongewijzigd: dat bevat de
  bar-specifieke `StaffHeader`). Zonder knop gaat de code weg bij het zesde
  cijfer (modus-keuze, wachtwoordflows); in de portal-sheet volgt eerst
  "Bevestigen". De pure MFA-logica en de teksten staan in `src/lib/mfa.ts`;
  de hooks per shell zijn `useBarMfa` en `usePortalTweestap`, en de
  wachtwoordhooks kregen een code-stap.
- **Een herstellink levert het token pas bij "Wachtwoord opslaan" in** (ADR
  0008). Daarom vraagt `/beheer/wachtwoord-herstellen` en
  `/portal/wachtwoord-herstellen` de code ná het invullen van het nieuwe
  wachtwoord en vóór `updateUser`: eerder is niet bekend of het account een
  factor heeft. In de portal-sheet "Wachtwoord wijzigen" komt de code wél
  eerst, vóór de velden.
- **`ModusKeuze`.** De tegel "Beheer" staat uit met `aria-disabled` (niet
  `disabled`), zodat hij met de uitleg focusbaar en voorleesbaar blijft. De
  code-stap heeft een knop "Annuleren" (bestaande tekst) terug naar de
  tegels. Kan de factorstatus niet gelezen worden, dan blijft de tegel aan
  en toont een tik eerst de code-stap (besloten 13, gebouwd 2026-10-01, zie
  hieronder).
- **Leesfout van de factorstatus (besloten 13, 2026-10-01).** `kiesBeheer`
  in `Assortimentbeheer.tsx` toont de code-stap bij `mfa.status === "error"`
  net als bij een factor met aal1; er gaat dan geen
  `register_bar_session('beheer')` meer op een aal1-sessie uit. Lukt verify
  niet (de factor opnieuw niet te lezen), dan geeft `verifieerCode`
  (`src/lib/mfa.ts`) `unknown` en toont `CodeInvoer` de bestaande regel "er
  ging iets mis, probeer het opnieuw".
- **Focus bij een nieuwe stap (besloten 12, 2026-10-01).** Het patroon uit
  `BarInloggen` is een gedeelde hook geworden: `src/hooks/useFocusNaWissel.ts`
  (`markeer()` in de handler van de gebruikersactie, daarna focus naar het
  doel van de nieuwe stap). `BarInloggen` gebruikt hem zelf ook. Doelen:
  `ModusKeuze` de kop "Code uit je authenticator-app" (`h2`,
  `tabIndex={-1}`) na "Beheer", en de tegel "Beheer" na "Annuleren";
  `TweestapSheet` de titel van de sheet ("Code invoeren") na "Volgende";
  `WachtwoordWijzigenSheet` de titel van de sheet ("Wachtwoord wijzigen")
  na een geldige code. `Overlay` kreeg daarvoor een optionele `titleRef`
  (de titel krijgt dan `tabIndex={-1}`). Op `/beheer/wachtwoord-herstellen`
  en `/portal/wachtwoord-herstellen` had de code-stap geen kop: de bestaande
  regel "Voer eerst de code uit je authenticator-app in." is daar nu een
  `h2` (zelfde opmaak, zelfde tekst), en die krijgt de focus na
  "Wachtwoord opslaan". In de portal-sheet "Wachtwoord wijzigen" heeft de
  stap met de velden geen eigen kop; de titel van de sheet is die kop.
- **Hervatten.** `useBarAuth` levert het `session_id` uit het access token;
  `BarSessieProvider` leest het cookie bij elke render en sluit een niet te
  hervatten sessie hooguit één keer per sessie met `niet_hervat`.
  `aal2_required` staat in `SESSION_ERROR_CODES` en logt centraal lokaal uit.
- **Portal-rij** alleen voor een niet-gearchiveerde beheerder (zelfde regel
  als de PIN-rij). "Aan" is geen knop. De QR-code heeft als alt-tekst
  "QR-code"; de spec gaf daar geen tekst voor.
- **Seed en CI.** `supabase/config.toml` zet TOTP aan. Femke Bos heeft in
  `supabase/seed.sql` een geverifieerde TOTP-factor met een vast secret;
  `e2e/helpers/totp.ts` rekent de code uit, zodat de a11y-tests op `/beheer`
  echt aal2 halen. Een eigen fixture `e2e.profiel.tweestap@aurora.local`
  (beheerder zonder factor) dekt het instellen in de portal; de test ruimt de
  factor op via de Admin API.
- **Tests.** pgTAP: `beheer_tweede_factor.test.sql` (nieuw) en een ronde
  aal1 in `beheer_rpcs_modus.test.sql`; de testhelpers voor een beheersessie
  zetten nu `aal2`. Unit: `test/mfa.test.ts`, de cookielogica in
  `test/barSessie.test.ts`. e2e: `e2e/beheer-tweede-factor.spec.ts`
  (gemockt), de portal-tests in `e2e/portal-profiel.spec.ts` en de echte
  code-stap in `e2e/a11y.spec.ts`. Aanvulling 2026-10-01: in
  `e2e/beheer-tweede-factor.spec.ts` de focus na "Beheer", "Annuleren" en
  "Wachtwoord opslaan" (beheer en portal), geen focus zonder wissel, en twee
  tests met een gemockte leesfout (`GET /auth/v1/user` 500): de code-stap,
  geen registratie en geen uitlog, de foutregel als verify ook niet kan
  lezen, en een geslaagde beheersessie als verify wel kan lezen. In
  `e2e/portal-profiel.spec.ts` de focus in beide sheets.
- **Promotie naar beheerder (besloten 11, gebouwd 2026-10-01).** Migratie
  `0037_promotie_beheerder_sluit_bar_sessies.sql`: `end_member_bar_sessions`
  krijgt de sluitreden als parameter (`geen_bar_rol` of `beheerder_geworden`,
  anders `invalid_reason`; de versie met één parameter vervalt);
  `set_member_role` naar `beheerder` sluit de bar-sessies met
  `beheerder_geworden`, met hun koppelingen, Auth-sessies, PIN-vertrouwen en
  een melding bij een wees-dienst; `beheerder_geworden` staat in de checks
  van `end_reason`, `left_reason` en `admin_notifications.reason` en telt in
  `left_shift_open`. Client: eigen melding-reden in `sessieMeldingReden`,
  `AdminMeldingReden` en `toMelding`, met de goedgekeurde teksten. Tests:
  `promotie_beheerder.test.sql` (nieuw), de promotie-asserties in
  `beheer_rpcs_modus.test.sql` (de oude "beëindigt niets"-asserties zijn
  omgedraaid), `rpc_execute_grants.test.sql` (nieuwe signatuur) en
  `test/beheerderGeworden.test.ts`.
