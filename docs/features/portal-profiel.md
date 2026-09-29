# Portal-profiel: naam, wachtwoord en eigen bar-PIN

**Status: gebouwd en gemerged (2026-09-28, [PR #110](https://github.com/BramLambertJansen/ABAS/pull/110), merge-commit `3df726d`).**
Geaccordeerd door Bram (2026-09-28): besluiten 1–7, alle teksten en ADR 0012.
Waar de bouw van deze spec afwijkt, staat in "Zoals gebouwd" hieronder; die
sectie gaat voor op de rest van dit document.
Introduceert een nieuwe architectuurbeslissing, zie
[ADR 0012](../adr/0012-portal-eigen-data-voor-elke-rol.md), geaccepteerd
samen met besluit 1.

Spec voor [issue #17](https://github.com/BramLambertJansen/ABAS/issues/17).
Volgt op [#15](https://github.com/BramLambertJansen/ABAS/issues/15)
(portal-login, gebouwd, `docs/features/portal-login.md`),
[#16](https://github.com/BramLambertJansen/ABAS/issues/16) (portal-dashboard,
gebouwd, `docs/features/portal-dashboard.md`) en
[#3](https://github.com/BramLambertJansen/ABAS/issues/3) (PIN-opslag/hashing,
`docs/ARCHITECTURE.md` → "PIN storage/hashing (settled, 2026-08-26)").

De portal liet tot nu toe alleen rol `lid` binnen. Daardoor kon **geen enkel
lid dat ook bardienst/beheerder is** het profielscherm bereiken, en was het
PIN-deel van het acceptatiecriterium niet te bouwen. Bram heeft besloten dat
de portal het lid-deel wordt voor elke rol (besluit 1, ADR 0012). Zie
"Besloten door Bram (2026-09-28)" onderaan voor alle zeven besluiten; dit
document is daarop bijgewerkt. Eén punt staat na de bouw nog open: zie
"Zoals gebouwd" → Open.

Bouwt voort op ADR
[0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md) (actorcheck
via `auth.uid()`, `select * into v_actor`),
[0005](../adr/0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md)
(wachtwoord verplicht, PIN optionele snelkoppeling, alleen-PIN verboden),
[0007](../adr/0007-rol-lid-leest-alleen-eigen-rijen.md) (rol `lid` leest
alleen eigen rijen) en
[0009](../adr/0009-portal-sessie-eigen-cookienaam.md) (portal gebruikt
`portalClient.ts`/`portalServer.ts`, afgedwongen door `check:arch`) en
[0012](../adr/0012-portal-eigen-data-voor-elke-rol.md) (portal voor elke rol,
alleen eigen data, leeshooks scopen expliciet).

## Zoals gebouwd (PR #110, 2026-09-28)

De bouw volgt de spec, op deze punten na. Elk punt is tegen de code op
`main` (`3df726d`) nagelopen.

- **Testplan → e2e, stap 3 en 4 zijn één test.** "portal-PIN instellen zet
  de bardienst in de stafkeuze, verwijderen haalt hem eruit" staat in
  `e2e/a11y.spec.ts`, binnen `test.describe.serial("stateful bar-shell
  scenarios (shared session)")`, na `ensureNoOpenShift()`. De portal draait
  in een tweede tab van dezelfde browsercontext (eigen cookie, ADR 0009).
  De test gebruikt alleen de eigen fixture `e2e.profiel.bardienst`, en ruimt
  een PIN van een afgebroken eerdere run eerst op. Er staat dus geen
  PIN-test in `e2e/portal-profiel.spec.ts` → live backend. Daar staan Anna
  (alleen lezen), `e2e.profiel.naam` en `e2e.profiel.wachtwoord` (dat
  laatste met `adminSetPassword` in `afterEach`, via het nieuwe
  `e2e/helpers/supabaseAdmin.ts`). De regel "één fixture per muterende
  test" is aangehouden.
- **Testplan → db:test, kern-AC:** de Developer koos een nieuw bestand,
  `supabase/tests/set_own_pin_start_shift.test.sql`.
- **`src/lib/authErrors.ts` deelt ook de foutteksten, niet alleen de
  mapping.** Naast `toPasswordUpdateErrorCode()` (type
  `PasswordUpdateErrorCode`) staat daar `passwordUpdateErrorMessage()`. De
  eigen `errorMessage()`-functies in `WachtwoordHerstellen.tsx` en
  `PortalWachtwoordHerstellen.tsx` zijn weg. Gevolg: ook de twee
  herstelflows (`useWachtwoordHerstellen.ts`,
  `usePortalWachtwoordHerstellen.ts`) kennen nu `reauth_required`. Hun
  foutcode-type is `"link_invalid" | PasswordUpdateErrorCode`. De teksten
  voor de bestaande codes zijn niet veranderd.
- **`usePortalUpdateOwnName` en `usePortalSetOwnPin` geven `{ ok: true } |
  { ok: false, code }` terug** (`UpdateOwnNameResult`/`SetOwnPinResult`), geen
  boolean. Zo kan de sheet zonder effect op `actor_not_found`/`no_bar_role`
  reageren (`onStale` → profiel-`refetch()`). `errorCode` staat daarnaast
  nog steeds in de hook-state. `usePortalWachtwoordWijzigen` geeft wel een
  boolean terug.
- **UI-details die de spec niet noemde:**
  - de PIN-sheet heeft onderaan een eigen **"Annuleer"**-knop, onder
    "Pincode verwijderen";
  - het Account-tabblad heeft een kop **"Account"** (`<h2>`) boven de
    profielkaart;
  - de toast staat onderaan het scherm (`fixed`, in een
    `role="status"`-regio van `AccountTab.tsx`), zelfde duur als in
    `MijnAccountOverlay.tsx` (3,5 s).
- **Naam-sheet via `TekstVeld`.** `src/components/TekstVeld.tsx` kreeg een
  `tone`-prop (`"rail"`, de standaard, of `"light"`). Bestaande schermen zijn
  daardoor ongewijzigd. `NaamWijzigenSheet.tsx` gebruikt `tone="light"` in
  plaats van een eigen label en input. Annuleer/Opslaan en
  Annuleer/Wijzigen komen uit het nieuwe `SheetKnoppen.tsx` in
  `src/features/portal-profiel/`.
- **Laadfouten (#68) alleen in `usePortalProfiel`.** De spec zegt bij Hooks
  dat `usePortalProfiel` "hetzelfde netwerk-/serverfoutonderscheid als de
  andere portal-leeshooks" volgt. `usePortalProfiel` gebruikt
  `loadErrorMessage()` (`src/lib/loadErrors.ts`). `usePortalBalance`,
  `usePortalTransactions` en `usePortalAppSettings` doen dat **nog niet**:
  die tonen een vaste "Controleer de verbinding"-tekst. Die inconsistentie
  bestond al en is in #17 niet aangeraakt.
- **Sheet-animatie:** `tailwind.config.ts` kreeg keyframes/animatie
  `sheet-in` (0,22 s). `Overlay.tsx` gebruikt die alleen via
  `motion-safe:`.

**Open.** De instelling "Secure password change" in het gehoste
Supabase-project (Randgevallen → `updateUser` vereist herauthenticatie) is
nog niet vastgesteld. Bram kijkt het na. De code vangt beide gevallen al af
(`reauth_required` → "log opnieuw in en probeer het nog eens"). De uitkomst
verandert dus niets aan de code, alleen aan hoe vaak die melding te zien
zal zijn.

## Onderzocht in /designs/

- `designs/Lid App.dc.html`, `isSettings`-blok (regel 289–325): het
  "Account"-scherm, een derde tabblad naast Saldo en Transacties (`tab ===
  'account'`, regel 544). Een profielkaart (initialen, naam, e-mail), een
  "GEGEVENS"-lijst met drie rijen (`settingRows`, regel 666–670): **Naam
  wijzigen** (hint: huidige naam), **Wachtwoord wijzigen** (hint: "laatst
  gewijzigd 3 maanden geleden"), **Pincode voor snel inloggen** (hint:
  "ingesteld"/"niet ingesteld"). Daaronder "MELDINGEN" (toggle laag-saldo-mail)
  en een "Uitloggen"-knop.
- **Sheet "Naam wijzigen"** (regel 364–371, logica 692–698): uitleg "Zo staat
  je naam op de bar-tablet en in het dienstoverzicht.", één tekstveld
  (placeholder "Volledige naam"), Annuleer/Opslaan. Opslaan alleen actief bij
  een niet-lege naam na trim; toast "Naam bijgewerkt".
- **Sheet "Wachtwoord wijzigen"** (regel 373–381, logica 700–710): drie
  velden (Huidig wachtwoord, Nieuw wachtwoord, Nieuw wachtwoord herhalen),
  foutmeldingen "Minimaal 8 tekens" en "Wachtwoorden komen niet overeen",
  Annuleer/Wijzigen, toast "Wachtwoord gewijzigd". Het prototype
  *controleert* het huidige wachtwoord nergens, het veld is alleen verplicht.
- **Sheet "Pincode instellen" → "Pincode herhalen"** (regel 384–398, titel
  regel 680, logica 712–719 en `pressKey` 752–765): puntjes plus
  cijfertoetsenbord, twee stappen (kiezen, herhalen). Bij verschil: toast
  "Codes komen niet overeen" en terug naar stap 1. Bij gelijke invoer: toast
  "Pincode ingesteld". Bij een al ingestelde PIN: een tekstlink "Pincode
  verwijderen", toast "Pincode verwijderd". De rij opent altijd het
  toetsenbord, ook als er al een PIN is: overschrijven gebeurt dus direct,
  zonder eerst te verwijderen.
- **Afwijking van betekenis, niet alleen van vorm.** In het prototype is de
  pincode een *portal*-inlogmethode, "alleen op dit toestel" (regel 447,
  594–597: "Vier cijfers om snel je saldo te checken. De pincode geldt alleen
  op dit toestel."). Dat bestaat in ABAS niet en komt er met dit ticket ook
  niet: CLAUDE.md → Auth noemt voor de portal alleen magic link en
  wachtwoord (en `portal-login.md` → Expliciet buiten scope bevestigt dat).
  Het issue maakt er expliciet de **bar-PIN** van (`members.pin_hash`,
  gebruikt door `start_shift` op het bar-tablet). Tekst uit het prototype die
  naar portal-inloggen verwijst ("in te loggen zonder wachtwoord", "op dit
  toestel") klopt daardoor niet en wordt vervangen, zie besluit 7.
- `designs/chats/chat10.md` regel 9 (Bram): *"op de telefoon kan een
  gebruiker alleen maar het LID gedeelte zien — dus saldo, transacties, en
  instellingen voor het account (pincode zetten, wachtwoord wijzigen, naam
  wijzigen)"*. Dit is de basis van besluit 1: "een gebruiker" op de
  telefoon ziet het lid-deel, ongeacht de rol. De pincode staat in dezelfde zin, en die is
  alleen zinvol voor bar-rollen.
- `designs/chats/chat30.md` (regel 9): het onboardingscherm "wachtwoord
  kiezen" na een eerste magic link. `portal-login.md` en
  `lid-account-invite.md` hebben dat allebei bij #17 neergelegd, maar de
  issue-tekst van #17 noemt het niet. Buiten scope, apart vervolgticket
  (besluit 5).

## Onderzocht in de code: wat al bestaat

| Bouwsteen | Waar | Hergebruik in deze spec |
|---|---|---|
| `set_own_pin(p_pin text)` | `supabase/migrations/0014_pin_zelfbediening.sql` | **Ongewijzigd hergebruikt.** Herleidt de aanroeper via `auth.uid()`, weigert `lid` (`no_bar_role`) en gearchiveerd (`actor_not_found`), valideert `^[0-9]{4}$` (`invalid_pin_format`), hasht met `crypt(p_pin, gen_salt('bf'))`, `p_pin = null` zet de PIN uit, scrubt `pin_hash` in de return. Dit is de "bestaande PIN-opslag/hashing (#3)" uit het acceptatiecriterium. Er komt geen tweede PIN-RPC. |
| `useSetOwnPin.ts` | `src/hooks/queries/` | **Niet direct bruikbaar:** importeert `@/lib/supabase/client`, en dat verbiedt `check:arch` voor portal-code (ADR 0009). Zie Hooks voor hoe duplicatie hier wordt voorkomen. |
| `MijnAccountOverlay.tsx` | `src/features/assortimentbeheer/` | Het "Mijn account"-scherm uit CLAUDE.md → Auth, op het modus-keuzescherm van `/beheer`. Blijft bestaan en blijft ongewijzigd in gedrag. Deelt na dit ticket de foutteksten met de portal (zie Hooks). |
| `update_member_name(p_member_id, p_name)` | `0007_ledenbeheer.sql` | **Niet bruikbaar:** alleen voor beheerders (`no_admin_role`) en met een willekeurig doel-id. Een lid mag hiermee nooit schrijven. De validatie (`trim`, niet leeg → `invalid_name`) wordt wel letterlijk overgenomen in de nieuwe RPC. |
| `members.has_pin` | `0010_pin_hash_kolombeveiliging.sql` | Gegenereerde kolom, leesbaar voor `authenticated`. Bron voor "ingesteld/niet ingesteld". `pin_hash` zelf blijft REVOKED. |
| `NieuwWachtwoordVelden.tsx` + `passwordPolicy.ts` | `src/components/`, `src/lib/` | **Ongewijzigd hergebruikt** voor Nieuw/Herhalen plus live checklist. Precies waarvoor `wachtwoord-vergeten.md` → "Herbruikbaar voor portal en #17" ze heeft gebouwd. De "Minimaal 8 tekens"-melding uit het prototype vervalt: de checklist toont dat al. |
| `usePortalWachtwoordHerstellen.ts` | `src/hooks/queries/` | Bevat al `updateUser({ password })` via `portalClient.ts` en de mapping van `weak_password`/`same_password`. De mapping wordt gedeeld (zie Hooks). De hook zelf niet: die logt na afloop uit (herstelflow), deze flow juist niet. |
| `Overlay.tsx` | `src/components/` | De `case "sheet"`-tak is een placeholder die dezelfde gecentreerde dialoog toont als `"modal"` (regel 139–146). Dit ticket is de **eerste echte portal-consument** van een secundaire weergave (`portal-dashboard.md` → Expliciet buiten scope voorspelde dat). Zie useShell()-contract. |
| `PinPad.tsx` | `src/features/dienst-starten/` | Puntjes plus 12-toetsenraster, maar vast op de donkere `rail-*`-tokens en met `StaffHeader`. Zie Schermflow → PIN voor hoe het raster gedeeld wordt. |
| `PortalDashboard.tsx` | `src/features/portal-dashboard/` | Krijgt een derde tabblad "Account". |
| `usePortalSession.ts` | `src/hooks/queries/` | Laat nu alleen `role === 'lid'` door (regel 60). Wordt verruimd (besluit 1, ADR 0012). |
| `PortalShellHome.tsx` | `src/shells/portal/` | Heeft een **eigen** `usePortalSession()`-instantie en geeft `session.name` door aan `PortalDashboard` (header "Hoi {voornaam}"). Een `refetch()` op een andere instantie van dezelfde hook ververst deze niet, zie Schermflow → Naam. |
| `useBarStaff.ts` | `src/hooks/queries/` | De stafkeuze op het bar-tablet filtert op `.eq("has_pin", true)` (regel 45). Een lid zonder PIN staat er dus niet in. Relevant voor het testplan. |
| `start_shift(p_member_id, p_pin, p_activity_type_id)` | `0021_start_shift_een_open_dienst.sql` | Weigert `pin_hash is null` of een foute PIN met `invalid_pin`, vereist een activiteitstype, en weigert een tweede open dienst. Relevant voor het testplan. |

## Doel

Een lid dat in de portal is ingelogd kan zelf:

1. de eigen **naam** wijzigen;
2. het eigen **wachtwoord** wijzigen;
3. als het lid ook `bardienst` of `beheerder` is: de eigen **bar-PIN**
   instellen, wijzigen of uitzetten, via de bestaande `set_own_pin`.

Een gewoon `lid` ziet de PIN-rij niet: geen dode UI, en `set_own_pin` zou
voor zo'n lid toch `no_bar_role` geven.

**Hoe dit past binnen de twee kernbeslissingen uit CLAUDE.md →
Architectuurbeslissingen:**

- **"Geld beweegt alleen via RPC."** Niet geraakt. Er wordt geen bedrag
  gelezen of geschreven dat niet al door #16 werd getoond. De nieuwe RPC
  `update_own_name` raakt alleen `members.name`. `balance_cents` staat
  bovendien al onder de `REVOKE update` uit `0001_init.sql`, wat voor
  `members` als geheel geldt en ongewijzigd blijft.
- **"`served_by` komt uit de bezetting, niet uit een PIN."** Niet geraakt, en
  deze spec verschuift die grens ook niet. De portal zet alleen de
  `pin_hash` die `start_shift` gebruikt om een dienst te *starten*. Dat is
  het enige waar een PIN in ABAS voor dient (CLAUDE.md: "Het *starten* van een
  dienst blijft wél op de eigen PIN van de starter"). Attributie van
  bestellingen blijft volledig uit de bezetting komen. Een PIN die op een
  telefoon is ingesteld is op de database identiek aan een PIN uit
  `/beheer` → "Mijn account": één kolom, één hashfunctie, één RPC.
- **ADR 0005 (alleen-PIN verboden).** Niet geraakt. Het wachtwoord blijft
  bestaan: `set_own_pin` raakt `auth.users` niet, en uitzetten maakt alleen
  `pin_hash` leeg. Wachtwoord wijzigen vervangt het wachtwoord, verwijdert
  het nooit.

## Betrokken shell

**`shells/portal` alleen.** Geen wijziging aan `shells/bar`, `/beheer`,
`MijnAccountOverlay.tsx` (behalve het delen van foutteksten, zonder
gedragswijziging) of `src/middleware.ts`.

- **Nieuw:** `src/features/portal-profiel/` met `AccountTab.tsx` (profielkaart
  plus drie rijen) en per sheet een component: `NaamWijzigenSheet.tsx`,
  `WachtwoordWijzigenSheet.tsx`, `PincodeSheet.tsx`. Exacte opdeling aan de
  Developer.
- **Gewijzigd:** `src/features/portal-dashboard/PortalDashboard.tsx` — derde
  tabblad "Account" in de bestaande `role="tablist"`. De Uitloggen-knop in de
  header blijft waar hij staat (gebouwd in #16). Geen tweede Uitloggen-knop
  in het Account-tabblad, anders twee knoppen voor één actie.
- **Gewijzigd:** `scripts/check-arch.mjs` — `PORTAL_ONLY_DIRS` krijgt
  `"src/features/portal-profiel/"` erbij, naast `portal-login/` en
  `portal-dashboard/`. Zonder die regel zou een import van
  `@/lib/supabase/client` in de nieuwe map niet worden tegengehouden. Dat
  is dezelfde reden die `portal-dashboard.md` → Betrokken shell al gaf.
- **Gewijzigd:** `src/hooks/queries/usePortalSession.ts` (besluit 1, ADR
  0012) — de rolfilter `data.role !== "lid"` vervalt. Een sessie die naar een
  `members`-rij herleidt, met welke rol ook, is `signed-in`. De state krijgt
  `role` (en `archived`, zie Randgevallen) erbij. De `denied`-staat blijft
  bestaan voor een sessie zonder gekoppelde `members`-rij.
  `docs/features/portal-login.md` → Rolzichtbaarheid wordt daarop bijgewerkt
  (Docs-rol), met een verwijzing naar ADR 0012.
- **Gewijzigd:** `src/shells/portal/PortalShellHome.tsx` — geeft
  `session.refetch` door aan `PortalDashboard` (nieuwe prop, bijvoorbeeld
  `onProfileChanged`), en die weer aan het Account-tabblad. Zie Schermflow →
  Naam voor waarom dat nodig is.

## Datamodel

**Geen schemawijziging.** Geen nieuwe kolom, tabel, enum of policy. `name`,
`role`, `archived` en `has_pin` bestaan al en zijn al leesbaar voor
`authenticated` (0010), `pin_hash` blijft REVOKED.

Eén nieuwe migratie, alleen voor een functie:
`supabase/migrations/0026_eigen_naam_wijzigen.sql`. Het nummer is het
eerstvolgende vrije nummer op `main` op 2026-09-28 (`0025_client_errors.sql` bestaat al). `check:migrations` vangt
een botsing met een openstaande branch op; hernummer dan vóór de merge, niet
erna (zie de kop van `0014_pin_zelfbediening.sql`).

## RPC's

### Nieuw: `update_own_name(p_name text) returns members`

Zelfbediening, zelfde vorm als `set_own_pin`: **geen doel-id-parameter**. De
functie kan per constructie alleen de rij van de aanroeper schrijven.

- `language plpgsql`, `security definer`, `set search_path = public`.
  `extensions` is hier niet nodig, want er wordt geen pgcrypto gebruikt.
- Actorcheck: `select * into v_actor from members where auth_user_id =
  auth.uid() and not archived;` Het verplichte `select *`-patroon komt uit
  ADR 0002 → "Post-implementatie fix". Geen rij → `raise exception
  'actor_not_found' using errcode = 'P0001'`. Daarmee vallen de gedeelde
  bar-tablet-device-sessie (geen `members`-rij), een ongekoppelde
  `auth.users`-rij en een gearchiveerd lid af.
- **Geen rolcheck.** `lid`, `bardienst` en `beheerder` mogen allemaal de
  eigen naam wijzigen. Dat is precies wat het issue vraagt ("een lid kan de
  eigen naam wijzigen"), en wat Bram besloot (besluit 2: vrij, geen spoor).
- Validatie letterlijk zoals `update_member_name`: `v_name := trim(p_name)`;
  `null` of `''` → `invalid_name`. Geen maximumlengte en geen
  uniciteitseis, want die heeft `update_member_name` ook niet. Een verschil
  tussen "beheer wijzigt naam" en "lid wijzigt eigen naam" zou een
  inconsistentie zijn zonder reden.
- `update members set name = v_name where id = v_actor.id returning * into
  v_member;` en dan **`v_member.pin_hash := null;` vóór de return**. Dit is
  dezelfde scrub als 0010/0014: de return is `members`, en zonder scrub zou
  de bcrypt-hash van een 4-cijferige PIN naar de client lekken.
- Grants, verplicht volgens CLAUDE.md → Architectuurbeslissingen / `0018`:
  ```
  grant execute on function update_own_name(text) to authenticated;
  revoke execute on function update_own_name(text) from public;
  revoke execute on function update_own_name(text) from anon;
  ```
  `supabase/tests/rpc_execute_grants.test.sql` bewaakt dit al generiek voor
  élke functie in `public`, en zal falen als een van de twee `revoke`'s
  ontbreekt.
- Foutcodes: `actor_not_found`, `invalid_name`. Meer niet.

### Bestaand, ongewijzigd: `set_own_pin(p_pin text)`

Geen migratie. De RPC doet al alles wat het acceptatiecriterium vraagt,
inclusief direct overschrijven van een bestaande PIN (`update ... set
pin_hash = crypt(...)`, geen "moet eerst leeg zijn"-eis). De portal-sessie is
een individuele sessie met een echte `auth.uid()`. Dat is precies de eis die
`auth-methode-per-lid.md` → "Definitieve keuzes" punt 3 stelde, en waarom
"Mijn account" destijds níet in bar-modus kon. Die redenering geldt in de
portal dus ook.

### Wachtwoord: geen RPC

`supabase.auth.updateUser({ password })` via `portalClient.ts`. Dat is een
auth-call, geen `.from()`/`.rpc()`, en valt dus niet onder
`check:policy`/`check:rls`. Zelfde constatering als `wachtwoord-vergeten.md` →
"Geldlaag, datamodel, RPC's". De sterkte-eisen dwingt Supabase serverside af
(dashboard-instelling uit `wachtwoord-vergeten.md` → Dashboard-instellingen).
De client-checklist is alleen UX. Het huidige wachtwoord wordt niet gevraagd:
de ingelogde sessie is genoeg (besluit 3). Andere sessies van hetzelfde
account blijven actief (besluit 4), dus er volgt geen `signOut`.

**Let op, één account:** een bardienst/beheerder heeft één `auth.users`-rij
voor portal én `/beheer`. Een wachtwoordwijziging in de portal wijzigt dus
ook het wachtwoord waarmee dit lid op `/beheer` inlogt. Dat is correct (één
account, ADR 0005) en hoort in de uitlegtekst van de sheet voor bar-rollen,
zie besluit 7.

## Hooks (`src/hooks/queries/`)

Allemaal met de `usePortal`-prefix. `check:arch`'s `isPortalOnlyFile()`
herkent ze daaraan (`scripts/check-arch.mjs` regel 68–72) en dwingt
`portalClient.ts` af.

- **`usePortalProfiel.ts`** (lezen): `members.select("name, role, archived,
  has_pin").eq("auth_user_id", session.user.id).maybeSingle()`, met een
  expliciete `auth_user_id`-filter en zonder te leunen op RLS. Dat is
  hetzelfde patroon als `usePortalBalance.ts`, en verplicht volgens ADR 0012
  → Beslissing 2: een bardienst/beheerder-sessie kan via RLS álle
  `members`-rijen lezen (ADR 0007 beperkt alleen rol `lid`). Met `refetch()`. Loading/error-staten
  volgen hetzelfde netwerk-/serverfoutonderscheid als de andere
  portal-leeshooks (#68). *(Gebouwd: alleen deze hook doet dat, zie "Zoals
  gebouwd".)* De e-mail voor de profielkaart komt uit
  `usePortalSession()` (`session.user.email`), niet uit `members.email`: die
  kolom is RPC-gated (ADR 0004).
- **`usePortalUpdateOwnName.ts`** → `rpc("update_own_name", { p_name })`,
  foutcodes `actor_not_found | invalid_name | unknown`.
- **`usePortalWachtwoordWijzigen.ts`** → `auth.updateUser({ password })`,
  foutcodes `weak_password | same_password | reauth_required | rate_limited
  | unknown`. `reauth_required` komt uit `error.code ===
  "reauthentication_needed"` of `"reauthentication_not_valid"`. Dat zijn de
  codes die `@supabase/auth-js` in `node_modules` kent (geverifieerd
  2026-09-28), en ze komen terug als Supabase "Secure password change" aan
  staat en de sessie buiten het venster valt (zie Randgevallen). Geen
  huidig-wachtwoordveld en geen `signOut()` na afloop (besluiten 3 en 4), in
  tegenstelling tot de herstelflow.
- **`usePortalSetOwnPin.ts`** → `rpc("set_own_pin", { p_pin })`.
- Onverwachte fouten gaan via `src/lib/clientErrors.ts`, niet via een kale
  `console.error`. `check:policy` dwingt dat af in `src/hooks/queries/`.

**Duplicatie voorkomen (CLAUDE.md → "Componenten zijn herbruikbaar totdat
bewezen anders").** Dat de hooks zelf aparte bestanden zijn, is de erkende
uitzondering uit `portal-login.md` → "Herbruik": de cookie-isolatie is de
reden, geen stijlvoorkeur. Alles wat níet aan de client hangt, wordt wél
gedeeld:

- **`src/lib/ownPinErrors.ts` (nieuw):** het type `SetOwnPinErrorCode`, de
  mapping `toSetOwnPinErrorCode(message)` en `setOwnPinErrorMessage(code)`.
  Die staan nu verspreid over `useSetOwnPin.ts` en `MijnAccountOverlay.tsx`.
  `useSetOwnPin.ts`, `MijnAccountOverlay.tsx` en `usePortalSetOwnPin.ts`
  importeren ze alle drie hieruit. De teksten veranderen niet.
- **`src/lib/authErrors.ts` (bestaand, uitbreiden):** de
  `weak_password`/`same_password`-mapping die nu in
  `usePortalWachtwoordHerstellen.ts` (regel 60–76) en in
  `useWachtwoordHerstellen.ts` staat, verhuist hierheen als één functie.
  Beide bestaande hooks en de nieuwe `usePortalWachtwoordWijzigen.ts` roepen
  die aan. `isRateLimitedMessage` staat er al. *(Gebouwd: ook de teksten
  zijn gedeeld, zie "Zoals gebouwd".)*
- De 4-cijferregex (`/^[0-9]{4}$/`) hoort als export `PIN_PATTERN` in
  `ownPinErrors.ts` (of een klein `src/lib/pin.ts`), niet als derde losse
  kopie.

## useShell()-contract

`shells/portal` levert `overlay: "sheet"`. De drie sheets gebruiken
**`Overlay.tsx`**, geen eigen sheet-component. Dit ticket bouwt de echte
`case "sheet"`-tak die daar nu ontbreekt:

- aan de onderkant verankerd, volle breedte, afgeronde bovenhoeken
  (prototype: `border-radius: 28px 28px 0 0`, lichte `canvas`-achtergrond).
  Een inschuifanimatie mag, maar moet `prefers-reduced-motion` respecteren;
- **alle a11y-eisen uit de kop van `Overlay.tsx` blijven gelden en worden
  niet opnieuw gebouwd:** `role="dialog"`, `aria-modal`, `aria-labelledby`,
  focus erin bij openen en terug bij sluiten, focus trap, Escape en
  backdrop-klik roepen `onClose` aan. De tak verandert alleen de
  opmaak/positie, de gedeelde logica blijft één codepad;
- **geen sleepgebaar om te sluiten** (prototype regel 677–679). Sluiten gaat
  via Annuleer, Escape en backdrop. Slepen is een extra invoermethode die
  geen AC vraagt en die a11y-werk (WCAG 2.5.1, pointer gestures) meebrengt.
- `"modal"` (bar-shell) verandert niet. Een regressie daar ziet `check:a11y`
  op de bestaande bar-scenario's.

Features lezen `useShell().overlay` niet zelf, dat doet `Overlay.tsx`.
`src/features/portal-profiel/` heeft verder geen shell-kennis nodig.

## Schermflow

### 0. Tabblad "Account" (`PortalDashboard.tsx`)

Derde tab achter Saldo en Transacties, label **"Account"**, zelfde
tab-patroon (mount/unmount per tab, dus bij elk bezoek verse data).

`AccountTab.tsx`:

- **Profielkaart:** `InitialsAvatar` (bestaat in `src/components/`, niet
  opnieuw bouwen), naam, e-mailadres.
- **Kop "GEGEVENS"**, lijst met rijen (elke rij is een `<button>`, titel plus
  hint plus `›` met `aria-hidden`):
  1. **Naam wijzigen, alleen als niet `archived`**, hint: huidige naam.
     Zelfde reden als bij de PIN-rij: `update_own_name` weigert een
     gearchiveerd lid (`actor_not_found`), dus de rij zou dode UI zijn.
  2. **Wachtwoord wijzigen**, hint: geen. De hint uit het prototype ("laatst
     gewijzigd 3 maanden geleden") vervalt: daar is geen databron voor, en
     een verzonnen waarde is onjuist. Zelfde afweging als
     `portal-dashboard.md` bij "bijgewerkt vandaag HH:MM".
  3. **PIN-rij, alleen als `role` in (`bardienst`, `beheerder`) en niet
     `archived`**, hint: "ingesteld"/"niet ingesteld" (uit `has_pin`). Label:
     zie besluit 7. Voor rol `lid` wordt de rij **niet gerenderd** (niet
     uitgeschakeld, niet verborgen met CSS).
- **"MELDINGEN" (laag-saldo-mail) wordt niet gebouwd,** zie Expliciet buiten
  scope.
- Zolang `usePortalProfiel()` laadt: statusregel, geen rijen, zodat er geen
  PIN-rij opflitst en weer verdwijnt. Bij een fout: foutmelding plus
  "Opnieuw proberen", zelfde vorm als de andere portal-tabs.

### 1. Sheet "Naam wijzigen"

- Titel **"Naam wijzigen"**, uitleg (prototype, letterlijk) **"Zo staat je
  naam op de bar-tablet en in het dienstoverzicht."**
- Eén tekstveld met zichtbaar `<label>` "Volledige naam", voorgevuld met de
  huidige naam, `autoComplete="name"`.
- Knoppen **Annuleer** / **Opslaan**. Opslaan is `aria-disabled` (niet
  `disabled`, #77-patroon) zolang `trim(naam) === ''` of de naam gelijk is aan
  de huidige, en tijdens pending.
- Opslaan → `update_own_name`. Bij succes: sheet sluit, toast **"Naam
  bijgewerkt"** (prototype), `usePortalProfiel().refetch()` én de
  **doorgegeven** `onProfileChanged()` (dat is `session.refetch` van
  `PortalShellHome.tsx`, zie Betrokken shell). De header ("Hoi {voornaam}")
  krijgt zijn naam van de sessie-instantie in `PortalShellHome.tsx`. Een
  eigen `usePortalSession()`-aanroep in de sheet maakt een tweede,
  losstaande instantie, en die `refetch()` ververst de header niet. Die weg
  is dus uitdrukkelijk niet toegestaan.
- Fout: `invalid_name` → "vul een naam in"; `actor_not_found` → "dit account
  is niet (meer) gekoppeld aan een actief lid — log opnieuw in"; `unknown` →
  "er ging iets mis, probeer het opnieuw". Gebruik dezelfde toon en vorm als
  de meldingen in `MijnAccountOverlay.tsx`. Zijn er voor `invalid_name`
  al teksten in `LidBeherenOverlay.tsx`, dan die hergebruiken.

### 2. Sheet "Wachtwoord wijzigen"

- Titel **"Wachtwoord wijzigen"**.
- `NieuwWachtwoordVelden` (Nieuw + Herhalen + checklist), knoppen
  **Annuleer** / **Wijzigen**. Geen veld "Huidig wachtwoord" (besluit 3); het
  prototype toont dat veld wel, maar controleert het nergens.
- Wijzigen is `aria-disabled` tot `checkPassword(nieuw).isValid && nieuw ===
  herhaal`, en tijdens pending.
- Bij succes: sheet sluit, toast **"Wachtwoord gewijzigd"** (prototype). De
  sessie blijft actief, en andere sessies ook (besluit 4).
- Fouten: exact de teksten die `wachtwoord-vergeten.md` → Randgevallen al
  vastlegt voor `weak_password`/`same_password`, plus
  `RATE_LIMITED_MESSAGE` uit `authErrors.ts`. `reauth_required` → **"log
  opnieuw in en probeer het nog eens"**, met de Uitloggen-actie van de
  header als weg terug. Die tekst stelde de Architect op;
  Bram keurde hem goed (2026-09-28).

### 3. Sheet "Pincode instellen" → "Pincode herhalen"

Alleen bereikbaar vanuit de PIN-rij, dus alleen voor bardienst/beheerder.

- **Stap 1**, titel **"Pincode instellen"**: uitlegtekst (besluit 7), vier
  puntjes plus cijfertoetsenbord. Na het vierde cijfer automatisch naar stap 2.
- **Stap 2**, titel **"Pincode herhalen"**, tekst **"Voer dezelfde 4 cijfers
  nog een keer in."** (prototype en `MijnAccountOverlay.tsx`, letterlijk).
  - Gelijk → `set_own_pin(pin)`. Bij succes: sheet sluit, toast **"Pincode
    ingesteld"**, `refetch()`.
  - Ongelijk → melding **"Codes komen niet overeen"** (prototype) en terug
    naar stap 1 met lege invoer. Dit is client-side: de RPC ziet alleen de
    uiteindelijke PIN.
- **Als er al een PIN is:** zelfde twee stappen (overschrijven, geen oude PIN
  nodig, want de sessie is het bewijs, net als in `set_own_pin`), plus
  onderaan een tekstknop **"Pincode verwijderen"** → `set_own_pin(null)`,
  zonder aparte bevestiging. Uitzetten kan niemand buitensluiten, want het
  wachtwoord blijft werken (`auth-methode-per-lid.md` → Schermflow stap 6 en
  de kop van `0014`). Toast **"Pincode verwijderd"** (prototype). CLAUDE.md →
  Auth ("die het lid zelf aan- of uitzet via 'Mijn account'") en het
  prototype staan dit allebei al toe. Geen open vraag.
- Foutteksten: via `setOwnPinErrorMessage()` uit `src/lib/ownPinErrors.ts`,
  dezelfde teksten als op `/beheer`.
- **Toetsenbord, geen twee invoervelden.** Het prototype bepaalt de eerste
  bouw (CLAUDE.md → Designbestanden), en `PinPad.tsx` heeft het raster al.
  Om duplicatie te voorkomen: **haal het puntjes-plus-toetsen-deel van
  `PinPad.tsx` naar `src/components/PinToetsenbord.tsx`**, met een prop voor
  de kleurvariant (donker `rail` voor het bar-tablet, licht voor de portal).
  `PinPad.tsx` wordt daar een dunne schil omheen (`StaffHeader` plus
  terug-link), zonder zichtbare wijziging op de bar. De bestaande
  a11y-details (sr-only "Pincode: n van 4 cijfers ingevoerd", `role="alert"`)
  gaan mee naar het gedeelde component. `MijnAccountOverlay.tsx` houdt zijn
  twee invoervelden: dat is een ander, al gebouwd scherm, en die hier
  ombouwen valt buiten dit ticket.

## Rolzichtbaarheid

| Rol / staat | Naam | Wachtwoord | PIN-rij |
|---|---|---|---|
| `lid` | ja | ja | **nee, niet gerenderd** |
| `bardienst` / `beheerder` | ja | ja | ja |
| gearchiveerd (elke rol) | nee | ja | nee |
| sessie zonder `members`-rij | n.v.t., `denied`-staat (bestaand) | — | — |

- De UI-verberging is gemak, geen beveiliging. De server dwingt het af:
  `set_own_pin` weigert `lid` (`no_bar_role`), beide RPC's weigeren
  gearchiveerd en ongekoppeld (`actor_not_found`), en geen van beide kan een
  andere rij dan die van de aanroeper raken.
- **Gearchiveerd:** `usePortalSession` laat een gearchiveerd lid bewust nog
  binnen om de eigen historie te zien (`0015`, `caller_is_lid()`). Beide
  schrijf-RPC's weigeren gearchiveerde aanroepers al (`set_own_pin`) of gaan
  dat doen (`update_own_name`, zelfde actorcheck). Naam- en PIN-rij tonen voor
  zo'n lid zou dode UI zijn die altijd op `actor_not_found` stukloopt, dus die
  rijen worden niet gerenderd. Wachtwoord blijft: dat is een auth-eigenschap,
  geen `members`-schrijfactie, en het lid kan nog inloggen. Dit is een keuze
  van de Architect die consequent volgt uit bestaand RPC-gedrag. Bram kan
  hem terugdraaien, maar hij staat niet als open vraag omdat elk ander gedrag
  van de UI een bestaande RPC zou tegenspreken.
- Beheer ziet naamwijzigingen, net als nu bij een beheerwijziging, alleen als
  de nieuwe naam in Ledenbeheer en overal waar de naam getoond wordt. Er komt
  geen logboekregel of ander spoor (besluit 2).

## Randgevallen

| Geval | Gedrag |
|---|---|
| Lid wijzigt naam, oude transacties | Namen zijn geen snapshot. Elke plek die `served_by`/`reversed_by`/`member_id` naar een naam oplost (dienstoverzicht, logboek, `list_own_transactions`) toont voortaan de nieuwe naam, ook voor historie. Dat gebeurt nu ook al na `update_member_name` door beheer. Geaccepteerd (besluit 2). |
| Lid kiest een naam die een ander lid al heeft | Toegestaan, er is geen uniciteitseis (ook niet bij `update_member_name`). Op het bar-tablet kunnen dan twee gelijke namen in de ledenlijst of stafkeuze staan. Geaccepteerd risico, zelfde als vandaag via beheer. |
| Naam alleen spaties | Client: Opslaan `aria-disabled`. Server: `invalid_name`. |
| Naamwijziging terwijl het bar-tablet open staat | De bar-tablet toont de nieuwe naam bij de volgende fetch van `useMembers`/`useBarStaff`. Geen live-subscriptie, zelfde afweging als `portal-dashboard.md` → Randgevallen. |
| Rol wijzigt terwijl het Account-tabblad open staat (beheer maakt bardienst → lid) | PIN-rij blijft zichtbaar tot een refetch. Een PIN-actie geeft dan `no_bar_role` → bestaande tekst "dit account kan geen pincode instellen — vraag een beheerder", en de sheet doet een `refetch()` zodat de rij verdwijnt. Wat er met een al ingestelde `pin_hash` gebeurt bij degradatie naar `lid` is `set_member_role`'s zaak, niet van dit ticket. |
| Lid wordt gearchiveerd terwijl het tabblad open staat | Naam-/PIN-actie → `actor_not_found` → melding plus `refetch()`, waarna de rijen verdwijnen (zie Rolzichtbaarheid). |
| PIN ingesteld in de portal, daarna dienst starten op het bar-tablet | Werkt direct: `start_shift` leest dezelfde `pin_hash`, en `useBarStaff` toont het lid in de stafkeuze zodra `has_pin` waar is. Kern van het acceptatiecriterium, zie Testplan (db-test voor het starten, e2e voor de stafkeuze). |
| PIN verwijderd in de portal | Het lid verdwijnt bij de volgende fetch uit de stafkeuze op het bar-tablet (`useBarStaff`, `.eq("has_pin", true)`). Een directe `start_shift`-aanroep geeft `invalid_pin`. Bar-modus via e-mail → "Bar" blijft werken, want dat is de wachtwoordweg (ADR 0005). |
| Bardienst stelt dezelfde PIN in als een collega | Toegestaan en onzichtbaar, want de hashes zijn gezouten. `start_shift` kiest het lid via de stafkeuze, niet via de PIN. Geen wijziging. |
| Zwakke PIN (`0000`, `1234`) | Toegestaan, `set_own_pin` weigert alleen verkeerde formaten. Geen nieuwe regel zonder beslissing van Bram. Buiten scope. |
| Portal-sessie van bardienst, `/beheer`-sessie op het tablet met hetzelfde account | Losse cookies (ADR 0009), losse sessies. Een PIN- of naamwijziging in de portal is op `/beheer` zichtbaar na een refetch. Een wachtwoordwijziging logt de `/beheer`-sessie niet uit (besluit 4); het nieuwe wachtwoord geldt bij de volgende login. |
| Lid heeft alleen via magic link ingelogd en nooit een wachtwoord gezet | Werkt direct, want er wordt geen huidig wachtwoord gevraagd (besluit 3). De sheet functioneert dan als "wachtwoord instellen". Een verplichte onboardingstap hiervoor is buiten scope (besluit 5). |
| `updateUser` vereist herauthenticatie (Supabase "Secure password change" staat aan en de sessie is ouder dan het venster) | Supabase geeft dan een fout in plaats van te wijzigen. Het gedrag hangt van een dashboard-instelling af die deze repo niet kan inzien (lokaal `supabase/config.toml` zet hem niet). **De Developer controleert de instelling van het gehoste project** en noteert de uitkomst in de PR. Ongeacht de uitkomst vangt de hook de fout op als `reauth_required` (zie Hooks), en de sheet toont "log opnieuw in en probeer het nog eens" in plaats van `unknown`. Geen `reauthenticate()`-nonce-flow (besluit 3). |
| Rate limit op `updateUser` | `RATE_LIMITED_MESSAGE`, bestaand. |
| Netwerkfout tijdens een van de drie acties | Sheet blijft open, invoer blijft staan (behalve bij de PIN: terug naar stap 1, geen PIN in state laten hangen), melding "er ging iets mis, probeer het opnieuw". |
| **a11y** | Nieuwe stateful weergaven in `e2e/a11y.spec.ts` (axe): Account-tabblad als `lid` (zonder PIN-rij) en als bardienst (met PIN-rij), elk van de drie sheets open, PIN-sheet stap 2 en met foutmelding, naam-sheet met foutmelding. De bar-scenario's dekken de `PinPad`-refactor al af (dienst-starten). Het bestaande scenario "portal (/portal) denied-staat (bardienst-account)" gaat over op een ongekoppeld account, zie Testplan → Bestaande tests. |

## Testplan

### `db:test` (pgTAP) — `supabase/tests/update_own_name.test.sql` (nieuw)

Fixturestijl en `request.jwt.claim.sub`-simulatie van `auth.uid()` zoals
`set_own_pin.test.sql`. Negatieve tests eerst:

1. Aanroeper zonder gekoppelde `members`-rij (ongekoppelde `auth.users`-rij,
   staat model voor de device-sessie) → `throws_ok … 'actor_not_found'`.
2. Gearchiveerd lid → `actor_not_found`, en de naam is onveranderd.
3. `p_name = ''`, `'   '`, `null` → `invalid_name`, naam onveranderd.
4. Lid A wijzigt de eigen naam → de rij van lid B is byte-voor-byte
   onveranderd (naam, rol, saldo).
5. Alleen `name` verandert bij de aanroeper: `balance_cents`, `role`,
   `archived`, `has_pin` en `auth_user_id` zijn na de aanroep gelijk aan
   ervoor.
6. De functie heeft precies één argument (`pg_proc.pronargs = 1`), zodat een
   latere "handige" `p_member_id`-toevoeging deze test rood maakt.
7. Positief: `lid`, `bardienst` en `beheerder` kunnen elk de eigen naam
   wijzigen. De waarde wordt getrimd (`'  Anna  '` → `'Anna'`).
8. Return-rij: `pin_hash is null`, ook voor een aanroeper die wél een PIN
   heeft.

`rpc_execute_grants.test.sql` dekt anon/PUBLIC-EXECUTE voor de nieuwe functie
al generiek af, zonder aanpassing. Een expliciete
`has_function_privilege('anon', 'update_own_name(text)', 'EXECUTE') = false`
in het nieuwe bestand mag, zodat de negatieve test ook bij de functie zelf
staat.

### `db:test` — kern-AC over de shells heen (`set_own_pin` → `start_shift`)

De database weet niet of een `set_own_pin`-aanroep uit de portal of uit
`/beheer` komt. "Aansluitend op de bestaande PIN-opslag" wordt daarom op
RPC-niveau bewezen, niet met een e2e-test die een echte dienst start (zie
e2e → waarom niet). Uitbreiding van `supabase/tests/set_own_pin.test.sql`,
of een nieuw bestand `supabase/tests/set_own_pin_start_shift.test.sql`
(Developer kiest):

1. Als bardienst-fixture (via `request.jwt.claim.sub`): `set_own_pin('4821')`.
   Daarna `start_shift(<fixture-id>, '4821', <geseed activiteitstype-id>)`
   slaagt en geeft een dienst terug. `p_activity_type_id` is verplicht
   (0021); neem een niet-gearchiveerd type uit de seed of een fixture in het
   testbestand zelf.
2. `start_shift` met een andere PIN → `invalid_pin`.
3. Na `set_own_pin(null)`: `start_shift(<fixture-id>, '4821', …)` →
   `invalid_pin` (de `pin_hash is null`-tak van 0021, regel 57).
4. Alles binnen de transactie van de test (`begin … rollback`), zodat de
   ene-open-dienst-guard van 0021 geen andere test raakt. Sluit een eventueel
   al openstaande dienst uit de fixture-opzet vóór stap 1 in dezelfde
   transactie, anders geeft stap 1 de foutcode van de open-dienst-guard in
   plaats van een dienst.

`check:rls` verandert niet: geen nieuwe tabel of policy.

### `test` (unit)

- `src/lib/ownPinErrors.ts`: mapping van alle bekende foutcodes plus
  fallback naar `unknown`.
- Uitgebreid `src/lib/authErrors.ts`: `weak_password`/`same_password`/
  `reauthentication_needed` en `reauthentication_not_valid` → `reauth_required`/
  rate-limit/onbekend.
- Draaien de bestaande tests voor `passwordPolicy` al, dan hoeft daar niets
  bij.

### e2e (Playwright)

**Gemockt** (`e2e/helpers/supabaseMock.ts`, zelfde opzet als
`e2e/portal-login.spec.ts` → "gemockt"):

- Wachtwoord-sheet: Wijzigen blijft `aria-disabled` tot de checklist groen
  is en beide velden gelijk zijn; `weak_password`/`same_password`/rate-limit
  tonen de bestaande teksten; succes → toast, sheet dicht, nog steeds
  ingelogd.
- Wachtwoord-sheet, herauthenticatie: de mock laat `PUT /auth/v1/user`
  antwoorden met `error_code: "reauthentication_needed"` → de sheet toont
  "log opnieuw in en probeer het nog eens", niet de `unknown`-tekst.
- PIN-sheet: ongelijke herhaling → "Codes komen niet overeen", terug naar
  stap 1, **geen** `set_own_pin`-request verstuurd (request-log van de mock).

**Live backend** (lokale stack plus `seed.sql`, zelfde opzet als
`portal-login.spec.ts` → "live backend").

**Eigen fixture-accounts, geen gedeelde seedleden muteren.**
`playwright.config.ts` draait met `fullyParallel: true`, en andere specs
loggen tegelijk in als Anna de Vries, Sanne Bakker en Femke Bos. Een test die
de naam, het wachtwoord of de PIN van zo'n gedeeld lid wijzigt, laat
parallelle tests willekeurig falen, ook als hij in een `afterEach` herstelt.
Daarom voegt de Developer aan `supabase/seed.sql` toe (exacte namen en
e-mailadressen aan de Developer, met een herkenbaar `e2e`-voorvoegsel, en een
lokaal-only wachtwoord in dezelfde vorm als de bestaande fixtures):

| Fixture | Rol | Staat | Gebruikt door |
|---|---|---|---|
| profiel-lid-naam | `lid` | gekoppeld, wachtwoord | test 2 (naam wijzigen) |
| profiel-lid-wachtwoord | `lid` | gekoppeld, wachtwoord | test 5 (wachtwoord wijzigen) |
| profiel-bardienst | `bardienst` | gekoppeld, wachtwoord, **geen** PIN | tests 3–4 (PIN) |
| ongekoppeld | — | alleen een `auth.users`-rij met wachtwoord, **geen** `members`-rij | bestaande denied-tests (zie hieronder) |

Elke muterende test gebruikt precies één fixture die geen andere test
gebruikt. Alleen-lezende tests (test 1) mogen een gedeeld lid gebruiken.

1. **Anna de Vries (`lid`, alleen lezen)** logt in op `/portal` →
   Account-tabblad → rijen Naam en Wachtwoord zichtbaar, **geen PIN-rij in de
   DOM** (`toHaveCount(0)`, niet alleen `not.toBeVisible`).
2. **profiel-lid-naam** wijzigt de naam → toast, header "Hoi {nieuwe
   voornaam}" verandert **zonder herladen** (bewijst de doorgegeven refetch,
   zie Schermflow → Naam), en na herladen staat de nieuwe naam er nog.
3. **profiel-bardienst** logt in op `/portal` → PIN-rij "niet ingesteld" →
   PIN instellen en herhalen → toast, hint "ingesteld". Dan "Pincode
   verwijderen" → hint "niet ingesteld".
4. **Stafkeuze op het bar-tablet** (read-only, geen dienst starten): na
   stap 3's instellen staat profiel-bardienst in de stafkeuze op `/`, na het
   verwijderen **niet meer** (`toHaveCount(0)`; `useBarStaff` filtert op
   `has_pin`). Na verwijderen is er dus geen tegel om op te tikken, en een
   "PIN geweigerd"-assertie kan niet. Het weigeren van een lege PIN is
   `start_shift`'s zaak en zit in de db-test hierboven. **Plaatsing:** de
   stafkeuze is alleen zichtbaar zolang er geen open dienst is, en de
   bestaande bar-scenario's openen en sluiten de gedeelde dienst binnen
   `test.describe.serial("stateful bar-shell scenarios (shared session)")` in
   `e2e/a11y.spec.ts`. Deze stap draait daarom in die serial-groep, op een
   moment dat er geen dienst open staat (vóór de eerste dienststart, zoals de
   bestaande stafkeuzescan), of in een eigen serial-groep die met die groep
   gecoördineerd wordt. Niet als losse parallelle test. De portal-kant (stap
   3) mag in de groep zelf, of er vlak voor via de Admin API/RPC als
   opzetstap.
5. **profiel-lid-wachtwoord** wijzigt het wachtwoord → uitloggen → inloggen
   met het nieuwe wachtwoord lukt, met het oude niet. Geen herstel nodig: de
   fixture is van deze test alleen. Is herhaalbaarheid op een lokale stack
   zonder `db reset` nodig, zet het wachtwoord dan in de teardown terug via de
   Admin API (service-role, alleen in de testhelper, zoals `generate_link` al
   doet).

**Waarom geen e2e die op het bar-tablet een echte dienst start met de nieuwe
PIN.** Dat vraagt de hele route stafkeuze → **activiteitkeuze** (verplichte
stap in `DienstStarten.tsx`, `step "activity"`, omdat `start_shift`
`p_activity_type_id` vereist) → PIN, én coördinatie met de ene open dienst
die de database toestaat (0021) en die de serial-groep in `a11y.spec.ts`
al gebruikt. De db-test bewijst dezelfde eigenschap (portal-PIN = de PIN die
`start_shift` accepteert) zonder die gedeelde staat. Kiest de Developer toch
voor een volledige e2e, dan moet die in de serial-groep, met de
activiteitkeuze erin en met `end_shift` in de teardown.

**Bestaande tests die door besluit 1 veranderen.** `e2e/portal-login.spec.ts`
("een bardienst-account op /portal krijgt de neutrale 'niet
gekoppeld'-melding", regel 183) en `e2e/a11y.spec.ts` ("portal (/portal)
denied-staat (bardienst-account)", regel 378) loggen in als Sanne Bakker en
verwachten "Dit account is niet gekoppeld aan een lid.". Na besluit 1 is
Sanne gewoon `signed-in`, dus beide tests falen. Aanpassen:

- Beide tests loggen in met de nieuwe **ongekoppelde** fixture (`auth.users`
  zonder `members`-rij), en blijven verder gelijk (neutrale melding, geen
  "Hoi …", a11y-scan). Zo blijft de `denied`-staat gedekt.
- Nieuw in `portal-login.spec.ts`: Sanne Bakker (bardienst) op `/portal` →
  `signed-in`, Saldo toont **haar eigen** saldo (€21,00), en de
  Transacties-tab toont geen transacties van anderen. Dat is de
  testverwachting uit ADR 0012 → Gevolgen. Alleen lezen, dus Sanne mag
  gedeeld gebruikt worden.
- Test- en commentaarteksten die "bardienst → denied" als bedoeld gedrag
  beschrijven (bijvoorbeeld `a11y.spec.ts` regel 373–376) meebijwerken.

### Gates

`check:arch` (nieuwe `PORTAL_ONLY_DIRS`-entry; geen `client.ts`-import in
`portal-profiel/` of in `usePortal*`), `check:policy` (alle queries in
`src/hooks/queries/`), `check:a11y` (zie Randgevallen → a11y), `lint` zonder
warnings.

## ADR

- **[ADR 0012 — De portal toont voor elke rol alleen eigen data;
  portal-leeshooks filteren expliciet op de eigen rij](../adr/0012-portal-eigen-data-voor-elke-rol.md)**,
  geaccepteerd met besluit 1. Wijzigt de sessie-gate uit `portal-login.md` →
  Rolzichtbaarheid. Kern voor de Developer:
  - elke **root-read van lid-eigen data** (`members`, `orders`, `top_ups`,
    `order_reversals`) in een `usePortal*`-hook filtert expliciet op de eigen
    `auth_user_id`, of gaat via een zelf-scopende RPC zonder doel-parameter.
    Nooit leunen op de RLS-narrowing van ADR 0007, want een
    bardienst/beheerder-sessie heeft die niet;
  - **afgeleide reads** mogen filteren op id's die uit zo'n eigen-rij-read
    komen (zoals `usePortalTransactions.ts` `order_lines` ophaalt voor de
    order-id's uit `list_own_transactions()`);
  - **globale data** zonder eigen rij en zonder persoonsgegevens
    (`app_settings`, zoals `usePortalAppSettings.ts`, en `products`) valt
    buiten de regel;
  - reviewwerk, geen gate (zie ADR → Gevolgen voor wanneer dat verandert).
  ADR 0003 en 0005 worden niet geraakt.
- **Geen ADR voor `update_own_name`**: dat volgt het bestaande
  zelfbedieningspatroon van `set_own_pin` (0014) één op één.
- **Geen ADR voor de `Overlay.tsx`-sheet-tak**: die was al voorzien in het
  type (`overlay: "sheet"`) en in `docs/ARCHITECTURE.md` (regel 183). Na de
  bouw werkt Docs die passage bij van "nog niet gebouwd" naar gebouwd.
  *(Gedaan, 2026-09-28: `docs/ARCHITECTURE.md` → "`useShell().overlay`".)*

## Expliciet buiten scope

- **Portal-inloggen met pincode** ("alleen op dit toestel", prototype). Zie
  "Onderzocht in /designs/". Ongewijzigd buiten scope volgens
  `portal-login.md`.
- **"MELDINGEN" / e-mail bij laag saldo** (prototype `notify`-toggle). Er is
  geen mail-infrastructuur voor, en het issue vraagt er niet om. Zelfde
  conclusie als `portal-dashboard.md`.
- **E-mailadres wijzigen door het lid zelf.** Staat niet in het issue en niet
  in het prototype (de profielkaart toont het e-mailadres alleen).
- **Naam, wachtwoord en PIN wijzigen voor een ander lid.** Blijft
  `update_member_name`/Ledenbeheer (beheer).
- **`MijnAccountOverlay.tsx` ombouwen of uitbreiden** (naam/wachtwoord op
  `/beheer`). Besluit 6.
- **Logboekregel of ander spoor bij een naamwijziging.** Besluit 2.
- **Huidig wachtwoord vragen, of herauthenticatie via een gemailde code.**
  Besluit 3.
- **Andere sessies uitloggen na een wachtwoordwijziging.** Besluit 4.
- **Onboardingstap "kies een wachtwoord" na de eerste magic link** (chat30).
  Besluit 5: apart vervolgticket. `portal-login.md` en `lid-account-invite.md`
  verwijzen hiervoor nog naar #17; Docs werkt die verwijzing bij naar het
  vervolgticket zodra dat een nummer heeft.
- **PIN-sterkteregels, lockout na foute pogingen.** `docs/ARCHITECTURE.md` →
  "No lockout/rate-limit in MVP" blijft staan.
- **Sleepgebaar om een sheet te sluiten.** Zie useShell()-contract.

## Besloten door Bram (2026-09-28)

1. **Portal voor elke rol (1A).** Bardienst en beheerder loggen in op de
   portal en zien daar het lid-deel: eigen saldo, eigen transacties, eigen
   profiel, plus de PIN-rij. Vastgelegd in
   [ADR 0012](../adr/0012-portal-eigen-data-voor-elke-rol.md). Verwerkt in
   Betrokken shell (`usePortalSession.ts`), Hooks, Rolzichtbaarheid en
   Testplan (bestaande denied-tests).
2. **Naam vrij wijzigen, geen spoor (2A).** Het lid wijzigt, iedereen ziet de
   nieuwe naam, ook bij oude transacties. Zelfde als nu wanneer beheer een
   naam wijzigt. Geen logboekregel.
3. **Geen huidig wachtwoord nodig (3A).** De ingelogde sessie is genoeg.
   Alleen Nieuw plus Herhalen. Werkt ook voor een lid dat alleen via magic
   link inlogde. Staat Supabase "Secure password change" aan, dan vangt de
   hook `reauth_required` op met een "log opnieuw in"-melding, zonder
   nonce-flow.
4. **Andere sessies blijven actief (4A).** Geen `signOut({ scope: "others"
   })` na een wachtwoordwijziging.
5. **Onboarding "kies een wachtwoord" buiten scope.** Apart vervolgticket.
6. **Naam en wachtwoord alleen in de portal (6A).** `/beheer` → "Mijn
   account" blijft zoals het is (PIN aan/uit).
7. **Teksten voor de PIN-rij en PIN-sheet (bar-PIN, niet portal-PIN): akkoord
   zoals voorgesteld.**
De prototypeteksten verwijzen naar inloggen op de portal, en dat klopt hier
niet. De teksten zijn afgeleid van de al goedgekeurde tekst in
`MijnAccountOverlay.tsx`:
- Rij: **"Pincode voor de bar-tablet"** (prototype: "Pincode voor snel
  inloggen").
- Stap 1-uitleg: **"Kies 4 cijfers om snel in te loggen op de bar-tablet. Je
  wachtwoord blijft altijd werken."** (prototype: "Kies 4 cijfers om in te
  loggen zonder wachtwoord.")
- Uitleg in de wachtwoord-sheet, alleen voor bardienst/beheerder: **"Dit is
  ook je wachtwoord voor beheer op de bar-tablet."**
- De overige teksten (toasts, titels, "Voer dezelfde 4 cijfers nog een keer
  in.", de uitleg in de naam-sheet) komen letterlijk uit het prototype of uit
  bestaande schermen. De foutteksten die de Architect opstelde
  (`reauth_required`, lege naam, niet-gekoppeld account) zijn ook
  goedgekeurd.
