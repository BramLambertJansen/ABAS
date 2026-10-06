# Contrast, controls, taal en portalbreedte harmoniseren

**Status: goedgekeurd door Bram (architect-keuzes geaccepteerd).** Bram zei
op 2026-10-06: "Laat architect kiezen, ik accepteer voorstellen." Alle
besluiten hieronder zijn dus namens Bram door de Architect genomen en vallen
onder dat akkoord. Er zijn geen open vragen over geld, beleid, auth of
backend (zie "Open vragen").

Spec voor [issue #132](https://github.com/BramLambertJansen/ABAS/issues/132)
(frontend T12 · P1/P3, epic #121, findings F06 en F27; laatste ticket van de
epic). Gevalideerd tegen `main` op `17792ed` (2026-10-06, na T01 en T05 t/m
T11 en #115). Alleen frontend: geen RPC, migratie, schema, RLS of
auth-beleid. De client berekent nergens een bedrag.

## Doel

Dezelfde handeling ziet er overal hetzelfde uit en blijft leesbaar in elke
interactieve toestand (rust, hover, ingedrukt, focus). Eerst en
verplicht: witte tekst op een accentknop haalt 4,5:1 ook onder de muis. Daarna
een korte woordenlijst, één focusstijl, een bewuste fontkeuze, een begrensde
portalbreedte en een beperkte set controlmaten.

## Gelezen bronnen

- Issue #132 en epic #121 (`gh api`).
- Wireframes: `designs/Bar App.dc.html` en `designs/Lid App.dc.html`. De
  prototypes laden Manrope via Google Fonts (`Bar App.dc.html` regel 20) en
  tonen de portal als telefoonframe; ze schrijven geen desktopbreedte voor.
  Volgens CLAUDE.md bepaalt het in-app design system na de eerste bouw.
- Code: `tailwind.config.ts`, `test/accentContrast.test.ts`,
  `src/app/layout.tsx`, `src/app/globals.css`, `src/components/Overlay.tsx`,
  `src/features/*` (alle `hover:bg-accent`-knoppen), `src/lib/betaalmethode.ts`,
  `src/features/portal-dashboard/*`, `src/shells/portal/*`,
  `e2e/a11y.spec.ts`, `e2e/tablet-bruikbaarheid.spec.ts`.
- Kaders: CLAUDE.md, ADR's, en de gebouwde specs `tablet-bruikbaarheid.md`
  (#124), `dialogen-tabs-landmarks.md` (#125), `opslaan-sluiten-pending.md`
  (#126), `portaltransacties-consistent.md` (#129; draagt de reversalbadge
  expliciet door naar T12), `logboek-chronologisch-reikwijdte.md` (#130) en
  `beheerformulieren-catalogus.md` (#131).

## Validatie op actuele main

| Onderdeel van het issue | Stand op `17792ed` |
|---|---|
| **F06**: wit op `hover:bg-accent` (3,42:1) | **Bevestigd, onopgelost.** Elf bestanden hebben een `bg-accent-active … text-white … hover:bg-accent`-knop: `Mandje` (2x), `AfrekenenOverlay`, `OpwaarderenOverlay` (2x), `BezettingOverlay` (2x), `DienstAfsluitenOverlay`, `DienstTeLangOpenMelding`, en in `bar-sessie`: `SessieMeldingOverlay`, `UitloggenKnop`, `OvernemenOverlay`, `AdminMeldingen`, `AfmeldenOverlay`. Gemeten: wit op `#ee5a24` = 3,43:1; op `accent-hover` `#f1703f` nog slechter (2,95:1). Rust (`accent-active`, 4,83:1) is wel goed. |
| `accentContrast.test` controleert niet het gebruikte hoverpaar | **Bevestigd.** De test meet losse tokens; de kopregel van `tailwind.config.ts` beweert dat witte knoppen niet op `hover` zitten, maar ze zitten op `bg-accent` (DEFAULT). Die toelichting klopt dus niet meer en wordt bijgewerkt. |
| Axe vangt het geval af | **Gedeeltelijk.** `e2e/a11y.spec.ts` zet de muis bewust weg (`mouse.move(0, 0)`) en omzeilt zo het probleem; er is geen test die hover meet. Reduced motion staat al aan, dus de eindkleur is stabiel meetbaar. |
| Dark-text-varianten (`text-rail` op `accent`/`accent-hover`) | **Al correct** (5,18 en 6,03:1) en al bewaakt. Blijft zo. |
| **F27**: `cash` in bar/logboek tegenover "contant" | **Achterhaald.** `methodLabel` (`src/lib/betaalmethode.ts`) wordt gebruikt in logboek, dienstoverzicht en portal-transacties; op het scherm komt geen "cash" meer voor (alleen de databasewaarde en `p_method: "cash"` in `useTopUp`, wat zo hoort). Er is hooguit een regressietest nodig. |
| "Invite" tegenover Nederlandse labels | **Bevestigd, klein.** `LidBeherenOverlay` toont nog "Invite versturen" / "Invite opnieuw versturen" (r. 624-625); overal elders staat "uitnodiging" (`contactadresTeksten.ts`, "Uitnodiging verstuurd"). |
| Sluiten/Klaar/Annuleren-vormen | **Bevestigd.** "Annuleer" (portal-sheets: `SheetKnoppen`, `TweestapSheet`, `PincodeSheet`, `WachtwoordWijzigenSheet`) tegenover "Annuleren" (bar, beheer, `teksten.ts`). "Sluiten" en "Klaar" (`BezettingOverlay`) en "Terug" (weggooien-vraag, Mandje) zijn verschillende dingen en worden hieronder vastgelegd. |
| Veel losse hoogtes/radii | **Bevestigd.** `rounded-control` (80x) naast `rounded-2xl` (56x), `rounded-card`, `rounded-xl` en een tiental `rounded-[Npx]`-varianten; knophoogtes `h-9/10/11/12/[50|52|54px]`. |
| Zichtbare focus | **Inconsistent.** Er is geen globale `:focus-visible`-regel; 36 plekken zetten ad hoc `outline-*`/`ring-*`/`focus:border-accent`; sommige velden zetten `outline-none` met alleen een randkleur. Overal elders valt het op de browserstandaard terug. |
| Manrope wordt niet geladen | **Bevestigd.** `tailwind.config.ts` noemt Manrope eerst; `layout.tsx` laadt niets. Schermen vallen terug op de systeemfont (en op CI/screenshots op wat daar staat). |
| Portaldesktop strekt over de volle breedte | **Bevestigd.** `PortalDashboard` is `<main class="… w-full">`; header, tabbalk en tabinhoud lopen over elk scherm. Alleen de login (`max-w-sm`) is al begrensd. |
| Kleine belangrijke touchacties | **Deels.** Bar/tablet is door #124 grotendeels aangepakt (`h-11` is de bar-norm). Resterend zijn kleine acties in de portal (`Uitloggen` in de header `h-9`; "Alle transacties" `h-9`) en in de verkoopbalk (Mandje: `h-10`, wis/terug-knoppen). |

Niet van dit ticket (blijft zoals het is): handmatige checks en
afsluitpunten van epic #121/#128 (o.a. #143, #168), tenzij dit document ze
noemt. Dat doet het niet.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC:** niet geraakt. Er verandert alleen kleur,
  tekst en layout. Er komt geen bedrag in een nieuwe vorm op het scherm en de
  client berekent niets. "Contant" is een label voor de bestaande
  databasewaarde, geen nieuwe geldlogica.
- **Attributie alleen via bezetting:** niet geraakt.
- **Componenten zijn herbruikbaar totdat bewezen anders:** ja, dit is de
  kern van deel D. Er bestaat nog geen gedeelde knopstijl; die komt er als
  constanten, niet als 80 losse aanpassingen.
- Auth, modi, PIN, cookie-isolatie: niet geraakt.

## Betrokken shell

Beide, via gedeelde bronnen: `tailwind.config.ts`, `globals.css`,
`layout.tsx` (root, dus beide shells), gedeelde stijlconstanten in
`src/components/`. De desktopbreedte is alleen `shells/portal`. Geen nieuwe
`useShell()`-capability: de portalbreedte is een CSS-maximum, geen
gedragsverschil. Features blijven shell-onwetend (`check:arch`).

## Besluiten Architect (namens Bram, 2026-10-06)

### Deel A, F06: contrast (verplicht, eerst bouwen)

1. **Eén witte-tekst-knopvariant, hover wordt donkerder.** Nieuw token
   `accent.pressed` = `#b93d15` (wit 5,61:1). Witte knoppen: rust
   `bg-accent-active` (4,83:1), hover én ingedrukt `bg-accent-pressed`
   (5,61:1). De hover gaat dus naar donkerder, niet naar `accent`. De
   dark-text-variant (`bg-accent text-rail hover:bg-accent-hover`) blijft
   exact zoals hij is. Het token heet `pressed` omdat het ook voor
   `active:` geldt.
2. **Knopstijlen als constanten, niet als component.** Nieuw
   `src/components/knopStijlen.ts` (platte stringconstanten voor
   Tailwind, geen JSX) met o.a. `KNOP_ACCENT_WIT` (kleur-, hover-,
   active- en uitgeschakeld-klassen) en `KNOP_ACCENT_DONKER`, en
   `KNOP_RAND` (witte knop met rand, zoals `Sluiten` en de Annuleren-knoppen).
   Reden: de knoppen verschillen in maat en layout (`flex-1`, `h-[50px]` in
   dialogen, `h-[54px]` in het mandje); een gedeeld `<Knop>`-component zou 80
   aanroepplekken en veel layoutrisico tegelijk raken, en dat is geen
   S/M-ticket. Constanten delen alleen wat het ticket nodig heeft:
   kleur-/toestandsklassen. Maat, vorm en schaduw blijven bij de aanroeper (zie
   besluit 12). Tailwind scant `./src/**/*.{ts,tsx}`, dus klassen in een
   `.ts`-bestand worden gebouwd.
3. **Alle witte accentknoppen met `hover:bg-accent` uit de tabel hierboven worden omgezet**
   (ook de bar-sessie-knoppen die het issue niet bij naam noemt, want het
   patroon is identiek). `Assortiment.tsx` (`group-hover:bg-accent-active
   group-hover:text-white`, 4,83:1) en `OpwaarderenOverlay` chips (gekozen:
   `bg-accent-active text-white`, 4,83:1) zijn al goed en worden hooguit
   op de constante gezet.
4. **Uitgeschakeld blijft `disabled:bg-track disabled:text-muted`** (4,36:1).
   WCAG 1.4.3 sluit uitgeschakelde componenten uit; geen wijziging. Wel
   vastgelegd in de test (`track`/`muted` mag onder 4,5, anders niet).
5. **De test toetst de werkelijk gebruikte paren.** Zie Teststrategie,
   unit: een nieuwe test scant de broncode op klasse-literals die een
   achtergrond én tekstkleur noemen, en rekent rust-, hover- en
   active-paar door met de waarden uit `tailwind.config.ts`. Daarnaast een
   axe-test op stabiele hover.
6. **Toelichting in `tailwind.config.ts` bijwerken.** De bestaande
   tekst ("witte knoppen zitten op `active`, niet op `hover`") klopt niet
   voor de hoverstaat en moet de nieuwe regel vertellen: wit op
   `active`/`pressed`, donker op `DEFAULT`/`hover`. Het oude `#d94d1a`-testje
   blijft (negatieve bewaking).
7. **Aanpalende paren die de test meteen meeneemt** (niet apart gebouwd):
   `text-accent-active` op wit (4,83), op `canvas` (4,52, loopt dun maar
   haalt AA) en `text-danger` op `accent-soft` (4,73). Faalt er een,
   dan kiest de Developer de donkerder tekstkleur; dat is geen nieuwe
   ontwerpbeslissing.

### Deel B, F27: taal

8. **Woordenlijst (vast).** Vastgelegd als commentaarblok bovenin
   `src/components/knopStijlen.ts` (daar kijkt de volgende bouwer) en in
   `src/components/README.md`:
   - **Sluiten**: een weergave of dialoog sluiten, zonder iets af te
     breken of te bevestigen (de Sluiten-knop van `Overlay`).
   - **Annuleren**: een lopende handeling of invoer afbreken (uitgesproken
     werkwoord; niet "Annuleer").
   - **Klaar**: alleen een bewerkscherm waarvan de wijzigingen al live zijn
     opgeslagen af te ronden (nu alleen `BezettingOverlay`).
   - **Terug**: alleen navigeren, of de "weggooien?"-vraag verlaten
     (`WEGGOOIEN_TERUG_KNOP`, mandje).
   - **Contant**: betaalmethode in de UI; "cash" komt nooit op het scherm.
   - **Uitnodiging**: nooit "Invite" in UI-tekst.
9. **Wijzigingen.** "Annuleer" wordt "Annuleren" op vier portalplekken
   (`SheetKnoppen`, `TweestapSheet` x2, `PincodeSheet`,
   `WachtwoordWijzigenSheet`). "Invite versturen" / "Invite opnieuw
   versturen" wordt "Uitnodiging versturen" / "Uitnodiging opnieuw
   versturen". "Klaar" en "Terug" blijven. De bestaande e2e-selectors op
   "Invite versturen", "Invite opnieuw versturen" en "Annuleer"
   (`ledenbeheer-invite`, `beheerformulieren-catalogus`,
   `opslaan-sluiten-pending-aanvulling`) worden bijgewerkt. Playwright-namen
   zonder `exact` matchen als substring, "Annuleer" zou "Annuleren" nog
   vangen, maar de selectors worden toch gelijkgetrokken voor leesbaarheid.
   Interne identifiers (`inviteMember.ts`, route `/beheer/invite`,
   `useSendMemberInvite`) blijven; alleen UI-tekst verandert.
10. **"cash" is al opgelost (T09/T10).** Wel een regressietest: de
    weergavefuncties van logboek, dienstoverzicht en portal geven bij
    `method: "cash"` nooit "cash" terug. De grepcheck is er geen
    gate-waardige regel genoeg voor (één bron, `methodLabel`).

### Deel C: focus, font, portalbreedte

11. **Eén zichtbare focusstijl, globaal.** In `globals.css` (`@layer base`)
    één `:focus-visible`-regel: 2px outline in `accent`, `outline-offset`
    2px. `accent` op wit is 3,43:1 en op `rail` 5,18:1, voldoende voor
    een UI-component (WCAG 1.4.11, 3:1). Reeds bestaande eigen
    `focus-visible:outline…`-klassen blijven werken (gelijkwaardig) en
    worden niet bulk verwijderd; plekken met `outline-none` zonder eigen
    focusvervanging (zoekvelden met `focus:border-accent` en `ring`) houden
    hun vervanging. De Developer controleert alleen dat geen interactief
    element zonder zichtbare focus overblijft (toetsenbordronde in het
    testplan). Geen `:focus` (alleen `:focus-visible`), zodat muisklikken
    geen ring tonen.
12. **Beperkte controlmaten, gedeeld via constanten, alleen voor wat dit
    ticket raakt.** Vastgelegd: knop/invoer standaard `h-11` (44px,
    comfortdoel, geen WCAG-eis) en `rounded-control` (12px); grote
    primaire dialoogknop `h-[50px]` met `rounded-2xl` is de enige tweede
    maat (bestaat al in dialogen; nu constant `KNOP_DIALOOG_MAAT`
    optioneel). De ~dozijn losse `rounded-[Npx]` en `h-[52/54px]`-waarden
    worden **niet** in één klap vervangen: dat is visuele herbouw van
    schermen die door T04/T06/T11 net zijn afgestemd. Regel voor nieuw
    werk: kies uit de twee maten. De bestaande afwijkingen zijn
    deferred (zie "Buiten scope").
13. **Kleine belangrijke touchacties naar 44px.** Uitsluitend deze, omdat
    het kleine, veelgebruikte acties op een telefoon/tablet zijn:
    portal-header `Uitloggen` (`h-9` -> `h-11`), "Alle transacties" in
    `SaldoTab` (`h-9` -> `h-11`), de mandje-acties `h-10` (wissen/leden-
    knoppen, r. 182) -> `h-11`. Controleer dat de header op 320px niet
    overloopt (naam + knop; de naam is al `truncate`). Verder alleen
    "waar nodig": 24px-minimum (WCAG 2.5.8) is gehaald; 44px is een
    comfortdoel. Geen verplichte audit van elke kleine knop.
14. **Font: Manrope bewust laden, zelf gehost.** `next/font/local` met een
    meegeleverd variabel woff2-bestand (Manrope, SIL OFL, gewichten
    400 t/m 800, subset latin), in `src/app/fonts/` (of `public/`; `next/font`
    bundelt het bij de build en host het zelf). `display: swap`,
    `variable: "--font-manrope"`, en in `tailwind.config.ts` wordt
    `fontFamily.sans` `["var(--font-manrope)", "-apple-system",
    "BlinkMacSystemFont", "sans-serif"]`. Gekozen boven `next/font/google`:
    zelf hosten betekent geen verzoek van het apparaat van een lid naar
    Google (AVG-voorzichtig) en geen netwerktoegang tijdens `build` in
    CI. Gekozen boven "systeemfont expliciet": het design (prototype en
    tokens) is op Manrope gebouwd. `layout.tsx` zet de fontklasse op
    `<html>`; beide shells erven dat. **Terugvaloptie:** zegt de
    layouttest (tablet 768/1024, portal 320) dat de bredere Manrope-metriek
    nieuwe overflow of afgekapte tekst veroorzaakt die niet binnen deze PR
    op te lossen is, dan wordt in dezelfde PR in plaats daarvan de
    systeemfontstack expliciet gekozen (Manrope uit `tailwind.config.ts`
    halen) en de reden hier genoteerd. Beide opties lossen "bewust
    gekozen" op; de screenshots/layouttests gebruiken in beide gevallen
    dezelfde keuze, omdat het font dan in de app zelf zit en niet meer van
    de machine afhangt.
15. **Portal: begrensde inhoudsbreedte.** Op desktop worden alle portal-
    schermen (dashboard-header, tabbalk en tabinhoud; account-,
    wachtwoord-herstellen- en foutschermen) in een gecentreerde kolom
    gezet, `max-w-[560px]` (`mx-auto`, `w-full`), met op `sm` en breder een
    lichte `border-x` zodat de kolom herkenbaar blijft. Kleiner dan
    560px verandert er niets (telefoon blijft randloos volledig scherm).
    Dit is een eigenschap van de portal-root (`PortalDashboard` en de
    afzonderlijke losse schermen), niet van `Overlay`: de portal-sheet
    moet óók binnen die kolom blijven (of dezelfde `max-w` krijgen) zodat een
    sheet op desktop niet breder is dan de pagina. `PortalLogin` is al
    `max-w-sm` en blijft. Alle geladen en foutstaten van het dashboard
    (`PortalShellHome`) volgen hetzelfde maximum. De reversalinformatie
    (status, "Door:", "Reden:") blijft op alle breedten volledig zichtbaar
    (#129, besluit 6); T12 mag die rij niet afkappen.
16. **320px blijft de ondergrens.** Geen horizontale overflow op 320px (de
    tests uit #129 bestaan al voor het dashboard en worden uitgebreid met
    de hoger geworden header/knoppen en het nieuwe font).

### Afbakening

17. **Volgorde van bouwen en eventuele splitsing.** Deel A en B zijn klein,
    risicoarm en direct uitvoerbaar. Deel C/D raakt veel bestanden. De
    Developer bouwt in deze volgorde en committeert per deel; mag het
    ticket in twee PR's splitsen (A+B eerst, C+D daarna) als dat de
    review verlicht, omdat het issue zelf zegt "begin met het kleine
    contrastdeel; overige uniformering kan later". Eén PR mag ook. De
    acceptatiecriteria van het issue gelden pas als beide delen klaar zijn;
    het epic sluit pas met de tweede.
18. **Geen nieuwe gate, geen ADR.** Dit is presentatie binnen bestaande
    beslissingen. Gate-signaal: de contrastpaar-test (besluit 5) is zelf de
    gate (hij draait in `npm run test`, dus ook in `check:fast`), en daarmee
    hoeft er geen zin in CLAUDE.md. Een lint-regel tegen "Invite"/"cash"
    in UI-tekst is niet de moeite waard (één plek, twee woorden).

## Bouwnotities (Developer)

- **Font:** Manrope zelf gehost is gebouwd, de terugvaloptie (systeemstack)
  is niet nodig geweest. Bestand: latin-subset uit het npm-pakket
  `@fontsource-variable/manrope@5.3.0` (SIL OFL 1.1; tarball-integriteit tegen
  het register gecontroleerd; zie `src/app/fonts/README.md`, licentie in
  `src/app/fonts/OFL.txt`). Layouttests op 768/1024/1280 (tablet) en 320/390
  (portal) zijn groen met het geladen font.
- **Controlmaten:** `KNOP_DIALOOG_MAAT` bestaat als constante maar de
  bestaande dialoogknoppen zijn bewust niet omgezet (besluit 12).

## Datamodel, RPC's, ADR

Geen datamodelwijziging, geen nieuwe of gewijzigde RPC, geen migratie, geen
RLS-wijziging, geen backendtest nodig. `check:rls`, `db:test`,
`rpc_catalogus` en `test:integration` blijven onaangeroerd. Geen ADR.

## Rolzichtbaarheid

Ongewijzigd. Alleen uiterlijk en labels van bestaande schermen.

## Teksten

| Plek | Was | Wordt |
|---|---|---|
| Portal-sheets (`SheetKnoppen`, `TweestapSheet`, `PincodeSheet`, `WachtwoordWijzigenSheet`) | Annuleer | Annuleren |
| `LidBeherenOverlay` | Invite versturen | Uitnodiging versturen |
| `LidBeherenOverlay` | Invite opnieuw versturen | Uitnodiging opnieuw versturen |
| Overig | Sluiten, Klaar, Terug, contant, Annuleren | Ongewijzigd |

## Randgevallen

| Geval | Gedrag |
|---|---|
| Hover, muis ingedrukt en toetsenbordfocus op een witte accentknop | Altijd minstens 4,5:1 tekst; focusring zichtbaar buiten de knop (offset 2px). |
| Uitgeschakelde witte accentknop | `disabled:bg-track disabled:text-muted`, en `hover:`-kleur mag niet doorlekken (de constante zet `disabled:hover`-neutrale klassen of gebruikt `enabled:hover:`). |
| Knop met `aria-disabled` i.p.v. `disabled` (portal, sheets) | Hoverstijl blijft de gewone; het is geen "disabled" in WCAG-zin, dus 4,5:1 blijft gelden. |
| Portal op 1280px | Kolom van 560px gecentreerd, canvaskleur ernaast, geen losse kaarten die de kolom uitsteken. |
| Portal op 320px | Geen horizontale scroll; header met naam + Uitloggen op `h-11` past, naam wordt afgekapt (`truncate`), de knop niet. |
| Lange naam in de portalheader | Naam wordt afgekapt, Uitloggen blijft bereikbaar. |
| Teruggedraaide bestelling op 320px | Status, "Door:" en "Reden:" volledig zichtbaar (blijft bestaand gedrag uit #129). |
| Font laadt nog niet of niet | `display: swap`; de systeemfont is een leesbare terugval, geen onzichtbare tekst. Er is geen laadstatus. |
| Bredere Manrope-metriek in de bar op 768/1024 | Layouttests uit #124 moeten groen blijven; zo niet, zie besluit 14 (terugvaloptie). |
| Gebruiker met "reduce motion" | Onveranderd; `transition-colors` staat dan uit, waardoor axe de eindkleur meet. |
| Nieuwe witte knop zonder constante | Faalt op de contrastpaar-test zodra hij een `hover:`-kleur met onvoldoende contrast heeft (de test scant alle bronliteralen). |

## Afstemming met andere tickets

- **T04 (#124), T05, T06, T11:** allemaal gebouwd. T12 verandert geen
  gedrag, alleen klassen, labels en een globale stijl. Risicovlak:
  `Overlay.tsx` (alleen de Sluiten-knopklassen naar `KNOP_RAND`),
  `Mandje.tsx` en `LidBeherenOverlay.tsx` (labels). Geen grote refactor van
  `Overlay` of `DienstTabs` (epic-regel).
- **T09 (#129):** de reversalbadge en doorgestreepte rij gebruiken
  `text-muted`; de contrasttest toetst dat paar op wit en canvas
  (4,79 en hoger). De rij op 320px blijft zoals gebouwd.
- **#143, #168 en andere open handmatige checks van #121/#128:** niet van
  dit ticket.

## Teststrategie

- **Unit (`npm run test`, `test/accentContrast.test.ts` uitbreiden):**
  1. Het nieuwe token `accent.pressed` haalt >= 4,5:1 met wit; `accent-active`
     ook (bestaand).
  2. Nieuw, gebruikte paren: een test leest alle `src/**/*.{ts,tsx}`,
     vindt klasse-literals met zowel `bg-<token>` als `text-<token|white>`,
     en rekent voor rust, `hover:`, `active:` en `focus:`-varianten het
     contrast door met de kleuren uit `tailwind.config.ts`. Alles onder
     4,5:1 faalt behalve `disabled:`-klassen (WCAG-uitzondering,
     expliciet in de test genoteerd). De test noemt bestand en klasse in
     de foutmelding. Een nep-literal in de test zelf (de oude
     `bg-accent-active text-white hover:bg-accent`) bewijst dat het
     mechanisme het huidige geval had gevangen.
  3. `knopStijlen.ts`-constanten: `KNOP_ACCENT_WIT` bevat geen
     `hover:bg-accent`/`hover:bg-accent-hover`; `KNOP_ACCENT_DONKER` geen
     `text-white`.
  4. `methodLabel("cash") === "contant"` en de zichtbare tekstfuncties van
     logboek, dienstoverzicht en portal tonen nergens "cash" (regressie, F27).
  5. Geen UI-tekst "Invite" en geen "Annuleer" meer in `src/**/*.tsx`
     (een eenvoudige grep-achtige test op string-literals; interne
     identifiers en routes zijn uitgezonderd).
- **Gemockte e2e (`e2e/a11y.spec.ts`, Playwright, Supabase via
  `page.route()`):**
  - Axe (`wcag2a`, `wcag2aa`) met de muis **op** de witte knop
    (`locator.hover()`) voor: Afrekenen (afrekenknop in het mandje en
    in `AfrekenenOverlay`), Opwaarderen, Bezetting ("Klaar" en
    bevestigen), Dienst afsluiten, `DienstTeLangOpenMelding`. Geen
    `mouse.move(0, 0)` bij deze scans; de bestaande ontsnapping daar blijft
    voor de overige tests.
  - Ingedrukt: `mouse.down()` op dezelfde knoppen, axe, `mouse.up()` buiten
    de knop.
  - Focus: Tab naar de knop, axe, en een controle dat de computed
    `outline-style` niet `none` is (de focusring bestaat) voor een knop,
    een link en een invoerveld.
  - Een negatieve controle die laat zien dat de test het oude geval zou
    vangen is niet via e2e nodig (die staat in de unit-test, punt 2).
  - **Portal, `e2e/portaltransacties-consistent.spec.ts` of nieuw
    `e2e/contrast-controls-portal.spec.ts`:** viewport 1280x800: de
    inhoudskolom heeft `getBoundingClientRect().width <= 560`, is
    gecentreerd, en de header, tabbalk en tabinhoud steken er niet uit;
    320x800 en 390x800: `scrollWidth <= clientWidth`, Uitloggen en
    "Alle transacties" zijn ten minste 44px hoog en volledig in beeld,
    en de reversalregel ("Teruggedraaid", "Door:", "Reden:") is volledig
    zichtbaar.
  - **Tablet (`e2e/tablet-bruikbaarheid.spec.ts`):** blijft groen op 768,
    1024 en 1280 met het geladen Manrope (of de gekozen systeemfont); de
    spec wordt niet versoepeld.
  - Labels: "Uitnodiging versturen"/"Uitnodiging opnieuw versturen" en
    "Annuleren" in de bestaande specs (selectors bijgewerkt).
- **Handmatig of Tester:**
  - Stabiele hover/focus/ingedrukt-screenshots van de witte knoppen en
    een oogcontrole naast het oude gedrag.
  - Toetsenbordronde door één bar-scherm, één dialoog en het portaldashboard:
    elk bedienbaar element toont een focusring.
  - Portal op echt of geëmuleerd 1280px en 320px; tablet 768 en 1024.
  - **Echt iOS-toestel:** de hypothese "kleine invoerfont veroorzaakt
    zoom bij focus" wordt hier niet als bewezen behandeld en niet
    gerepareerd. Invoervelden hebben `text-sm` (14px) of kleiner; een
    echte test op Safari/iOS bepaalt of een follow-up (16px op
    portalvelden) nodig is. Zie "Buiten scope".
  - Echte backend en geldboekingen zijn met dit fixture niet bewezen en
    worden hier niet geraakt.
- **Reviewwerk:** de client berekent nergens een bedrag (geen gate);
  eventuele stijl-/tekstwijziging die een bedrag of status anders toont is
  een reviewfout.

## Expliciet buiten scope

- Alle losse `rounded-[Npx]`/`h-[5Npx]`-varianten in één klap vervangen of
  een volledig `<Knop>`-component: later, per scherm wanneer dat scherm
  toch wordt aangeraakt (besluit 12).
- Het 44px-doel voor elke kleine knop; alleen de drie genoemde plekken
  (besluit 13).
- Een iOS-inputzoomfix: eerst bewijs op een echt toestel.
- Een nieuw donker thema, nieuwe accentkleur, of herontwerp van het
  tokenstelsel.
- Een desktop-herontwerp van de portal (zijbalk, meerdere kolommen);
  alleen een begrensde kolom.
- Wijzigingen aan `Overlay`-gedrag, `DienstTabs`, focusbeheer of
  opslaan-/sluitgedrag (T05/T06).
- RPC's, migraties, RLS, auth, bedragen, `served_by`.
- `cash` in de database of in `useTopUp` (`p_method` blijft "cash").
- De nog openstaande handmatige checks en tickets uit epic #121/#128
  (#143, #168).

## Open vragen

Geen. Er ontbreekt geen beslissing over geld, beleid, auth/PII of backend.
Eén bewust ingebouwde terugvaloptie (fontkeuze, besluit 14) is een
Developer-beslissing op basis van de layouttests, geen open vraag aan Bram.

## Bestanden (indicatie, geen code)

Nieuw:
- `src/components/knopStijlen.ts` (knopconstanten en woordenlijstcommentaar)
- `src/app/fonts/Manrope-Variable.woff2` (SIL OFL; licentietekst erbij)
- `e2e/contrast-controls-portal.spec.ts` (portalbreedte, touchmaat, 320px;
  of toevoegen aan `portaltransacties-consistent.spec.ts`)

Wijzigen:
- `tailwind.config.ts` (token `accent.pressed`, toelichting, `fontFamily`)
- `src/app/globals.css` (`:focus-visible`)
- `src/app/layout.tsx` (`next/font/local`, klasse op `<html>`)
- Witte accentknoppen: `Mandje.tsx`, `AfrekenenOverlay.tsx`,
  `OpwaarderenOverlay.tsx`, `BezettingOverlay.tsx`,
  `DienstAfsluitenOverlay.tsx`, `DienstTeLangOpenMelding.tsx`,
  `bar-sessie/{SessieMeldingOverlay,UitloggenKnop,OvernemenOverlay,AdminMeldingen,AfmeldenOverlay}.tsx`
- `src/components/Overlay.tsx` (alleen de Sluiten-knopklassen)
- Labels: `portal-profiel/{SheetKnoppen,TweestapSheet,PincodeSheet,WachtwoordWijzigenSheet}.tsx`,
  `ledenbeheer/LidBeherenOverlay.tsx`
- Portal: `portal-dashboard/PortalDashboard.tsx`, `SaldoTab.tsx`,
  `shells/portal/PortalShellHome.tsx`, `portal/wachtwoord-herstellen`-scherm
  (`PortalWachtwoordHerstellen.tsx`), en de portal-sheet-breedte in `Overlay.tsx`
- Tests: `test/accentContrast.test.ts`, `test/betaalmethode.test.ts`,
  `e2e/a11y.spec.ts`, `e2e/ledenbeheer-invite.spec.ts`,
  `e2e/beheerformulieren-catalogus.spec.ts`,
  `e2e/opslaan-sluiten-pending-aanvulling.spec.ts`,
  `e2e/tablet-bruikbaarheid.spec.ts` (alleen als het font dat vraagt)
- `src/components/README.md` (woordenlijst, knopconstanten)

Niet aanraken: `supabase/`, `src/lib/supabase/`, hooks in
`src/hooks/queries/`, `scripts/check-*.mjs`.

## Wat de Developer niet hoeft te doen

Geen nieuwe gate, geen ADR, geen backendtest, geen `check:arch`-wijziging
(`knopStijlen.ts` staat in `src/components/`, shell-onwetend). Raakt de bouw
tóch een bedrag, status of auth-gedrag, stop dan en meld het aan de
Architect.
