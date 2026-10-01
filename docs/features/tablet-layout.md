# Tablet-indeling: bar en beheer bruikbaar op ondersteunde maten

Spec voor [issue #124](https://github.com/BramLambertJansen/ABAS/issues/124)
(Frontend T04 · P1, epic #121, finding F04, besluit D1).

**Status: concept, wacht op akkoord van Bram.** De Developer begint niet
voordat Bram de open vragen onderaan heeft beantwoord en de spec heeft
goedgekeurd.

Bronnen: het issue, de bestaande code op `main` (`9f8e05b`:
`DienstTabs.tsx`, `Mandje.tsx`, `DienstActief.tsx`, `Assortiment.tsx`,
`BeheerTabs.tsx`, `Transactielijst.tsx`, `src/shells/bar/capabilities.ts`),
de kaders (`CLAUDE.md` → Shells, `docs/ARCHITECTURE.md` → Shells,
ADR 0016) en `designs/Bar App.dc.html`. De wireframe legt geen
doeltoestelmaat vast; hij gebruikt alleen dezelfde vaste maten als de code
nu heeft (rail 92px, zijpaneel 372px, regels 39/227/803/2894). De
wireframe bepaalt dus de vormtaal, niet de maten die hier veranderen
(CLAUDE.md → Designbestanden: afwijking is normale evolutie).

## Doel

De medewerker herkent producten en financiële regels en bereikt alle
primaire acties op de ondersteunde tabletmaten van de bar en het
beheerscherm. Nu gaat dat mis doordat de indeling uit vaste maten bestaat:
rail 92px (`DienstTabs.tsx`), zijpaneel 372px (`Mandje.tsx`,
`DienstActief.tsx`) en `barCapabilities.columns = 4` (via `useShell()` in
`Assortiment.tsx`). De indeling kijkt niet naar de ruimte die er werkelijk is.

Gemeten op de huidige code (rekensom, geen browsermeting):

| Viewport | Rail + paneel | Inhoud (na `px-[26px]`) | Kaartbreedte bij 4 kolommen | Ruimte voor naam |
|---|---|---|---|---|
| 1024 | 464px | 508px | ~118px | ~40px, naast "+"-knop van 44px |
| 1280 | 464px | 764px | ~182px | ~108px, ~70px met aantallenbadge |
| 768 | 464px | ~252px | n.v.t. | n.v.t. |

`truncate` op de naam doet de rest. Daarom wordt "Rode wijn" afgekapt op
1024 en ligt de `QtyPill` ("3×") naast de naam in plaats van er ruimte voor
te laten. Op 1280 met een lange naam verliest een gebruiker context.

## Besluit D1 (Bram): alleen landschap

**Tabletportret is uitgesloten.** De ondersteunde matrix:

| Maat | Status |
|---|---|
| 1024×768 (tablet landschap) | ondersteund, dit is de krapste maat |
| 1280×800 (tablet landschap) | ondersteund |
| Desktop (breder dan 1280) | ondersteund |
| 768×1024 (tabletportret) | niet ondersteund |
| Telefoon | niet ondersteund (ongewijzigd, CLAUDE.md → Shells) |

**Minimale-toestelafspraak (voorstel):** `shells/bar` en `/beheer` eisen een
effectieve breedte van **minimaal 1024 CSS-pixels**. "Effectief" betekent na
browser-zoom: 1280 breed op 125% zoom is 1024 effectief en dus ondersteund,
1024 op 125% is 819 effectief en valt eronder.

Wat er onder die breedte gebeurt, is **niet af te leiden uit de bestaande
docs** en staat daarom als open vraag 1 hieronder. Wat de docs wel
vastleggen: "tablet/desktop, nooit telefoon" is een **supportuitspraak, geen
grens die de app afdwingt** (CLAUDE.md → Shells, ARCHITECTURE.md → Shells),
en sinds ADR 0016 kan elke bardienst op elk apparaat inloggen. Elke keuze
voor een melding of blokkade is dus nieuw gedrag en niet aan de Developer.

Beperking die voor elke variant geldt: `check:policy` verbiedt
device-sniffing (`matchMedia`, `userAgent`). Een eventuele melding wordt
daarom met CSS of container-regels getoond en verborgen, niet met JS die op
het toestel reageert.

## Betrokken shell

`shells/bar` (verkoop, dienst) en `/beheer` (`BeheerTabs`, ook binnen
`shells/bar`, CLAUDE.md → Domein). `shells/portal` blijft buiten beeld: de
portal is telefoon-first en ongewijzigd.

Alle gewijzigde componenten staan al in `src/features/` en blijven
shell-onwetend. Ze lossen hun indeling op uit de breedte van hun eigen
container, niet uit een shell-constante of viewport. Dat is het
bestaande verbod op device-sniffing doorgetrokken tot een ontwerpregel:
**een feature-component beslist zijn kolommen op de ruimte die hij heeft.**

Welke componenten raakt dit (hergebruik gaat voor nieuw, CLAUDE.md →
Componenten): er komt **geen nieuw component**. Wel mogen de dubbele
zijpaneel-maten (`Mandje` en `DienstActief` hebben beide `w-[372px]`) naar
één gedeelde maat of gedeelde klasse, zodat ze niet uit elkaar lopen. Dat
is aan de Developer; duplicatie zou een reviewfout zijn.

## Datamodel, RPC's, geld, attributie

**Geen wijzigingen, bevestigd.** Geen migratie, geen nieuwe of gewijzigde
RPC, geen RLS-policy, geen wijziging in `place_order`, `top_up`,
`reverse_order_*` of `my_bar_state`. Daarmee blijven beide kernbeslissingen
onaangeroerd: geld beweegt alleen via RPC (de client stuurt nog steeds
alleen ids, aantallen en opwaardeerbedrag; het getoonde totaal blijft een
weergave) en `served_by` komt uit de bezetting. Deze spec verandert alleen
CSS-klassen, markup-structuur en welke weergave een lange tekst krijgt. Een
Developer die tijdens de bouw toch een RPC of schema nodig denkt te hebben,
stopt en meldt dat aan de Architect.

Er is ook geen nieuwe auth- of cookieregel, geen PWA- of
offline-uitbreiding (CLAUDE.md → Shells).

## Rolzichtbaarheid

Ongewijzigd. Deze spec verandert niet wie wat ziet. Alleen de presentatie
verandert voor bardienst en beheerder. Een lid gebruikt de portal en wordt
niet geraakt.

## Gedrag per onderdeel

De getallen hieronder zijn **doelen en meetpunten**, geen voorgeschreven
pixelwaarden. De exacte maten kiest de Developer en onderbouwt hij met de
metingen op de matrix.

### 1. Productgrid (`Assortiment.tsx`)

- Het aantal kolommen volgt uit de **breedte van het gridgebied**, met een
  minimale kaartbreedte waarbij "Rode wijn" en "Spa rood" volledig naast prijs
  en "+"-knop passen, op 1024×768 met een voor het ontwerp gebruikelijke
  tekstgrootte. `shell.columns` bepaalt het productgrid niet langer.
  `StaffPicker` leest `columns` nog wel, daar verandert niets; het contract
  `ShellCapabilities.columns` blijft bestaan.
- Een gewone naam wordt **nooit afgekort met "…"**. Gewone naam is hier: de
  producten uit de bestaande fixture en seed, plus de voorbeelden uit de
  audit (Rode wijn, Spa rood, Pils). Er bestaat **geen maximale lengte** voor
  een productnaam in het schema (geen `check` op `products.name`), dus een
  lange naam is een geldig geval en wordt hieronder apart behandeld.
- Naam, prijs en aantal staan **naast elkaar zonder overlap**. De aantallen-
  badge (`QtyPill`) krijgt eigen ruimte in de kaart: ze bedekt nooit naam of
  prijs, ook niet bij "10×" of "99×". Dat betekent een kaartindeling waarin de
  badge plek claimt en de naam de rest krijgt (niet andersom afkappen).
- **Lange namen:** de naam breekt af over maximaal twee regels in plaats van
  één afgekapte regel. Past hij dan nog niet, dan is de volledige tekst
  **zonder hover** bereikbaar. Voorstel: de volledige naam staat bovenaan het
  mandje-regeltje van dat product (dat wordt ook zonder afkapping getoond,
  zie 3) en in de bevestiging bij afrekenen. De Developer mag een
  tik-gevoelige variant kiezen, maar `title=` alleen volstaat niet, omdat
  touch geen hover heeft. De bestaande `aria-label` met naam, prijs en
  aantal blijft zoals hij is.
- De lijstweergave (`view === "list"`) volgt dezelfde regels: naam krijgt de
  rest, badge en prijs behouden hun ruimte.
- Zoekveld (`min-w-[260px]`), weergave-schakelaar en categorie-chips (`flex-wrap`)
  moeten op 1024 naast elkaar of netjes gewrapt passen zonder overlap en zonder
  de grid onder de vouw te duwen.

### 2. Rail (`DienstTabs.tsx`)

- De rail blijft een **verticale** `tablist` met dezelfde rollen, id's en
  `aria-orientation="vertical"`. Alleen de maat en inhoud mogen veranderen.
  Reden: T05 (#125) bouwt op precies dit contract (toetsenbordbediening,
  één tabstop, main-landmark).
- Doel: rail mag smaller als dat op 1024 ruimte oplevert, mits label
  "Verkoop"/"Dienst" en de knop "Uitloggen" leesbaar blijven en elk
  tikdoel minimaal 44px blijft (ARCHITECTURE.md: 44-52px tap targets).
- "Ingelogd als {naam}" breekt af of wordt afgebroken zonder dat "Uitloggen"
  uit beeld raakt, ook bij een lange naam.
- Het meldingsvenster `AdminMeldingen` (`fixed right-4 top-4 w-[360px]`) en
  `DienstTeLangOpenMelding` mogen op 1024 geen primaire actie bedekken die
  daarna onbereikbaar is (de melding is sluitbaar of verschuift het scherm).
  Controle in de matrix, geen aparte ontwerpopdracht.
- De rail- en paneelhoogte volgt de zichtbare viewport. Nu staat er
  `h-screen`; op een tablet met browserbalk is `100vh` hoger dan wat zichtbaar
  is, waardoor de onderste knoppen achter de browserbalk kunnen vallen. De
  Developer onderzoekt een dynamische hoogte-eenheid en controleert dat op
  een fysiek tablet.

### 3. Mandje (`Mandje.tsx`)

- Het paneel behoudt een vaste, maar kleinere ondergrens-breedte op 1024 en
  mag op bredere containers groeien tot de huidige 372px. Welke ondergrens
  past, volgt uit de meting: de regel heeft naam, stappers (−, aantal, +,
  elk 44px), regeltotaal en een verwijderknop naast elkaar, en dat is nu al
  krap.
- Mandje-regels laten de naam **afbreken over twee regels** in plaats van
  `truncate`, zodat de volledige naam zonder hover leesbaar is. Stappers en
  regeltotaal houden hun breedte en worden nooit afgekapt.
- **Totaal, "Saldo na afrekenen", saldobanner en "Tik afrekenen"** blijven in
  beeld terwijl de regels scrollen. Dat vraagt dat alleen de regellijst
  scrolt en de onderste blok vast onderaan het paneel staat, ook met een
  volle bestelling op 1024×768. Nu is de regellijst `flex-1 overflow-auto`,
  maar het hele paneel ook `overflow-auto`; de eis is dat "Tik afrekenen" niet
  kan wegscrollen.
- Ledenkeuze: de resultatenlijst (`absolute`, `max-h-[300px]`) blijft
  bruikbaar op 768 hoogte. Lange ledennamen worden niet zonder volledige
  weergave afgekapt in de gekozen-lid-kop (nu `truncate`).
- Het saldo en "laag saldo" naast de lidnaam krijgen voorrang: de naam
  breekt, het bedrag niet.

### 4. Dienst-tab (`DienstActief.tsx`, `Transactielijst.tsx`)

- Hetzelfde zijpaneel-doel als in 3. De bezettingsregels (nu `truncate`)
  breken af in plaats van afkappen.
- **Dienstbedragen blijven altijd volledig zichtbaar**: omzet deze dienst
  (`31px`), de statistieken (OPGEWAARDEERD, GESTART, BEZETTING) en het bedrag
  per regel in `Transactielijst` (nu `min-w-[84px] flex-none`, dat blijft het
  uitgangspunt). Namen mogen krimpen of breken, bedragen niet.
- **"Dienstregels verliezen context":** in `Transactielijst` staat wie de
  bestelling plaatste (`servedByName`) nu alleen in `title=` op de avatar,
  dus onbereikbaar op touch. De spec vraagt dat bij meerdere
  crewleden die context zonder hover zichtbaar of op touch
  bereikbaar is (bijvoorbeeld de naam in de detailregel, nu al `sr-only`
  aanwezig als ", door {naam}"). De Developer kiest de vorm; gedrag blijft
  `showServedBy = members.length > 1`.
- "Dienst afsluiten" blijft bereikbaar bij drie crewleden en een lange
  transactielijst op 1024×768, zoals "Tik afrekenen" bij het mandje.
- Toast (`fixed bottom-6`) en overlays veranderen niet.
- Raakt het aantal kolommen van de omzetkaart (`grid-cols-[repeat(auto-fit,
  minmax(84px,1fr))]`): dat is al container-gedreven en blijft.

### 5. Beheerheader (`BeheerTabs.tsx`)

- **Let op, afwijking van het issue:** het issue spreekt van "vier
  admintabs", maar op `main` heeft een beheerder **vijf** tabs: Assortiment,
  Leden, Instellingen, Diensten, Logboek. Een bardienst in `/beheer` ziet er
  drie. De eis geldt voor het **maximum, dus vijf tabs**, plus "Ingelogd als",
  de BEHEER-badge en "Uitloggen". Dit is geen scopewijziging maar een
  tellingsverschil; het hoeft geen vraag te worden.
- De header past op 1024 en 1280 **zonder horizontale paginascroll** en
  **zonder dat een actie wegvalt**. "Uitloggen" is altijd zichtbaar en
  tikbaar. "Ingelogd als {naam}" is nu `lg:inline` (zichtbaar vanaf
  1024) en niet afgekapt: een lange naam moet krimpen/afkappen
  (de naam heeft op deze plek een volledige weergave elders in het scherm
  nodig of een tik-bereikbare vorm) in plaats van de header te verbreden.
- De tabs behouden `whitespace-nowrap` en een tikdoel van 44px waar de
  header dat toelaat. Past het niet, dan herschikt de header over twee rijen,
  niet door tabs te verbergen of horizontaal te scrollen.
- De tabpanelen (`ProductenLijst`, `LedenLijst`, `DienstenApparaten`,
  `LogboekLijst`, instellingenkaarten) worden op 1024 en 1280 gecontroleerd
  op paginabrede horizontale overflow. De gemeten 840px op viewport 768 is in
  het issue aan de header toegeschreven, maar niet per paneel uitgesplitst.
  Vindt de Developer overflow in een tabpaneel, dan lost hij die op als
  hij klein is en meldt hij hem anders in de PR als nieuwe finding.
  Een grotere herindeling van een tabblad is geen onderdeel van dit ticket.

### 6. Zoom en fontvergroting

- Het stylesheet lost de **werkelijke inhoudsbreedte** op, niet alleen
  viewport-breakpoints. In Tailwind 3.4 (`tailwind.config.ts`, versie
  `^3.4.17`) kan dat met intrinsieke CSS (`grid-template-columns:
  repeat(auto-fill, minmax(…, 1fr))`, `flex-wrap`, `min-w-0`), met
  container-rules in plain CSS, of met de officiële container-queries-plugin.
  Een nieuwe dev-dependency is een kleine keuze van de Developer en moet in
  de PR-beschrijving staan. Het grid hoeft geen plugin: auto-fill met `minmax`
  past zich al aan de containerbreedte aan.
- **Fontvergroting** (tekstgrootte van het systeem of de browser, zonder
  paginazoom) tot een niveau waarbij de effectieve breedte nog ≥1024px is:
  alle primaire acties (product toevoegen, mandje wijzigen, afrekenen,
  opwaarderen, dienst afsluiten, uitloggen) blijven bereikbaar, eventueel via
  duidelijke verticale scroll binnen het paneel. Een primaire actie mag door
  vergroting nooit buiten beeld raken zonder scrollmogelijkheid.
- **Paginazoom:** een effectieve breedte onder 1024 valt buiten de
  ondersteuning (zie D1 en open vraag 1). Daaronder gaat het om gedrag
  zoals vastgelegd bij open vraag 1, niet om een garantie dat de
  indeling goed blijft.
- Eenheden: waar een maat met de tekst mee moet groeien (rail, knoppen,
  chips), gebruikt de Developer `rem` of relatieve maten; vaste `px`
  voor tikdoelen van 44px blijft toegestaan, want die zijn een minimum en
  geen tekstmaat.

## Afstemming met andere tickets

Alle drie raken dezelfde bestanden. Dit is het voorstel; de merge-volgorde
is aan Bram.

| Ticket | Raakt | Afspraak |
|---|---|---|
| T03 (#43, [PR #137](https://github.com/BramLambertJansen/ABAS/pull/137), open) | `DienstTabs`, `Assortiment`, `Mandje`, `VerkoopScherm`, `AfrekenenOverlay`, `BarApp`, nieuw `useVerkoopDraft.ts`, `docs/features/verkoop.md` | T03 bezit de **toestand** (verkoopdraft in `DienstTabs`, rail uit tijdens modale dialoog). T04 bouwt **na merge van #137** en wijzigt alleen indeling en tekstweergave. De bestaande regel uit #137 (modale dialogen schakelen de rail uit) blijft gelden bij elke railwijziging. T04 verplaatst geen state en voegt geen props toe. |
| T05 (#125, open) | `DienstTabs`, `BeheerTabs`, `PortalDashboard`, `Overlay` | T05 bezit **rollen, toetsenbord en landmarks** (`main`, roving tabindex, `aria-orientation`). T04 laat rollen, id's, `aria-*` en de volgorde in de DOM staan en past alleen klassen en layoutwrappers aan. Voeg T04 een wrapper toe, dan zit die niet tussen `tablist` en `tab`. Landen T04 en T05 tegelijk, dan rebaset de latere op de eerdere. |
| T07 (#127, open) | verkoopschermen, ledenzoeker, productfilters | Noemt het issue als afstemming. Raakt dezelfde `Assortiment`-filters en ledenzoeker in `Mandje`. Geen eigen afspraak nodig buiten: eerst overleggen vóór T07 de filterbalk herbouwt, omdat die balk hier ook wordt beoordeeld. |

Voorgestelde volgorde: #137 (T03) → T05 → T04, omdat T04 dan op beide bouwt
en alleen klassen hoeft te wijzigen. Dat is een voorstel, geen eis.

## Randgevallen

- **Productnaam zonder maximum:** 60+ tekens zonder spaties. Moet breken
  (`overflow-wrap`) zonder het grid te verbreden of de badge te bedekken.
- **Veel producten in één categorie:** de grid blijft scrollen binnen het
  gebied, zoek- en filterbalk blijven zichtbaar.
- **Zeer groot bedrag** (bijvoorbeeld €10.000,00 omzet, €500,00 opwaardering,
  of een negatief saldo): wordt niet afgekapt en breekt de regel niet.
- **Drie crewleden plus een lange `startedByName`:** paneel blijft leesbaar.
- **Volle bestelling:** vijftien regels met een lange naam op 1024×768:
  afrekenen blijft zichtbaar (onder 3).
- **Archived product in mandje** (T03/#137): blijft herkenbaar en
  verwijderbaar; de indeling mag dat niet afkappen.
- **Overgang tussen maten** (venster verkleinen, zoom tijdens een dienst):
  er gaat geen draft of ingevulde invoer verloren; alleen de indeling past
  zich aan. Een resize remount geen schermen.
- **1024-grens:** op exact 1024 effectief geldt de ondersteunde indeling, niet
  de melding.
- **Overlays** (`Overlay.tsx`, afrekenen, bezetting, terugdraaien) worden op
  1024×768 gecontroleerd op bereikbaarheid van hun knoppen. Hun focusgedrag
  hoort bij T05; hun maat en scroll bij hen alleen als ze op de matrix
  een knop buiten beeld zetten.

## Acceptatiecriteria

Elk criterium wordt op beide maten (1024×768, 1280×800) en op desktop
gecontroleerd, tenzij anders vermeld.

1. Normale namen als "Rode wijn" en "Spa rood" staan volledig en leesbaar in
   het productgrid op 1024×768 en 1280×800. Geen afkorting met "…".
2. De aantallenbadge bedekt nooit een naam of prijs, ook niet bij een
   geselecteerd product met een naam die twee regels vult, en niet bij 2-
   en 3-cijferige aantallen.
3. Een lange productnaam, lidnaam of medewerkersnaam is in volledige
   tekst te lezen of te bereiken via een tik, zonder afhankelijkheid van
   hover. `title=` alleen geldt niet.
4. Mandje, totaal en "Tik afrekenen" zijn bereikbaar met een volle
   bestelling op 1024×768 (afrekenen verdwijnt niet door scrollen).
5. Omzet, opgewaardeerd, regelbedragen en "Dienst afsluiten" zijn bereikbaar
   met drie crewleden; bedragen worden nooit afgekapt; wie een bestelling
   plaatste is zonder hover te zien.
6. De beheerheader met alle vijf tabs (beheerder), "Ingelogd als",
   de BEHEER-badge en "Uitloggen" past op 1024 en 1280 zonder verborgen
   actie en zonder horizontale paginascroll, ook bij een lange naam.
7. Er zijn geen overlappende bedieningselementen op de matrix.
8. De indeling reageert op containerbreedte: het productgrid en de
   zijpanelen hangen niet af van `shell.columns` of alleen van
   viewport-breakpoints.
9. Met vergrote tekst of zoom (effectief ≥1024 breed) blijven alle primaire
   acties bereikbaar.
10. Onder de effectieve breedte van 1024 gebeurt wat Bram bij open vraag 1
    kiest.
11. Rail, tablist, `aria-*`, tab-id's en DOM-volgorde zijn niet gewijzigd
    (T05-afspraak). `check:arch`, `check:policy` en `check:a11y` blijven
    groen; er staat geen `matchMedia` of `userAgent` in de code.
12. Geen RPC-, schema- of policywijziging in de PR.

## Verificatie

- **Playwright-tests op de matrix.** `playwright.config.ts` heeft nu geen
  viewportmatrix. De Developer voegt viewports 1024×768 en 1280×800 toe
  voor de schermen uit deze spec. Interactiemetingen, geen alleen
  screenshots: `scrollWidth <= clientWidth` van de pagina, bounding-box
  controles dat badge en naam niet overlappen, en dat "Tik afrekenen" en
  "Uitloggen" binnen de viewport liggen.
- **Testdata (fixtures):** lange product-, lid- en medewerkersnamen, grote
  bedragen, drie crewleden en een volle bestelling.
- **Handmatig:** screenshots op de matrix en een **fysiek tablet** (Safari/
  touch zijn nog niet bewezen met de fixture, zie het issue). De hoogte-
  eenheid van `h-screen` en browserbalken is alleen daarmee te zien.
- `check:a11y` (axe) blijft groen op elk shell-entrypoint. Contrast van de
  accent-tokens verandert niet.
- Geen nieuwe `db:test`-tests: er verandert niets in de database.

## Expliciet buiten scope

- Tabletportret (768×1024) en telefoon voor de bar.
- Een apart portret- of telefoonlayout, of een tweede rail/onderbalk.
- Toetsenbordbediening van tabs, focusval van dialogen en landmarks (T05, #125).
- Opslaan van de verkoopdraft (T03, #43/#137).
- Ledenzoeker, invoerfeedback en productfilters inhoudelijk (T07, #127).
- Productfoto's, nieuwe categorieën, nieuwe knoppen of nieuwe teksten buiten
  wat criterium 3 en 5 nodig hebben.
- Offline, service worker, PWA-uitbreiding (CLAUDE.md → Shells).
- Een herontwerp van het beheer-tabblad-inhoud (zie Gedrag 5).
- Het portal-shell.

## Open vragen voor Bram

1. **Wat gebeurt er onder 1024 effectieve breedte?** Bestaande docs zeggen
   alleen "nooit telefoon, supportuitspraak, niet afgedwongen". Opties:
   (A) niets, de indeling kan daar kapot gaan, wat bij een supportuitspraak
   past; (B) een niet-blokkerende melding op bar en beheer ("Dit scherm is
   te smal voor de bar. Gebruik een tablet in landschap"), alleen met CSS
   getoond; (C) een blokkerend scherm. Voorstel van de Architect: **B**, omdat
   het D1 voor de medewerker zichtbaar maakt zonder een grens af te dwingen
   die ADR 0016 bewust niet kent. De tekst van de melding is dan ook aan Bram.
2. **Is 1024 CSS-pixels de juiste ondergrens?** Dit is een voorstel. Hij valt
   samen met de krapste ondersteunde maat (1024×768). Bevestig 1024, of noem
   het smalste toestel (in landschap) dat de vereniging werkelijk gebruikt.
3. **Merge-volgorde met T03/T05.** Voorstel #137 → T05 → T04. Akkoord, of
   wil je T04 eerder omdat het P1 is en #137 al klaarstaat?
4. **ADR.** De regel "een feature-component beslist zijn kolommen op zijn
   eigen containerbreedte, niet op `shell.columns` of viewport" kan een
   volgende feature tegenspreken. Voorstel: een korte ADR (0018) en een
   aanpassing van de `useShell()`-alinea in `docs/ARCHITECTURE.md` bij
   akkoord op deze spec. Geen ADR schrijven zolang jij dat niet wilt.
