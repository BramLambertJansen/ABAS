# Dialogen, tabs en landmarks: één toetsenbordcontract voor bar, beheer en portal

Spec voor [issue #125](https://github.com/BramLambertJansen/ABAS/issues/125)
(Frontend T05 · P1, epic #121, findings F05, F17, F28).

**Status: concept, wacht op akkoord van Bram.** De Developer begint pas na
akkoord, en na merge van [PR #137](https://github.com/BramLambertJansen/ABAS/pull/137)
(T03, raakt `DienstTabs`). Merge-volgorde (besluit Bram in
`tablet-layout.md`): #137 (T03) → T05 → T04.

Bronnen: het issue, de code op `main` (`0001283`: `src/components/Overlay.tsx`,
`OverlayPresence.tsx`, `DienstTabs.tsx`, `BeheerTabs.tsx`,
`PortalDashboard.tsx`, `AfrekenenOverlay.tsx`, `BezettingOverlay.tsx`,
`TerugdraaienOverlay.tsx`, `LidBestellingenOverlay.tsx`,
`LidBeherenOverlay.tsx`, `LedenLijst.tsx`), PR #137 (diff van `DienstTabs`),
`docs/features/tablet-layout.md`, de kaders (`CLAUDE.md`,
`docs/ARCHITECTURE.md` → Overlay presence, ADR 0014) en de wireframe
`designs/Bar App.dc.html` (alleen voor de vormtaal, die verandert niet).
De issue is geschreven op commit `ebca054`; alles hieronder is op de actuele
`main` nagelopen. Eén afwijking: het issue spreekt van "scrolllock wordt na
sluiten opgeruimd", maar `Overlay.tsx` heeft nu **geen** scrolllock (zie
Gedrag 1.5 en open vraag 3).

## Doel

Alle bestaande dialogen en alle drie de tabbalken gedragen zich voorspelbaar
met alleen een toetsenbord of schermlezer, via **één** dialoog-primitive en
**één** tab-gedragsbasis. Nu:

- **F05.** `Overlay` zet de beginfocus op de container, maar vangt alleen
  Tab op het eerste en laatste focusbare element af, en alleen als dat element
  de actieve is. Shift+Tab direct na openen (focus staat op de container)
  verlaat de dialoog; de achtergrond is niet `inert`. Een tijdelijk
  disabled eerste/laatste control valt buiten de selector, waardoor de
  controle op "eerste/laatste" fout gaat. Bij verdwenen trigger valt de focus
  terug op `body`.
- **F17.** `DienstTabs`, `BeheerTabs` en `PortalDashboard` hebben
  `role="tab"` maar geen pijltjesbediening; elke tab staat in de Tab-volgorde.
  `aria-controls` verwijst naar een paneel dat bij een inactieve tab niet
  bestaat (panelen zijn alleen gemount terwijl ze actief zijn).
- **F28.** In de actieve bar-weergave (Verkoop en Dienst) staat geen
  `<main>`; axe meldt `landmark-one-main` en `region`.

Dit ticket levert geen verklaring van WCAG-conformiteit (issue).

## Betrokken shells

| Onderdeel | Shell |
|---|---|
| Dialoog-primitive (`Overlay`) | gedeeld (`src/components/`): bar als `modal`, portal als `sheet`, via `useShell().overlay` zoals nu |
| Tab-gedragsbasis | gedeeld (`src/components/`), geen shell-kennis |
| `DienstTabs` (verticale rail) | `shells/bar` (feature `verkoop`) |
| `BeheerTabs` (horizontaal, pillen) | `/beheer`, binnen `shells/bar` (CLAUDE.md → Domein) |
| `PortalDashboard` (horizontaal, segmented) | `shells/portal` |
| Main/navigatie-landmarks | alleen de actieve bar-weergave; portal en beheer behouden hun structuur |

**Hergebruik gaat voor nieuw (CLAUDE.md → Componenten).** Er komt geen
componentlibrary en geen nieuwe dependency. Er komt **één** nieuwe
tab-gedragsbasis, omdat de drie huidige tabimplementaties kopieën van elkaar
zijn en er nu geen tweede bestaat om te hergebruiken. `Overlay.tsx` wordt
verbeterd, niet vervangen. Beide blijven in `src/components/`, shell-onwetend
(`check:arch`); de visuele shells blijven in de features. Vorm van de tab-
basis (hook, kleine headless component of beide) is aan de Developer, mits het
contract hieronder blijft gelden en de drie features dezelfde code gebruiken.
Een vierde, losse kopie van tab-gedrag is een reviewfout.

## Datamodel, RPC's, geld, attributie

**Geen wijzigingen, bevestigd.** Geen migratie, geen nieuwe of gewijzigde
RPC, geen RLS-policy, geen wijziging in `place_order`, `top_up`,
`reverse_order_*` of `my_bar_state`. Beide kernbeslissingen blijven
onaangeroerd: geld beweegt alleen via RPC (de client stuurt nog steeds alleen
ids, aantallen en opwaardeerbedrag), en `served_by` komt uit de bezetting. Deze
spec raakt alleen toetsenbord-, focus- en landmarkgedrag en de markup die dat
draagt. De enige geldrelatie is het sluitcontract tijdens een lopende
geldmutatie (Gedrag 1.4): dat voorkomt een dubbele boeking en verandert
niets aan wat de RPC doet. Een Developer die tijdens de bouw toch een RPC of
schema nodig denkt te hebben, stopt en meldt dat aan de Architect.

Geen nieuwe auth- of cookieregel, geen PWA/offline-uitbreiding.

## Rolzichtbaarheid

Ongewijzigd. Wie welke tab of dialoog ziet verandert niet (bijvoorbeeld:
`Diensten` en `Logboek` alleen voor een beheerder; de tablijst is dus
dynamisch en de basis moet daarmee kunnen omgaan).

## Gedrag

### 1. Dialoog-primitive (`Overlay.tsx`)

Het bestaande contract blijft: `role="dialog"`, `aria-modal`, benoemd via
`title`, mount/unmount als open/sluit-levenscyclus, `titleRef` voor
`useFocusNaWissel`, meldt zich aan bij `OverlayPresenceProvider` (ADR 0014),
modal vs. sheet via `useShell().overlay`. Daarbovenop:

**1.1 Focusinsluiting vanuit elke beginpositie.**
- Beginfocus blijft op de dialoogcontainer (huidig gedrag, ongewijzigd; zie
  `titleRef` voor een nieuwe stap binnen dezelfde dialoog).
- Tab en Shift+Tab blijven binnen de dialoog vanuit: de container zelf, het
  eerste en het laatste element, een element midden in de dialoog, en een
  dialoog waarvan het eerste of laatste element op dat moment `disabled` is
  (bijvoorbeeld "ja, afrekenen" tijdens `pending`, of een opslaan-knop die
  pas na een wijziging actief wordt).
- De lijst van focusbare elementen wordt **op het moment van de toets**
  bepaald en slaat `disabled`, `tabindex="-1"`, verborgen en `inert`
  elementen over. Staat de focus buiten de dialoog (bijvoorbeeld na een
  klik op een niet-focusbaar gebied, of doordat het focusbare element
  verdween), dan trekt de volgende Tab of Shift+Tab hem terug in de dialoog.
- Heeft de dialoog tijdelijk geen enkel focusbaar element, dan blijft de focus
  op de container.
- Zichtbare focusindicator op elk element in de dialoog, ook op de container
  waar nu `focus:outline-none` staat (de container krijgt alleen programmatisch
  focus; of die een indicator nodig heeft is een uitkomst van de a11y-test, niet
  een voorschrift).

**1.2 Achtergrond inert.** Zolang een dialoog gemount is, is de rest van de
pagina niet interactief voor toetsenbord en assistive technologie (`inert`;
React 19 ondersteunt het attribuut). Dit geldt voor het hele schermdeel buiten
de dialoog, inclusief rail/tabbalk, toast, `AdminMeldingen` en
`DienstTeLangOpenMelding`. Hoe de primitive dat bereikt (de dialoog buiten de
boom plaatsen en de overige root inert maken, of anders) is aan de Developer;
eis is het waarneembare gedrag, op bar, beheer én portal. De uitzondering van
ADR 0014 blijft: de melding "Dienst staat nog open" wacht tot er geen
overlay open is. Het uitschakelen van de rail tijdens een modale dialoog uit
#137 (`RailTab disabled={overlayOpen}`) **blijft staan** als tweede laag; deze
spec haalt die niet weg.

**1.3 Gelijk sluitcontract.** Escape, een klik op de backdrop en elke eigen
sluitknop in de dialoog lopen door **één** sluitpad in de primitive. Dat pad
is wat `onClose` van de aanroeper aanroept, of wat blokkeert (1.4). Nu doet
elk overlay dat zelf: `AfrekenenOverlay`, `TerugdraaienOverlay` en
`LidBestellingenOverlay` wikkelen `onClose` in een eigen `if (pending) return`,
`BezettingOverlay` en `LidBeherenOverlay` geven `onClose` rechtstreeks door.
Daardoor kan dezelfde klik de ene dialoog wel en de andere niet sluiten. De
primitive stelt het pad ook beschikbaar aan de kinderen (bijvoorbeeld via een
kleine context of render-prop), zodat een eigen "Sluiten"/"annuleren"-knop
hetzelfde pad volgt als Escape. Het huidige document-brede
`mousedown`-luisteren voor backdrop mag blijven of vervangen worden; zie
open vraag 5 voor de precieze regel.

**1.4 Sluit-/pendingcontract (basis voor T06, #126).** De primitive krijgt
een expliciete manier om te zeggen "sluiten kan nu niet" (werktitel
`closeBlocked: boolean`, naam aan de Developer). Gedrag zolang het geldt:
- Escape, backdrop en de gedeelde sluitroute roepen `onClose` **niet** aan.
- De dialoog blijft open, de focus blijft binnen de dialoog, en de
  geblokkeerde poging wordt **niet** stil genegeerd voor assistive technologie:
  de primitive meldt de geblokkeerde poging via een callback
  (werktitel `onCloseBlocked`) en zet `aria-busy` op de dialoog.
- Wat de gebruiker te zien/horen krijgt (tekst, plaats, tijdsduur) is
  **bewust niet** onderdeel van T05: dat is T06 (#126). T05 levert alleen het
  contract: de status, het blokkeren en de callback.
- Zodra `closeBlocked` weer onwaar wordt, werkt sluiten weer, zonder dat de
  dialoog herrendert met verloren invoer.
- De mutatiestatus komt van de aanroeper (`mutation.status === "pending"`);
  de primitive kent geen geldlogica en berekent niets.
- Dit vervangt de losse `if (pending) return` in de dialogen die dat nu al
  hebben (Afrekenen, Terugdraaien, LidBestellingen): zelfde gedrag, één
  plek. Gedrag van `BezettingOverlay` (`pendingId`) en `LidBeherenOverlay`
  (`*.status === "pending"`) verandert in T05 **niet** zonder akkoord, zie
  open vraag 4.

Reden dat dit bij geld hoort (CLAUDE.md → Geld beweegt alleen via RPC):
`AfrekenenOverlay` documenteert al waarom sluiten tijdens `place_order`
verboden is (unmount mid-RPC, daarna kon dezelfde bestelling opnieuw worden
ingediend, dubbele afschrijving; reviewbot PR #41). Het contract maakt die
bescherming gedeeld in plaats van per dialoog herhaald, en dus ook voor
toekomstige geldmutaties (`top_up` in `OpwaarderenOverlay`) afdwingbaar.

**1.5 Scrolllock.** Zolang een dialoog open is, scrollt de pagina erachter
niet mee; bij sluiten (op elke manier, ook unmount door de ouder, ook
`closeBlocked` → sluiten) is de lock volledig opgeruimd. Meerdere gelijktijdig
gemounte dialogen (kan, zie 3 en ADR 0014) mogen elkaars lock niet te vroeg
opheffen. Dit bestaat nu niet; invulling en reikwijdte staan in open vraag 3.
Lange dialogen: de dialoog zelf scrollt (nu al `max-h-[88vh] overflow-auto`);
de focus-volgorde en Escape blijven werken terwijl de inhoud scrolt, en een
element dat focus krijgt wordt in beeld gescrold.

**1.6 Focusherstel.** Bij sluiten gaat de focus naar de trigger (het element
dat focus had bij openen). Is dat element niet meer verbonden met het
document of niet meer focusbaar, dan naar een **logische opvolger**.
Wat dat is, staat in open vraag 2 (aanbeveling: een door de aanroeper
opgegeven terugkeerdoel, anders het dichtstbijzijnde stabiele bovenliggende
paneel/landmark met `tabindex="-1"`, nooit stil `body`). Concreet te
controleren geval, ledenbeheer → orders → terugdraaien
(`LedenLijst`): `LidBeherenOverlay` ("Bestellingen") wordt vervangen door
`LidBestellingenOverlay`; de trigger van de eerste (de ledenrij) leeft nog,
de trigger van de tweede (de knop binnen de eerste dialoog) bestaat niet meer.
`DienstActief` → `TerugdraaienOverlay` is het bar-geval waarin de trigger
(een knop in de transactielijst) kan verdwijnen doordat de lijst herlaadt
na een geslaagde terugdraaiing.
**Overgang tussen dialogen:** de focus gaat naar de nieuwe actieve dialoog
(niet kort naar de achtergrond), de achtergrond blijft inert, en bij sluiten
van de laatste dialoog landt de focus in de juiste view (de ledenlijst, niet in
de gesloten "Lid beheren"). Of de huidige volgorde van effecten in React
dat nu toevallig goed doet (cleanup van de ene overlay vóór de effecten van de
andere) wordt in een test vastgelegd, niet aangenomen.

### 2. Tab-gedragsbasis (drie implementaties, één gedrag)

De drie features behouden hun visuele vorm (rail, pillen, segmented) en hun
eigen markup; het **gedrag** komt uit één gedeelde basis.

**2.1 Toetsen.**
- Horizontale tablist (`BeheerTabs`, `PortalDashboard`): ArrowRight →
  volgende tab, ArrowLeft → vorige. Verticale rail (`DienstTabs`): ArrowDown →
  volgende, ArrowUp → vorige. De pijl van de andere richting doet niets.
- Wrap-around aan de uiteinden (APG), Home/End naar eerste/laatste tab.
- `aria-orientation` volgt de werkelijke richting: `"vertical"` op de rail
  (staat er al), expliciet `"horizontal"` is de default en hoeft niet.
- Overgeslagen: `disabled` tabs (bijvoorbeeld de rail tijdens een modale
  dialoog, #137) en tabs die niet bestaan voor de rol (`Diensten`, `Logboek`
  alleen beheerder).

**2.2 Eén tabstop (roving tabindex).** Alleen de geselecteerde tab heeft
`tabindex="0"`, alle andere `tabindex="-1"`. Tab vanuit de tablist gaat naar
de inhoud van het actieve paneel (of volgende focusbare element), niet naar de
volgende tab. Verandert de selectie door een klik of een externe actie, dan
volgt de roving-stop de selectie. Bij een veranderende set tabs (rol) blijft
er altijd precies één tab met `tabindex="0"`.

**2.3 Activatiegedrag.** Zie open vraag 1 (aanbeveling: handmatig).

**2.4 `aria-controls` en panelen.** Een inactief paneel is niet gemount.
`aria-controls` staat daarom **alleen** op de geselecteerde tab en verwijst
daar naar het bestaande paneel; op inactieve tabs ontbreekt het attribuut.
Het paneel behoudt `role="tabpanel"` en `aria-labelledby` naar de tab. De
tab-id's en paneel-id's (`verkoop-panel`, `dienst-panel`, `assortiment-panel`,
`saldo-panel`, enzovoort) en de volgorde in de DOM blijven ongewijzigd:
T04 (`tablet-layout.md`, afspraak T05) laat precies deze rollen, id's, `aria-*`
en DOM-volgorde ongemoeid en past alleen klassen en layoutwrappers aan.
Daarom geldt andersom: T05 voegt **geen** wrapper toe tussen `tablist` en
`tab`, en wijzigt geen klassen of maten.

Panelen blijven alleen gemount terwijl ze actief zijn (bestaand, bewust
besluit: verse leesdata bij terugkeer). Deze spec verandert dat niet; dat
is ook de reden voor de aanbeveling bij open vraag 1.

**2.5 Labels.** Elke tablist behoudt zijn `aria-label` (`Dienst-navigatie`,
`Beheer-navigatie`, `Portaal-navigatie`); elk paneel is benoemd via
`aria-labelledby`.

**2.6 Focus na activeren.** Activeren van een tab verplaatst de focus niet
automatisch uit de tablist; de gebruiker tabt naar het paneel. (Dit is het
APG-standaardgedrag, geen eigen keuze.)

### 3. Landmarks in de actieve bar-weergave (F28)

`DienstTabs` (Verkoop en Dienst, de enige weergave onder
`OverlayPresenceProvider`):

- **Eén `<main>`** per weergave, om de plek van de tabpanelen (de plaats waar nu
  de twee conditionele paneldivs staan). De rail blijft een `<nav
  aria-label="Bar">` buiten `main`. De tablist blijft binnen die `nav`.
- Het `main` verandert niet de inhoud van het paneel en voegt geen
  tweede `main` toe binnen `VerkoopScherm` of `DienstActief` (controle in de
  Developer-taak: nu bevatten die geen `main`).
- Logische DOM-volgorde: rail (`nav`), `main` met het actieve paneel,
  vervolgens de vaste meldingen. Dat is de bestaande volgorde; alleen de
  wrapper komt erbij. `DienstTeLangOpenMelding` en `AdminMeldingen` staan
  buiten `main`; of axe daar `region` voor meldt, wordt gemeten en zo nodig
  opgelost door een passende rol/landmark op de melding zelf (zie
  Randgevallen). Geen verplaatsing van state.
- Portal (`PortalDashboard`) en beheer (`BeheerTabs`) hebben al een
  `<main>` en **behouden hun structuur**; er verandert daar alleen tab-gedrag.
  Overlays die buiten die `main` staan (portal) komen in de a11y-scan
  mee als dialoog, niet als pagina-inhoud.
- Axe op de actieve bar-weergave meldt na de bouw geen `landmark-one-main`
  of `region`, op Verkoop én op Dienst, ook met een dialoog open.

## Overlay-gebruikers die mee moeten (regressielijst)

Alle gebruikers van `Overlay` krijgen het nieuwe gedrag automatisch; deze
lijst is wat de Developer en de Tester doorlopen. Geen van deze dialogen
verandert van inhoud.

| Dialoog | Shell | Waarom speciaal |
|---|---|---|
| `AfrekenenOverlay` | bar | geldmutatie (`place_order`), sluiten geblokkeerd tijdens `pending` |
| `OpwaarderenOverlay` | bar | geldmutatie (`top_up`); heeft nu geen eigen sluit-guard, zie open vraag 4 |
| `BezettingOverlay` | bar | lijst met toggles die disabled worden tijdens `pendingId` |
| `DienstAfsluitenOverlay` | bar | |
| `TerugdraaienOverlay` | bar (Dienst-tab) | geldmutatie, trigger kan verdwijnen na herladen |
| `LidBeherenOverlay` → `LidBestellingenOverlay` → terugdraaien | beheer | wissel van dialoog, trigger verdwijnt, geldmutatie in tweede stap |
| `NieuwLidOverlay`, `ProductBeherenOverlay`, `NieuwProductOverlay` | beheer | formulierdialogen, lange inhoud |
| `SessieMeldingOverlay`, `OvernemenOverlay`, `AfmeldenOverlay`, `DienstElders` | bar | |
| Portal `NaamWijzigenSheet`, `WachtwoordWijzigenSheet`, `TweestapSheet`, `PincodeSheet` | portal (sheet) | `titleRef`/`useFocusNaWissel`, meerdere stappen |

Dit overzicht is gemaakt uit de importen van `Overlay` op `main`; de Developer
controleert met `grep` of er een dialoog bij is gekomen of weggevallen.

## Randgevallen

- **Beginfocus op de container, direct Shift+Tab** (de reproductie uit F05):
  focus blijft binnen de dialoog.
- **Laatste/eerste control disabled** op het moment van de toets: er is geen
  sprong naar de achtergrond.
- **Klik op een niet-focusbaar deel van de dialoog**, daarna Tab: focus blijft
  in de dialoog.
- **Escape terwijl een invoer/keuzelijst binnen de dialoog open is** (ledenzoeker
  `Select`, zoekresultaten): Escape sluit eerst het onderdeel, niet de hele
  dialoog, als dat onderdeel dat nu al doet. Controleren en vastleggen, niet
  veranderen zonder akkoord.
- **Geblokkeerde sluitpoging tijdens een geldmutatie** (Afrekenen, Terugdraaien,
  LidBestellingen): Escape, backdrop en "annuleren"/"Sluiten" doen niets; de
  dialoog blijft, de focus blijft erbinnen, `onCloseBlocked` wordt aangeroepen.
  Na afloop van de mutatie sluit hij weer op elke manier.
- **Dialoog unmount door de ouder terwijl hij open is** (dienst afgesloten door
  een beheerder, sessie verlopen): scrolllock en `inert` zijn opgeruimd; focus
  gaat naar de logische opvolger en niet naar een verdwenen element.
- **Meerdere dialogen na elkaar in dezelfde commit** (ledenbeheer → orders): zie
  1.6, expliciet in een test.
- **Twee dialogen tegelijk** (ADR 0014 voorkomt dit voor de melding; andere
  combinaties zijn er niet bedoeld): de bovenste vangt focus en Escape; een
  sluitende dialoog heft de inertheid niet op zolang een andere open is.
- **Live-regio's en toasts in de achtergrond** (bijvoorbeeld de toast in
  `LedenLijst`, buiten de dialoog) worden tijdens een open dialoog niet
  voorgelezen doordat `inert`. Toasts die door de dialoog zelf getoond
  worden staan in de dialoog en blijven werken. Vraag 6.
- **Tab verdwijnt of verschijnt** (rolwijziging, `Logboek` voor beheerder):
  roving tabindex blijft consistent.
- **Selectie wijzigt terwijl focus op een andere tab staat** (handmatige
  activatie): de selectie verandert pas bij Enter/Space/klik; de roving-stop
  van `tabindex` volgt de selectie, niet de focus (APG).
- **Rail uitgeschakeld tijdens dialoog** (#137): `disabled` tabs worden
  overgeslagen bij pijltjes; na sluiten werkt de rail weer en de focus staat
  op de trigger/opvolger, niet op een disabled tab.
- **Melding `region`** (zie 3): vaste meldingen buiten `main`.
- **Bar-weergaven zonder dienst** (inloggen, namenlijst, dienst starten,
  hervatscherm) hebben al een `main` en vallen buiten deze spec.

## Afstemming met andere tickets

| Ticket | Raakt | Afspraak |
|---|---|---|
| T03 (#43, PR #137, open) | `DienstTabs`, `RailTab disabled={useOpenOverlayCount() > 0}` | T05 bouwt na merge op `main`. De `disabled`-regel blijft; de tab-gedragsbasis moet `disabled` tabs overslaan. Landen ze tegelijk, dan rebaset T05. |
| T04 (#124) | `DienstTabs`, `BeheerTabs`, `Overlay` (maat/scroll alleen bij bereikbaarheid) | T04 bouwt na T05 en wijzigt alleen klassen en layoutwrappers. T05 wijzigt geen klassen of maten, en gebruikt de rollen/id's/aria/DOM-volgorde hierboven. |
| T06 (#126) | `Overlay`, geldmutatie-dialogen | T05 levert het sluit-/pendingcontract (1.4); T06 bepaalt wat de gebruiker te zien krijgt bij een geblokkeerde poging. |
| T11 (#131) | gedeeld dialoog-/tabcontract | T05 levert het; de naamgeving van het contract (props, hooks) is daarmee de afspraak voor T11. |

## Acceptatiecriteria

Gemapt op het issue; elk punt wordt met een toetsenbordreeks en
focus-/inert-asserties bewezen, niet alleen met axe.

1. Vanuit beginfocus, eerste control, laatste control en met tijdelijk
   disabled eerste/laatste control blijven Tab en Shift+Tab binnen de actieve
   dialoog (alle dialogen uit de regressielijst die bereikbaar zijn in de
   fixtures).
2. De achtergrond is `inert` zolang een dialoog open is; na sluiten niet meer.
   Op bar, beheer en portal.
3. Escape, backdrop en sluitknop volgen hetzelfde pad; scrolllock en
   inertheid zijn na sluiten volledig opgeruimd (ook bij unmount door de
   ouder).
4. Een geblokkeerde sluitpoging tijdens een geldmutatie (`closeBlocked`) laat
   de dialoog open, houdt de focus binnen, roept `onCloseBlocked` aan en zet
   `aria-busy`; daarna sluit hij weer.
5. Focus keert terug naar de trigger; verdwenen trigger → logische opvolger
   (open vraag 2). Ledenbeheer → orders → terugdraaien houdt de focus in de juiste
   actieve view.
6. Horizontale tabs: links/rechts; verticale rail: omhoog/omlaag met
   `aria-orientation="vertical"`; Home/End; wrap-around; één tabstop
   (precies één tab met `tabindex="0"`); `aria-controls` alleen naar een
   gemount paneel; het gekozen activatiegedrag.
7. De actieve bar-weergave (Verkoop en Dienst) heeft precies één
   `<main>`; de rail blijft herkenbaar als `nav`. Portal en beheer behouden hun
   structuur.
8. Rollen, tab-id's, paneel-id's en DOM-volgorde zijn gelijk aan `main`
   (afspraak T04); er is geen nieuwe dependency; `check:arch` en
   `check:policy` blijven groen (geen `matchMedia`/`userAgent`).
9. Geen RPC-, schema- of policywijziging in de PR.

## Verificatie

- **Playwright (E2E, in `e2e/`, gedraaid door `check:a11y` =
  `playwright test`).** Een nieuw spec-bestand met echte toetsenbordreeksen
  (`page.keyboard.press`) en asserties op `document.activeElement`,
  `inert`/`aria-hidden`-status van de achtergrond en `tabindex`. Minimaal:
  - Afrekenen openen, direct Shift+Tab; Tab vanaf laatste en eerste control;
    met "ja, afrekenen" disabled; focus nooit buiten de dialoog.
  - Geblokkeerde sluitpoging tijdens een vertraagde `place_order` (route-
    mock zoals de bestaande specs doen), voor Escape, backdrop en annuleren;
    daarna sluiten en focusherstel op de trigger.
  - Ledenbeheer → orders → terugdraaien: focus na elke stap, `inert` na elke
    stap, focus na sluiten, en een terugdraaiing die de trigger laat verdwijnen.
  - Lange dialoog (formulier met veel regels, ledenlijst in `LidBeheren`):
    scrollen binnen, Tab scrollt focus in beeld, scrolllock opgeruimd.
  - Portal-sheet (bijvoorbeeld Naam wijzigen): zelfde reeks op `sheet`.
  - Tabs: ArrowLeft/Right op portal en beheer; ArrowUp/Down op de rail;
    Home/End; één tabstop (Tab uit de tablist komt in het paneel); disabled
    tabs overgeslagen; `aria-controls` aanwezig op de actieve en niet op de
    inactieve tab.
- **Axe (bestaande `e2e/a11y.spec.ts`, `@axe-core/playwright`)**: actieve bar-
  weergave Verkoop én Dienst zonder `landmark-one-main` en `region`, ook
  met een dialoog open; bestaande scans blijven groen. Axe bewijst semantiek
  en contrast, niet de focusvolgorde.
- **Pure logica** (volgende/vorige tab met wrap/skip van disabled, bepalen van
  focusbare elementen): `npm test` voor wat zonder DOM kan, de rest in
  Playwright.
- **Handmatig:** één toetsenbordreeks door Verkoop → Afrekenen → sluiten, en
  Beheer → Leden → Lid beheren → Bestellingen → terugdraaien; schermlezer
  (VoiceOver/NVDA) op tablist en dialoog. Safari/touch zijn met de fixture niet
  bewezen (zie het issue).
- **Gates:** `check:fast` (lint inclusief `jsx-a11y`, typecheck,
  `check:arch`, `check:policy`) in de pre-commit hook; CI draait
  `check:all`: `check:a11y` (axe + Playwright), `check:arch` (primitives
  shell-onwetend in `src/components/`), `check:policy` (geen `matchMedia`,
  geen `console.error` in `src/hooks/queries/`), `build`, `test`. Geen
  `db:test`-wijziging: er verandert niets in de database.
- Open meteen een PR bij de eerste push (CLAUDE.md → Verificatie).

## Expliciet buiten scope

- Wat de gebruiker te zien krijgt bij een geblokkeerde sluitpoging, en het
  tonen van pending-feedback in de geldmutatie-dialogen (T06, #126).
- Maten, indeling en tekstweergave van de dialogen en tabbalken (T04, #124).
- Het ontwerp van de tabs, kleuren, iconen, animaties.
- Het uit elkaar halen of samenvoegen van dialogen, een nieuwe stap in een
  flow, een nieuwe dialoog.
- Panelen blijvend mounten (hidden-toggle) of een tabinhoud cachen.
- Een nieuwe componentlibrary of dependency, en een verklaring van volledige
  WCAG-conformiteit.
- Wijzigingen in `OverlayPresence`-semantiek (ADR 0014) buiten wat hierboven
  staat.
- Toetsenbordbediening van andere composiet-widgets (menu's, comboboxen).
- RPC, schema, policies, auth, PWA/offline.

## Open vragen voor Bram

Per vraag een aanbeveling; er is geen antwoord afgeleid uit docs of issue.

1. **Activatiegedrag van tabs: automatisch (focus activeert) of handmatig
   (pijl verplaatst focus, Enter/Space activeert)?** Het issue zegt "handmatige
   activatie als laden merkbare vertraging geeft". Elke tab mount zijn paneel
   opnieuw en haalt verse data op (bewust, zie `DienstTabs`, `BeheerTabs`,
   `PortalDashboard`). *Aanbeveling: handmatig, voor alle drie.* Met
   automatische activatie zou een pijl door drie tabs drie keer laden, en bij
   `DienstTabs` Verkoop elke keer unmounten (met #137 blijft de draft bewaard,
   maar de data wordt wel steeds opnieuw geladen). Eén gedrag voor alle drie is
   voorspelbaarder en simpeler te testen. Alternatief: automatisch op de
   portal (kleine, snelle leesschermen) en handmatig op de bar en beheer;
   dat vraagt een optie in de gedeelde basis.
2. **Waar gaat de focus heen als de trigger verdwenen is ("logische
   opvolger")?** De docs leggen dit niet vast. *Aanbeveling:* de primitive
   accepteert optioneel een terugkeerdoel van de aanroeper; zonder doel of
   bij een niet meer verbonden doel gaat de focus naar het dichtstbijzijnde
   stabiele omhullende element met `tabindex="-1"` (het actieve `tabpanel`,
   in de bar het `main`), nooit stil naar `body`. Concreet: sluiten van de
   bestellingendialoog (vanuit ledenbeheer) gaat naar de rij van dat lid in de
   ledenlijst (waar "Lid beheren" begon); sluiten van `TerugdraaienOverlay` na
   een geslaagde terugdraaiing waarvan de rij verdween gaat naar de
   transactielijst-container of het dichtstbijzijnde stabiele element, niet naar
   de weggevallen rij. Dit raakt aanroepers (een terugkeerdoel opgeven), dus
   het is bewust een keuze, geen detail.
3. **Scrolllock: invoeren, en waarop?** `Overlay` heeft er nu geen; het issue
   gaat uit van een bestaande lock die moet worden opgeruimd. De bar (`DienstTabs`)
   heeft zelf een vaste hoogte met `overflow-hidden`; beheer en portal scrollen
   als pagina. *Aanbeveling:* invoeren, met teller zodat twee dialogen elkaar niet
   vroeg opheffen, op bar, beheer en portal gelijk; alleen verticaal scrollen van
   de pagina erachter blokkeren, niet de scroll in de dialoog. Zonder lock blijft
   alleen de rest van acceptatiecriteria 3 over (opruimen van `inert`).
4. **Reikt de pending-guard verder dan de drie dialogen die er al een
   hebben?** `BezettingOverlay` (`pendingId`), `LidBeherenOverlay` (opslaan,
   archiveren, uitnodigen) en `OpwaarderenOverlay` (`top_up`) laten sluiten
   tijdens een lopende mutatie toe of regelen het zelf. Ze hierop zetten
   verandert gedrag (Escape doet dan niets tijdens `pending`). *Aanbeveling:*
   T05 migreert alleen de drie die het al doen (zelfde gedrag, één plek) en
   laat de rest als aandachtspunt voor T06, dat de geldmutaties bekijkt. De
   `OpwaarderenOverlay` is een geldmutatie en hoort daar in elk geval bij.
5. **Backdrop-regel:** nu sluit `mousedown` buiten de dialoog. Dat sluit ook bij
   een klik die in de dialoog begint (tekst selecteren) en buiten eindigt, en
   gebruikt geen pointer/touch-event. *Aanbeveling:* sluiten alleen als zowel
   het indrukken als loslaten op de backdrop gebeurt (pointer events, dus ook
   touch). Dit is een kleine gedragswijziging, daarom een vraag; zonder akkoord
   blijft het `mousedown`-gedrag, nu door het gedeelde sluitpad.
6. **Live-regio's in de achtergrond tijdens een dialoog.** Door `inert` worden
   toasts buiten de dialoog (bijvoorbeeld "{naam} toegevoegd" in `LedenLijst`,
   gezet bij het sluiten) niet voorgelezen zolang de dialoog open is. Sluit de
   dialoog en komt de toast daarna, dan is dat in orde. *Aanbeveling:* geen
   speciale behandeling; de Developer controleert dat de toasts van
   `LedenLijst`, `DienstActief` en `Transactielijst` na het sluiten
   verschijnen en voorgelezen worden (er is nu geen toast die tijdens een open
   dialoog moet klinken). Alleen aanpassen als de test iets anders laat zien.
