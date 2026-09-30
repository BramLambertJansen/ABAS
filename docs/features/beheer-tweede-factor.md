# Beheer met tweede factor, Auth-sessie intrekken, en hervatten per browser

Status: **concept.** De keuzes zijn gemaakt door Bram (2026-09-30), maar
een aantal vragen is nog open (onderaan) en de teksten wachten op
goedkeuring. De Developer begint pas na akkoord. Hoort bij
[ADR 0017](../adr/0017-beheer-eist-tweede-factor-en-eigen-loginlimiet.md).
Vult [`dienst-per-sessie.md`](dienst-per-sessie.md) aan. Dat bestand wordt
nu niet gewijzigd; zie "Later door te voeren".

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
het account en geen beheerschermen. Willen we hier ook aal2 eisen, dan is
dat een aparte vraag (zie Open vragen, 6).

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
- **Aan.** Geen knop om de factor uit te zetten (zie Buiten scope en Open
  vragen, 1).

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
  alleen voor een beheerder; zie Open vragen, 2.
- **Beheerder:** de rij in de portal, de code-stap op `/beheer` en in de
  herstelflows.

## Randgevallen

- **Beheerder na de uitrol, nog zonder factor:** geen beheer (de tegel staat
  uit), geen PIN op de bar, en de bar-sessie wordt niet hervat. Bar-werk met
  het wachtwoord kan gewoon.
- **Telefoon kwijt:** geen beheer tot de factor is teruggezet. Wie dat doet,
  is een open vraag (1). Tot er een antwoord is, kan het alleen via het
  Supabase-dashboard.
- **Onbeheerde actieve bar-sessie van een beheerder zonder factor:** die
  sessie kan zelf een factor toevoegen, en daarmee aal2 en beheer krijgen.
  Dat is hetzelfde restrisico als een gestolen apparaat, en het verdwijnt
  zodra de beheerder zelf een factor instelt. Daarom zo snel mogelijk
  instellen na de uitrol.
- **Bardienst:** heeft geen factor. Wie diens PIN kent op een vertrouwd
  apparaat, kan het wachtwoord van die bardienst wijzigen. Dat geeft geen
  beheer. Open vraag (3).
- **Een inactieve sessie na 60 minuten:** de Auth-sessie is weg. Is het
  access token nog geldig, dan verschijnt de melding "inactief". Is het
  verlopen, dan kan `my_bar_state` niet meer gelezen worden en volgt het
  startscherm zonder melding. Open vraag (4).
- **Afgemelde tablet (`admin_end_bar_session`):** een gekopieerd token kan
  niet meer verversen en geen `/auth/v1/user` meer aanroepen. PostgREST
  accepteert het access token tot het verloopt (`jwt_expiry` 3600); de RPC's
  weigeren al via de guard.
- **Klok van de telefoon loopt verkeerd:** TOTP faalt, met de gewone
  foutmelding.
- **Magic-link-login op `/beheer`:** daarna volgt de code-stap, net als na
  een wachtwoord.

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

**Unit (`test`):** de cookielogica in `barSessie.ts` (bevestigd alleen bij
een gelijk `session_id`, en wissen).

**e2e:**

- een tweede tabblad op `/beheer` laat de sessie staan;
- een nieuwe browsercontext toont hervatten of `niet_hervat`;
- de code-stap in `ModusKeuze`, gemockt of met een TOTP-bibliotheek in de
  test (keuze Developer);
- de portal-sheet Tweestapsverificatie.

## Uitrol

Komt bovenop de uitrol van `dienst-per-sessie.md`.

1. TOTP aanzetten op het gehoste project.
2. Controleren of `postgres` `auth.sessions` en `auth.mfa_factors` mag
   gebruiken (zie RPC's).
3. Deployen.
4. Elke beheerder stelt in de portal tweestapsverificatie in, te beginnen
   met Bram. Tot dan is er geen beheer.

## Expliciet buiten scope

- Een tweede factor voor bardienst of lid (open vraag 3).
- De factor zelf uitzetten of terugzetten in de app (open vraag 1).
- Herstelcodes, WebAuthn en sms.
- aal2 voor de beheerdersingrepen in bar-modus (open vraag 6).
- HttpOnly-sessiecookies (ADR 0017 → Verworpen).

## Teksten (voorstel, ter goedkeuring)

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

## Open vragen voor Bram

1. **Wie zet een factor terug bij een verloren telefoon?** Opties:
   - (a) alleen jij, via het Supabase-dashboard (geen bouw nodig);
   - (b) een andere beheerder via ledenbeheer, met een server-actie
     (ADR 0006) die de factoren van dat lid verwijdert. Dat vraagt zelf
     aal2;
   - (c) de beheerder zelf, na een herstelmail. Zwakker: wie de mailbox
     heeft, heeft dan beheer met alleen het wachtwoord.

   Tot er een antwoord is, geldt (a).
2. **Ziet een bardienst de rij Tweestapsverificatie ook** (vrijwillig), of
   alleen een beheerder? Het voorstel hierboven: alleen een beheerder.
3. **Restrisico bij bardienst:** wie de PIN van een bardienst kent en bij
   een vertrouwd apparaat kan, kan diens wachtwoord wijzigen. Dat geeft geen
   beheer, wel het account: portal en bar-logins als die persoon.
   Accepteer je dat? Of wil je ook voor bardienst een tweede factor, of een
   andere maatregel?
4. **Inactief na 60 minuten:** is het acceptabel dat de melding "Je bent
   uitgelogd" wegblijft als het access token ook al verlopen is (gevolg van
   het intrekken van de Auth-sessie)? Alternatief: bij `inactief` de
   Auth-sessie niet intrekken, en bij alle andere redenen wel.
5. **De teksten hierboven:** goedkeuren of aanpassen.
6. **Beheerdersingrepen vanuit bar-modus** (afsluiten, overnemen,
   afmelden): zonder aal2 laten, zoals nu besloten (12a/12c)? Of ook daar
   de code vragen?

## Later door te voeren in `dienst-per-sessie.md` en CLAUDE.md

Deze bestanden worden nu niet gewijzigd: een Developer werkt eraan op deze
branch. Na akkoord en na de merge van dat werk:

**`docs/features/dienst-per-sessie.md`:**

- **Schermflow punt 3:** "een vlag in `sessionStorage`" wordt "een
  sessiecookie met het `session_id` (zie `beheer-tweede-factor.md` → B)".
  "actieve sessie in modus `beheer`" wordt "een sessie met
  `resumable = false` (modus `beheer`, of de bar-sessie van een beheerder
  zonder tweede factor)".
- **Randgevallen, "Twee tabbladen in één browser":** aanvullen met "de
  hervat-bevestiging geldt voor de hele browser".
- **Randgevallen, PWA op iOS:** "`sessionStorage`" wordt "het sessiecookie".
- **Veiligheid, "Een PIN-sessie komt niet in beheer":** aanvullen. De
  PIN-sessie zelf komt niet in beheer (`mode_locked`), en het account ook
  niet via een wachtwoordwijziging, omdat beheer aal2 eist (ADR 0017).
- **Veiligheid, "Verloren of gestolen apparaat":** afmelden trekt ook de
  Auth-sessie in.
- **Veiligheid, "Wachtwoordpogingen via de namenlijst":** verwijzen naar
  `login-rate-limit.md`.
- **Inloggen op de bar, punt 4:** foutcode `pin_needs_mfa`.
- **RPC's:** de gewijzigde functies uit deze spec, en `aal2_required` en
  `mfa_not_enrolled` bij de codes van `register_bar_session`.
- **Zoals gebouwd, "De rate limit van Supabase Auth":** vervangen door een
  verwijzing naar `login-rate-limit.md`.

**CLAUDE.md:**

- **Auth:** na "Beheeracties (...) vragen een sessie in modus beheer" komt:
  "met een tweede factor (TOTP, aal2); de factor stel je in de portal in (ADR
  0017)". "een PIN-login geeft nooit beheer" blijft staan, nu met ADR 0017
  als afdwinging.
- **Domein, Dienst & bezetting:** geen wijziging.
- **ADR-verwijzingen in Auth:** "ADR 0002/0003/0016" wordt
  "ADR 0002/0003/0016/0017".

**ADR 0016:** status-regel "geamendeerd door ADR 0017 (Beslissing 4 en 7)".
**ADR 0002, 0003 en 0005:** idem, met een verwijzing naar ADR 0017.
