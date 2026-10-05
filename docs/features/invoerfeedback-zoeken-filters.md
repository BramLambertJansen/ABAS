# Invoerfeedback, ledenzoeker en productfilters

**Status: gebouwd** ([PR #152](https://github.com/BramLambertJansen/ABAS/pull/152),
gemerged in main als `3a8d13e`). Goedgekeurd door Bram op 2026-10-02, inclusief
vraag 9 en 10 en besluit 11 t/m 15 (zie "Besluiten Bram"). Wat er daadwerkelijk
staat: zie "Zoals gebouwd" onderaan; de rest van dit document is de
goedgekeurde spec.

Spec voor [issue #127](https://github.com/BramLambertJansen/ABAS/issues/127)
(frontend T07 · P2, epic #121, findings F12, F15, F16; besluit D3). Bouwt voort
op T05 (#125, `Overlay`/`Tabs`, gemerged) en T06 (#126, `src/lib/opslaan.ts`,
`OpslaanSectie`, pending-model, gemerged). Bouwt ook voort op T03
([#43](https://github.com/BramLambertJansen/ABAS/issues/43), PR
[#137](https://github.com/BramLambertJansen/ABAS/pull/137), gemerged:
`useVerkoopDraft`) en T04
([#124](https://github.com/BramLambertJansen/ABAS/issues/124), PR #145,
gemerged: `ZijPaneel`) omdat die dezelfde verkoopschermen raken. Eerst
gevalideerd op main `c48d063`, opnieuw gevalideerd op main `c1dd5bb`
(2026-10-02, na T03, T04 en PR #146).

## Doel

De bardienst of beheerder begrijpt waarom een actie niet kan (veldfout in
plaats van een stille uitgeschakelde knop), kiest snel en met toetsenbord of
touch het juiste lid of product, en raakt een bestelling niet stil kwijt bij
een lidwissel.

## Gelezen bronnen

- Ticket #127 en epic #121 (D3-rij: voorstel "categorieklik wist de
  zoekterm", alternatief "samen filteren"; "agents mogen besluiten niet
  ongemerkt invullen").
- Wireframe: `designs/Bar App.dc.html`, verkoopscherm (zoekveld, chips,
  ledenzoeker in het mandjepaneel) en de opwaardeer-modal. Het ontwerp kent
  geen veldfouten of toetsenbordgedrag; het in-app design system en de
  bestaande foutstijl (`text-xs font-bold text-danger`, `role="alert"`) zijn de
  waarheid.
- Code op main: `src/features/verkoop/Assortiment.tsx`, `Mandje.tsx`,
  `VerkoopScherm.tsx`, `src/features/opwaarderen/OpwaarderenOverlay.tsx`,
  `src/lib/money.ts`, `src/lib/email.ts`, `src/components/TekstVeld.tsx`,
  `NieuwWachtwoordVelden.tsx`, `Select.tsx` (bestaand combobox/listbox-patroon),
  `PinToetsenbord.tsx`, `NieuwLidOverlay.tsx`, `LidBeherenOverlay.tsx`,
  `NieuwProductOverlay.tsx`, `ProductBeherenOverlay.tsx`,
  `NegatieveLimietInstellingen.tsx`, `PincodeSheet.tsx`.
- Kaders: `CLAUDE.md`, `docs/features/verkoop.md` (§1 en §2),
  `opwaarderen.md`, `tablet-bruikbaarheid.md`, `dialogen-tabs-landmarks.md`,
  `opslaan-sluiten-pending.md`, ADR 0014 (overlay-aanwezigheid, geen
  gestapelde overlays).
- Gemerged sinds de eerste versie van deze spec (gelezen op `c1dd5bb`):
  `src/features/verkoop/useVerkoopDraft.ts` en `DienstTabs.tsx` (T03),
  `src/components/ZijPaneel.tsx` (T04), `ProductAfbeelding` in `Assortiment`
  (PR #146). De bestanden in `src/features/opwaarderen`, `TekstVeld`, `Select`,
  `money.ts` en `email.ts` zijn sinds `c48d063` niet gewijzigd, dus de
  F12-bevindingen hieronder blijven gelden.

## Validatie van de bevindingen tegen actuele main

| Finding | Bevinding op main | Status |
|---|---|---|
| F12 Opwaarderen: `abc`, nul of negatief | `OpwaarderenOverlay` toont alleen `amountTooHigh` (regel ~163, `role="alert"` + `aria-invalid`). Voor `abc`, `0`, `0,001`, `-5` is `amountCents` `null` of 0, `bookDisabled` waar, geen melding. De knop "boeken" is dan stil `disabled`. | Bevestigd |
| F12 Overige geldvelden | Nieuw product (prijs), Product beheren (prijs), Nieuw lid (startsaldo), Negatieve limiet (eigen bedrag): `canSubmit`/`canSave*` op `parseEuroToCents`, geen enkele veldmelding. | Bevestigd |
| F12 E-mail | `NieuwLidOverlay` en `LidBeherenOverlay`: `isValidEmailFormat` stuurt alleen `canSubmit`/`canSaveEmail`, geen melding. | Bevestigd |
| F12 PIN-mismatch | `PincodeSheet` toont bij een mismatch "Codes komen niet overeen" via `PinToetsenbord` (`role="alert"`) en begint opnieuw. Geen uitgeschakelde knop. | **Niet bevestigd**: al afgehandeld, buiten scope behalve controle dat de melding bij de stap-tekst hoort |
| F12 Wachtwoordchecklist | `NieuwWachtwoordVelden`: checklist plus `aria-invalid`/`aria-describedby` voor mismatch. | Bestaat, blijft intact en is het voorbeeld |
| F15 Categorie tijdens zoeken | `Assortiment.tsx`: `visible` filtert bij een zoekterm alleen op naam; `setCategory` wijzigt state, chips tonen `aria-pressed={!trimmedQuery && ...}`, dus bij een zoekterm staat nergens een chip aan en een klik doet niets zichtbaars. Bewuste regel in `verkoop.md` §1 ("zolang er een zoekopdracht actief is, overschrijft die de categoriefilter"). Op `c1dd5bb` ongewijzigd; `query`/`category` komen nu uit `draft` (`AssortimentView`). | Bevestigd, besloten (D3) |
| F16 Ledenzoeker | `Mandje.tsx` (nu in `ZijPaneel`): `type="search"` plus `<ul>` met knoppen. Geen `role`s, geen pijltoetsen, geen Escape, geen buitenklik, geen open/dicht-state (lijst staat open zolang er tekst is). Naam `truncate`. Wel aanwezig: `role="status"` bij laden, `role="alert"` bij fout, "geen leden gevonden". | Bevestigd |
| F16 Lidwissel wist stil | Op main: de knop "wissel" (`clearMember`) wist alleen het gekozen lid, **niet** het mandje. Het mandje wordt geleegd in `VerkoopScherm.chooseMember` zodra daarna een **ander** lid gekozen wordt (vergelijking met `lastMemberId`, nu in `draft`). Er is geen aankondiging of bevestiging. Het ticket zegt "bij kiezen van een ander lid", dat klopt. | Bevestigd, nuance: het wissen gebeurt bij de keuze, niet bij "wissel". Let op: `verkoop.md` §2 zegt nog dat "wissel" het mandje leegt; dat klopt niet met de code (zie "Afwijkingen gevonden bij validatie") |
| Geldlimiet en bevestiging | €500 max en bevestiging boven €100 in `OpwaarderenOverlay`/`messages.ts`; server dwingt `amount_exceeds_max` af. | Blijft ongewijzigd |

Gedeelde basis die al bestaat en hergebruikt wordt (niets dupliceren):

- `TekstVeld` (label plus input, `useId`), maar zonder fout/hint-slot.
- `src/lib/money.ts` `parseEuroToCents` (blijft de enige parser),
  `src/lib/email.ts` `isValidEmailFormat`, `messages.ts`-conventie met teksten
  naast de feature.
- `Select.tsx`: bestaand `role="combobox"`/`listbox` met
  `aria-activedescendant`. De ledenzoeker is een autocomplete (tekstinvoer),
  geen knop-select, maar toetsenbord- en id-logica hoort niet opnieuw geschreven.
- `Overlay` (T05/T06): Escape/backdrop, `onopgeslagen`, `closeBlocked`. De
  ledenzoeker staat in het mandjepaneel, geen overlay.

## Gekozen aanpak

### 1. Veldfeedback (F12): één gedeeld patroon

- **Pure classificatie** `src/lib/veldFouten.ts` (nieuw, unit-getest in
  `test/veldFouten.test.ts`): `bedragFout(invoer, { minCents, maxCents })`
  geeft `null` of een soort: `leeg`, `ongeldig` (geen getal, ook `1.000,50`),
  `teveelDecimalen`, `negatief`, `nul`, `tehoog`. De parser
  `parseEuroToCents` blijft ongewijzigd en beslist de uiteindelijke waarde; de
  classificatie bepaalt alleen *welke* melding (geen bedrag wordt berekend).
  Idem `emailFout(invoer)` (`leeg` is geldig waar optioneel, `ongeldig`).
- **Teksten** naast de feature in `messages.ts`, per soort en per veld, exact
  volgens de goedgekeurde tabel onder "Besluiten Bram".
- **`TekstVeld` krijgt een additieve `fout`-prop** (en optionele `hint`):
  de component rendert de melding in een element met eigen id (`role` en
  `aria-live`: zie hieronder), zet `aria-invalid` en `aria-describedby`
  (samengevoegd met een bestaande hint), en behoudt `value`/focus. Bestaande
  inputs die geen `TekstVeld` gebruiken (`OpwaarderenOverlay` bedragveld,
  `NieuwLidOverlay`, `NieuwProductOverlay`, `NegatieveLimietInstellingen`)
  worden omgezet of krijgen hetzelfde id-/aria-koppelpatroon; de Developer
  kiest per veld, zonder een tweede foutcomponent te maken.
- **Moment** (besloten): een veld toont zijn fout na `blur`
  of na een tik op de primaire knop ("poging"), niet tijdens het eerste
  typen. Een ongewijzigd, nog nooit aangeraakt formulier toont niets.
  `tehoog` blijft direct zichtbaar (bestaand gedrag, de grens is geen
  typfout-in-wording). Zodra de invoer weer geldig is verdwijnt de fout
  direct (herstel hoeft niet te wachten op blur).
- **Knop bij een veldfout** (besloten): de knop blijft **actief** bij een fout
  in het veld zelf; een tik toont de fout en zet de focus op het eerste ongeldige
  veld. De knop blijft `disabled` alleen voor toestanden zonder veldverklaring
  (lopende actie, ontbrekende of lege bezetting, A4). Bestaande tests op "knop
  disabled bij ongeldig bedrag" worden daarom **bewust** aangepast (gewijzigd
  productcontract); de Developer noemt dat in de PR.
- **Behoud**: focus en ingevoerde waarde blijven staan bij een fout; een
  poging met ongeldige invoer zet de focus op het eerste ongeldige veld.
- **Meldingsrol**: `aria-describedby` aan het veld voor het voorlezen bij
  focus; de melding zelf is zichtbaar tekst, met `role="alert"` alleen bij
  de pogingsfout (niet bij elke toetsaanslag).
- **Hergebruik wachtwoordchecklist**: ongewijzigd laten; het patroon
  (`aria-describedby`, `aria-invalid`) wordt alleen op de andere velden
  toegepast.
- **Onder pending (T06)**: velden zijn tijdens een lopende actie `readOnly`;
  veldfouten worden dan niet opnieuw berekend of getoond. De sectiefout
  (`OpslaanSectie`, serverfouten) blijft een aparte regel en wordt niet met
  de veldfout vermengd.

Velden in scope (bedrag, e-mail; PIN is al afgedekt):

| Scherm | Veld | Soorten |
|---|---|---|
| Opwaarderen | ander bedrag | leeg (alleen bij poging zonder chip), ongeldig, teveelDecimalen, negatief, nul, tehoog |
| Nieuw product / Product beheren | prijs | leeg, ongeldig, teveelDecimalen, negatief, nul |
| Nieuw lid | startsaldo (optioneel), e-mail (optioneel) | ongeldig, teveelDecimalen, negatief; e-mail ongeldig |
| Lid beheren | e-mail | ongeldig |
| Negatieve limiet | eigen bedrag | ongeldig, teveelDecimalen, negatief (0 is toegestaan) |

Niet in scope: login-/herstelformulieren in portal en beheer (andere
foutstroom, aparte T-tickets), PIN-toetsenbord (al afgedekt, geen wijziging).

### 2. Zoek- en categoriecontract (F15, D3 — besloten)

Besluit Bram (2026-10-02): een categorieklik wist de zoekterm. Uitwerking:

- Een klik op een categoriechip (ook "Alle") roept `setQuery("")` en
  `setCategory(...)` aan (beide uit `AssortimentView`, `useVerkoopDraft`) en
  toont die categorie; de chip is zichtbaar actief.
- Terwijl er een zoekterm is, staat geen chip aan (zoals nu) en staat
  er tussen de chips en het grid een resultaatregel in `role="status"`:
  "{n} producten voor "{term}" in alle categorieën" met een knop "Wis
  zoekterm". Bij nul: "Geen producten voor "{term}"" met dezelfde knop. Bij
  nul vervangt deze regel de bestaande lege-staat "Geen producten gevonden."
  (die blijft alleen voor een categorie zonder producten). Zo komen de
  zichtbare filters overeen met de werkelijke resultaten.
- Typen in het zoekveld laat `category` ongemoeid maar de zoekterm
  overschrijft hem. "Wis zoekterm" zet `category` terug op "Alle" (besluit 9), en
  dat geldt ook als de zoekterm op een andere manier leeg raakt: met Escape, het
  kruisje van `type="search"`, backspace of handmatig leeghalen (besluit 12).
  Zo is wat je ziet nooit een verborgen eerdere keuze. Na "Wis zoekterm" gaat de
  focus naar het zoekveld (besluit 14).
- De filterlogica verhuist naar een pure functie
  `filterProducten(producten, zoekterm, categorie)` (nieuw, naast
  `src/features/verkoop/cart.ts`; dat bestand bevat nu alleen `applyDelta` en
  `removeLine`), unit-getest. `Assortiment` roept hem aan in plaats van de
  inline `useMemo` (nu `visible`).
- `docs/features/verkoop.md` §1 wordt in **dezelfde stap als de code** (dezelfde
  PR) aangepast: de zin "Zolang er een zoekopdracht actief is, overschrijft die
  de categoriefilter (zelfde gedrag als het ontwerp); leeg zoekveld →
  categoriefilter geldt weer" wordt vervangen door het D3-contract (categorieklik
  wist de zoekterm, resultaatregel, "Wis zoekterm"). Ook de beschrijving
  van zoekterm en categorie in de "Verkoopdraft"-alinea blijft kloppen (de
  state staat nog in de draft) en wordt alleen aangepast voor zover het D3-gedrag
  daar anders van afwijkt.

### 3. Ledenzoeker (F16): toetsenbord, status en leesbaarheid

Eén gedeeld component `src/components/LidZoeker.tsx` (nieuw; geen tweede
variant in `Mandje`), met de lijstlogica van `Select.tsx` hergebruikt of naar
een gedeelde hook getild in plaats van gekopieerd (Developer kiest, reviewfout
bij duplicatie). Gedrag:

- ARIA-combobox-patroon: invoer met `role="combobox"`, `aria-expanded`,
  `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant`;
  lijst `role="listbox"` met `role="option"`. Focus blijft in de invoer.
- Pijltoetsen omhoog/omlaag lopen door de resultaten (lopen rond niet:
  stoppen aan de randen), Enter kiest de actieve optie (besloten:
  het eerste resultaat is automatisch actief), Escape sluit eerst de lijst en
  behoudt de tekst, een tweede Escape wist de tekst. Escape sluit alleen de lijst (geen
  `Overlay`-conflict in `Mandje`; bij een latere plaatsing in een overlay
  moet Escape bij een open lijst niet de dialoog sluiten).
- Geen lijst bij lege invoer (besloten); resultaten vanaf 1 teken.
- Open/dicht-state expliciet: de lijst opent bij typen of bij ArrowDown,
  sluit bij Escape, buitenklik (`pointerdown` buiten de component), kiezen
  of `blur` naar buiten. Tab verlaat de lijst zonder te kiezen.
- Status in `role="status"` (zichtbaar of `sr-only`): "{n} leden gevonden",
  "Leden laden…", de bestaande nulresultaatregel ("geen leden gevonden") en
  de fout (`role="alert"`, bestaand). Geen aankondiging bij elke toets
  voor hetzelfde aantal.
- Namen: optie toont de volledige naam en wrapt over zoveel regels als nodig is
  (`break-words`), geen `truncate`, geen regelklem (besluit 11, zodat "de Wit" en
  "de Witt" onderscheidbaar blijven); saldo blijft rechts met de bestaande
  lage-saldo-markering. Voor twee gelijkende lange namen is er géén extra
  persoonsgegeven (geen e-mail, geen telefoon, geen geboortedatum): alleen
  naam en saldo, zoals nu. De gekozen-lid-kaart in `Mandje` (nu `truncate`) toont de naam
  ook volledig (wrap over zoveel regels als nodig, geen regelklem, besluit 11); hover-only of
  `title`-only is niet toegestaan (zelfde regel als T04, waar de mandjeregels
  al `break-words` gebruiken).
- Touch: elke optie minimaal 44px hoog (bestaand `min-h-[44px]`).
- Aantal resultaten: geen limiet (besloten); de lijst scrolt
  (`max-h-[300px]`, zoals nu).
- Plaatsing: de lijst blijft een absoluut gepositioneerde laag onder de invoer
  binnen `Mandje` (nu `absolute inset-x-0 top-14 z-30`), in `ZijPaneel`
  (`overflow-auto`, 300 tot 372px). De Developer controleert op 768 portret
  dat de lijst niet wordt afgekapt door het scrollende paneel; zo wel, dan is
  dat een layoutfix binnen deze taak, geen nieuwe beslissing.
- Na een tabwissel blijft `memberQuery` bewaard (draft), maar open/dicht en
  actieve optie zijn lokaal en verdwijnen bij unmount. Na terugkeer staat de
  lijst dus gesloten tot de eerste toets of ArrowDown (besluit vraag 10).
- Gedeeld met bestaande zoekvelden (`LedenLijst`, `LogboekLijst`) is
  **niet** nodig: dat zijn filters op een lijst, geen kies-een-lid-patronen.

### 4. Lidwissel met gevulde bestelling (F16, veiligheidsregel uit T03; besloten)

Veiligheidsdoel (verkoop.md §2): geen bestelling afrekenen bij de verkeerde
betaler. Het doel blijft; alleen de zichtbaarheid verandert. Besluit Bram
(2026-10-02): aankondigen én inline bevestigen, alleen bij een ander lid en een
gevuld mandje.

- Na "wissel" met een gevuld mandje staat boven de zoeker een vaste melding
  (`role="status"`): "De bestelling ({n} stuks) staat nog klaar. Kies je een
  ander lid, dan wordt de bestelling geleegd." Hetzelfde lid opnieuw kiezen
  laat het mandje intact (bestaande `lastMemberId`-regel blijft).
- Kies je een **ander** lid terwijl het mandje gevuld is, dan verschijnt een
  inline bevestiging in het mandjepaneel (geen modal; ADR 0014 verbiedt een
  gestapelde overlay en dit is geen dialoog): "Bestelling wissen en verder
  met {naam}?" met "Wissen en kiezen" en "Terug" (focus op "Terug", zodat
  een dubbele tik niet per ongeluk wist; na "Wissen en kiezen" gaat de focus naar
  de lidnaam in het lidkaartje, met `tabIndex={-1}`, besluit 14). Pas daarna wordt het mandje geleegd
  en het lid gekozen. Met een leeg mandje, zonder eerder lid of hetzelfde lid:
  direct kiezen, geen bevestiging.
- Eén regel, één plek: de voorwaarde "wist deze keuze het mandje" staat nu
  inline in `VerkoopScherm.chooseMember`
  (`!(lastMemberId === null || lastMemberId === id)`). De Developer tilt die
  naar een pure functie naast `cart.ts` (bijvoorbeeld
  `lidwisselWistMandje(lastMemberId, id, aantalRegels)`, unit-getest) en
  gebruikt hem zowel in `chooseMember` als voor het tonen van de
  bevestiging, zodat de regel niet tweemaal bestaat. Het mandje wist nog steeds
  alleen in `chooseMember`, na de bevestiging.
- `Mandje` krijgt daarvoor `lastMemberId` (of een afgeleide
  "vraagt bevestiging"-functie) als prop; nu krijgt hij hem niet. De
  bevestigingsstaat ("wacht op bevestiging voor {id}") is lokale state in
  `Mandje`.
- Samenspel met de bestaande mandjemelding: `DienstTabs` roept
  `useMandjeMelding(draft.cartLines.length > 0)` aan (uitloggen met gevuld
  mandje). Dat is een ander mechanisme (uitloggen, niet lidwissel); T07 raakt
  het niet.

**Afstemming met T03 (#137, gemerged; gelezen op `c1dd5bb`).**
`useVerkoopDraft` (`src/features/verkoop/useVerkoopDraft.ts`) bestaat. De draft
wordt in `DienstTabs` aangemaakt en bevat `cartLines`, `selectedMemberId`,
`lastMemberId`, `selectedMemberSnapshot`, `productInfoCache`, `query`,
`category`, `view` en `memberQuery`. Hieruit volgt, op de werkelijke code:

- `Assortiment` krijgt `display={draft}` (type `AssortimentView`: `query`,
  `setQuery`, `category`, `setCategory`, `view`, `setView`); `Mandje` krijgt
  `memberQuery`/`setMemberQuery` als props van `VerkoopScherm`. De nieuwe pure
  functies en `LidZoeker` zijn state-agnostisch en nemen waarden en setters als
  props; T07 voegt **geen** velden aan de draft toe.
- De bevestigingsstaat voor de lidwissel is **geen** draftdata (vluchtig, hoort
  niet na een tabwissel terug): lokale state in `Mandje`. `Mandje` is alleen
  gemount op het verkooptabblad, dus de bevestiging verdwijnt bij een
  tabwissel en het mandje blijft onaangeroerd (veilige kant). Een open dialoog
  maakt de achtergrond inert (`overlayShield.ts`) en blokkeert tabwissels.
- Dienstwissel/afsluiten/uitloggen/succesvolle afrekening wist de draft
  (`DienstTabs` wordt per sessie/dienst gemount; `handleCheckoutSuccess` wist
  mandje en lid). T07 voegt daar niets aan toe.
- `lastMemberId` blijft na "wissel" bewaard (`clearMember` wist het niet) en
  wordt wel gewist bij afrekenen en `member_not_found`. De aankondiging
  na "wissel" gebruikt dus: `selectedMember === null`, `lastMemberId !== null`
  en `cartLines.length > 0`.
- `verkoop.md` bevat sinds #137 de alinea "Lidwissel behoudt de bestaande regel:
  hetzelfde lid bewaart het mandje, een ander lid wist de regels." Die klopt
  nog, maar T07 voegt de aankondiging en bevestiging toe. In dezelfde PR als
  T07 worden bijgewerkt: §1 (D3, zie hierboven), §2 ("Na kiezen"-bullet:
  "wissel" leegt het mandje niet, de keuze van een ander lid doet dat, na
  inline bevestiging) en die alinea in "Verkoopdraft binnen de dienst".

**Afstemming met T04 (#124, gemerged via PR #145).** `ZijPaneel`
(`src/components/ZijPaneel.tsx`) is `w-[clamp(300px,36vw,372px)]`, scrollt
binnen zichzelf (`overflow-auto`) en wordt gebruikt door `Mandje` en
`DienstActief`. De ledenlijst, de resultaatregel van de zoeker en de inline
wissel-bevestiging moeten daarin passen op 768 portret (geen horizontale
overflow, geen overlap met de afrekenknop). D1 is besloten (768 portret en 1024
landschap). Naam-wrap is in lijn met T04, waar de mandjeregels al `break-words` hebben;
namen in ledenlijst en lidkaartje krijgen geen regelklem (besluit 11). T04 is gebouwd en geraakt alleen
classes/layout; T07 voegt gedrag toe in dezelfde bestanden (`Mandje.tsx`,
`Assortiment.tsx`): geen conflict.

**Afstemming met PR #146 (productafbeeldingen, ADR 0018; gemerged).**
`Assortiment` toont nu `ProductAfbeelding` in kaart en rij. T07 wijzigt de
kaart niet, alleen het filter, de resultaatregel en de chip-klik. Geen conflict.

### Afwijkingen gevonden bij validatie op `c1dd5bb`

Voor Bram ter kennis; geen eigen besluit nodig behalve waar een vraag staat.

1. `verkoop.md` §2 ("Na kiezen") beweert dat "wissel" het mandje leegt. De code
   doet dat niet (zie `VerkoopScherm.clearMember`; het wissen gebeurt bij het
   kiezen van een ander lid). De spec volgt de code; `verkoop.md` wordt in de
   T07-PR gecorrigeerd. Het lidwisselbesluit staat onder "Besluiten Bram".
2. Eerdere tekst in deze spec verwees voor "terug naar Alle" naar "vraag 2", wat
   de lidwissel was. Het besluit over wat "Wis zoekterm" met de categorie doet,
   ontbreekt daardoor: besloten in vraag 9.
3. `memberQuery` zit in de draft, maar open/dicht van de lijst niet: besloten in vraag 10.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC.** Ja, de bedrag-/saldovelden raken geld, maar de
  spec verandert geen RPC en berekent geen bedrag. `parseEuroToCents` zet
  invoer om naar de cents die de RPC verwacht (bestaand); `bedragFout`
  classificeert alleen. Grens €500 en bevestiging boven €100 blijven in de
  overlay én server-side (`top_up`). Een veldfout is UX, de RPC blijft de
  afdwinging. `place_order`: de lidwissel verandert niets aan wat wordt
  verstuurd (alleen ids, aantallen).
- **Attributie alleen via bezetting.** Niet geraakt: `served_by` en de
  "Wie geeft uit?"-keuze blijven ongewijzigd. A4 (nooit opwaarderen naar het
  eigen lid) blijft vóór het boeken zichtbaar.
- **Componenten herbruikbaar.** `TekstVeld` wordt uitgebreid in plaats van een
  tweede veldcomponent; `LidZoeker` is nieuw omdat er geen bestaande
  autocomplete is, maar hergebruikt het patroon van `Select`. Dat is
  onderbouwd in de Gelezen bronnen en moet door de Reviewer getoetst worden.

## Betrokken shells

`shells/bar` primair (verkoop, opwaarderen, ledenbeheer, productbeheer,
negatieve limiet). `TekstVeld`/`veldFouten` zijn shell-onwetend en staan in
`src/components` en `src/lib`, zodat de portal ze kan gebruiken
(`PortalLogin`, profielsheets; buiten scope voor wijzigingen). Geen
`useShell()`-afhankelijkheid.

## Datamodel, RPC's, rolzichtbaarheid

Geen datamodel- of RPC-wijzigingen. Geen nieuwe policies (`check:rls` en
`db:test` onaangeroerd). Geen nieuwe persoonsgegevens op het scherm (de lijst
toont nog steeds alleen naam en saldo). Rolzichtbaarheid ongewijzigd: bardienst
en beheerder zien de ledenzoeker zoals nu; leden hebben geen verkoopscherm.

## ADR nodig?

Nee. Er is geen nieuwe architectuurbeslissing: geen nieuwe laag, geen
afwijking van een ADR (ADR 0014 wordt gevolgd door een inline bevestiging
in plaats van een gestapelde overlay). D3 is een productbesluit en landt in
`verkoop.md`, niet in een ADR. Een gate hoeft niet (zie "Gate-signaal").

## Randgevallen

- `abc`, `-5`, `0`, `0,001`, `1.000,50`, `€ 5`, spaties, leeg: elk een eigen
  soort of bewust gelijke melding (tabel onder "Besluiten Bram"); invoer en focus blijven staan.
- Chip gekozen en daarna `abc` getypt: het vrije veld wint (bestaand), de
  chip wordt uit; foutmelding voor het veld, de bevestiging wordt ingetrokken
  (bestaand `setConfirming(false)`).
- Opwaarderen boven €100: bevestigingsstap blijft; veldfout en bevestiging
  zijn nooit tegelijk zichtbaar.
- Zoekterm met alleen spaties: telt als leeg (bestaande `trim`), geen
  resultaatregel.
- Categorieklik op een chip terwijl het zoekveld focus heeft: focus blijft op
  de chip; de resultaatregel verdwijnt.
- Categorie die na een productwijziging niet meer bestaat: bestaand
  gedrag (geen producten); resultaatregel toont de actieve filter en een
  reset ("Alle").
- Ledenlijst terwijl `members` herlaadt (T03 refetch bij terugkeer):
  status "Leden laden…", actieve optie en gekozen index worden niet
  behouden; geen sprong van de focus.
- Lid verdwijnt uit de lijst (gearchiveerd) terwijl de bevestiging open
  staat: bevestiging vervalt met melding "dit lid bestaat niet meer"
  (bestaande tekst `member_not_found`). Vrijwel onbereikbaar; het
  vangnet-effect in `Mandje` blijft staan (besluit 14).
- Dubbele tik op "Wissen en kiezen": één wisseling (de bevestiging sluit bij
  de eerste).
- Twee leden met bijna dezelfde naam: beide volledig leesbaar; onderscheid
  alleen via naam en saldo. Een echte duplicaatnaam is een ledenbeheerzaak
  (buiten scope), niet iets wat de zoeker oplost.
- Escape in de ledenzoeker: sluit de lijst; de pagina-brede overlays sluiten
  niet (er staat er geen open; de zoeker staat niet in een `Overlay`).
- Tablet touch: geen hover-only uitleg; geen `title`-only volledige naam.

## Teststrategie

- Unit (`npm run test`): `test/veldFouten.test.ts` (alle soorten, grensgevallen
  `0`, `0,001`, `1.000,50`, `-5`, `500` en `500,01`, e-mail met/zonder
  spaties), `filterProducten` (zoek, categorie, combinaties volgens het
  gekozen contract), tekstfuncties. `test/money.test.ts` blijft ongewijzigd
  (parser is niet veranderd); `test/transacties.test.ts` en `cart.test.ts`
  alleen aanpassen als de lidwisselregel in `cart.ts` verandert, en dan met een
  nieuwe test, niet door een bestaande te laten vallen.
- E2E (Playwright, gemockte Supabase zoals `opslaan-sluiten-pending.spec.ts`):
  - Opwaarderen: `abc`, `0`, `-5`, `1,234`, `600` (tehoog), herstel; fout
    verdwijnt bij geldige invoer; waarde en focus blijven; `aria-invalid` en
    `aria-describedby` wijzen naar de melding.
  - Nieuw product/lid, Lid beheren: e-mail en bedrag, melding bij blur en
    poging, geen melding op een ongewijzigd formulier.
  - Ledenzoeker: pijltoetsen, Enter, Escape (eerst lijst, dan tekst),
    buitenklik, nulresultaten, laden, fout; twee lange gelijkende namen volledig
    zichtbaar op 768px; touch (`hasTouch`) kiest zonder hover.
  - Zoeken + categorie: Pils zoeken, Fris klikken: zoekterm weg, Fris
    zichtbaar actief, resultaatregel klopt met het aantal kaarten.
  - Lidwissel: gevulde bestelling, wissel, ander lid: melding en bevestiging,
    Terug laat alles intact, "Wissen en kiezen" leegt; hetzelfde lid:
    geen bevestiging; leeg mandje: geen bevestiging.
- `check:a11y` (axe, jsx-a11y): combobox-attributen, `aria-describedby`-
  referenties en contrast van de nieuwe tekst (`text-danger` op wit).
- Handmatig, nog niet uit te voeren in deze omgeving: schermlezer, Safari,
  fysieke tablet. Geen claim over werking daarop.

## Gate-signaal

Overweeg een lint- of testregel die een `<input>` met `parseEuroToCents`
zonder `aria-describedby` voor een foutmelding afvangt. Niet nu: een
gedeelde `TekstVeld`-prop is de eerste stap; een gate pas als dezelfde fout
na T07 opnieuw wordt gemaakt.

## Expliciet buiten scope

- De geldparser, maximumbedragen en de bevestigingsdrempel (blijven).
- Een nieuw backendcontract of idempotentie (#143).
- Auth-/loginformulieren in portal en beheer, wachtwoordchecklist (ongewijzigd).
- PIN-toetsenbord (al afgedekt).
- Draftpersistentie en tabwissel (T03/#137).
- Layout, kolommen en responsiviteit (T04, klaar), productafbeeldingen (#146).
- Het onderscheiden van gelijknamige leden met extra persoonsgegevens.
- Zoeken in `LedenLijst`/`LogboekLijst`, fuzzy search, zoeken op categorie.
- Bewaren van zoekterm of categorie na een volledige reload.

## Besluiten Bram

Genomen op 2026-10-02 (aanbevelingen goedgekeurd):

1. **D3:** een categorieklik wist de zoekterm; resultaatregel plus knop "Wis
   zoekterm"; `verkoop.md` §1 in dezelfde stap bijwerken.
2. **Lidwissel:** aankondigen en inline bevestiging ("Wissen en kiezen" /
   "Terug"), alleen bij een ander lid en een gevuld mandje.
3. **Veldfouten:** bij blur of tik op de knop, `tehoog` direct, herstel direct,
   knop blijft actief; bestaande tests op "knop disabled bij ongeldig bedrag"
   bewust aanpassen.
4. **Ledenzoeker:** eerste resultaat automatisch actief, geen lijst bij lege
   invoer, Escape sluit eerst de lijst dan wist de tekst, namen wrappen over zoveel
   regels als nodig (aangepast door besluit 11; eerder "over twee regels").
5. **Teksten:** de tabel hieronder is goedgekeurd (inclusief `1.000,50` als
   "ongeldig", zonder aparte hint).
6. **Drempels:** geen maximum aantal leden (de lijst scrolt), resultaten vanaf 1
   teken.
7. **Volgorde met T03:** vervallen; PR #137 is gemerged.
8. **PIN-mismatch:** ongewijzigd (`PincodeSheet` toont al "Codes komen niet
   overeen").
9. **"Wis zoekterm":** zet `category` terug op "Alle" (optie B), niet op de
   eerder gekozen categorie.
10. **Ledenlijst na tabwissel:** blijft gesloten tot de eerste toets of
    ArrowDown (optie B), ook als `memberQuery` nog tekst bevat.

Genomen op 2026-10-02 ("Pak de aanbevelingen"):

11. **Namen zonder regelklem:** namen in de ledenlijst en het lidkaartje wrappen
    over zoveel regels als nodig, zodat "de Wit" en "de Witt" onderscheidbaar
    blijven. Overruled "namen over twee regels" in §3 en besluit 4.
12. **"Wis zoekterm" en leeg zoekveld:** `category` gaat terug op "Alle", ook als
    de zoekterm met backspace of handmatig leeg wordt gemaakt.
13. **Enkelvoud:** "1 product" en "1 lid gevonden" (grammaticaal enkelvoud van de
    goedgekeurde sjablonen) is goedgekeurd.
14. **Focusdoelen:** na "Wis zoekterm" naar het zoekveld; na "Wissen en kiezen"
    naar de lidnaam in het lidkaartje (`tabIndex={-1}`); het vangnet-effect in
    `Mandje` voor "lid verdwijnt tijdens bevestiging" blijft staan (vrijwel
    onbereikbaar).
15. **Knoppen die disabled blijven zonder veldverklaring:** (aanbeveling
    overgenomen) ongewijzigde invoer en lege verplichte velden blijven bewust
    `disabled` zonder tekst: leeg eigen-bedragveld bij de negatieve limiet,
    ongewijzigde prijs of e-mail bij Product beheren en Lid beheren, lege naam of
    niet gekozen categorie bij Nieuw product en Nieuw lid. Er wordt geen tekst
    bedacht. Voor het lege limietveld bij een tik levert Bram later zelf een
    tekst aan; tot dan geldt de knop als `disabled` en gebeurt er niets. Dat is
    geen blokkade voor deze PR.

Goedgekeurde teksten (Nederlands, in de stijl van `messages.ts`):

| Soort | Veld | Tekst |
|---|---|---|
| leeg (bij poging) | bedrag | "Kies een bedrag of typ er een." |
| leeg | prijs | "Vul een prijs in." |
| ongeldig | bedrag/prijs | "Vul een bedrag in zoals 5 of 5,50." |
| teveelDecimalen | bedrag/prijs | "Maximaal twee decimalen, bijvoorbeeld 5,50." |
| negatief | bedrag/prijs | "Het bedrag mag niet negatief zijn." |
| nul | opwaarderen/prijs | "Het bedrag moet meer dan € 0 zijn." |
| tehoog | opwaarderen | bestaand: "maximaal € 500,00 per opwaardering" |
| ongeldig | e-mail | "Dit lijkt geen e-mailadres. Controleer het adres, bijvoorbeeld naam@voorbeeld.nl." |
| lidwissel-aankondiging | mandje | "De bestelling ({n} stuks) staat nog klaar. Kies je een ander lid, dan wordt de bestelling geleegd." |
| lidwissel-bevestiging | mandje | "Bestelling wissen en verder met {naam}?" (knoppen "Wissen en kiezen", "Terug") |
| resultaat zoeken | assortiment | "{n} producten voor "{term}" in alle categorieën" / "Geen producten voor "{term}"" met "Wis zoekterm"; enkelvoud "1 product voor "{term}" in alle categorieën" (besluit 13) |
| resultaat leden | zoeker | "{n} leden gevonden" / bestaand "geen leden gevonden"; enkelvoud "1 lid gevonden" (besluit 13) |

## Open vragen voor Bram

Alle beantwoord. Vraag 9 en 10 op 2026-10-02, vraag 15 (disabled-knoppen zonder
veldverklaring) ook (zie "Besluiten Bram", punt 9, 10 en 15). Alleen de tekst
voor het lege limietveld bij een tik moet Bram nog zelf aanleveren; die staat
bij de backlog en blokkeert niets.

## Zoals gebouwd

Gebouwd in PR #152 (issue #127, T07), gemerged als `3a8d13e`. De Reviewer
oordeelde de PR merge-klaar. Geen datamodel-, RPC- of policywijzigingen, geen
ADR (zoals gespecificeerd).

**Onderdelen**

- `src/lib/veldFouten.ts`: classificatie (`bedragFout` met `BedragFout`: leeg,
  ongeldig, teveelDecimalen, negatief, nul, tehoog; `emailFout` via
  `isValidEmailFormat`) en de gebruikerstekst die daarbij hoort voor alle
  formulieren: `bedragFoutTekst` (per soort, `tehoog` heeft hier bewust geen
  tekst: de grens hoort bij het scherm) en `EMAIL_ONGELDIG_TEKST`. De spec
  noemde hiervoor oorspronkelijk `messages.ts`; die teksten staan dus in
  `veldFouten.ts`. De waarde zelf blijft van `parseEuroToCents` in `money.ts`;
  er wordt hier nooit een bedrag berekend.
- `src/hooks/useVeldMoment.ts`: houdt alleen de vlaggen `aangeraakt` (blur),
  `pogingGedaan` en `pogingAlert` (alleen direct na een poging) bij. Het
  beslist niet zelf of een fout zichtbaar is: elke consument combineert de
  vlaggen met zijn eigen classificatie. De directe `tehoog`-regel zit alleen
  in `OpwaarderenOverlay` (`amountTooHigh`); direct herstel volgt uit het
  opnieuw berekenen van de classificatie bij elke wijziging.
- `src/components/TekstVeld.tsx`: additieve props `fout`, `foutAlert` en `hint`;
  `TekstVeld` koppelt `aria-invalid` en `aria-describedby` zelf aan het input.
  De geexporteerde `VeldFout` rendert alleen de melding en zet `role="alert"`
  alleen als zijn `alert`-argument waar is; invoervelden met eigen opmaak
  (bijvoorbeeld in `OpwaarderenOverlay`) gebruiken `VeldFout` zelf en moeten
  `aria-invalid`/`aria-describedby` zelf koppelen. Bestaande aanroepen blijven
  werken.
- `src/components/LidZoeker.tsx`: de ledenzoeker als combobox. De toetsen
  (pijltoetsen, Enter, Escape eerst lijst dan tekst) zitten in
  `LidZoeker.handleKeyDown`; laden/fout/nulresultaten en de resultaatregel met
  enkelvoud zitten in het component zelf (de teksten staan in
  `LidZoeker.tsx`).
- `src/hooks/useListbox.ts`: gedeelde state en DOM-gedrag van `LidZoeker` en
  `Select.tsx`: id's (`aria-controls`/`aria-activedescendant`), open- en
  actieve-optiestate, sluiten bij een klik buiten het component en de actieve
  optie in beeld scrollen. Geen toetsenbordlogica: de toetsen blijven in
  `LidZoeker.handleKeyDown` en `Select.handleKeyDown`.
- `src/features/verkoop/productFilter.ts`: `filterProducten` filtert alleen op
  zoekterm (alle categorieen) of categorie. De resultaatregel en het
  categorieklikgedrag van D3 (klik wist de zoekterm) zitten in `Assortiment`;
  de tekst `zoekResultaatTekst` staat in `src/features/verkoop/messages.ts`.
- `src/features/verkoop/cart.ts`: `lidwisselWistMandje(lastMemberId, memberId,
  aantalRegels)` is een zuiver predicaat (geen mutatie): de ene regel voor
  `VerkoopScherm.chooseMember` (die het mandje daadwerkelijk wist) en `Mandje`
  (die eerst de inline bevestiging toont). `verkoop.md` blijft kloppen:
  "wissel" wist het mandje niet, pas het kiezen van een ander lid doet dat.

**Afwijkingen en besluiten tijdens de bouw (besluit 11 t/m 15)**

- Geen regelklem: namen wrappen over zoveel regels als nodig (11; vervangt
  "twee regels" uit §3).
- Backspace of handmatig leegmaken van het zoekveld zet `category` terug op
  "Alle", net als "Wis zoekterm" (12).
- Enkelvoud: "1 product" en "1 lid gevonden" (13).
- Focusdoelen: na "Wis zoekterm" naar het zoekveld; na "Wissen en kiezen" naar
  de lidnaam in het lidkaartje (`tabIndex={-1}`); het vangnet-effect in
  `Mandje` ("lid verdwijnt tijdens bevestiging") blijft staan (14).
- Disabled-knoppen zonder tekst zijn bewust: ongewijzigde invoer en lege
  verplichte velden (leeg eigen-bedragveld bij de negatieve limiet, ongewijzigde
  prijs of e-mail, lege naam of categorie) blijven `disabled`, er is geen
  tekst bedacht (15).

**Bewust gewijzigd productcontract.** De primaire knoppen (Opwaarderen, prijs,
e-mail en bedragvelden in beheer) zijn niet meer `disabled` bij een ongeldig
bedrag of e-mailadres: de tik toont de veldfout en voert niets uit. Bestaande
tests op "knop disabled bij ongeldig bedrag" zijn daarop aangepast (besluit 3).

**Tester- en CI-bevindingen**

- Tester: twee focusbugs waarbij de focus op `body` terechtkwam (na "Wis
  zoekterm" en na "Wissen en kiezen"); gefixt in `1a171d5`.
- CI: `a11y.spec.ts` (regel 740) verwachtte opties in de beheer-ledenlijst, maar
  die heeft knoppen; de test opent Lid beheren nu via de knop. Gefixt in
  `4c259f4`.

**Niet gedekt**

- Handmatig, nog niet uitgevoerd: schermlezer, Safari, fysieke tablet. Geen
  claim over werking daarop.
- Het vangnet-effect in `Mandje` ("lid verdwijnt tijdens bevestiging") is niet
  via e2e bereikbaar en alleen via een componenttest te testen.

## Backlog (niet-blokkerende Reviewer-punten, geen besluit)

- Tekst voor het lege eigen-bedragveld bij de negatieve limiet bij een tik
  (besluit 15): nog door Bram aan te leveren.
- Zichtbare focusring of `aria-live` voor de lidnaam met `tabIndex={-1}` in het
  lidkaartje (besluit 14).
- `NegatieveLimietInstellingen` maakt het eigen-bedragveld tijdens opslaan niet
  `readOnly` (pre-existing, strijdt met het pending-model uit T06).
- Hover-contrast van `hover:bg-accent` valt onder T12
  ([#132](https://github.com/BramLambertJansen/ABAS/issues/132)).
