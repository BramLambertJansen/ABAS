# Portal-sessielookup: laadfout is geen "niet gekoppeld"

**Status: gebouwd (PR #164, d9c86f8; issue #115, deel van epic #128).**
Goedgekeurd door Bram (gedelegeerd aan de Architect). Zie "Zoals gebouwd" voor
de afwijkingen van deze spec. Gevalideerd tegen `main` op `ee8c066`. De keuzes zijn door de Architect namens Bram gemaakt (zie
"Besluiten Architect"); er zijn geen open vragen over geld of beleid.

Spec voor [issue #115](https://github.com/BramLambertJansen/ABAS/issues/115)
(`usePortalSession` toont "Dit account is niet gekoppeld aan een lid." bij een
laadfout), plus het deel van [#128](https://github.com/BramLambertJansen/ABAS/issues/128)
dat op #115 wacht. Dit document **vervult** de punten die
[`leesfouten-herstel-actuele-data.md`](leesfouten-herstel-actuele-data.md)
(T08, "Niet gebouwd: wacht op #115"; Schermgedrag → PortalShellHome 1 tot 7;
besluiten 1, 6 en 14) bewust aan #115 overliet. Schermgedrag en tekstkeuzes uit
T08 gelden hier ongewijzigd; dit document is de bouwopdracht ervoor, geen
tweede ontwerp. Bij een conflict wint dit document voor `usePortalSession` en
`PortalShellHome`.

## Doel

Een gekoppeld lid dat door een storing (netwerk, 5xx, PostgREST- of
schemafout, RLS-fout) de `members`-lookup niet kan voltooien, ziet een
laad-/verbindingsfout met "Opnieuw proberen", niet een onjuiste accountmelding.
`denied` betekent daarna uitsluitend: lookup geslaagd, geen `members`-rij. Alleen
frontend: geen RPC, RLS, migratie, schema of auth-/sessiebeleid; geld, saldi en
attributie blijven buiten beeld.

## Gelezen bronnen

- **Issue #115** en #128 (volledig), T08-spec (alle PortalShellHome-items, besluiten
  1, 6, 11, 14), `portal-login.md` (Rolzichtbaarheid, Randgevallen).
- **Wireframe** `designs/Lid App.dc.html`: geen foutscherm ontworpen voor een
  mislukte sessielookup. Toevoeging op het in-app design system (`LeesFout`,
  tone `light`), geen afwijking van een ontwerpkeuze.
- **Code**: `usePortalSession.ts`, `PortalShellHome.tsx`, `PortalLogin.tsx`,
  `PortalDashboard.tsx`, `useBeheerSession.ts`, `usePortalProfiel.ts`,
  `src/lib/loadErrors.ts`, `src/components/LeesFout.tsx`,
  `src/hooks/useHerstelFocus.ts`, `e2e/portal-login.spec.ts`,
  `e2e/leesfouten-herstel.spec.ts` (met `e2e/helpers/supabaseMock.ts`).
- **Kaders**: CLAUDE.md (Auth, "geld alleen via RPC" blijft onaangeraakt),
  ADR 0009 (cookie-isolatie, `portalClient`), ADR 0012 (expliciet
  `auth_user_id`-filter), ADR 0019 (eigen-rij-leespolicy).

## Validatie van het issue op actuele main

- **Bevestigd.** In `usePortalSession.ts` zet de `catch` rond de `members`-lookup
  (`if (error) throw error` valt daar ook in) `denied` met `DENIED_MESSAGE`,
  identiek aan "lookup geslaagd, geen rij". `PortalShellHome` toont dat via
  `PortalLogin deniedMessage` zonder opnieuw-proberen.
- **Eindeloze loader (T08-bevinding, nog open):** `supabase.auth.getSession().then(...)`
  heeft geen `.catch`; een afgewezen sessielezing laat de hook op `loading`.
- **Achtergrondlookup (T08-bevinding, nog open):** `onAuthStateChange` roept
  `resolve()` bij elk event aan (`INITIAL_SESSION`, `SIGNED_IN` bij
  tabterugkeer, `TOKEN_REFRESHED`). Met alleen de classificatie uit #115 zou
  een mislukte achtergrondlookup een werkend dashboard vervangen door een
  foutscherm, of (zoals nu) door `denied`. `resolve()` heeft geen
  volgordeguard, en bij `INITIAL_SESSION` plus `getSession()` start de hook nu
  twee lookups voor dezelfde sessie.
- **`PortalDashboard` heeft geen `key`:** bij een andere identiteit op dezelfde
  pagina blijven tabstate en hooks staan.
- **`refetch` wordt al gebruikt** (`onProfileChanged` na een naamswijziging in
  `PortalShellHome`). Die refetch gaat nu via `tick` en laat de bestaande state
  staan tot het resultaat er is: dat gedrag blijft, ook bij een mislukte
  refetch (zie Gedrag 5).
- **`useBeheerSession` (nagaan, issue-punt 4): al deels goed, bewust niet
  gewijzigd.** Zijn `catch` zet `denied` met een eigen, juiste tekst ("Kon niet
  controleren of dit account mag inloggen — probeer opnieuw in te loggen."),
  niet "niet gekoppeld". Hij heeft een volgordeguard (`request`) en een
  `getSession`-`.catch` (naar `signed-out`). Resterend, buiten scope: geen
  opnieuw-proberen-knop, de laadfout deelt de `denied`-status, en `resolve()`
  zet `loading` ook bij een achtergrond-event. Zie besluit 10 en "Buiten scope".
- **Het ongekoppelde-account-geval blijft.** `e2e/portal-login.spec.ts`
  ("een ongekoppeld account op /portal krijgt de neutrale 'niet gekoppeld'-melding")
  gebruikt een echte seed-account zonder `members`-rij; dat blijft `denied`.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC:** niet geraakt. De sessielookup is een leesactie op de
  eigen `members`-rij; er wordt geen bedrag berekend of getoond.
- **Attributie alleen via bezetting:** niet geraakt; portal-only, geen
  `served_by`.
- **Auth/sessiebeleid:** niet gewijzigd. De hook beslist nog steeds alleen "is
  er een sessie, en herleidt die naar een rij". Fail-closed blijft: een
  mislukte lookup geeft **nooit** `signed-in` (er is geen dashboard zonder
  bevestigde rij) en geeft ook geen toegang tot iets nieuws. De enige
  versoepeling is dat een al bevestigde `signed-in`-sessie niet door een
  *mislukte achtergrondlookup* wordt weggeslagen (besluit 4); dat geeft geen
  extra rechten, de RLS en RPC-guards beslissen server-side bij elke
  volgende lezing toch zelf.
- **Cookie-isolatie (ADR 0009):** onveranderd; de hook blijft op
  `portalClient`.
- **Portal-dashboard `PortalDashboard` en `PortalLogin`:** hun rolzichtbaarheid
  en inhoud veranderen niet.

## Betrokken shell

Alleen `portal` (`src/shells/portal/PortalShellHome.tsx`,
`src/hooks/queries/usePortalSession.ts`). Het foutscherm is portal-specifiek en
gebruikt het gedeelde `LeesFout` (`src/components/`, tone `light`); geen nieuw
component.

## Datamodel, RPC's, rolzichtbaarheid

Geen wijzigingen: geen tabel, kolom, migratie, RPC of policy. Dezelfde
`members`-select (`name, role, archived`, filter op `auth_user_id`, geen
`archived`-filter, ADR 0019) blijft. Rolzichtbaarheid ongewijzigd: elke rol met
een gekoppeld lid is `signed-in` op de portal (ADR 0012).

## Interface

### `PortalSessionState` (uitbreiding)

```
| { status: "loading" }
| { status: "signed-out" }
| { status: "denied"; message: string }                       // lookup ok, geen rij
| { status: "error"; message: string; bezig: boolean }         // nieuw
| { status: "signed-in"; userId: string; email; name; role; archived }  // userId nieuw
```

- `error.message` komt uit `loadErrorMessage("Kan je account niet laden.", err)`
  (`src/lib/loadErrors.ts`, #68): netwerk geeft "… Controleer de verbinding.",
  al het andere "… Er ging iets mis aan de serverkant — meld dit bij de
  beheerder (code …)." met de korte `SAFE_CODE_RE`-code. Nooit de ruwe fout.
  Zelfde patroon als `usePortalProfiel` (`WHAT`), andere eerste zin omdat dit
  de hele account-check is.
- `bezig` is `true` zolang een retry vanuit de foutstaat loopt; de status blijft
  `error` (geen terugval naar `loading`, zodat de focus op de knop blijft).
- `userId` is `session.user.id`; de naamgeving en `PortalDashboard key` zijn T08
  besluit 6.
- `refetch` blijft bestaan met dezelfde signatuur (`() => void`) en dient
  voor beide: "Opnieuw proberen" (vanuit `error`) en `onProfileChanged`
  (vanuit `signed-in`).

### Pure logica (nieuw, unit-testbaar)

`src/lib/portalSessie.ts`, geen React, geen Supabase:

- `volgendeSessieStaat(huidig, uitkomst)`: `uitkomst` is `{ soort: "rij", userId,
  email, rij }`, `{ soort: "geen-rij" }` of `{ soort: "fout", err }`, plus een
  vlag of de lookup op de achtergrond liep. Bepaalt de nieuwe staat volgens de
  tabel onder "Gedrag 4".
- `isAchtergrondlookup(huidig, userId)`: `true` als `huidig` `signed-in` is met
  dezelfde `userId`.

De Developer mag de namen aanpassen; de eis is dat de beslistabel buiten React
unit-getest is (`test/portalSessie.test.ts`, `npm test`).

## Gedrag

### 1. `loading`, `signed-out`

Ongewijzigd: neutrale laadtekst (`role="status"`) en `PortalLogin`. Een
verlopen of ontbrekende sessie blijft `signed-out` met het gewone
loginscherm, zonder nieuwe tekst (T08 besluit 12).

### 2. Foutstaat: classificatie

Een lookup die faalt (`error` van PostgREST, een geworpen netwerkfout) en elke
afgewezen `getSession()` geeft `status: "error"` (alleen als het een
voorgrondlookup is, zie 4). `classifyLoadError` bepaalt alleen de tekst.
De lookup wordt hier **niet** opnieuw automatisch geprobeerd: geen
timer, geen backoff.

`getSession()` die **resolvet met `error` en zonder sessie**: is dat een
retryable fetch-fout van supabase-js (`isAuthRetryableFetchError`: netwerk of
5xx bij de token-refresh), dan is dat ook `error`, niet `signed-out`; een
andere auth-fout of "geen sessie" blijft `signed-out`. De Developer controleert
de te gebruiken helper tegen de geïnstalleerde `@supabase/supabase-js` /
`auth-js`-versie. Is de fout daarmee niet betrouwbaar te onderscheiden, dan
blijft het bij `signed-out` en meldt de Developer dat in de PR (geen eigen
heuristiek). `logLocalError` blijft voor de console; `reportClientError` blijft
voor de lookup-fout (bestaand), zodat `foutlogging.md` onveranderd klopt.

### 3. `denied`

Alleen als de lookup **slaagde** en geen rij teruggaf. Tekst ("Dit account is
niet gekoppeld aan een lid."), weergave via `PortalLogin deniedMessage` en
`DENIED_MESSAGE` ongewijzigd. Dit geldt ook voor een achtergrondlookup:
verdwenen rij is `denied`.

### 4. Voorgrond versus achtergrond, volgorde en deduplicatie

Een lookup is **achtergrond** als de huidige staat `signed-in` is met dezelfde
`userId`; anders **voorgrond** (eerste lookup, na `error`, of een andere
`userId`).

| Huidige staat, uitkomst | Nieuwe staat |
|---|---|
| voorgrond, rij gevonden | `signed-in` (met `userId`) |
| voorgrond, geen rij | `denied` |
| voorgrond, fout | `error` (`bezig: false`) |
| achtergrond, rij gevonden | `signed-in` met ververste `name/role/archived/email` |
| achtergrond, geen rij | `denied` |
| achtergrond, fout | **geen wijziging** (dashboard blijft; geen toast) |
| auth-event zonder sessie (`SIGNED_OUT`) | `signed-out` |

Aanvullende regels:

- **Andere `userId` tijdens `signed-in`:** de staat gaat direct naar `loading`
  (de oude identiteit blijft niet zichtbaar), dan voorgrond-lookup.
- **Volgordeguard:** een `request`-teller zoals `useBeheerSession`
  (`++request` per lookup, resultaat van een oudere ronde wordt genegeerd, ook
  bij `cancelled`). Een auth-event zonder sessie verhoogt de teller zodat een
  late lookup van de uitgelogde identiteit niets zet.
- **Geen dubbele lookups:** loopt er al een lookup voor dezelfde `userId` en
  komt er een auth-event (bv. `INITIAL_SESSION` naast `getSession()`), dan
  start dat geen tweede request. Een expliciete `refetch` (nieuwe `tick`,
  nieuwe effect-instantie) start wel een nieuwe.
- **Achtergrondfout wordt nog wel gerapporteerd** via `reportClientError`
  (zodat het in het foutlogboek komt), maar leidt niet tot UI.

### 5. `refetch`

- Vanuit `error`: zet `bezig: true` zonder de foutstaat te verlaten; bij een
  succes `signed-in` of `denied`; bij een mislukking weer `error` met
  `bezig: false` en de nieuwe melding. Geen automatische herhaling.
- Vanuit `signed-in` (naamswijziging, `onProfileChanged`): achtergrondlookup
  volgens 4. Een mislukte refetch laat de oude naam staan.
- Vanuit `loading`, `denied` of `signed-out`: gewoon een nieuwe lookup volgens
  4 (voorgrond).

### 6. `PortalShellHome`

1. `loading`: ongewijzigd.
2. `signed-out`: `PortalLogin`.
3. `denied`: `PortalLogin deniedMessage` (ongewijzigd).
4. `error`: een `<main>` met dezelfde schil als de laadstaat
   (`min-h-screen`, gecentreerd, `bg-canvas`) en `LeesFout` (tone `light`) met
   `message` en `bezig`, `onRetry = session.refetch`. **Geen** loginformulier
   en **geen** "niet gekoppeld"-tekst. Daaronder een secundaire tekstknop
   "Uitloggen" (`session.signOut`), zodat een aanhoudende storing geen
   doodlopend scherm is (besluit 6).
5. `signed-in`: `<PortalDashboard key={session.userId} … />`; props verder
   ongewijzigd (`onProfileChanged={session.refetch}`).

**Focus:** de retry-knop is `aria-disabled` (door `LeesFout`), dus de focus
blijft op de knop tijdens en na een mislukte retry. Bij een geslaagde retry
verdwijnt de knop; de focus gaat dan via `useHerstelFocus` naar de
dashboardkop (`h1` "Hoi …", `tabIndex={-1}`), nooit naar `body` (T08 besluit 9,
T06). Bij een geslaagde retry die `denied` oplevert, gaat de focus naar de
meldingsregel van `PortalLogin` zoals nu bij `denied`: geen nieuwe regel.

## Teksten

| Plek | Tekst |
|---|---|
| Foutregel, netwerk | "Kan je account niet laden. Controleer de verbinding." |
| Foutregel, server | "Kan je account niet laden. Er ging iets mis aan de serverkant — meld dit bij de beheerder (code …)." (code alleen als veilig volgens `SAFE_CODE_RE`) |
| Herstelknop | "Opnieuw proberen" (bezig: "Opnieuw proberen…", via `VERVERS_TEKSTEN`) |
| Tweede knop | "Uitloggen" |
| `denied` | "Dit account is niet gekoppeld aan een lid." (ongewijzigd) |

## Randgevallen

| Geval | Gedrag |
|---|---|
| `members` geeft 500 bij de eerste lookup | `error`, serverkant-tekst met code; retry herstelt zonder login. |
| `members` netwerkfout (`abort`) | `error`, "Controleer de verbinding."; retry herstelt. |
| Retry faalt weer | Zelfde foutscherm, focus blijft op de knop, geen automatische herhaling. |
| Lookup slaagt zonder rij | `denied`, ongewijzigd. |
| Gekoppeld lid, lookup 200 met rij | `signed-in`, ongewijzigd. |
| Auth-event bij tabterugkeer terwijl `members` faalt | Dashboard blijft staan (T08 besluit 14), geen toast. |
| Auth-event bij tabterugkeer, rij is inmiddels weg | `denied`. |
| `INITIAL_SESSION` plus `getSession()` | Eén lookup. |
| `getSession()` wijst af | `error` (niet eindeloos `loading`). |
| Uitloggen terwijl een lookup loopt | Late respons genegeerd, `signed-out`, geen foutmelding. |
| Andere gebruiker logt in op dezelfde pagina | `loading`, nieuwe lookup, `PortalDashboard` remount via `key`; geen data van de vorige gebruiker. |
| Foutscherm en uitloggen, netwerk weg | Uitloggen werkt zoals nu in het dashboard (`signOut` ruimt lokaal op, fout naar `logLocalError`); het scherm gaat bij `SIGNED_OUT` naar `PortalLogin`. |
| Bar-sessie op het apparaat | Onveranderd `signed-out` (cookie-isolatie, ADR 0009). |

## Teststrategie

Negatieve gevallen eerst. De Reviewer controleert deze lijst.

**Unit (`npm test`, `test/portalSessie.test.ts`):** de beslistabel uit Gedrag 4:
voorgrond-fout geeft `error`; achtergrond-fout geeft ongewijzigd `signed-in`;
voorgrond-geen-rij en achtergrond-geen-rij geven `denied`; andere `userId` is
voorgrond; netwerk- en serverfout geven de juiste tekst (`loadErrorMessage`)
zonder ruwe fout; een oudere ronde wordt genegeerd (als de guard als functie
uitgesplitst is).

**E2E (Playwright, gemockt, in `e2e/leesfouten-herstel.spec.ts` omdat die
`mockPortal` en `antwoord` heeft; de bestaande opmerking bovenaan "Niet in
deze spec (wacht op #115)" wordt bijgewerkt):** de sessielookup is de
`members`-request met `auth_user_id=eq.<id>` zonder `balance_cents`.

1. `members`-lookup geeft 500: scherm met "Kan je account niet laden. Er ging
   iets mis aan de serverkant" en code, knop "Opnieuw proberen"; **geen** "Dit
   account is niet gekoppeld aan een lid." en **geen** loginformulier. Retry
   met herstelde mock: dashboard "Hoi Mock", zonder opnieuw in te loggen
   (controleer dat er geen tweede `/auth/v1/token`-aanroep is).
2. Idem met `route.abort("failed")` (netwerkfout): "Controleer de verbinding."
3. Retry faalt weer: foutscherm blijft, knop blijft focus houden
   (`document.activeElement` is de knop), tijdens de retry `aria-disabled`.
4. Lookup slaagt met `null` (mock geeft geen rij): `denied` met de bestaande
   tekst en het inlogformulier. De bestaande live-test voor het ongekoppelde
   seed-account in `e2e/portal-login.spec.ts` blijft ongewijzigd groen.
5. Achtergrondfout: ingelogd dashboard, daarna `members`-lookup op 500 en een
   `visibilitychange` of een `TOKEN_REFRESHED`-achtig auth-event: dashboard en
   saldo blijven staan, geen foutscherm, geen `denied`.
6. Achtergrond, rij verdwenen (mock geeft `null`): `denied`.
7. `getSession`-afwijzing (bv. vooraf corrupte opslag of een geforceerde
   fout, naar keuze van de Developer): foutscherm met retry, geen eindeloze
   "Bezig met laden…".
8. Uitloggen vanuit het foutscherm: `PortalLogin`.
9. Identiteitswissel: na `signOut` en login als andere mock-gebruiker toont
   het dashboard geen naam of saldo van de eerste (via `key` en `loading`).
10. Eén lookup per sessiestart: het aantal sessielookups (members-request
    zonder `balance_cents`) is 1 bij de eerste lading.
11. **a11y:** `e2e/a11y.spec.ts` krijgt de foutstaat van `/portal` (axe
    WCAG-AA schoon; `role="alert"` op de melding; knoppen 44 px; focus niet op
    `body` na herstel).

**Handmatig door de Tester:** vliegtuigmodus op een echte telefoon bij het
openen van `/portal`, daarna online zetten en "Opnieuw proberen"; tabblad
op de achtergrond terwijl het netwerk wegvalt, daarna terugkeren.

## Besluiten Architect (namens Bram, 2026-10-05)

Bram heeft de keuzes bij de Architect gelegd. Per keuze: de vraag, het
antwoord, een zin reden. Bij twijfel is de conservatiefste optie gekozen.

1. **Vraag:** één nieuwe staat of een veld op `denied`? **Antwoord:** een eigen
   `status: "error"`; `denied` blijft puur "geen rij". **Reden:** het issue
   eist dat `denied` alleen die betekenis houdt, en een aparte status laat
   `PortalShellHome` de twee onmogelijk verwarren.
2. **Vraag:** classificatie en tekst? **Antwoord:** `loadErrorMessage("Kan je
   account niet laden.", err)` uit #68, dus netwerk versus server met korte
   code. **Reden:** bestaande vaste vocabulaire, dezelfde aanpak als
   `usePortalProfiel`, en nooit de ruwe fout op het scherm.
3. **Vraag:** hoe herstelt de gebruiker? **Antwoord:** gedeeld `LeesFout` (tone
   `light`) met "Opnieuw proberen" via `refetch`; de status blijft `error`
   met `bezig: true` tijdens de retry. **Reden:** componenten zijn herbruikbaar
   (CLAUDE.md), en een status die niet naar `loading` terugvalt houdt de
   focus op de knop (T06, T08 besluit 9).
4. **Vraag:** wat doet een mislukte achtergrondlookup bij een bevestigde
   sessie? **Antwoord:** niets zichtbaars; wel `reportClientError`. Een
   verdwenen rij blijft `denied`. **Reden:** T08 besluit 14; geen rechten
   erbij want server-side guards blijven beslissen, en een werkend dashboard
   wegslaan om een token-refresh is erger dan even wachten.
5. **Vraag:** volgorde en dubbele lookups? **Antwoord:** `request`-teller zoals
   `useBeheerSession`, plus overslaan van een tweede lookup voor dezelfde
   `userId` terwijl er een loopt; auth-event zonder sessie verhoogt de teller.
   **Reden:** bestaand patroon, geen nieuwe architectuur; sluit het
   late-response-risico (T08 criterium 6) voor de sessie zelf.
6. **Vraag:** blijft de gebruiker bij een aanhoudende fout in een doodlopend
   scherm? **Antwoord:** nee, een secundaire "Uitloggen" onder de foutmelding;
   geen loginformulier op dat scherm. **Reden:** het is portal-only, raakt
   geen dienst (de reden waarom T08 besluit 7 dit op de bar weigert) en
   `signOut` bestaat al; het formulier zou suggereren dat het lid geen
   sessie heeft, wat niet klopt.
7. **Vraag:** `getSession`-afwijzing en een resolvede auth-fout? **Antwoord:**
   `.catch` zet `error`; een retryable fetch-fout van supabase-js wordt ook
   `error`; alles anders blijft `signed-out`, en als het niet betrouwbaar te
   onderscheiden is blijft het bij `signed-out` met melding in de PR.
   **Reden:** netwerkuitval bij de token-refresh is een laadfout, geen
   uitlog; maar geen eigen heuristiek over sessiegedrag (T08 besluit 12,
   T01/#122 is eigenaar van sessiestatus).
8. **Vraag:** `key={userId}` op `PortalDashboard` hier of bij T08?
   **Antwoord:** hier, samen met `userId` in `signed-in`. **Reden:** T08
   besluit 6 liet dit expliciet aan dit ticket over omdat het dezelfde hook en
   hetzelfde bestand raakt; één eigenaar voorkomt merge-conflicten.
9. **Vraag:** waar komen de e2e-tests? **Antwoord:** in
   `e2e/leesfouten-herstel.spec.ts` (gemockt, `mockPortal` bestaat al); de
   live-test voor het ongekoppelde seed-account in `e2e/portal-login.spec.ts`
   blijft ongewijzigd. **Reden:** de mock kan 500 en een netwerkfout
   afdwingen; de seed-test bewijst het echte `denied`.
10. **Vraag:** `useBeheerSession` aanpassen? **Antwoord:** nee, wel nagegaan
    (zie Validatie). **Reden:** zelfde keuze als T08 besluit 11: hij toont al
    een eigen juiste melding en heeft een guard; een retry-knop raakt de
    `/beheer`-modus en #78. Een eventuele opvolger is een eigen ticket.
11. **Vraag:** documentatie van `portal-login.md`? **Antwoord:** de Docs-rol
    werkt na de bouw de zin in Rolzichtbaarheid ("Een aparte laadfout-staat is
    niet gebouwd") en de Randgevallen-rij bij en markeert in T08 het
    PortalShellHome-deel als gebouwd. **Reden:** de bron van waarheid moet
    kloppen; dit is geen Architect- of Developerwerk.
12. **Vraag:** ADR nodig? **Antwoord:** nee. **Reden:** elke keuze past binnen
    bestaande patronen (`loadErrors`, `LeesFout`, volgordeguard, T08
    besluit 14) en `CLAUDE.md`; er is geen beslissing die een volgende
    feature zou tegenspreken. Een gate is niet nodig: de classificatie is een
    gedragsregel die de unit- en e2e-tests bewaken.

## Zoals gebouwd

Gebouwd in PR #164 (d9c86f8). Gedrag, teksten en beslistabel zijn zoals hierboven;
de punten waar de bouw afwijkt of iets toevoegt (de waarheid voor toekomstig werk):

- **`INITIAL_SESSION` zonder sessie wordt genegeerd** in `onAuthStateChange`
  (alleen `SIGNED_OUT` en andere events zonder sessie geven `signed-out`).
  `getSession()` beslist dan: `signed-out`, of bij een retryable fetch-fout `error`.
  Zo kan `INITIAL_SESSION` een netwerkfout bij de token-refresh niet als uitlog lezen.
- **`getSession()`-takken laten bij `signed-in` het dashboard staan.** Zowel de
  resolvede retryable fetch-fout als de `.catch` rapporteren dan via
  `reportClientError` en wijzigen niets; anders gaan ze naar `error` via
  `sessieOphaalFoutStaat(huidig, err)` (pure functie in `src/lib/portalSessie.ts`,
  naast `foutStaat` en `metRetryBezig`). Dit geldt ook voor een `refetch` vanuit
  `signed-in` (naamswijziging) waarbij `getSession()` faalt.
- **Retryable fetch-fout herkend met `isAuthRetryableFetchError`**, via de
  re-export `src/lib/supabase/authErrors.ts` (pure functie uit
  `@supabase/supabase-js`, geen client). De re-export bestaat omdat `check:arch`
  Supabase-packages buiten `src/lib/supabase/` verbiedt. Besluit 7 is daarmee
  betrouwbaar uitgevoerd; geen eigen heuristiek.
- **`signOut()`-fallback.** Geeft `auth.signOut()` een `{error}` terug (auth-js
  keert dan vóór `_removeSession()` terug: cookie blijft, geen `SIGNED_OUT`), dan
  wist `wisPortalSessieLokaal()` (`src/lib/supabase/portalClient.ts`) de eigen
  portalcookie en `refetch` (via `tick`) leest de sessie opnieuw: leeg geeft
  `signed-out` zonder netwerk. Dit vervangt "uitloggen werkt zoals nu" in de
  randgevallentabel voor het geval zonder netwerk.
- **Focus bij `error` naar `denied`**: `PortalLogin` kreeg een `meldingRef`
  (meldingsregel `tabIndex={-1}`, `role="alert"`); `PortalShellHome` roept
  `useFocusNaHerstel` tweemaal aan (naar `h1` bij `signed-in`, naar de melding
  bij `denied`). De spec noemde `useHerstelFocus`; `useFocusNaHerstel` gebruikt
  die intern. `PortalDashboard` kreeg daarvoor een `kopRef`-prop (de `h1` is
  `tabIndex={-1}`), meer dan de spec voorzag.
- **Cooldown van supabase-js (60 s).** Na een mislukte token-refresh geeft
  supabase-js dezelfde fout 60 s lang uit zijn cache terug
  (`REFRESH_FAILURE_COOLDOWN_MS`). "Opnieuw proberen" binnen die minuut blijft
  dus een foutscherm (focus blijft op de knop, geen lus); daarna herstelt de
  sessie zonder opnieuw inloggen. De e2e-test dekt dit; geen app-code voor nodig.
- **`isActueleRonde`** staat als pure functie en is unit-getest, maar de hook
  vergelijkt de ronde inline (`ronde !== request`); de functie wordt niet door de
  hook aangeroepen.
- **Eén lookup per sessiestart** is bereikt met `inflight` (userId) naast de
  `request`-teller; `commit()` houdt een `stateRef` bij voor de
  voorgrond/achtergrond-beslissing in async code.
- **Tests:** `test/portalSessie.test.ts` (beslistabel), `e2e/leesfouten-herstel.spec.ts`
  (500, netwerk, retry faalt, `denied`, achtergrondfout, verdwenen rij,
  getSession-netwerkfout met `page.clock`, uitloggen, identiteitswissel, één
  lookup) en `e2e/a11y.spec.ts` (foutstaat van `/portal`).
- **Niet los in e2e te forceren:** de `.catch`-tak van `getSession()` (een echt
  afgewezen promise). De e2e-test met een netwerkfout bij de token-refresh raakt
  de resolvede `error`-tak; de `.catch` heeft dezelfde uitkomst via
  `sessieOphaalFoutStaat`, dat in `test/portalSessie.test.ts` is gedekt, maar de
  tak zelf is niet end-to-end bewezen.
- **Niet handmatig getest:** vliegtuigmodus op een echte telefoon bij het openen
  van `/portal` met daarna online zetten en "Opnieuw proberen"; een tabblad op de
  achtergrond terwijl het netwerk wegvalt, daarna terugkeren. De Tester-lijst
  hierboven staat dus nog open; alleen gemockt (Playwright) bewezen.
- **Epic #128:** met deze PR zijn de `PortalShellHome`-delen van T08 gebouwd
  (zie `leesfouten-herstel-actuele-data.md`). Sluiten van #128 doet Bram.
- `useBeheerSession` is, zoals besloten, onaangeroerd.

## Open vragen

Geen over geld of beleid. De technische controle van besluit 7 is uitgevoerd:
`isAuthRetryableFetchError` herkent retryable fetch-fouten betrouwbaar in de
geïnstalleerde auth-js en is gebouwd (zie "Zoals gebouwd").

## Expliciet buiten scope

- `useBeheerSession` (retry-knop, status naast `denied`, `loading` bij
  achtergrond-event) en #78 (device-loginmelding).
- Alle overige T08-onderdelen (herstelknoppen elders, `VerversStatus`,
  terugkeer-refresh): al gebouwd (PR #159) of van #128.
- Een aparte "sessie verlopen"-melding (T08 besluit 12) en alles wat
  sessiebeleid raakt (T01/#122).
- Automatische herhaling of backoff van de lookup, offline gedrag,
  service-worker caching.
- RPC's, RLS, migraties, schema, PIN-beleid of auth-instellingen.
- Wijzigingen aan `PortalLogin` buiten het doorgeven van `deniedMessage`
  (ongewijzigd). *Zoals gebouwd:* bij de bouw is hier bewust één uitzondering
  op gemaakt: de optionele prop `meldingRef` en `tabIndex={-1}` op de
  `role="alert"`-regel, zodat de focus bij error → denied niet op `body` valt
  (zie "Zoals gebouwd").

## Bestanden (indicatie voor de Developer)

- `src/hooks/queries/usePortalSession.ts`: staat, guard, achtergrondregel,
  `getSession`-catch.
- `src/lib/portalSessie.ts` (nieuw, puur) en `test/portalSessie.test.ts`.
- `src/shells/portal/PortalShellHome.tsx`: foutbranch, `key`, focus.
- `src/features/portal-dashboard/PortalDashboard.tsx`: alleen de `h1` focusbaar
  (`tabIndex={-1}`) als dat nog niet zo is.
- `e2e/leesfouten-herstel.spec.ts`, `e2e/a11y.spec.ts`; commentaar in
  `usePortalSession.ts` bijwerken (de zin over `denied` bij elke fout).
