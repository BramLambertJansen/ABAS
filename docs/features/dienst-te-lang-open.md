# Dienst te lang open (melding na 6 uur)

Verzoek van Bram (2026-09-28, nog geen issue-nummer): als een dienst te lang
openstaat, verschijnt er in het scherm een melding die vraagt of de gebruiker
zich daarvan bewust is. Volgt op #12 (`docs/features/dienst-afsluiten.md`,
gebouwd en gemerged). Deze spec voegt geen nieuwe sluitactie toe, alleen een
herinnering die naar de bestaande sluitactie verwijst.

**Status: goedgekeurd door Bram (2026-09-28).** Klaar voor de Developer. De
vier open vragen uit het concept zijn beantwoord, allemaal met de aanbeveling
van de Architect (zie "Besloten", punten 6–9). Bram ging ook akkoord met de
twee keuzes die de Architect zelf had gemaakt (punten 10–11). Eén nieuwe
architectuurbeslissing hoort bij deze spec:
[ADR 0012](../adr/0012-overlay-aanwezigheid-via-gedeelde-context.md). Dat
is het mechanisme waarmee de melding wacht tot er geen andere overlay open
is.

Er is **geen wireframe** voor deze melding: `designs/Bar App.dc.html` en
`designs/chats/` bevatten geen "dienst staat lang open"-scherm (gezocht op
"uur open", "te lang", "lang open", "klopt dat"). Visueel volgt de melding
daarom de bestaande overlays (`AfrekenenOverlay.tsx`, knoppenpaar), zie
Schermflow.

## Besloten (Bram, 2026-09-28)

Uit het oorspronkelijke verzoek:

1. **Drempel: 6 uur na `shifts.started_at`**, als vaste constante in de code.
   Geen beheerinstelling, geen `app_settings`-kolom, geen migratie.
2. **Melding** in de trant van *"Deze dienst staat al X uur open. Klopt
   dat?"* met twee knoppen: **Dienst afsluiten** (opent het bestaande
   `DienstAfsluitenOverlay`) en **Nog bezig** (sluit de melding).
3. **Na "Nog bezig" komt de melding na 1 uur terug.** De snooze-staat
   bestaat alleen client-side. De keuze tussen geheugen en opslag per tablet
   lag bij de Architect: het werd geheugen (zie "Snooze-staat").
4. **Overal in `shells/bar` zolang er een dienst open is**, ook over het
   verkoopscherm heen, niet alleen op de Dienst-tab. Features blijven
   shell-onwetend. Afgebakend in punt 9.
5. **Geen aparte melding aan de beheerder** voor een dienst die open bleef
   na het dichtklappen van het tablet. Omdat de melding op elk bar-scherm
   verschijnt, ziet de eerstvolgende gebruiker van het tablet hem direct
   (zie Randgevallen: tablet uit slaapstand).

Antwoorden op de open vragen uit het concept:

6. **Snooze telt vanaf de tik** (was open vraag 1, optie A). Na "Nog bezig"
   blijft de melding precies één uur weg, gerekend vanaf de tik, niet vanaf
   het volgende hele uur sinds de start. Voorbeeld: tablet gaat om 6u50
   open, iemand tikt "Nog bezig", de volgende melding komt om 7u50. "Dus
   weer na 7u, 8u, ..." uit het verzoek is het typische geval: wie direct
   reageert, ziet hem inderdaad om 7u, 8u, ...
7. **Uitstellen als er al een andere overlay open is** (was open vraag 2,
   optie A). Valt de grens terwijl bijvoorbeeld Afrekenen, Opwaarderen (met
   de €100-bevestiging), Bezetting, Terugdraaien of Dienst afsluiten
   openstaat, dan wacht de melding tot die overlay dicht is en verschijnt
   dan meteen. Een lopende betaling of bevestiging wordt nooit onderbroken.
   Het mechanisme staat hieronder onder "Wachten op andere overlays" en in
   ADR 0012.
8. **Annuleren in `DienstAfsluitenOverlay` telt als "Nog bezig"** (was open
   vraag 3), als die overlay vanuit de melding geopend is. Wie het overzicht
   bekeek en besloot niet af te sluiten, maakte dezelfde keuze.
9. **Alleen in bar-modus** (was open vraag 4). "Overal in `shells/bar`"
   betekent: **elk scherm in bar-modus terwijl er een dienst open is**. Niet
   in beheer-modus (`/beheer`). Dat is een aparte e-mailsessie die de
   gedeelde tablet-sessie tijdelijk vervangt (ADR 0002/0003) en die geen
   dienst-UI toont.

Akkoord op de twee keuzes van de Architect:

10. **Escape of een tik op de achtergrond = "Nog bezig"** (zie Schermflow
    §2).
11. **Titel: "Dienst staat nog open"** (zie Schermflow §1).

## Doel

Een dienst die vergeten is af te sluiten, valt op zodra iemand naar het
tablet kijkt. Wie het tablet bedient, gaat in één tik door naar het bestaande
afsluitoverzicht, of bevestigt in één tik dat de dienst bewust nog loopt. De
melding blokkeert nooit: "Nog bezig" kan altijd, en er verandert niets aan
wat verkocht of opgewaardeerd mag worden.

**Raakt de kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen als
volgt**:

- **Geld beweegt alleen via RPC**: niet in het geding. De melding leest
  alleen `started_at` en verplaatst geen geld. De enige schrijfactie die ze
  kan starten, loopt via het bestaande `DienstAfsluitenOverlay` naar de
  bestaande `end_shift`-RPC. Die beweegt ook geen geld
  (`docs/features/dienst-afsluiten.md` → Doel).
- **`served_by` komt uit de bezetting**: niet van toepassing. Er is geen
  bestelling en geen attributie, en "Nog bezig" wordt niet aan een lid
  gekoppeld. Dat past bij hetzelfde vertrouwensmodel als "iedereen op de
  gedeelde sessie mag afsluiten" (`dienst-afsluiten.md` →
  Rolzichtbaarheid).

## Betrokken shell

`shells/bar` alleen, en daarbinnen alleen bar-modus (besluit 9). In
`shells/portal` is er geen dienst-concept (CLAUDE.md → Domein).

**Waar de check in de component-tree hangt: in `DienstTabs`**
(`src/features/verkoop/DienstTabs.tsx`). Elk bar-scherm met een open dienst
loopt via dat ene punt:

```
BarShellHome → DienstStarten (useOpenShift) → DienstTabs(shift, onShiftEnded)
                                               └─ OverlayPresenceProvider (nieuw, ADR 0012)
                                                   ├─ VerkoopScherm   (tab)
                                                   ├─ DienstActief    (tab)
                                                   └─ DienstTeLangOpenMelding (nieuw, altijd gemount)
```

- `DienstStarten` rendert `DienstTabs` alleen als `useOpenShift()` een open
  dienst teruggeeft. Zonder dienst (stafkeuze, PIN) komt er dus nooit een
  melding, zonder dat daar een aparte check voor nodig is.
- `DienstTabs` blijft gemount bij het wisselen tussen de Verkoop- en de
  Dienst-tab; alleen de tabpanelen mounten en unmounten. Een component daar
  overleeft dus elke tabwissel, en dat is nodig voor de snooze-staat.
- De melding is een **sibling van de tabpanelen**, geen kind van een
  tabpaneel. Daardoor verschijnt hij over beide tabs heen, en het mounten
  ervan raakt de lokale state van `VerkoopScherm` niet (het mandje blijft
  staan).
- `OverlayPresenceProvider` omvat de tabpanelen én de melding, zodat elke
  overlay in dit deel van de boom telt (zie "Wachten op andere overlays").
  `/beheer` en de portal mounten geen provider: daar doet het aanmelden van
  een `Overlay` niets (besluit 9).
- Nieuw component in een eigen featuremap: **`src/features/dienst-te-lang-open/
  DienstTeLangOpenMelding.tsx`**. Dat volgt het precedent "elke spec zijn
  eigen featuremap" (`bezetting-beheren.md` → Betrokken shell). Props:
  `shift: OpenShift` en `onShiftEnded: () => void`. `DienstTabs` geeft zijn
  eigen, al bestaande `onShiftEnded` door. Die prop-keten naar
  `openShift.refetch` bestaat al voor `DienstActief`. Waarom dit
  prop-drilling moet zijn en geen gedeelde cache, staat in
  `dienst-afsluiten.md` → Schermflow §4.
- Het component importeert geen shell-internals. Het gebruikt alleen
  `@/components/Overlay`, `@/components/OverlayPresence` en
  `@/features/dienst-afsluiten/DienstAfsluitenOverlay`. Die laatste import
  van feature naar feature heeft precedent (`DienstActief` importeert hem
  ook), dus `check:arch` blijft groen. Er wordt geen `window.innerWidth` of
  user-agent gelezen (`check:policy`).

## Hergebruik (verplicht, CLAUDE.md → "Componenten zijn herbruikbaar")

| Wat | Bestaand | Hoe |
|---|---|---|
| Open dienst + `started_at` | `useOpenShift()` (`src/hooks/queries/useOpenShift.ts`), al aangeroepen in `DienstStarten` | **Niet** opnieuw aanroepen. `DienstTabs` heeft `shift: OpenShift` al (met `startedAt` als ISO-string van de server) en geeft die door. Een tweede `useOpenShift()`-instantie zou een extra query zijn, met een eigen `refetch` die niets bijwerkt (er is geen gedeelde cache). |
| Dialoog | `Overlay` (`src/components/Overlay.tsx`) | De melding is een `<Overlay title description onClose>`. `role="dialog"`, `aria-modal`, labelling, focus erin en terug, focus-trap en Escape/achtergrond komen daar allemaal al uit. Geen eigen dialoogmarkup. De enige wijziging aan `Overlay` is dat hij zich aanmeldt (ADR 0012). Zijn gedrag voor bestaande consumenten verandert niet. |
| Afsluiten | `DienstAfsluitenOverlay` (`src/features/dienst-afsluiten/`) | Ongewijzigd hergebruikt, met dezelfde props als vanuit `DienstActief`: `shift`, `onClose`, `onShiftEnded`. |
| Knoppenpaar | Stijl van het knoppenpaar in `AfrekenenOverlay.tsx` (secundair wit met rand, primair `bg-accent-active`) | Zelfde classes. Er is geen gedeeld `Button`-component in `src/components/`, en er een extraheren valt buiten deze spec. |
| Tijdsduur | `durationLabel()` in `src/features/dienst-overzicht/ledger.ts` en de 30s-tick in `DienstActief.tsx` | **Niet** hergebruikt voor de tekst: `durationLabel()` geeft "2u 05m", de melding toont hele uren. Wel overgenomen: hetzelfde tijdsmodel (server-`started_at` tegen de client-klok) en hetzelfde tick-interval van 30 seconden. |

## Datamodel

**Geen schemawijziging, geen migratie.** De drempel is een constante
(besluit 1), de snooze-staat is client-only (besluit 3), en
`shifts.started_at` bestaat al sinds `0001_init.sql`.

## RPC's

**Geen nieuwe RPC, geen wijziging aan een bestaande.** De enige RPC in het
spel is het bestaande `end_shift(p_shift_id)`, en dan alleen indirect: via
`DienstAfsluitenOverlay` en diens `useEndShift()`, precies zoals vanuit de
Dienst-tab.

**Geen RLS-wijziging.** Er komt geen tabel of policy bij, en er wordt niets
gelezen wat `useOpenShift()` niet al leest. `check:rls` en `db:test` raakt
deze spec niet.

**Geen geld.** Er wordt geen bedrag berekend, getoond of verstuurd.

## Pure logica: `src/lib/dienstTeLangOpen.ts`

De beslissing "moet de melding nu komen, en met welk getal" staat in één pure
module, zonder React, Supabase of `Date.now()`; de tijd komt binnen als
argument. Zo is ze te unit-testen met `node --test`.

Interface (de namen zijn een voorstel; de Developer mag ze aanpassen zolang
de vorm gelijk blijft):

- `SHIFT_OPEN_WARNING_AFTER_MS = 6 * 60 * 60 * 1000`: de drempel
  (besluit 1).
- `SHIFT_OPEN_SNOOZE_MS = 60 * 60 * 1000`: het uur rust na "Nog bezig"
  (besluiten 3 en 6).
- `openHours(startedAtIso: string, nowMs: number): number`: de hele uren
  sinds de start (`Math.floor`), met ondergrens 0 (zie Randgevallen:
  klokverschil). Dit is de X in de tekst.
- `shouldWarn({ startedAtIso, nowMs, snoozedAtMs }: { startedAtIso: string;
  nowMs: number; snoozedAtMs: number | null }): boolean`: `true` als de
  verstreken tijd ≥ de drempel is **en** (`snoozedAtMs === null` **of**
  `nowMs - snoozedAtMs ≥ SHIFT_OPEN_SNOOZE_MS`). De grens is **≥**: op precies
  6u00m00s verschijnt de melding, en precies een uur na de tik weer
  (besluit 6).

Of er intussen een andere overlay openstaat, hoort **niet** in deze functie.
Dat is React-state (zie hieronder). `shouldWarn` zegt alleen of de melding
aan de beurt is.

## Wachten op andere overlays (besluit 7, ADR 0012)

**Het probleem**: twee `Overlay`s tegelijk werken niet. Beide luisteren
documentbreed naar Escape en naar `mousedown` buiten het eigen
dialoogvenster, dus een tik in de bovenste overlay sluit de onderste, en
beide focus-traps vechten om Tab. Er is ook al een precedent tegen stapelen:
"nooit twee overlays tegelijk" (`LidBeherenOverlay.tsx`, prop
`onOpenOrders`). De overlay-state leeft lokaal in `VerkoopScherm.tsx`
(Bezetting, Afrekenen, Opwaarderen) en in `DienstActief.tsx` (Bezetting,
Dienst afsluiten, Terugdraaien), dus `DienstTabs` weet niet of er een open
is.

**Gekozen mechanisme: `Overlay` meldt zich zelf aan bij een teller in een
context.** Dit is het minst ingrijpende van de drie opties die zijn
afgewogen (zie ADR 0012 → Verworpen alternatieven):

- **Nieuw bestand `src/components/OverlayPresence.tsx`** met:
  - `OverlayPresenceProvider({ children })` houdt het aantal gemounte
    `Overlay`s bij.
  - Een stabiele aanmeldfunctie voor `Overlay`: aanmelden geeft een
    afmeldfunctie terug. Die functie moet stabiel zijn (bijvoorbeeld via
    `useCallback` of een aparte context), zodat het effect in `Overlay`
    alleen bij mount en unmount draait en niet bij elke telwijziging.
  - `useOpenOverlayCount(): number` leest de teller.
  - Buiten een provider (default context) doet aanmelden niets en is de
    teller `0`.
- **`src/components/Overlay.tsx`** krijgt één effect: bij mount aanmelden,
  bij unmount afmelden. Verder niets. Markup, focus, Escape en achtergrond
  blijven hetzelfde, en geen van de elf bestaande consumenten hoeft te
  veranderen.
- **`DienstTabs.tsx`** zet zijn inhoud in `<OverlayPresenceProvider>`.
- **`VerkoopScherm.tsx`, `DienstActief.tsx` en alle overlay-consumenten
  blijven ongewijzigd.** Een overlay die later in dit deel van de boom
  bijkomt, telt automatisch mee, zonder regel om te onthouden.

**Hoe de melding de teller gebruikt**: `DienstTeLangOpenMelding` heeft één
state-variabele `view: null | "melding" | "afsluiten"`, die "vastklikt":

- Van `null` naar `"melding"` gaat alleen als `shouldWarn(...)` `true` is
  **én** `useOpenOverlayCount() === 0`. Die overgang gebeurt in een effect
  dat afhangt van `now`, `snoozedAtMs` en de teller. Sluit de andere overlay,
  dan daalt de teller naar 0, rendert de melding opnieuw en verschijnt hij
  **meteen**, zonder op de volgende tick van 30 seconden te wachten.
- Staat `view` eenmaal op `"melding"` of `"afsluiten"`, dan kijkt de melding
  niet meer naar de teller. Zijn eigen `Overlay` (en daarna
  `DienstAfsluitenOverlay`) telt immers zelf mee, en zonder vastklikken zou
  de melding zichzelf direct weer weghalen.
- Terwijl de melding openstaat, kan er geen andere overlay bij komen: de
  modale achtergrond dekt de rest van het scherm af.

## Snooze-staat: in geheugen, niet per tablet opgeslagen

`snoozedAtMs` is gewone React-state in `DienstTeLangOpenMelding`, **samen
met het `shift.id` waarvoor hij gezet is**. Zo telt een snooze van een
eerdere dienst nooit mee voor een nieuwe, ook niet als de component
toevallig gemount blijft. Geen `localStorage` en geen `sessionStorage`.

Waarom:

- **De levensduur klopt vanzelf.** `DienstTabs` blijft gemount zolang de
  dienst open is en de pagina niet herladen wordt. De snooze overleeft dus
  elke tabwissel en elke overlay, en verdwijnt pas bij een herlaadactie of
  als de PWA opnieuw wordt geopend.
- **Kwijtraken bij herladen is gewenst gedrag, geen verlies.** Een
  herlaadactie of een herstarte PWA betekent meestal dat iemand anders het
  tablet oppakt, of dezelfde persoon veel later. Die ziet de melding dan
  meteen, en daar rekent besluit 5 juist op. In het ergste geval komt er
  één melding te veel, afgehandeld met één tik.
- **Geen nieuw precedent.** `src/` gebruikt nergens web-opslag.
  `localStorage` zou de eerste client-persistentie op de gedeelde tablet
  zijn, met eigen vragen: opruimen na het einde van de dienst, sleutels per
  dienst, twee tabbladen die elkaar beïnvloeden. Voor een herinnering van
  een uur is die complexiteit het niet waard.

## Tijdbron en timer

- **Tijdbron**: `shift.startedAt` komt van de server (`shifts.started_at`,
  gezet door `start_shift` met `now()` van de database). "Nu" is de klok van
  het tablet (`Date.now()`). Dat is hetzelfde model dat de duur op het
  Dienst-scherm al gebruikt (`durationLabel` in `DienstActief.tsx`). De
  berekening is `nowMs - Date.parse(startedAtIso)` op absolute tijdstippen,
  dus los van tijdzone en zomer-/wintertijd.
- **Klokverschil-risico, benoemd en geaccepteerd**: loopt de tabletklok
  voor, dan komt de melding te vroeg; loopt hij achter, dan te laat, en wel
  precies met het verschil. Een tablet dat zijn tijd via het netwerk
  synchroniseert, zit er seconden naast, en dat maakt bij een drempel van 6
  uur niets uit. Een tablet met een klok die uren verkeerd staat, toont nu
  al een verkeerde duur op het Dienst-scherm, dus dit is geen nieuw risico.
  Servertijd ophalen zou een nieuwe RPC of query vragen voor een probleem dat
  zich niet aantoonbaar voordoet, en valt daarom buiten scope. Is de
  verstreken tijd negatief (tabletklok achter op de server, vlak na de
  start), dan geldt 0 (zie `openHours`), zodat er nooit "-1 uur" in beeld
  komt.
- **Timer**: een `setInterval` van **30 seconden** in
  `DienstTeLangOpenMelding` (dezelfde waarde als `DURATION_TICK_MS` in
  `DienstActief.tsx`) zet een `now`-state, en wordt opgeruimd bij unmount.
  30 seconden is ruim nauwkeurig genoeg voor een grens van 6 uur en een
  snooze van een uur.
- **Terug uit de slaapstand**: browsers vertragen of pauzeren intervallen als
  een tablet dichtgeklapt is of op de achtergrond staat. Daarom zet de
  component bij `visibilitychange` (naar `visible`) meteen een nieuwe `now`,
  zonder op de volgende tick te wachten. Zo komt besluit 5 uit: wie het
  tablet openklapt, ziet de melding direct.

## Rolzichtbaarheid

Hetzelfde model als `dienst-afsluiten.md` → Rolzichtbaarheid: **iedereen die
de gedeelde bar-sessie gebruikt terwijl er een dienst open is**, ziet de
melding en mag beide knoppen gebruiken. Er is geen onderscheid tussen
bardienst en beheerder, en de knoppen zijn niet voorbehouden aan wie de
dienst startte. Een identiteit "wie staat er nu aan het tablet" bestaat niet
buiten de bezetting, en is hier ook niet nodig. Een lid ziet niets: de portal
kent geen dienst. Een beheerder in beheer-modus ziet ook niets (besluit 9).

## Schermflow

### 1. Verschijnen

De melding verschijnt zodra `shouldWarn(...)` `true` is en er geen andere
overlay openstaat (zie "Wachten op andere overlays"). Dan rendert
`DienstTeLangOpenMelding` een `Overlay`:

- **Titel**: "Dienst staat nog open" (besluit 11).
- **Toelichting** (`description`, dus ook `aria-describedby`): "Deze dienst
  staat al {X} uur open. Klopt dat?", met X = `openHours(...)`. De melding
  komt pas vanaf 6 uur, dus X is altijd ≥ 6 en "uur" is altijd de juiste
  vorm. Een enkelvoud-uitzondering is niet nodig.

X wordt bepaald op het moment van renderen en loopt bij de volgende tick
mee: een melding die blijft openstaan, springt van 6 naar 7 uur.

### 2. Knoppen

Knoppenpaar in de stijl van `AfrekenenOverlay`, in deze volgorde:

- **"Nog bezig"** (secundair): zet `snoozedAtMs = now` voor dit `shift.id`
  en `view = null`. De melding verdwijnt.
- **"Dienst afsluiten"** (primair, accent): zet `view = "afsluiten"`. De
  melding maakt dan plaats voor `DienstAfsluitenOverlay`, zodat er **nooit
  twee overlays tegelijk** openstaan (precedent `LidBeherenOverlay`). React
  voert bij het wisselen eerst de effect-cleanup van de melding uit (focus
  terug) en daarna het mount-effect van `DienstAfsluitenOverlay` (focus
  erin). De focusvolgorde klopt dus zonder extra code.

**Escape of een tik op de achtergrond** roept `onClose` van `Overlay` aan.
Voor de melding is dat hetzelfde als **"Nog bezig"** (besluit 10). `Overlay`
vereist een `onClose`, en Bram omschreef "Nog bezig" als "sluit de melding",
dus sluiten, op welke manier ook, is snoozen. Een derde toestand "gesloten
zonder snooze" bestaat niet: die zou bij de volgende tick meteen weer
openen.

### 3. Vanuit `DienstAfsluitenOverlay`

- **Afsluiten gelukt**: `DienstAfsluitenOverlay` roept zelf eerst `onClose()`
  aan en daarna `onShiftEnded()`. Dat laatste is `openShift.refetch` van
  `DienstStarten`. Die ziet dan geen open dienst meer, dus `DienstTabs` (en
  daarmee de melding) unmount en de stafkeuze verschijnt. Dat is precies het
  bestaande pad uit `dienst-afsluiten.md` → Schermflow §4. Dat `onClose()`
  hier eerst een snooze zet (zie de volgende regel), is onschuldig: de
  component unmount direct daarna.
- **Annuleren** (of Escape/achtergrond) **telt als "Nog bezig"** (besluit
  8): de `onClose` die de melding aan `DienstAfsluitenOverlay` meegeeft, zet
  `snoozedAtMs = now` en `view = null`. Dat geldt alleen voor de instantie
  die de melding opent. Opent iemand `DienstAfsluitenOverlay` zelf via de
  Dienst-tab, dan is dat de instantie van `DienstActief`, en daar
  verandert niets.

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Pagina wordt geladen of herladen terwijl de dienst al meer dan 6 uur openstaat | De melding verschijnt bij de eerste render nadat `useOpenShift()` "ready" is. Er staat geen snooze in het geheugen, dus hij is direct zichtbaar. Zie Snooze-staat voor waarom dat gewenst is. |
| Tablet dichtgeklapt of in slaapstand, later weer geopend | De `visibilitychange`-handler rekent direct opnieuw, en de melding staat er zodra het scherm zichtbaar is (besluit 5). Er gaat geen melding naar een beheerder of ergens anders heen. |
| Grens valt terwijl Afrekenen, Opwaarderen, Bezetting, Terugdraaien of Dienst afsluiten (via de Dienst-tab) openstaat | De melding wacht (teller > 0). Zodra die overlay dicht is, verschijnt de melding meteen (besluit 7). Is de dienst intussen via die overlay afgesloten, dan unmount de hele `DienstTabs` en komt er geen melding. |
| Afrekenen of Opwaarderen is bezig (`pending`) als de grens valt | Hetzelfde als hierboven: de overlay blijft open tot de RPC klaar is (die overlays sluiten niet tijdens `pending`). Pas daarna komt de melding. Een betaling wordt nooit onderbroken. |
| Melding blijft open terwijl er een uur verstrijkt | X loopt mee bij de volgende tick (bijvoorbeeld 6 → 7). De melding gaat niet dicht en opent niet opnieuw. |
| "Nog bezig", daarna wisselen tussen Verkoop en Dienst | De snooze blijft staan, want `DienstTabs` blijft gemount. |
| Mandje met artikelen open op de Verkoop-tab wanneer de melding verschijnt | Het mandje blijft staan: de melding is een sibling en `VerkoopScherm` unmount niet. Kiest de gebruiker "Dienst afsluiten" en bevestigt hij, dan is het mandje weg. Dat gebeurt nu ook al bij afsluiten via de Dienst-tab en is daar geaccepteerd (`dienst-afsluiten.md` → Randgevallen, issue #43). Deze spec maakt het niet erger. |
| Tabletklok loopt voor of achter op de server | De melding komt precies zoveel te vroeg of te laat. Een negatieve verstreken tijd telt als 0. Zie Tijdbron. |
| Overgang zomer-/wintertijd tijdens de dienst | Geen effect: de berekening werkt op absolute milliseconden, niet op lokale kloktijd. |
| Dienst langer dan 24 uur open | "Deze dienst staat al 26 uur open. Klopt dat?" Geen bovengrens, geen notatie in dagen. |
| Dienst wordt ergens anders gesloten terwijl de melding hier openstaat | Dit tablet merkt dat pas bij de volgende refetch van `useOpenShift()`. "Dienst afsluiten" werkt dan nog steeds: `end_shift` is idempotent en raakt nul rijen, waarna `onShiftEnded` de stafkeuze toont. Het is dezelfde race die `dienst-afsluiten.md` → Randgevallen al accepteert. |
| Nieuwe dienst direct na het afsluiten van een oude | `DienstTabs` mount opnieuw, met een nieuw `shift.id`. De oude snooze is weg of hoort bij een ander id, dus telt niet. Een nieuwe dienst krijgt pas na 6 uur een melding. |
| Twee tabbladen op hetzelfde tablet | Elk tabblad heeft een eigen snooze in het geheugen en een eigen teller. "Nog bezig" in het ene tabblad snoozet het andere niet. Geaccepteerd: dit is geen ondersteund gebruik van de gedeelde tablet (dezelfde afweging als issue #29). |
| Beheer-modus (`/beheer`) terwijl er op dit tablet een dienst open is | Geen melding (besluit 9). `/beheer` mount geen provider en geen `DienstTeLangOpenMelding`. Na uitloggen en terugkeer naar bar-modus verschijnt de melding meteen, als de dienst dan nog meer dan 6 uur openstaat. |

## A11y (WCAG-AA)

- **Dialoogrol**: `role="dialog"` en `aria-modal="true"` via `Overlay`, met
  de titel als `aria-labelledby` en de "X uur"-zin als `aria-describedby`.
  Een schermlezer leest bij het openen dus de vraag zelf voor.
  `role="alertdialog"` zou iets preciezer zijn, maar `Overlay` legt de rol
  vast. Die rol instelbaar maken is een wijziging aan een gedeeld component
  die deze melding niet nodig heeft, want de beschrijving wordt al
  voorgelezen. Daarom geen afwijkende rol.
- **Focus**: `Overlay` zet bij het mounten de focus op het dialoogvenster en
  geeft hem bij het unmounten terug aan het element dat daarvoor focus had.
  Zolang de melding open is, zit de focus erin gevangen. Voor de overgang
  van melding naar afsluitoverlay: zie Schermflow §2. Omdat de melding wacht
  tot andere overlays dicht zijn (besluit 7), is er nooit een tweede
  focus-trap actief.
- **Toetsenbord**: beide knoppen zijn echte `<button type="button">`s.
  Escape = "Nog bezig".
- **Contrast en aanraakdoel**: de bestaande tokens en de classes van het
  knoppenpaar uit `AfrekenenOverlay` (50px hoog, ruim boven 44px). Het
  contrast van de accent-tokens bewaakt `test` al (`accentContrast.test.ts`).
  Geen nieuwe kleuren.
- **Geen tijdsdruk**: de melding sluit nooit vanzelf en er zit geen timer op
  de knoppen (WCAG 2.2.1).

## `useShell()`-contract

Geen nieuwe invulling. De melding is de twaalfde consument van `Overlay.tsx`
en gebruikt de bestaande `"modal"`-tak van `useShell().overlay`. `density` en
`columns` spelen geen rol: het gaat om twee regels tekst en twee knoppen.
`OverlayPresence` staat los van `useShell()`: het meldt of er een overlay
open is, niet hoe hij eruitziet.

## Testgevallen

**`test` (unit, `test/dienstTeLangOpen.test.ts`, `node --test`)** tegen
`src/lib/dienstTeLangOpen.ts`, met vaste tijdstippen, net als `durationLabel`
in `test/ledger.test.ts`:

1. `shouldWarn` zonder snooze: 5u59m59s na de start → `false`; precies 6u00m
   → `true`; 8u → `true`.
2. Snooze vanaf de tik (besluit 6): gezet op 6u50m, dan `now` = 7u00m →
   `false` (dus níet op het hele uur), `now` = 7u49m → `false`, en `now` =
   7u50m → `true`.
3. Tweede snooze: gezet op 7u50m, dan 8u49m → `false` en 8u50m → `true`.
4. `openHours`: 6u00m → 6, 6u59m → 6, 7u00m → 7, 26u → 26. Een start 5
   minuten "in de toekomst" (klokverschil) → 0, en `shouldWarn` → `false`.

**`check:a11y` (Playwright, `e2e/a11y.spec.ts`)**: één nieuw scenario, "bar
shell (/) dienst-te-lang-open-melding has no WCAG2A/AA violations":

- Start een open dienst met de bestaande `ensureShiftStarted()`, of
  hergebruik er een.
- Zet de browserklok met Playwright's `page.clock` meer dan 6 uur na
  `started_at`. `started_at` in de database hoeft niet aangepast te worden.
- Wacht op `role="dialog"` met de titel, en scan.
- Tik daarna "Nog bezig", zodat volgende scenario's in dezelfde dienst geen
  melding in beeld hebben.

Let op voor de Tester: een bestaand bar-scenario dat een al lang lopende
dienst hergebruikt, kan na deze feature de melding te zien krijgen als de
CI-database een dienst van meer dan 6 uur oud bevat. Controleer dat vooraf.

**Functionele e2e (`e2e/dienst-te-lang-open.spec.ts`, nieuw, naast
`e2e/bestelling-terugdraaien.spec.ts`)**. Deze vier gedragingen zijn niet
unit-testbaar omdat ze in React-state zitten:

1. **Uitstellen** (besluit 7): open de Afrekenen-overlay, zet de klok voorbij
   6 uur, en controleer dat er precies één `role="dialog"` is (Afrekenen).
   Annuleer Afrekenen en controleer dat de melding direct verschijnt.
2. **Annuleren = snooze** (besluit 8): melding → "Dienst afsluiten" →
   "annuleren". Er is geen melding; na 59 minuten klok vooruit nog steeds
   niet; na 60 minuten wel.
3. **Escape = snooze** (besluit 10): melding → Escape. Er is geen melding
   tot een uur later.
4. **Over de Verkoop-tab heen** (besluit 4): de melding verschijnt terwijl
   de Verkoop-tab actief is, en het mandje staat er na "Nog bezig" nog.

**`db:test`**: niets nieuws. Er is geen database-eigenschap om te bewijzen.

## Expliciet buiten scope

- **De drempel instelbaar maken** (beheerinstelling, `app_settings`-kolom,
  RPC om hem te wijzigen). Besluit 1 kiest bewust een constante. Dat kan
  later: dan komen er een kolom en een schrijf-RPC bij, volgens het patroon
  van `negatieve-saldolimiet.md`, en krijgt de pure functie de drempel als
  argument in plaats van als constante.
- **Een melding of notificatie aan een beheerder** (mail, push, iets in
  beheer-modus of de portal) voor een dienst die open bleef na het
  dichtklappen van het tablet (besluit 5).
- **De melding in beheer-modus** (besluit 9).
- **Automatisch afsluiten** na X uur. Niet gevraagd, en het zou een
  serverside job vragen en de vraag "wie sloot af" opwerpen
  (`dienst-afsluiten.md` → Nog te beslissen, punt 2).
- **Vastleggen wie "Nog bezig" tikte**, of dat er gesnoozed is (logboek,
  audit). De snooze is client-only (besluit 3) en laat geen spoor na.
- **De snooze bewaren over een herlaadactie of tussen tabbladen.** Zie
  Snooze-staat.
- **Servertijd als "nu".** Zie Tijdbron, klokverschil-risico.
- **`Overlay.tsx` stapelbaar maken**, of de rol instelbaar maken. Besluit 7
  koos uitstellen in plaats van stapelen.
- **`OverlayPresenceProvider` in andere delen van de app** (portal,
  `/beheer`). Er is daar geen consument van de teller. Pas toevoegen als een
  toekomstige feature hem nodig heeft (ADR 0012 → Gevolgen).
- **Een gedeeld `Button`-component extraheren.** Het knoppenpaar volgt de
  bestaande classes. Extraheren is een aparte opschoonronde, zoals #53.

## Architectuur-aantekening

Eén nieuwe ADR:
[0012 — Overlays melden hun aanwezigheid via een gedeelde context](../adr/0012-overlay-aanwezigheid-via-gedeelde-context.md).
Dat patroon staat in `src/components/`, en elke toekomstige overlay volgt het
automatisch zolang hij `Overlay` gebruikt. Een eigen dialoog buiten `Overlay`
om zou de teller omzeilen; dat is al een reviewfout volgens CLAUDE.md →
"Componenten zijn herbruikbaar". Het is vastgelegd in
`docs/ARCHITECTURE.md` → `useShell().overlay`.

Er komt geen nieuw gate-signaal: "gebruik `Overlay`, geen eigen
`role="dialog"`" zou een `check:policy`-regel kunnen worden, maar dat is
vandaag geen terugkerende fout. Die regel komt pas als hij in review een keer
misgaat.
