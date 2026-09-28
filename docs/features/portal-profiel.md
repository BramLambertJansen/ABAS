# Portal-profiel: naam, wachtwoord en eigen bar-PIN

**Status: concept, wacht op akkoord van Bram.**

Spec voor [issue #17](https://github.com/BramLambertJansen/ABAS/issues/17).
Volgt op [#15](https://github.com/BramLambertJansen/ABAS/issues/15)
(portal-login, gebouwd, `docs/features/portal-login.md`),
[#16](https://github.com/BramLambertJansen/ABAS/issues/16) (portal-dashboard,
gebouwd, `docs/features/portal-dashboard.md`) en
[#3](https://github.com/BramLambertJansen/ABAS/issues/3) (PIN-opslag/hashing,
`docs/ARCHITECTURE.md` → "PIN storage/hashing (settled, 2026-08-26)").

Deze spec staat of valt met **open vraag 1** (onder "Nog te beslissen door
Bram"): de portal laat vandaag alleen rol `lid` binnen, en daarmee kan
**geen enkel lid dat ook bardienst/beheerder is** het profielscherm ooit
bereiken. Het PIN-deel van het acceptatiecriterium is zonder een beslissing
daarover niet te bouwen. De rest van dit document is geschreven onder de
aanbevolen optie (1A); waar een andere keuze iets verandert, staat dat
erbij.

Bouwt voort op ADR
[0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md) (actorcheck
via `auth.uid()`, `select * into v_actor`),
[0005](../adr/0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md)
(wachtwoord verplicht, PIN optionele snelkoppeling, alleen-PIN verboden),
[0007](../adr/0007-rol-lid-leest-alleen-eigen-rijen.md) (rol `lid` leest
alleen eigen rijen) en
[0009](../adr/0009-portal-sessie-eigen-cookienaam.md) (portal gebruikt
`portalClient.ts`/`portalServer.ts`, afgedwongen door `check:arch`).

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
  toestel") klopt daardoor niet en wordt vervangen, zie open vraag 7.
- `designs/chats/chat10.md` regel 9 (Bram): *"op de telefoon kan een
  gebruiker alleen maar het LID gedeelte zien — dus saldo, transacties, en
  instellingen voor het account (pincode zetten, wachtwoord wijzigen, naam
  wijzigen)"*. Dit ondersteunt optie 1A: "een gebruiker" op de telefoon ziet
  het lid-deel, ongeacht de rol. De pincode staat in dezelfde zin, en die is
  alleen zinvol voor bar-rollen.
- `designs/chats/chat30.md` (regel 9): het onboardingscherm "wachtwoord
  kiezen" na een eerste magic link. `portal-login.md` en
  `lid-account-invite.md` hebben dat allebei bij #17 neergelegd, maar de
  issue-tekst van #17 noemt het niet. Zie open vraag 5.

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
| `usePortalSession.ts` | `src/hooks/queries/` | Laat nu alleen `role === 'lid'` door (regel 60). Onder optie 1A wordt dat verruimd. |

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
- **Gewijzigd (alleen onder optie 1A):** `src/hooks/queries/usePortalSession.ts`
  — de rolfilter `data.role !== "lid"` vervalt. Een sessie die naar een
  `members`-rij herleidt, met welke rol ook, is `signed-in`. De state krijgt
  `role` (en `archived`, zie Randgevallen) erbij. De `denied`-staat blijft
  bestaan voor een sessie zonder gekoppelde `members`-rij. Dit wijzigt een
  beslissing uit `portal-login.md` → Rolzichtbaarheid, dus hoort er een ADR
  bij. Zie "ADR".

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
  eigen naam wijzigen"). Onder open vraag 2 optie 2C vervalt deze RPC.
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
De client-checklist is alleen UX. Hoe het huidige wachtwoord wordt
gecontroleerd hangt af van open vraag 3.

**Let op, één account:** een bardienst/beheerder heeft één `auth.users`-rij
voor portal én `/beheer`. Een wachtwoordwijziging in de portal wijzigt dus
ook het wachtwoord waarmee dit lid op `/beheer` inlogt. Dat is correct (één
account, ADR 0005) en hoort in de uitlegtekst van de sheet voor bar-rollen,
zie open vraag 7.

## Hooks (`src/hooks/queries/`)

Allemaal met de `usePortal`-prefix. `check:arch`'s `isPortalOnlyFile()`
herkent ze daaraan (`scripts/check-arch.mjs` regel 68–72) en dwingt
`portalClient.ts` af.

- **`usePortalProfiel.ts`** (lezen): `members.select("name, role, archived,
  has_pin").eq("auth_user_id", session.user.id).maybeSingle()`, met een
  expliciete `auth_user_id`-filter en zonder te leunen op RLS. Dat is
  hetzelfde patroon als `usePortalBalance.ts`, en nodig omdat onder optie 1A
  een bardienst/beheerder-sessie via RLS álle `members`-rijen kan lezen
  (ADR 0007 beperkt alleen rol `lid`). Met `refetch()`. Loading/error-staten
  volgen hetzelfde netwerk-/serverfoutonderscheid als de andere
  portal-leeshooks (#68). De e-mail voor de profielkaart komt uit
  `usePortalSession()` (`session.user.email`), niet uit `members.email`: die
  kolom is RPC-gated (ADR 0004).
- **`usePortalUpdateOwnName.ts`** → `rpc("update_own_name", { p_name })`,
  foutcodes `actor_not_found | invalid_name | unknown`.
- **`usePortalWachtwoordWijzigen.ts`** → `auth.updateUser({ password })`,
  foutcodes `weak_password | same_password | rate_limited | unknown`. Geen
  `signOut()` na afloop, in tegenstelling tot de herstelflow. Wat er met het
  huidige wachtwoord gebeurt: zie open vraag 3.
- **`usePortalSetOwnPin.ts`** → `rpc("set_own_pin", { p_pin })`.

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
  die aan. `isRateLimitedMessage` staat er al.
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
  1. **Naam wijzigen**, hint: huidige naam.
  2. **Wachtwoord wijzigen**, hint: geen. De hint uit het prototype ("laatst
     gewijzigd 3 maanden geleden") vervalt: daar is geen databron voor, en
     een verzonnen waarde is onjuist. Zelfde afweging als
     `portal-dashboard.md` bij "bijgewerkt vandaag HH:MM".
  3. **PIN-rij, alleen als `role` in (`bardienst`, `beheerder`) en niet
     `archived`**, hint: "ingesteld"/"niet ingesteld" (uit `has_pin`). Label:
     zie open vraag 7. Voor rol `lid` wordt de rij **niet gerenderd** (niet
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
  bijgewerkt"** (prototype), `usePortalProfiel().refetch()` én
  `usePortalSession().refetch()`, zodat de header ("Hoi {voornaam}")
  meeverandert.
- Fout: `invalid_name` → "vul een naam in"; `actor_not_found` → "dit account
  is niet (meer) gekoppeld aan een actief lid — log opnieuw in"; `unknown` →
  "er ging iets mis, probeer het opnieuw". Gebruik dezelfde toon en vorm als
  de meldingen in `MijnAccountOverlay.tsx`. Zijn er voor `invalid_name`
  al teksten in `LidBeherenOverlay.tsx`, dan die hergebruiken.

### 2. Sheet "Wachtwoord wijzigen"

- Titel **"Wachtwoord wijzigen"**.
- Onder de aanbevolen optie 3A: `NieuwWachtwoordVelden` (Nieuw + Herhalen +
  checklist), knoppen **Annuleer** / **Wijzigen**. Onder 3B of 3C komt
  daarboven een veld "Huidig wachtwoord" (`autoComplete="current-password"`),
  zie open vraag 3.
- Wijzigen is `aria-disabled` tot `checkPassword(nieuw).isValid && nieuw ===
  herhaal`, en tijdens pending.
- Bij succes: sheet sluit, toast **"Wachtwoord gewijzigd"** (prototype). De
  sessie blijft actief. Wat er met andere sessies gebeurt: open vraag 4.
- Fouten: exact de teksten die `wachtwoord-vergeten.md` → Randgevallen al
  vastlegt voor `weak_password`/`same_password`, plus
  `RATE_LIMITED_MESSAGE` uit `authErrors.ts`. Geen nieuwe teksten.

### 3. Sheet "Pincode instellen" → "Pincode herhalen"

Alleen bereikbaar vanuit de PIN-rij, dus alleen voor bardienst/beheerder.

- **Stap 1**, titel **"Pincode instellen"**: uitlegtekst (open vraag 7), vier
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
| `bardienst` / `beheerder` (onder 1A) | ja | ja | ja |
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
  de nieuwe naam in Ledenbeheer en overal waar de naam getoond wordt. Of er
  meer bij hoort: open vraag 2.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Lid wijzigt naam, oude transacties | Namen zijn geen snapshot. Elke plek die `served_by`/`reversed_by`/`member_id` naar een naam oplost (dienstoverzicht, logboek, `list_own_transactions`) toont voortaan de nieuwe naam, ook voor historie. Dat gebeurt nu ook al na `update_member_name` door beheer. Geen wijziging, wel expliciet benoemd: zie open vraag 2. |
| Lid kiest een naam die een ander lid al heeft | Toegestaan, er is geen uniciteitseis (ook niet bij `update_member_name`). Op het bar-tablet kunnen dan twee gelijke namen in de ledenlijst of stafkeuze staan. Geaccepteerd risico, zelfde als vandaag via beheer. |
| Naam alleen spaties | Client: Opslaan `aria-disabled`. Server: `invalid_name`. |
| Naamwijziging terwijl het bar-tablet open staat | De bar-tablet toont de nieuwe naam bij de volgende fetch van `useMembers`/`useBarStaff`. Geen live-subscriptie, zelfde afweging als `portal-dashboard.md` → Randgevallen. |
| Rol wijzigt terwijl het Account-tabblad open staat (beheer maakt bardienst → lid) | PIN-rij blijft zichtbaar tot een refetch. Een PIN-actie geeft dan `no_bar_role` → bestaande tekst "dit account kan geen pincode instellen — vraag een beheerder", en de sheet doet een `refetch()` zodat de rij verdwijnt. Wat er met een al ingestelde `pin_hash` gebeurt bij degradatie naar `lid` is `set_member_role`'s zaak, niet van dit ticket. |
| Lid wordt gearchiveerd terwijl het tabblad open staat | Naam-/PIN-actie → `actor_not_found` → melding plus `refetch()`, waarna de rijen verdwijnen (zie Rolzichtbaarheid). |
| PIN ingesteld in de portal, daarna dienst starten op het bar-tablet | Werkt direct: `start_shift` leest dezelfde `pin_hash`. Dit is de kern van het acceptatiecriterium, e2e-test hieronder. |
| Bardienst stelt dezelfde PIN in als een collega | Toegestaan en onzichtbaar, want de hashes zijn gezouten. `start_shift` kiest het lid via de stafkeuze, niet via de PIN. Geen wijziging. |
| Zwakke PIN (`0000`, `1234`) | Toegestaan, `set_own_pin` weigert alleen verkeerde formaten. Geen nieuwe regel zonder beslissing van Bram. Buiten scope. |
| Portal-sessie van bardienst, `/beheer`-sessie op het tablet met hetzelfde account | Losse cookies (ADR 0009), losse sessies. Een PIN- of naamwijziging in de portal is op `/beheer` zichtbaar na een refetch. Een wachtwoordwijziging: zie open vraag 4. |
| Lid heeft alleen via magic link ingelogd en nooit een wachtwoord gezet | Onder 3A: werkt direct, de sheet functioneert dan als "wachtwoord instellen". Onder 3B: onmogelijk, want er is geen huidig wachtwoord om in te vullen. Dit is het hoofdargument in open vraag 3. |
| `updateUser` vereist herauthenticatie (Supabase "Secure password change" staat aan en de sessie is ouder dan het venster) | Supabase geeft dan een fout in plaats van te wijzigen. Het gedrag hangt van een dashboard-instelling af die deze repo niet kan inzien (lokaal `supabase/config.toml` zet hem niet). **De Developer controleert de instelling van het gehoste project** en noteert de uitkomst in de PR. Onder 3A met de instelling aan, vang de fout op met "log opnieuw in en probeer het nog eens" in plaats van `unknown`. |
| Rate limit op `updateUser` | `RATE_LIMITED_MESSAGE`, bestaand. |
| Netwerkfout tijdens een van de drie acties | Sheet blijft open, invoer blijft staan (behalve bij de PIN: terug naar stap 1, geen PIN in state laten hangen), melding "er ging iets mis, probeer het opnieuw". |
| **a11y** | Nieuwe stateful weergaven in `e2e/a11y.spec.ts` (axe): Account-tabblad als `lid` (zonder PIN-rij) en als bardienst (met PIN-rij), elk van de drie sheets open, PIN-sheet stap 2 en met foutmelding, naam-sheet met foutmelding. De bar-scenario's dekken de `PinPad`-refactor al af (dienst-starten). |

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

`set_own_pin.test.sql` blijft ongewijzigd: de RPC verandert niet, en de
database weet niet of de aanroep uit de portal of uit `/beheer` komt.
`check:rls` verandert niet: geen nieuwe tabel of policy.

### `test` (unit)

- `src/lib/ownPinErrors.ts`: mapping van alle bekende foutcodes plus
  fallback naar `unknown`.
- Uitgebreid `src/lib/authErrors.ts`: `weak_password`/`same_password`/
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
- PIN-sheet: ongelijke herhaling → "Codes komen niet overeen", terug naar
  stap 1, **geen** `set_own_pin`-request verstuurd (request-log van de mock).

**Live backend** (lokale stack plus `seed.sql`, zelfde opzet als
`portal-login.spec.ts` → "live backend"). Tests die seeddata wijzigen,
herstellen die in een `afterEach` of draaien op een eigen fixture-lid, zodat
andere specs niet omvallen:

1. **Anna de Vries (`lid`)** logt in op `/portal` → Account-tabblad →
   rijen Naam en Wachtwoord zichtbaar, **geen PIN-rij in de DOM**
   (`toHaveCount(0)`, niet alleen `not.toBeVisible`).
2. Anna wijzigt haar naam → toast, header toont de nieuwe voornaam, na
   herladen staat de nieuwe naam er nog.
3. **Sanne Bakker (`bardienst`, wachtwoordaccount, geen PIN in de seed)**
   logt in op `/portal` (vereist 1A) → PIN-rij "niet ingesteld" → PIN
   instellen en herhalen → toast, hint "ingesteld".
4. **Kern-AC, over de shells heen:** daarna op `/` (bar-tablet, device-sessie)
   Sanne kiezen in de stafkeuze plus de zojuist ingestelde PIN → dienst
   start. Dit bewijst "aansluitend op de bestaande PIN-opslag/hashing" end to
   end. Sluit de dienst in de teardown af (`end_shift`) en zet de PIN weer uit.
5. Sanne verwijdert de PIN → hint "niet ingesteld" → op `/` weigert de
   stafkeuze met PIN (bestaand gedrag van `start_shift` bij `pin_hash is
   null`).
6. Wachtwoord wijzigen als Anna → uitloggen → inloggen met het nieuwe
   wachtwoord lukt, met het oude niet. Zet het wachtwoord in de teardown terug
   via de Admin API (service-role, alleen in de testhelper, zoals
   `generate_link` al doet).

### Gates

`check:arch` (nieuwe `PORTAL_ONLY_DIRS`-entry; geen `client.ts`-import in
`portal-profiel/` of in `usePortal*`), `check:policy` (alle queries in
`src/hooks/queries/`), `check:a11y` (zie Randgevallen → a11y), `lint` zonder
warnings.

## ADR

- **Onder optie 1A is een nieuwe ADR nodig**, voorgesteld als *ADR 0012 —
  Portal is het lid-deel voor iedereen met een gekoppeld `members`-record,
  niet alleen voor rol `lid`*. Die wijzigt `portal-login.md` → Rolzichtbaarheid
  ("sessie die niet naar een actief `lid`-record herleidt → `denied`"), wat
  een volgende portal-feature anders als vaste grens zou lezen. De ADR moet
  vastleggen: (a) de portal toont voor elke rol alleen eigen data; (b) elke
  portal-leeshook filtert daarom **expliciet** op de eigen
  `auth_user_id`/`caller_member_id()`, en mag nooit leunen op de
  RLS-narrowing van ADR 0007, omdat een bardienst/beheerder-sessie die
  narrowing niet heeft (dit is nu toevallig zo in `usePortalBalance.ts` en
  `list_own_transactions()`, en wordt daarmee een regel); (c) of dit een
  gate verdient (een `check:policy`-regel "elke `.from()` in een
  `usePortal*`-hook heeft een `.eq("auth_user_id", …)` of gaat via een
  zelf-scopende RPC") of reviewwerk blijft. Aanbeveling voor (c): eerst
  reviewwerk, want de regel is lastig betrouwbaar statisch te lezen. Het
  staat wel in de ADR, zodat het niet vergeten wordt. ADR 0003
  (modus-keuze bar óf beheer) wordt niet geraakt: de portal is geen derde
  modus op het bar-tablet, maar een aparte shell met een eigen cookie (ADR
  0009). ADR 0005 wordt niet geraakt. De ADR wordt geschreven zodra Bram
  voor 1A kiest, en landt in dezelfde PR als deze spec.
- **Geen ADR voor `update_own_name`**: dat volgt het bestaande
  zelfbedieningspatroon van `set_own_pin` (0014) één op één.
- **Geen ADR voor de `Overlay.tsx`-sheet-tak**: die was al voorzien in het
  type (`overlay: "sheet"`) en in `docs/ARCHITECTURE.md` (regel 183). Na de
  bouw werkt Docs die passage bij van "nog niet gebouwd" naar gebouwd.

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
  `/beheer`). Zie open vraag 6.
- **PIN-sterkteregels, lockout na foute pogingen.** `docs/ARCHITECTURE.md` →
  "No lockout/rate-limit in MVP" blijft staan.
- **Sleepgebaar om een sheet te sluiten.** Zie useShell()-contract.
- **Onboardingwizard na de eerste magic link** (chat30), tenzij Bram bij open
  vraag 5 anders beslist.

## Nog te beslissen door Bram

**1. (Blokkerend) Mag een bardienst/beheerder inloggen op de portal?**
Vandaag weigert `usePortalSession.ts` elke rol behalve `lid` (`denied`, "Dit
account is niet gekoppeld aan een lid."), zoals `portal-login.md` →
Rolzichtbaarheid besloot. Dan kan een bardienst het profielscherm nooit
bereiken, en is "PIN instellen, alleen voor leden met bar/beheer-rol" in de
portal onbereikbare code.
- **1A — Ja: de portal is het lid-deel voor iedereen met een gekoppeld
  `members`-record.** Een bardienst of beheerder ziet op de telefoon eigen
  saldo, transacties en profiel, plus de PIN-rij. Vereist ADR 0012 (zie ADR)
  en een kleine wijziging in `usePortalSession.ts`. Technisch veilig
  vandaag: `usePortalBalance.ts` filtert expliciet op `auth_user_id`, en
  `list_own_transactions()` op `caller_member_id()`. Bardienst/beheerder
  hebben een eigen saldo (seed: Tom €9,80, Sanne €21,00) maar nu geen enkele
  plek om hun eigen transacties te zien.
- **1B — Nee: de portal blijft alleen voor `lid`.** Een bardienst/beheerder
  zet de PIN alleen via `/beheer` → "Mijn account" (bestaat al). Voor de
  portal valt het PIN-deel van #17 weg: de PIN-rij wordt nooit gebouwd,
  omdat elk portal-lid rol `lid` heeft. Een bardienst kan dan ook naam en
  wachtwoord niet in de portal wijzigen (zie vraag 6).
- **Aanbeveling: 1A.** Het issue gaat er letterlijk van uit ("als het lid
  óók bardienst/beheerder is"), Bram's eigen woorden in `chat10.md` ("op de
  telefoon kan een gebruiker alleen maar het LID gedeelte zien") wijzen die
  kant op, en het lost een echt gat op (bar-rollen zien nu hun eigen
  transacties nergens). Het risico, dat een bardienst-sessie via RLS breed
  kan lezen, is beheersbaar met de regel uit ADR 0012 (b).

**2. Naam wijzigen: helemaal vrij, of met een spoor voor beheer?**
De naam staat op het bar-tablet (ledenlijst, stafkeuze), in dienstoverzicht
en logboek, en wordt niet gesnapshot, dus ook oude transacties tonen de
nieuwe naam.
- **2A — Vrij, geen spoor.** Het lid wijzigt, iedereen ziet de nieuwe naam.
  Zelfde als nu wanneer beheer een naam wijzigt.
- **2B — Vrij, met logboekregel voor beheer** ("Anna de Vries heet nu Anna
  Jansen"). Het logboek heeft nu geen databron voor ledenmutaties (de chip
  "Leden" is altijd leeg, `logboek.ts`), dus dit vraagt een nieuwe
  audittabel plus RLS plus tests. Dat is een eigen ticket, en waarschijnlijk
  ook nodig voor beheerwijzigingen.
- **2C — Niet in de portal; naam wijzigt alleen beheer.** De Naam-rij en
  `update_own_name` vervallen.
- **Aanbeveling: 2A.** Het is wat issue en prototype vragen, er is geen
  geldrisico, en het is gelijk aan wat beheer al kan. Hebben leden die zich
  bewust onherkenbaar noemen later een risico, dan is 2B een los ticket dat
  beide paden tegelijk dekt.

**3. Moet het huidige wachtwoord ingevuld worden bij wijzigen?**
Het prototype toont het veld, maar controleert het niet.
- **3A — Nee, de ingelogde sessie is genoeg.** Alleen Nieuw plus Herhalen.
  Werkt ook voor een lid dat alleen via magic link inlogde en nooit een
  wachtwoord had. Zelfde vertrouwensniveau als `set_own_pin` en de naam
  (sessie = bewijs). Risico: wie een ontgrendelde telefoon met open portal
  in handen krijgt, kan het wachtwoord wijzigen. Voor bardienst/beheerder is
  dat ook het `/beheer`-wachtwoord.
- **3B — Ja, client-side hercontrole** via `signInWithPassword(eigen e-mail,
  huidig)` vóór `updateUser`. Blokkeert het scenario met de onbeheerde
  telefoon, maar werkt niet voor een lid zonder wachtwoord (magic-link-only),
  en het is geen serverside garantie (een aanvaller met de sessie kan
  `updateUser` direct aanroepen).
- **3C — Serverside herauthenticatie via Supabase** (instelling "Secure
  password change" plus `reauthenticate()`, dat een code mailt). Echte
  garantie, maar een mailstap bij elke wijziging buiten het venster, en het
  hangt van Supabase-dashboardgedrag af dat hier niet te verifiëren is.
- **Aanbeveling: 3A.** Het lid kan altijd al via "Wachtwoord vergeten"
  (alleen de mailbox is nodig) een nieuw wachtwoord zetten, dus 3B voegt
  weinig echte bescherming toe en sluit magic-link-leden uit. Moet de
  onbeheerde telefoon wel afgedekt worden, dan is 3C de enige variant die
  het echt dekt.

**4. Andere sessies uitloggen na een wachtwoordwijziging?**
- **4A — Nee** (Supabase-standaard): andere sessies van hetzelfde account
  blijven werken tot ze verlopen.
- **4B — Ja**, `signOut({ scope: "others" })` na succes. Let op: voor een
  bardienst/beheerder logt dat ook een lopende `/beheer`-sessie op het
  bar-tablet uit (zelfde `auth.users`-rij). De device-sessie van de bar niet,
  want dat is een ander account.
- **Aanbeveling: 4A** voor v1. Een wachtwoordwijziging is hier meestal
  gemak, geen reactie op een lek. Wie een lek vermoedt, heeft baat bij 4B.
  Dat kan later een losse knop "overal uitloggen" worden.

**5. Hoort het onboardingscherm "kies een wachtwoord" na de eerste magic
link (chat30) bij dit ticket?** `portal-login.md` en `lid-account-invite.md`
wijzen het aan #17 toe. De issue-tekst noemt het niet.
- **5A — Buiten scope, eigen ticket.** Onder 3A kan een magic-link-lid via
  Account → Wachtwoord wijzigen alsnog een wachtwoord zetten (functioneel
  "instellen"), maar wordt daar niet naartoe geleid. Voor een uitgenodigde
  bardienst/beheerder (verplicht wachtwoord, ADR 0005) blijft de route nu
  "Wachtwoord vergeten", of onder 1A het portal-profiel.
- **5B — Binnen scope:** na de eerste magic-link-login (portal en `/beheer`)
  een verplichte stap "kies een wachtwoord". Dat raakt `/auth/callback`,
  vraagt een manier om "heeft nog geen wachtwoord" te detecteren (Supabase
  geeft dat niet aan de client; dat vraagt een nieuwe RPC die in `auth.users`
  kijkt of een nieuwe vlag) en raakt ook bar/beheer. Groter dan de rest van
  #17 bij elkaar.
- **Aanbeveling: 5A.** Wel expliciet een vervolgticket aanmaken, zodat de
  twee specs die ernaar verwijzen niet naar een lege plek wijzen.

**6. Naam en wachtwoord ook in `/beheer` → "Mijn account"?**
- **6A — Nee, alleen de portal.** Onder 1A doet een bardienst/beheerder dat
  op de telefoon.
- **6B — Ja**, `MijnAccountOverlay.tsx` krijgt dezelfde rijen, met
  bar-client-hooks.
- **Aanbeveling: 6A.** Het issue gaat over de portal, en onder 1A is er
  voor elke rol een plek. Kiest Bram 1B, dan is 6B de enige manier waarop
  een bardienst naam en wachtwoord kan wijzigen, en hoort het wel in scope.

**7. Teksten voor de PIN-rij en PIN-sheet (bar-PIN, niet portal-PIN).**
De prototypeteksten verwijzen naar inloggen op de portal, en dat klopt hier
niet. Voorstel, afgeleid van de al goedgekeurde tekst in
`MijnAccountOverlay.tsx`:
- Rij: **"Pincode voor de bar-tablet"** (prototype: "Pincode voor snel
  inloggen").
- Stap 1-uitleg: **"Kies 4 cijfers om snel in te loggen op de bar-tablet. Je
  wachtwoord blijft altijd werken."** (prototype: "Kies 4 cijfers om in te
  loggen zonder wachtwoord.")
- Uitleg in de wachtwoord-sheet, alleen voor bardienst/beheerder: **"Dit is
  ook je wachtwoord voor beheer op de bar-tablet."**
- Graag akkoord of eigen tekst. De overige teksten (toasts, titels, "Voer
  dezelfde 4 cijfers nog een keer in.", de uitleg in de naam-sheet) komen
  letterlijk uit het prototype of uit bestaande schermen, en staan niet ter
  discussie tenzij Bram dat wil.
