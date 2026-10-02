# Dialogen, tabs en landmarks herstellen

**Status: goedgekeurd door Bram** (besluiten onderaan, "Besluiten van Bram").

Spec voor [issue #125](https://github.com/BramLambertJansen/ABAS/issues/125)
(frontend T05 · P1, epic #121, findings F05, F17, F28). Levert het gedeelde
dialoog- en tabcontract voor
[#126](https://github.com/BramLambertJansen/ABAS/issues/126) (T06, opslaan/
sluiten/pending) en [#131](https://github.com/BramLambertJansen/ABAS/issues/131)
(T11, beheerformulieren), en stemt af met
[#43](https://github.com/BramLambertJansen/ABAS/issues/43) (T03, verkoopdraft
in `DienstTabs`).

## Doel

Elke dialoog en elke tabbalk in beide shells gedraagt zich voorspelbaar met het
toetsenbord en assistive technology: Tab en Shift+Tab verlaten een open dialoog
nooit, de achtergrond is niet bedienbaar zolang de dialoog open is, sluiten
volgt één contract, focus komt op een zinnige plek terug, tabs reageren op de
pijltjestoetsen met één tabstop, en het actieve barscherm heeft één
main-landmark. Dit ticket levert geen verklaring van volledige
WCAG-conformiteit.

## Gelezen bronnen

- **Ticket en afhankelijke tickets** (#125, #126, #131, #43), volledig gelezen.
- **Wireframe:** geen visuele wijziging gevraagd. De bestaande chrome
  (`designs/Bar App.dc.html` icon-rail, `designs/Lid App.dc.html` tabbalk en
  sheet) blijft; alleen gedrag en semantiek veranderen.
- **Code:** `src/components/Overlay.tsx`, `src/components/OverlayPresence.tsx`,
  `src/features/portal-dashboard/PortalDashboard.tsx`,
  `src/features/assortimentbeheer/BeheerTabs.tsx`,
  `src/features/verkoop/DienstTabs.tsx`, `VerkoopScherm.tsx`,
  `DienstActief.tsx`, `LedenLijst.tsx`, `TerugdraaienOverlay.tsx`, en de
  `Overlay`-consumenten (19 `<Overlay>`-gebruiken in `src/features/`; er is
  geen eigen `role="dialog"` daarbuiten).
- **Kaders:** `CLAUDE.md` (Verificatie, "Componenten zijn herbruikbaar"),
  `docs/ARCHITECTURE.md` (`useShell().overlay`, Overlay presence), ADR 0014.

## Hervalidatie van de auditbevindingen

Gedaan door de actuele code te lezen (HEAD `9f8e05b`), niet in een browser.
De reproductie in de browser is aan de Developer/Tester (zie Teststrategie).

**F05, focusval lekt: bevestigd.** In `Overlay.tsx`:

- De beginfocus staat op de dialoogcontainer (`tabIndex={-1}`, `dialogRef.focus()`).
  De Tab-afhandeling vergelijkt `document.activeElement` alleen met het eerste
  en laatste focusbare element. Staat de focus op de container zelf, dan
  volgt bij Shift+Tab de browserstandaard en verlaat de focus de dialoog.
  Hetzelfde geldt zodra de focus op een element staat dat niet in de lijst zit
  (bijvoorbeeld een `tabindex="-1"`-titel via `titleRef`, of een element dat
  net disabled werd).
- Er is geen vangnet als de focus er toch buiten belandt (`focusin`-bewaking
  ontbreekt), en de achtergrond is niet `inert` of `aria-hidden`. De
  overlay wordt inline gerenderd binnen het panel van de feature (geen portal),
  dus de rest van de pagina blijft in de toegankelijkheidsboom.
- `FOCUSABLE_SELECTOR` kent geen zichtbaarheid: elementen in een
  `hidden`/`display:none`-tak of binnen een `disabled` `fieldset` tellen mee.
- **Scrolllock bestaat niet.** Het ticket vraagt "scrolllock wordt na sluiten
  opgeruimd". Er is niets om op te ruimen (`grep` op `body.style`/
  `overflow`-lock geeft niets). De achtergrond kan dus onder de dialoog
  scrollen. Dit is dus een nieuwe eis, geen herstel.
- Focus bij sluiten: `previouslyFocused.focus?.()` zonder controle of dat
  element nog bestaat of focusbaar is. Is de trigger verdwenen of disabled,
  dan valt de focus op `body`. Waar de trigger blijft bestaan, werkt het nu.
- Overgang `LidBeherenOverlay` → `LidBestellingenOverlay` →
  `TerugdraaienOverlay`: `LedenLijst` zet een state `overlay` en mount telkens
  één overlay. De unmount-cleanup van de ene draait vóór de mount-effecten van
  de volgende, dus de volgende leest nu toevallig de oorspronkelijke trigger
  (rij in de ledenlijst) als terugkeerdoel. Dat is geen ontwerp, en breekt
  zodra die rij na een refetch een ander element is. Dit contract maakt het
  expliciet en test het.
- Sluitpogingen tijdens een geldmutatie: `AfrekenenOverlay` en
  `TerugdraaienOverlay` hebben een eigen `handleClose` met `if (pending)
  return`. Er is geen gedeeld contract; Escape, backdrop en knop lopen via
  dezelfde `onClose`, dus daar is het gelijk, maar de gebruiker krijgt geen
  melding dat sluiten geblokkeerd is. Beheerformulieren (F10 in #126) hebben
  niets.
- Backdrop-sluiting luistert op `mousedown` op `document`, niet op touch/pointer.
  Bepaal bij de bouw of `pointerdown` beter past (zie open vraag 6).

**F17, tabs zonder toetsenbordbediening: bevestigd.** `PortalDashboard`
(3 tabs), `BeheerTabs` (3 tabs, 5 voor beheerder) en `DienstTabs` (2 tabs,
`RailTab`) zijn drie kopieën van hetzelfde patroon: `role="tab"` op een
`<button>` zonder `tabIndex`-beheer en zonder `onKeyDown`. Alle tabs staan in
de Tab-volgorde, pijltjes doen niets. `aria-controls` verwijst naar een
`id` van een panel dat alleen bestaat terwijl de tab actief is (elk panel
wordt voorwaardelijk gerenderd, bewust, zie het docblock), dus voor de
inactieve tabs wijst het naar niets. `DienstTabs` heeft wel
`aria-orientation="vertical"`, de andere twee zijn horizontaal (impliciet
default). De drie bestanden verwijzen naar elkaar als "referentie", er is
geen gedeelde implementatie.

**F28, geen main-landmark op het actieve barscherm: bevestigd.**
`DienstTabs` rendert een `div` rond rail en panels, en de panels zijn `div`s;
`VerkoopScherm` en `DienstActief` hebben elk een `header` maar geen `main`.
`BarApp`, `DienstStarten`, `HervatScherm`, `BarInloggen` en `BeheerTabs` en
`PortalDashboard` hebben wel een `main`. Op de actieve verkoopweergave is dus
niets main. Bijkomend (niet in het ticket genoemd, wel dezelfde plek):
`DienstTeLangOpenMelding` en `AdminMeldingen` zijn siblings van de panels in
dezelfde `div` en dus buiten elke landmark, wat de axe-regel `region` verklaart.
Het ticket zegt zelf dat `landmark-one-main` en `region` best-practice-regels
zijn en geen bewezen WCAG-overtreding; de spec behandelt ze als zodanig.

## Gekozen aanpak

**Bestaande `Overlay` verbeteren, geen nieuwe dialogcomponent of
componentbibliotheek.** Redenen: `Overlay` heeft 19 gebruiken die
allemaal op `title`/`description`/`onClose`/`titleRef` leunen, ADR 0014 bouwt
erop, en het ticket sluit een bibliotheekmigratie uit. De publieke props blijven
compatibel; nieuwe props zijn optioneel.

**Voor tabs een klein gedeeld primitive**, omdat drie kopieën het probleem
zijn (CLAUDE.md: duplicatie is een reviewfout). Gedrag gescheiden van
shellstyling: het primitive bepaalt rollen, focus en toetsen; elke shell geeft
zijn eigen klassen mee.

### 1. Overlay: focusinsluiting

Binnen `Overlay.tsx`, interface ongewijzigd:

- **Tab/Shift+Tab** worden berekend ten opzichte van de lijst van *actueel
  focusbare* elementen in de dialoog (zichtbaar, niet disabled, niet
  `tabindex="-1"`, niet in een `inert`/`hidden`/disabled-`fieldset`-tak). Staat
  `document.activeElement` niet in die lijst (container, titel, een net
  disabled geworden element, of buiten de dialoog), dan gaat Tab naar het eerste
  en Shift+Tab naar het laatste element. Is de lijst leeg, dan blijft de focus
  op de container.
- **`focusin`-bewaking** op `document`: komt de focus buiten de dialoog terecht
  (muis, programmatisch, schermlezer), dan terug naar de laatst bekende
  focusbare positie in de dialoog, anders de container.
- **Zichtbare focus:** de container heeft `focus:outline-none`. Dat blijft
  toegestaan voor de container zelf (hij is geen bedieningselement), maar
  elk element binnen de dialoog houdt een zichtbare focusring; de Developer
  controleert dit in de dialogen waar `outline-none` op titels staat.

### 2. Overlay: achtergrond afschermen

De overlay blijft inline gerenderd (geen portal): een portal verandert de
DOM-structuur voor alle consumenten en vraagt client-only mounten om
hydratieverschillen te voorkomen. In plaats daarvan, bij mount:

- Loop van de dialoog omhoog naar `body`. Zet op elke sibling die geen
  voorouder van de dialoog is `inert` (dat sluit toetsenbord, muis en
  toegankelijkheidsboom af in één attribuut).
- Bewaar per element de oorspronkelijke waarde. Houd een teller bij zodat een
  overgang overlay A → B (unmount en mount in één commit) de achtergrond niet
  heropent, en herstel pas bij de laatste overlay.
- Bij unmount: herstel wat de overlay zelf gezet heeft, laat niets achter.
- Gevolg dat bewust geaccepteerd wordt: wat in een sibling van de overlay-tak
  staat (bijvoorbeeld `AdminMeldingen`, de rail en `DienstTeLangOpenMelding`
  buiten het panel) is tijdens een dialoog niet bedienbaar. ADR 0014 laat de
  melding toch al wachten tot er geen overlay open is.
- De backdrop (de `fixed inset-0`-wrapper) is onderdeel van de overlay en dus niet
  inert.

### 3. Overlay: scrolllock

Bij mount de scroll van het document vergrendelen, bij unmount exact de
vorige waarde terugzetten, via dezelfde teller als hierboven (geen race bij
overgang A → B, geen blijvende lock na sluiten). Eigen scroll in de dialoog
(`overflow-auto`, `max-h-[88vh]`) blijft werken. Geen layoutverspringing: houd
rekening met scrollbarbreedte op desktop (`scrollbar-gutter` of compensatie,
keuze van de Developer, zie Randgevallen).

### 4. Sluit- en pendingcontract (gedeeld met #126)

Dit is het contract dat T06 gebruikt. T05 levert het mechanisme, T06 past het
toe op de beheeroverlays.

`Overlay` krijgt twee optionele props:

- `closeBlocked?: boolean`. Standaard `false`. Zolang `true` doet **elk**
  sluitpad hetzelfde: Escape, backdrop, en de door `Overlay` zelf aangeboden
  sluitacties negeren het sluitverzoek en roepen `onClose` niet aan. In plaats
  daarvan meldt `Overlay` dat sluiten nu niet kan (zie hieronder). De
  consument blijft verantwoordelijk voor zijn eigen knoppen (Sluiten,
  Annuleren): die moeten `disabled` zijn of dezelfde vlag volgen.
- `closeBlockedMessage?: string`. Tekst voor de melding. Zonder tekst geldt de
  standaardtekst uit open vraag 3.

Pendingstatus:

- `Overlay` zet `aria-busy="true"` op de dialoog zolang `closeBlocked` waar is
  (dit is statusinformatie, geen vervanging voor een zichtbare "bezig…"-tekst
  bij de actie zelf; die blijft bij de consument).
- De melding "sluiten kan nu niet" is een `role="status"`-regio in de dialoog,
  altijd gemount (alleen de tekst wisselt), zodat een schermlezer hem
  aankondigt. Geen `alert`: dit is geen fout.
- Er gebeurt niets stil: een geblokkeerde Escape of backdrop-klik laat de focus
  waar hij is.

Wat T05 **niet** besluit en T06 wel: wat een formulier doet bij onopgeslagen
invoer, serialiseren van mutaties per object, en of een lopende opdracht na
sluiten zichtbaar buiten de dialoog doorloopt. Het contract hierboven
(blokkeren) is de variant die het ticket "blokkeren tijdens opslaan" noemt.
Kiest Bram in T06 voor "taak buiten de dialoog", dan is `closeBlocked` er
simpelweg niet voor nodig. Het huidige gedrag van `AfrekenenOverlay`,
`TerugdraaienOverlay` (eigen `handleClose` met `if (pending) return`) en
andere geldbevestigingen wordt omgezet naar `closeBlocked`, zonder hun
bescherming te verzwakken: de pending-bescherming moet na de omzetting nog
steeds aantoonbaar werken (bestaande specs en een E2E-test, zie
Teststrategie).

### 5. Overlay: focus terug

- Bij mount: onthoud het element dat de focus had (de trigger).
- Bij unmount: focus naar de trigger **als die nog verbonden, zichtbaar en niet
  disabled/inert is**. Anders naar een logische opvolger in deze volgorde:
  (1) een door de consument meegegeven `returnFocusFallback`
  (`RefObject<HTMLElement | null>`, optioneel), (2) het actieve
  `role="tabpanel"` of anders de dichtstbijzijnde `main`, waarop de container
  daarvoor `tabIndex={-1}` krijgt, (3) `body`-niet-focusbaar blijft alleen
  over als er niets is, wat in de app niet voorkomt.
- **Overgang overlay A → overlay B** (ledenbeheer → bestellingen →
  terugdraaien): B onthoudt als trigger niet het element dat toevallig tijdens
  de overgang de focus heeft, maar neemt de trigger van A over, zodat sluiten
  van B bij het oorspronkelijke doel uitkomt. Mechaniek is aan de Developer
  (bijvoorbeeld de gedeelde teller uit stap 2 die het eerste onthouden
  trigger bewaart tot de laatste overlay sluit). Zolang A → B gebeurt, staat
  de focus nooit buiten de actieve dialoog of op de inerte achtergrond.
- Is de trigger weg doordat de actie hem verwijderde (bijvoorbeeld een
  bestelling die na terugdraaien uit de lijst verdwijnt, of een lid dat
  gearchiveerd werd en uit een gefilterde lijst valt), dan geldt de
  opvolger-keten hierboven. Consumenten waar een nette opvolger bekend is
  (de lijst zelf) geven `returnFocusFallback` mee. Welke consumenten dat nodig
  hebben, bepaalt de Developer per overlay tijdens het bouwen en zet hij in
  de PR-beschrijving.

### 6. Tabs: gedeelde gedragsbasis

Eén primitive in `src/components/` (naam en exacte vorm aan de Developer; de
spec vraagt het gedrag, niet de API), plus de pure toetslogica in
`src/lib/` zodat `npm test` (`node --test`) hem kan testen zonder browser:

- **Roving tabindex, één tabstop:** alleen de geselecteerde (of bij manuele
  activatie de gefocuste) tab heeft `tabIndex={0}`, de rest `-1`. Tab vanuit de
  tablist gaat naar het volgende focusbare element: in de bar-rail is dat eerst
  Uitloggen (DOM-volgorde nav, main), op portal en beheer het panel (of het
  eerste focusbare element erin).
- **Orientatie:** `orientation: "horizontal" | "vertical"`, gezet als
  `aria-orientation` op de `tablist`. Horizontaal: Links/Rechts; verticaal
  (de bar-rail): Omhoog/Omlaag. De andere as doet niets (scrolt niet de
  pagina als de pijl door de tablist is afgehandeld). Home en End naar eerste
  en laatste tab. Wrap-around aan beide uiteinden (APG-patroon).
- **Activatie:** zie open vraag 4. Het primitive ondersteunt `automatic`
  (pijl selecteert en toont) en `manual` (pijl verplaatst alleen de focus,
  Enter/Space activeert), zodat de keuze per tabbalk een prop is en geen
  herschrijving.
- **Ids en relaties:** elke tab en elk panel krijgt een stabiele,
  gegenereerde id (nu hardgecodeerde `"verkoop-panel"` en dergelijke naast
  `useId`). `aria-controls` mag alleen gezet worden op de actieve tab, waarvan
  het panel gemount is; inactieve tabs krijgen het attribuut niet. Het
  bestaande beleid "panels alleen gemount terwijl actief" blijft zoals het is
  (verse data per tab); #43 kan dat voor Verkoop wijzigen (zie Afstemming).
  `aria-labelledby` van het panel verwijst naar de tab.
- **Verborgen tabs:** de beheer-tabs Diensten en Logboek bestaan alleen voor
  de rol beheerder. Pijlnavigatie slaat niet-gerenderde tabs over doordat ze
  niet in de lijst staan; de lijst is wat gerenderd is.
- **Labels:** de `aria-label`s `Portaal-navigatie`, `Beheer-navigatie` en
  `Dienst-navigatie` blijven.
- **Styling blijft per shell:** de primitive neemt `className`-functies of
  render props voor selected/unselected; de portal-pillen, beheer-pillen en
  de rail veranderen visueel niet. De oranje streep van de rail blijft
  `aria-hidden`.
- `useShell()` is hier niet nodig: de oriëntatie volgt uit de plaats van de
  tablist (rail = vertical), niet uit het apparaat. Dat is conform de regel
  geen device-sniffing.

### 7. Landmarks

- **`DienstTabs`:** het panelgebied (tabpanel + inhoud) wordt het enige
  `main`-element van het actieve barscherm. Een element kan niet tegelijk
  `main` en `tabpanel` zijn, dus het `main` omhult het
  `role="tabpanel"`-element (bestaande panelstructuur blijft), het is niet
  het panel zelf. De rail blijft `nav` met
  `aria-label="Bar"`. Eén `main`, de rail ervoor in de DOM-volgorde (nav,
  main, dan de meldingen), zodat de leesvolgorde logisch is.
- **Meldingen:** `DienstTeLangOpenMelding` en `AdminMeldingen` krijgen een
  eigen plek in een benoemde regio of in `main` zodat `region` niet meer
  klaagt. Precieze vorm (bijvoorbeeld `role="region"` met `aria-label`) aan
  de Developer; geen nieuwe zichtbare chrome.
- **Panelnamen:** `aria-labelledby` bestaat al; de `h1`'s ("Bar", "Dienst")
  in de schermen blijven de paginatitels. Controleer dat er per scherm één
  `h1` is.
- **Portal en beheer behouden hun structuur** (`main` + `header`), zoals het
  ticket vraagt. Alleen de tablist-gedragsbasis verandert daar.
- **Dienst-variant:** het tabblad Dienst valt onder dezelfde `main`.
- **Dialoogachtergrond:** omdat de achtergrond inert wordt, ziet axe geen
  dubbele landmarks onder de open dialoog; de Developer scant dit expliciet
  (zie Teststrategie).

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC:** niet geraakt. Geen bedragen, geen RPC, geen
  clientberekening. De enige link met geld is dat de bestaande
  sluitbescherming van `AfrekenenOverlay`, `OpwaarderenOverlay` en
  `TerugdraaienOverlay` na omzetting naar `closeBlocked` moet blijven werken.
- **`served_by` uit bezetting:** niet geraakt.
- **Auth/cookie-isolatie, PIN/wachtwoord:** niet geraakt.
- **Shells:** zie hieronder; geen `check:arch`-wijziging verwacht.

## Betrokken shells

- **`shells/bar`:** `DienstTabs` (verticale rail, `main`-landmark), `BeheerTabs`
  (horizontaal, beheerder en bardienst), alle bar-overlays (modal).
- **`shells/portal`:** `PortalDashboard` (horizontaal), de bottom sheets
  (`NaamWijzigenSheet`, `TweestapSheet`, `PincodeSheet`,
  `WachtwoordWijzigenSheet`, `MijnAccountOverlay`-pad) via `Overlay` in
  `sheet`-variant.
- **Gedeeld:** `Overlay` en het tabprimitive staan in `src/components/` en zijn
  shell-onwetend; de features importeren ze, zoals nu. Het gedrag is in beide
  shells gelijk; alleen layout verschilt via `useShell().overlay` (bestaand).
  Geen nieuwe capability in `useShell()` nodig. Moet een shell-capability
  blijken te ontbreken, dan is dat een signaal om terug te komen bij de
  Architect, geen device-check in de component.

## Datamodel, RPC's, rolzichtbaarheid

**Geen datamodelwijziging, geen nieuwe of gewijzigde RPC, geen migratie, geen
wijziging in rolzichtbaarheid.** Zo bevestigd door de feature-inventaris: alle
wijzigingen zitten in `src/components/Overlay.tsx`, het nieuwe tabprimitive,
`src/lib/` (pure toetslogica) en de drie tab-features plus `DienstTabs`.
Daarmee zijn er geen `db:test`-, `check:rls`- of `rpc_catalogus`-gevolgen.
Bar-rol- en lidzichtbaarheid veranderen niet: dezelfde tabs zijn per rol
zichtbaar als nu (Diensten en Logboek alleen voor beheerder).

## ADR nodig?

**Nee, bevestigd.** Dit is geen beslissing die een volgende feature kan
tegenspreken buiten wat er al staat: ADR 0014 (overlay-aanwezigheid) blijft
geldig en wordt niet geamendeerd, `Overlay` blijft de enige dialoog
(bestaand beleid, CLAUDE.md "Componenten zijn herbruikbaar"). Het
sluit-/pendingcontract wordt vastgelegd in deze spec en in de docblocks
van `Overlay`; het hoeft niet in een ADR. Wordt het later een
terugkerende fout dat iemand een `role="dialog"` buiten `Overlay` bouwt, dan
is de gate-suggestie uit ADR 0014 de volgende stap (`check:policy`-regel). Zie
ook "Gate-signaal" hieronder.

`docs/ARCHITECTURE.md` krijgt bij oplevering een korte aanvulling onder
`useShell().overlay` (focus, inert, scrolllock, `closeBlocked`) en bij het
tabprimitive; dat doet Docs na de merge, zoals de werkstraat voorschrijft.

## Afstemming met afhankelijke tickets

- **#126 (T06):** bouwt voort op `closeBlocked`/`closeBlockedMessage` en het
  focus-terugcontract. T05 moet dus eerst gemerged zijn, of in dezelfde
  PR-reeks vóór T06. Conflictvlak: `ProductBeherenOverlay`,
  `LidBeherenOverlay`, `NieuwLidOverlay`, `MijnAccountOverlay`,
  `BezettingOverlay`. T05 raakt die bestanden alleen als de omzetting van een
  bestaand `handleClose` naar `closeBlocked` er nodig is (Afrekenen,
  Terugdraaien, Opwaarderen-bevestiging, Dienst afsluiten); de beheerformulieren
  zijn van T06.
- **#131 (T11):** de grotere ledendetailvariant (F24) hangt af van dit
  contract. T05 maakt `Overlay` niet breder of anders van vorm; de
  detailvariant (vaste titel/sluitactie, ruimer paneel) is T11. Wat T05
  voor T11 vastlegt: een variant mag de layout van het venster wijzigen,
  niet de focus-, inert-, scrolllock- of sluitregels.
- **#43 (T03):** raakt dezelfde `DienstTabs`. Als T03 de verkoopdraft boven de
  panels tilt of Verkoop altijd gemount houdt, verandert dat de panelrelaties
  (voor Verkoop zou het panel dan altijd bestaan en verborgen worden met
  `hidden`; `aria-controls` mag dan permanent gezet worden). Het tabprimitive
  moet beide aan kunnen: een tab zonder gemount panel krijgt geen
  `aria-controls`, een tab met een verborgen gemount panel wel, en het
  verborgen panel krijgt `hidden` (en dus ook `inert` als het gemount blijft,
  zodat de Tab-volgorde niet in een verborgen panel valt). Ook de
  versheidsvraag verschuift: verse data bij terugkeer mag niet afhangen van
  unmounten (T03-eis). Volgorde: wie als eerste merget, past zijn rebase aan;
  de twee veranderen bijna alles in `DienstTabs.tsx`. Voorstel: T05 doet het
  tabprimitive + main-landmark in `DienstTabs`, T03 bouwt daarop de
  draftstate, beide in overleg met Bram (open vraag 7).

## Randgevallen

- **Dialoog zonder focusbare inhoud:** focus blijft op de container; Tab doet
  niets; Escape sluit (of meldt blokkade).
- **Een control die tijdelijk disabled wordt tijdens pending** (de "bezig…"-knop
  waar de focus op stond): `disabled` laat de browser de focus op `body`
  laten vallen. Door de `focusin`-bewaking en de focusbare-lijst komt de focus
  terug op de container of het logische element in de dialoog. Het ticket noemt
  dit expliciet ("tijdelijk disabled controls").
- **Lange dialoog:** de dialoog scrolt zelf; een focusverplaatsing naar een
  element onderin scrolt het in beeld (standaardgedrag, `scrollIntoView` niet
  nodig).
- **Meldingen die opkomen tijdens een open dialoog:** blijven wachten
  (ADR 0014). Een toast binnen de overlay-tak blijft bedienbaar.
- **Tweede overlay tegelijk:** blijft verboden (ADR 0014, "nooit twee overlays
  tegelijk"). De teller voor inert/scrolllock is dus uitsluitend bedoeld voor de
  opeenvolgende overgang, niet voor stapelen.
- **Resize/orientatie** (tablet roteren) terwijl de dialoog open is: lock en
  inert blijven staan, ze zijn niet aan afmetingen gebonden.
- **iOS Safari/Android:** inert wordt breed ondersteund (alle huidige
  evergreen-browsers); een browser zonder `inert` negeert het attribuut
  zonder foutmelding, en dan blijft de `aria-modal`-bescherming over. De audit
  heeft Safari en touch niet bewezen, dus dit wordt niet als bewezen gemeld
  (zie open vraag 8).
- **Scrollbarbreedte** bij vergrendelen op desktop: geen verspringende layout.
- **Een tabbalk met één tab** (bardienst zonder beheerrechten ziet drie
  beheertabs, nooit één): geen speciaal geval nodig; pijlen blijven op die tab.
- **Pijltoetsen in een tablist op de portal met schermlezer:** de toetsen
  worden alleen afgehandeld als de focus op een tab staat, nooit daarbuiten.

## Teststrategie

De Reviewer controleert deze lijst; de Tester voert de handmatige reeks uit.

**Unit (`npm test`, `node --test`):** de pure toetslogica
(volgende/vorige/Home/End, wrap, orientatie-as, overslaan van niet-bestaande
tabs, leeg en één item). Volgt het patroon van `src/lib/money.ts`-tests.

**E2E (Playwright, in `e2e/`, naast de bestaande specs):** een nieuw bestand
`e2e/dialogen-tabs-landmarks.spec.ts`. Dit zijn assertions op **actieve focus
en achtergrond**, niet alleen axe:

Dialogen (bar en portal; minimaal Afrekenen, Lid beheren, een portal-sheet):
1. Open de dialoog, druk direct Shift+Tab, en assert dat
   `document.activeElement` binnen de dialoog ligt. Hetzelfde met Tab vanaf het
   laatste element, en vanaf het eerste element met Shift+Tab.
2. Met een tijdelijk disabled control (pending, bijvoorbeeld de afrekenknop in
   "bezig…") focus daarbinnen houden: assert dat Tab/Shift+Tab binnen blijven.
3. Assert dat de achtergrond `inert` is (attribuut op siblings, plus
   `toBeHidden` in de toegankelijkheidsboom via `getByRole`-queries voor een
   achtergrondknop) terwijl de dialoog open is, en dat het attribuut
   weg is na sluiten.
4. Assert dat `document.body`/`documentElement` scrolt niet meer terwijl de
   dialoog open is, en na sluiten de oorspronkelijke waarde terug is.
5. Escape, backdrop-klik en de sluitknop sluiten (of weigeren, bij
   `closeBlocked`) identiek; bij blokkade blijft de dialoog open, `onClose` is
   niet aangeroepen, en de `status`-regio toont de melding.
6. Focus terug: na sluiten staat de focus op de trigger; met een verdwenen
   trigger (bijvoorbeeld afrekenen met leeggeraakt mandje) op de opvolger.
7. Overgang lid beheren → bestellingen → terugdraaien: bij elke stap ligt de
   focus in de actieve dialoog, geen stap laat de focus op `body`; na
   het sluiten van de laatste staat de focus op de rij van het lid of de
   opvolger. Geldmutatie met geblokkeerde sluitpoging: gebruik een
   vertraagde route (Playwright `page.route`) zodat de pending-periode
   deterministisch is.

Tabs (portal, beheer, bar-rail):
8. Pijl in de juiste richting verplaatst focus (horizontaal: Links/Rechts,
   verticaal: Omhoog/Omlaag), Home/End werken, wrap-around klopt, de andere
   as doet niets.
9. Precies één tab heeft `tabindex="0"` (assert op alle tabs), de rest `-1`;
   Tab vanuit de tablist gaat naar het volgende focusbare element; in de
   bar-rail is dat eerst Uitloggen (DOM-volgorde nav, main), op portal en
   beheer het panel.
10. `aria-orientation` per tablist, `aria-selected` volgt, `aria-controls` wijst
    uitsluitend naar bestaande id's (assert dat het gerefereerde element in
    de DOM staat).
11. Het afgesproken activatiegedrag (open vraag 4).

Landmarks:
12. Actieve verkoopweergave én Dienst-tab: precies één `main`; `nav` met naam
    "Bar" aanwezig; geen `landmark-one-main`/`region`-melding.
13. Een open dialoog bovenop beide: axe zonder nieuwe meldingen.

**Axe:** `a11y.spec.ts` bevat nu alleen niet-ingelogde routes en een stateful
blok; voeg de actieve verkoop-/dienstweergave en een open dialoog toe aan
het stateful blok, met `wcag2a`, `wcag2aa` en de best-practice-tags voor de
twee F28-regels. De axe-regels voor `region` en `landmark-one-main` worden
voor dit scherm niet uitgezet.

**Handmatig (Tester):** toetsenbordreeks per shell op een echte tablet en een
telefoon: Tab/Shift+Tab-cyclus in een lange dialoog (Lid beheren), schermlezer
(VoiceOver/TalkBack) op tabs en dialoog, Safari en touch. De audit heeft
Safari en touch niet bewezen; zonder deze reeks mag de PR dat niet claimen.

**Regressie:** bestaande e2e-specs die `getByRole("dialog", { name })` en
sluit-pogingen gebruiken moeten ongewijzigd groen blijven; wijzigt een
assertion, dan hoort dat in de PR-beschrijving uitgelegd.

## Gate-signaal

Het ticket levert gedrag dat een gate kan bewaken, en dat past bij de
"regel over regels" in CLAUDE.md. Voorstel (geen onderdeel van dit ticket,
beslissing aan Bram): een `check:policy`-regel "geen `role="dialog"` en geen
`role="tablist"` buiten de twee gedeelde componenten". Dit dekt tegelijk de
toezegging in ADR 0014 en voorkomt een vierde tabkopie. De regel kan met de
oplevering van T05 meekomen omdat dan voor het eerst alle bestaande gebruik via
de gedeelde componenten loopt.

## Expliciet buiten scope

- Een componentbibliotheek (Radix, Headless UI, `<dialog>`-migratie) of een
  stapelbare `Overlay`.
- De grotere ledendetailvariant, sectiefeedback en e-mailuitleg (T11/#131).
- Pending- en onopgeslagen-invoerbeleid van beheerformulieren, serialiseren van
  mutaties (T06/#126), behalve het mechanisme `closeBlocked`.
- Verkoopdraft behouden bij tabwissel (T03/#43), behalve de afstemming hierboven.
- Wijzigingen in layout of visueel ontwerp van tabs, rail, sheets of dialogen.
- Offline/PWA-uitbreiding, geld-/auth-/schemawijzigingen.
- Een verklaring van volledige WCAG-conformiteit.

## Besluiten van Bram

Expliciet door Bram besloten:

- Achtergrond afschermen: ancestor-`inert`, geen portal (vraag 1).
- Scrolllock aan (vraag 2).
- Eén standaardtekst voor `closeBlockedMessage`: "Even wachten, de actie wordt
  nog verwerkt." (door Bram gekozen; vraag 3).
- Tab-activatie: handmatig voor `BeheerTabs` en `PortalDashboard`, automatisch
  voor `DienstTabs` (vraag 4).
- Volgorde: T05 vóór T03 (vraag 7).
- Gate-regel `check:policy` niet in dit ticket (vraag 9).
- Tab vanuit de tablist in de bar-rail: eerst Uitloggen, dan main; de
  DOM-structuur blijft (§6, Teststrategie 9).
- Focusverlies bij pending: wordt een control disabled terwijl `closeBlocked`
  waar is en valt de focus buiten de dialoog, dan gaat de focus naar de
  dialoogcontainer.

Nog niet expliciet door Bram bevestigd; dit is het voorstel uit de spec en
geldt als uitgangspunt: wrap-around (vraag 5), backdrop-sluiting op touch
(vraag 6), browserdoel voor `inert` (vraag 8), gedrag van meldingen onder een
open dialoog (vraag 10).

## Oorspronkelijke open beslissingen (historie)

1. **Achtergrond afschermen: ancestor-`inert` of portal?** Voorstel van
   deze spec: `inert` op siblings van de ancestorketen, geen portal. Alternatief:
   `Overlay` via portal in `body` renderen en `body`-siblings inert maken.
   Bram, wil je het portalalternatief (groter blast radius over alle
   consumenten, wel structureel schoner)? De spec raadt de ancestorvariant aan.
2. **Scrolllock-gedrag:** moet de achtergrondpagina bij een open dialoog
   volledig vastliggen (voorstel), of mag hij nog scrollen? Bestaat daar een
   gewenst gedrag voor de portal-sheet op telefoon?
3. **Tekst van de geblokkeerde-sluit-melding** (`closeBlockedMessage` default).
   Geen standaardtekst verzonnen; welke zin wil je? Bijvoorbeeld in de trant
   van "Even wachten, de opdracht wordt nog verwerkt." Jij beslist de
   formulering en of die per overlay verschilt (geld versus beheer).
4. **Tab-activatie: automatisch of handmatig**, per tabbalk. Elke tab mount
   zijn data bij activatie (bestaand beleid), dus pijlen die direct activeren
   laden bij elke toetsaanslag. Voorstel om te bespreken: handmatig
   (Enter/Space) voor `BeheerTabs` (zware lijsten) en `PortalDashboard`, en
   automatisch voor `DienstTabs` (twee tabs, verkoop-panel is lichtgewicht)?
   Het ticket vraagt om handmatig "als laden merkbare vertraging geeft"; wat
   merkbaar is, is jouw beslissing, en het kan afhangen van T03.
5. **Wrap-around** van de pijltoetsen bij de uiteinden: voorstel ja (APG),
   maar uitgeschakeld voor de rail kan ook. Jouw keuze.
6. **Backdrop-sluiting op aanraking:** nu `mousedown`. Moet een tik op de
   backdrop op de telefoon-sheet sluiten of juist niet (bij de bar-tablet kan
   een per ongeluk verlaten dialoog een lopende bestelling storen)? Pas
   `closeBlocked` toe zodat het geen verschil maakt voor geld, maar
   voor beheerformulieren zonder pending is de huidige "tik buiten sluit"
   nu het gedrag. Behouden?
7. **Volgorde en eigenaarschap van `DienstTabs`** met #43: eerst T05 (tabprimitive
   + `main`) en daarna T03 (draft), of tegelijk in één PR? Wijzigt T03 de
   panels naar altijd-gemount, dan vervalt een deel van de aria-controls-regel
   hierboven.
8. **Browserdoel voor `inert`:** welke minimumversies van Safari/iPadOS en
   Android-browsers moeten de tablet en telefoon ondersteunen? De spec neemt
   evergreen aan en een veilige degradatie naar `aria-modal` bij oudere. Zo
   niet, dan is een polyfill of een portalvariant nodig.
9. **Gate:** wil je de voorgestelde `check:policy`-regel (geen
   `role="dialog"`/`role="tablist"` buiten de gedeelde componenten) meeleveren
   in dit ticket, of apart?
10. **Meldingen in de bar-DOM** (`DienstTeLangOpenMelding`, `AdminMeldingen`):
    mogen die onder een open dialoog onbedienbaar zijn (gevolg van inert op
    siblings; ADR 0014 laat de eerste toch al wachten)? Voor `AdminMeldingen`
    (Dienst zonder apparaat) is dat nieuw gedrag.
