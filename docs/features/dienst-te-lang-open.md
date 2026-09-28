# Dienst te lang open (melding na 6 uur)

Verzoek van Bram (2026-09-28, nog geen issue-nummer): als een dienst te lang
openstaat, verschijnt er in het scherm een melding die vraagt of de gebruiker
zich daarvan bewust is. Volgt op #12 (`docs/features/dienst-afsluiten.md`,
gebouwd en gemerged) — deze spec voegt geen nieuwe sluitactie toe, alleen een
herinnering die naar de bestaande sluitactie verwijst.

**Status: concept, wacht op akkoord van Bram.** Er staan vier open vragen
direct hieronder; de rest van de spec is op basis van Brams vijf beslissingen
(zie "Besloten") volledig te specificeren, maar de Developer begint pas na
antwoord op de open vragen en akkoord op het geheel (`.claude/agents/
architect.md` → Werkwijze stap 6).

## Open vragen (vóór de Developer begint)

Elk van deze vier kwam boven bij het uitzoeken en valt buiten Brams vijf
beslissingen. Per vraag staat de aanbeveling van de Architect erbij, maar dat
is een voorstel, geen gekozen antwoord — de spec hieronder noemt steeds waar
het antwoord landt.

1. **"Na 1 uur opnieuw": gerekend vanaf de tik op "Nog bezig", of vanaf het
   volgende hele uur sinds de start?** Brams formulering bevat beide lezingen
   ("na 1 uur opnieuw" en "dus weer na 7u, 8u, ..."). Ze vallen alleen samen
   als "Nog bezig" precies op het uurmoment getikt wordt. Verschil in de
   praktijk: tablet stond dicht, wordt om 6u50 opengeklapt, melding
   verschijnt, "Nog bezig" —
   - **(A) tik + 1 uur**: volgende melding om 7u50.
   - **(B) volgend heel uur na de start**: volgende melding om 7u00, dus al
     10 minuten later. Om dat te voorkomen zou B een minimale tussenpoos
     nodig hebben — een tweede regel die Bram dan ook zou moeten kiezen.

   *Aanbeveling: A.* Eén regel, altijd precies een uur rust na een bewuste
   keuze. De pure functie (zie "Pure logica") krijgt het snooze-moment als
   invoer, dus beide varianten zijn een wijziging van één regel en één
   testgeval — geen herziening van de rest van de spec.

2. **Wat gebeurt er als de 6-uursgrens valt terwijl er al een andere overlay
   openstaat** (Afrekenen, Opwaarderen met de €100-bevestiging, Bezetting,
   Terugdraaien, of Dienst afsluiten zelf)? Twee `Overlay.tsx`-instanties
   tegelijk werkt technisch niet goed: beide luisteren documentbreed naar
   Escape en naar `mousedown` buiten het eigen dialoogvenster, dus een tik in
   de bovenste overlay sluit de onderste, en beide focus-traps vechten om
   Tab. Er is ook al een precedent tegen stapelen: "nooit twee overlays
   tegelijk" (`src/features/ledenbeheer/LidBeherenOverlay.tsx`, prop
   `onOpenOrders`). Opties:
   - **(A) Uitstellen**: de melding wacht tot er geen andere overlay meer
     open is, en verschijnt dan meteen. Vereist dat `DienstTabs` weet of er
     een overlay openstaat. Die state leeft nu lokaal in `VerkoopScherm.tsx`
     en `DienstActief.tsx`, dus moet een signaal omhoog (een
     `onOverlayOpenChange`-achtige prop, of een kleine gedeelde
     "overlay open"-context in `src/components/`). Dat is een tweede,
     losstaande wijziging die nu te specificeren is.
   - **(B) Onderbreken**: de melding gaat eroverheen. Dat vraagt dat
     `Overlay.tsx` stapelbaar wordt (alleen de bovenste reageert op Escape,
     backdrop en Tab). Dat is een wijziging aan een gedeeld component waar
     elf consumenten van afhangen, en het onderbreekt een lopende
     afrekening of opwaardering.

   *Aanbeveling: A.* Een lopende betaling of een €100+-bevestiging mag niet
   onderbroken worden door een herinnering. Welke vorm A krijgt (prop of
   context), leg ik pas vast na Brams keuze.

3. **"Annuleren" in `DienstAfsluitenOverlay` nadat die vanuit de melding
   geopend is: telt dat als "Nog bezig"?** Zo niet, dan verschijnt de melding
   meteen opnieuw (de dienst staat nog steeds meer dan 6 uur open en er is
   geen snooze gezet), en is er geen manier om van de melding af te komen
   behalve "Nog bezig". *Aanbeveling: ja, annuleren = snooze van 1 uur* —
   wie het overzicht bekeek en besloot niet af te sluiten, heeft dezelfde
   keuze gemaakt als "Nog bezig".

4. **Ook in beheer-modus (`/beheer`)?** Brams beslissing 4 zegt "overal in
   `shells/bar` zolang een dienst open is". Beheer-modus draait
   route-technisch binnen `shells/bar` (`src/app/(bar)/beheer/`), maar het is
   een aparte e-mailsessie die de gedeelde tablet-sessie tijdelijk vervangt
   (ADR 0002/0003). Het toont nergens de open dienst, en na
   `DienstAfsluitenOverlay` is er daar geen `onShiftEnded`-pad (geen
   `useOpenShift`-consument op `/beheer`). *Aanbeveling: nee, alleen in
   bar-modus.* De melding is bedoeld voor wie aan de bar staat. Een
   beheerder die het wel in beheer wil zien, raakt de bar/beheer-scheiding
   van ADR 0003 (beheer toont geen dienst-UI), en dat verdient een eigen
   afweging. In de rest van deze spec is "overal" daarom gelezen als
   **elk scherm in bar-modus terwijl er een dienst open is**. Wordt het
   antwoord "ja", dan komt er een extra mountpunt in `Assortimentbeheer.tsx`
   bij, plus een eigen `useOpenShift()`-aanroep en een eigen `onShiftEnded`
   daar.

Er is **geen wireframe** voor deze melding: `designs/Bar App.dc.html` en
`designs/chats/` bevatten geen "dienst staat lang open"-scherm (gezocht op
"uur open", "te lang", "lang open", "klopt dat"). Visueel volgt de melding
daarom de bestaande overlays (`AfrekenenOverlay.tsx`, knoppenpaar), zie
Schermflow.

## Besloten (Bram, 2026-09-28)

1. **Drempel: 6 uur na `shifts.started_at`**, als vaste constante in de code.
   Geen beheerinstelling, geen `app_settings`-kolom, geen migratie.
2. **Melding** in de trant van *"Deze dienst staat al X uur open. Klopt
   dat?"* met twee knoppen: **Dienst afsluiten** (opent het bestaande
   `DienstAfsluitenOverlay`) en **Nog bezig** (sluit de melding).
3. **Na "Nog bezig" komt de melding na 1 uur terug** (zie open vraag 1 voor
   het ankerpunt). De snooze-staat bestaat alleen client-side; de keuze
   tussen geheugen en opslag per tablet ligt bij de Architect (zie
   "Snooze-staat").
4. **Overal in `shells/bar` zolang er een dienst open is**, ook over het
   verkoopscherm heen, niet alleen op de Dienst-tab (zie open vraag 4 voor
   beheer-modus). Features blijven shell-onwetend.
5. **Geen aparte melding aan de beheerder** voor een dienst die open bleef
   na het dichtklappen van het tablet. Omdat de melding op elk bar-scherm
   verschijnt, ziet de eerstvolgende gebruiker van het tablet hem direct
   (zie Randgevallen: tablet uit slaapstand).

## Doel

Een dienst die vergeten is af te sluiten, valt op zodra iemand naar het
tablet kijkt. Wie het tablet bedient, kan in één tik doorgaan naar het
bestaande afsluitoverzicht, of met één tik bevestigen dat de dienst bewust
nog loopt. De melding blokkeert nooit: "Nog bezig" is altijd mogelijk, en er
verandert niets aan wat verkocht of opgewaardeerd mag worden.

**Raakt de kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen als
volgt**:

- **Geld beweegt alleen via RPC**: niet in het geding. De melding leest
  alleen `started_at` en verplaatst geen geld. De enige schrijfactie die ze
  kan starten, loopt via het bestaande `DienstAfsluitenOverlay` naar de
  bestaande `end_shift`-RPC, die ook geen geld beweegt
  (`docs/features/dienst-afsluiten.md` → Doel).
- **`served_by` komt uit de bezetting**: niet van toepassing. Er is geen
  bestelling en geen attributie, en "Nog bezig" wordt niet aan een lid
  gekoppeld. Dat past bij hetzelfde vertrouwensmodel als "iedereen op de
  gedeelde sessie mag afsluiten" (`dienst-afsluiten.md` →
  Rolzichtbaarheid).

## Betrokken shell

`shells/bar` alleen, en daarbinnen bar-modus (zie open vraag 4). In
`shells/portal` is er geen dienst-concept (CLAUDE.md → Domein).

**Waar de check in de component-tree hangt: in `DienstTabs`**
(`src/features/verkoop/DienstTabs.tsx`). Dat is het ene punt waar elk
bar-scherm met een open dienst doorheen gaat:

```
BarShellHome → DienstStarten (useOpenShift) → DienstTabs(shift, onShiftEnded)
                                               ├─ VerkoopScherm   (tab)
                                               ├─ DienstActief    (tab)
                                               └─ DienstTeLangOpenMelding (nieuw, altijd gemount)
```

- `DienstStarten` rendert `DienstTabs` alleen als `useOpenShift()` een open
  dienst teruggeeft. Zonder dienst (stafkeuze, PIN) is er dus nooit een
  melding, zonder dat daar een aparte check voor nodig is.
- `DienstTabs` blijft gemount bij het wisselen tussen de Verkoop- en de
  Dienst-tab (alleen de tabpanelen mounten en unmounten). Een component daar
  overleeft dus elke tabwissel, en dat is nodig voor de snooze-staat.
- De melding is een **sibling van de tabpanelen**, geen kind van een
  tabpaneel. Daardoor verschijnt hij over beide tabs heen, en doet het
  mounten ervan niets met de lokale state van `VerkoopScherm` (het mandje
  blijft staan).
- Nieuw component in een eigen featuremap, **`src/features/dienst-te-lang-open/
  DienstTeLangOpenMelding.tsx`**. Dat volgt het "elke spec zijn eigen
  featuremap"-precedent (`bezetting-beheren.md` → Betrokken shell). Props:
  `shift: OpenShift` en `onShiftEnded: () => void`. `DienstTabs` geeft zijn
  eigen, al bestaande `onShiftEnded` door; die prop-keten naar
  `openShift.refetch` bestaat al voor `DienstActief`, en de reden dat dit
  prop-drilling moet zijn en geen gedeelde cache, staat in
  `dienst-afsluiten.md` → Schermflow §4.
- Het component importeert geen shell-internals, alleen `@/components/
  Overlay` en `@/features/dienst-afsluiten/DienstAfsluitenOverlay`. Die
  laatste import van feature naar feature heeft precedent (`DienstActief`
  importeert hem ook), dus `check:arch` blijft groen. Er wordt geen
  `window.innerWidth` of user-agent gelezen (`check:policy`).

## Hergebruik (verplicht, CLAUDE.md → "Componenten zijn herbruikbaar")

| Wat | Bestaand | Hoe |
|---|---|---|
| Open dienst + `started_at` | `useOpenShift()` (`src/hooks/queries/useOpenShift.ts`), al aangeroepen in `DienstStarten` | **Niet** opnieuw aanroepen. `DienstTabs` heeft `shift: OpenShift` al (met `startedAt` als ISO-string van de server) en geeft die door. Een tweede `useOpenShift()`-instantie zou een extra query zijn en een eigen `refetch` die niets bijwerkt (geen gedeelde cache). |
| Dialoog | `Overlay` (`src/components/Overlay.tsx`) | De melding is een `<Overlay title description onClose>`. `role="dialog"`, `aria-modal`, labelling, focus erin en terug, focus-trap en Escape/backdrop komen daar allemaal al uit. Geen eigen dialoogmarkup. |
| Afsluiten | `DienstAfsluitenOverlay` (`src/features/dienst-afsluiten/`) | Ongewijzigd hergebruikt, met dezelfde props als vanuit `DienstActief`: `shift`, `onClose`, `onShiftEnded`. |
| Knoppenpaar | Stijl van het knoppenpaar in `AfrekenenOverlay.tsx` (secundair wit met rand, primair `bg-accent-active`) | Zelfde classes. Dit is geen gedeeld component (er is geen `Button` in `src/components/`), en een knoppencomponent extraheren valt buiten deze spec. |
| Tijdsduur | `durationLabel()` in `src/features/dienst-overzicht/ledger.ts` en de 30s-tick in `DienstActief.tsx` | **Niet** hergebruikt voor de tekst: die toont "2u 05m", de melding toont hele uren. Wel overgenomen: hetzelfde tijdsmodel (server-`started_at` tegen de client-klok) en hetzelfde tick-interval van 30 seconden. |

## Datamodel

**Geen schemawijziging, geen migratie.** De drempel is een constante
(beslissing 1). De snooze-staat is client-only (beslissing 3).
`shifts.started_at` bestaat al sinds `0001_init.sql`.

## RPC's

**Geen nieuwe RPC, geen wijziging aan een bestaande.** De enige RPC in het
spel is het bestaande `end_shift(p_shift_id)`, en alleen indirect: via
`DienstAfsluitenOverlay` en diens `useEndShift()`, precies zoals vanuit de
Dienst-tab.

**Geen RLS-wijziging.** Er komt geen tabel of policy bij, en er wordt niets
gelezen dat `useOpenShift()` niet al leest. `check:rls` en `db:test` raakt
deze spec niet.

**Geen geld.** Er wordt geen bedrag berekend, getoond of verstuurd.

## Pure logica: `src/lib/dienstTeLangOpen.ts`

De beslissing "moet de melding nu zichtbaar zijn, en met welk getal" staat in
één pure module, zonder React, Supabase of `Date.now()` erin (de tijd komt
als argument binnen). Zo is ze te unit-testen met `node --test`.

Interface (namen zijn een voorstel, de Developer mag ze aanpassen zolang de
vorm gelijk blijft):

- `SHIFT_OPEN_WARNING_AFTER_MS = 6 * 60 * 60 * 1000`, de drempel
  (beslissing 1).
- `SHIFT_OPEN_SNOOZE_MS = 60 * 60 * 1000`, het uur rust na "Nog bezig"
  (beslissing 3).
- `openHours(startedAtIso: string, nowMs: number): number` geeft de hele
  uren sinds de start (`Math.floor`), met ondergrens 0 (zie Randgevallen:
  klokverschil). Dit is de X in de tekst.
- `shouldWarn({ startedAtIso, nowMs, snoozedAtMs }: { startedAtIso: string;
  nowMs: number; snoozedAtMs: number | null }): boolean` is `true` als de
  verstreken tijd ≥ de drempel is **en** (`snoozedAtMs === null` **of**
  `nowMs - snoozedAtMs ≥ SNOOZE_MS`). Grens: **≥**, dus op precies 6u00m00s
  verschijnt de melding. Variant B van open vraag 1 zou alleen de tweede
  voorwaarde vervangen.

## Snooze-staat: in geheugen, niet per-tablet opgeslagen

`snoozedAtMs` is gewone React-state in `DienstTeLangOpenMelding`, **samen met
het `shift.id` waarvoor hij gezet is**. Zo telt een snooze van een eerdere
dienst nooit mee voor een nieuwe, ook als de component toevallig gemount
blijft. Geen `localStorage` of `sessionStorage`.

Onderbouwing:

- **Levensduur komt vanzelf goed uit.** `DienstTabs` blijft gemount zolang
  de dienst open is en de pagina niet herladen wordt, dus de snooze
  overleeft elke tabwissel en elke overlay. Hij verdwijnt pas bij een
  herlaadactie of het opnieuw openen van de PWA.
- **Kwijtraken bij herladen is gewenst gedrag, geen verlies.** Een
  herlaadactie of een herstarte PWA betekent meestal: iemand anders, of
  dezelfde persoon veel later, pakt het tablet op. Dan ziet de nieuwe
  gebruiker de melding meteen, en dat is precies waar beslissing 5 op
  rekent. Het ergste geval is één melding te veel, afgehandeld met één tik.
- **Geen nieuw precedent.** `src/` gebruikt nergens web-opslag.
  `localStorage` zou een eerste client-persistentie op de gedeelde tablet
  zijn, met eigen vragen (opruimen na het einde van de dienst, sleutels per
  dienst, twee tabbladen die elkaar beïnvloeden). Voor een herinnering van
  één uur is dat die complexiteit niet waard.

## Tijdbron en timer

- **Tijdbron**: `shift.startedAt` komt van de server (`shifts.started_at`,
  gezet door `start_shift` met `now()` van de database). "Nu" is de klok van
  het tablet (`Date.now()`). Dit is hetzelfde model dat de duur op het
  Dienst-scherm al gebruikt (`durationLabel` in `DienstActief.tsx`). De
  berekening is `nowMs - Date.parse(startedAtIso)`: absolute tijdstippen, dus
  onafhankelijk van tijdzone en zomer-/wintertijd.
- **Klokverschil-risico, benoemd en geaccepteerd**: loopt de tabletklok
  voor, dan verschijnt de melding te vroeg; loopt hij achter, dan te laat,
  en wel precies met het verschil. Bij een tablet dat de tijd via het
  netwerk synchroniseert gaat het om seconden, wat bij een drempel van 6 uur
  niet uitmaakt. Een tablet met een uren verkeerde klok zou ook de duur op
  het Dienst-scherm al verkeerd tonen, dus dit is geen nieuw risico. Een
  servertijd ophalen zou een nieuwe RPC of query vragen om een probleem op
  te lossen dat zich niet aantoonbaar voordoet, en valt daarom buiten scope.
  Een negatieve verstreken tijd (tabletklok achter op de server, vlak na de
  start) wordt 0 (zie `openHours`), zodat er nooit "-1 uur" in beeld komt.
- **Timer**: een `setInterval` van **30 seconden** in
  `DienstTeLangOpenMelding` (zelfde waarde als `DURATION_TICK_MS` in
  `DienstActief.tsx`) zet een `now`-state. Die wordt opgeruimd bij unmount.
  30 seconden is ruim nauwkeurig genoeg voor een grens van 6 uur en een
  snooze van 1 uur.
- **Terug uit de slaapstand**: browsers vertragen of pauzeren intervallen op
  een tablet dat dichtgeklapt of op de achtergrond staat. Daarom zet de
  component bij `visibilitychange` (naar `visible`) meteen een nieuwe `now`,
  zonder op de volgende tick te wachten. Zo krijgt beslissing 5 zijn
  "direct": wie het tablet openklapt, ziet de melding meteen.

## Rolzichtbaarheid

Zelfde model als `dienst-afsluiten.md` → Rolzichtbaarheid: **iedereen die de
gedeelde bar-sessie gebruikt terwijl er een dienst open is**, ziet de melding
en mag beide knoppen gebruiken. Er is geen onderscheid tussen bardienst en
beheerder, en er is geen beperking tot wie de dienst startte. Er is geen
"wie staat er nu aan het tablet"-identiteit buiten de bezetting, en die
hebben we hier niet nodig. Een lid ziet niets, want de portal kent geen
dienst.

## Schermflow

### 1. Verschijnen

Zodra `shouldWarn(...)` `true` is (en, afhankelijk van open vraag 2, er geen
andere overlay openstaat), rendert `DienstTeLangOpenMelding` een `Overlay`.

- **Titel**: "Dienst staat nog open"
- **Toelichting** (`description`, dus ook `aria-describedby`): "Deze dienst
  staat al {X} uur open. Klopt dat?", met X = `openHours(...)`. Omdat de
  melding pas vanaf 6 uur verschijnt, is X altijd ≥ 6 en is "uur" altijd de
  juiste vorm; een enkelvoud-uitzondering is niet nodig.

De titel heb ik zelf geformuleerd (de toelichting is Brams tekst). Een andere
titel is een tekstwijziging, geen herziening van deze spec. X wordt bepaald
op het moment van renderen en loopt bij de volgende tick mee, zodat een
melding die blijft openstaan van 6 naar 7 uur springt.

### 2. Knoppen

Knoppenpaar in de stijl van `AfrekenenOverlay`, in deze volgorde:

- **"Nog bezig"** (secundair) zet `snoozedAtMs = now` voor dit `shift.id`,
  en de melding verdwijnt.
- **"Dienst afsluiten"** (primair, accent) vervangt de melding door
  `DienstAfsluitenOverlay`. Er staan **nooit twee overlays tegelijk** open
  (precedent `LidBeherenOverlay`): één state-variabele in de component,
  `"melding" | "afsluiten" | null`, bepaalt welke van de twee gemount is.
  Omdat React bij het wisselen eerst de effect-cleanup van de melding
  uitvoert (focus terug) en daarna de mount-effect van
  `DienstAfsluitenOverlay` (focus erin), klopt de focusvolgorde zonder extra
  code.

**Escape of een tik op de achtergrond** roept de `onClose` van `Overlay` aan.
Voor de melding is dat hetzelfde als **"Nog bezig"**. `Overlay` vereist een
`onClose`, en Bram definieerde "Nog bezig" als "sluit de melding", dus
sluiten op welke manier ook betekent snoozen. Er is geen derde toestand
"gesloten zonder snooze", want die zou bij de volgende tick meteen weer
openen.

### 3. Vanuit `DienstAfsluitenOverlay`

- **Afsluiten gelukt**: `DienstAfsluitenOverlay` roept zelf `onClose()` en
  daarna `onShiftEnded()` aan. Dat laatste is `openShift.refetch` van
  `DienstStarten`, die dan geen open dienst meer ziet, waardoor `DienstTabs`
  (en daarmee de melding) unmount en de stafkeuze verschijnt. Dat is exact
  het bestaande pad van `dienst-afsluiten.md` → Schermflow §4.
- **Annuleren** (of Escape/backdrop): zie open vraag 3. Aanbevolen: dit geldt
  als "Nog bezig" (snooze).

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Pagina wordt geladen of herladen terwijl de dienst al meer dan 6 uur openstaat | De melding verschijnt bij de eerste render na `useOpenShift()` ("ready"). Er is geen snooze in het geheugen, dus direct zichtbaar. Zie Snooze-staat voor waarom dat gewenst is. |
| Tablet dichtgeklapt of in slaapstand, later weer geopend | De `visibilitychange`-handler herberekent direct, en de melding staat er zodra het scherm zichtbaar is (beslissing 5). Geen melding naar een beheerder of ergens anders. |
| Melding blijft open terwijl er een uur verstrijkt | X loopt mee bij de volgende tick (bijvoorbeeld 6 → 7). De melding gaat niet dicht en opent niet opnieuw. |
| "Nog bezig", daarna wisselen tussen Verkoop en Dienst | Snooze blijft staan, want `DienstTabs` blijft gemount. |
| Mandje met artikelen open op de Verkoop-tab wanneer de melding verschijnt | Het mandje blijft staan: de melding is een sibling en `VerkoopScherm` unmount niet. Kiest de gebruiker "Dienst afsluiten" en bevestigt hij, dan raakt het mandje verloren. Dat is hetzelfde, al geaccepteerde gedrag als afsluiten via de Dienst-tab (`dienst-afsluiten.md` → Randgevallen, issue #43). Deze spec maakt dat niet erger. |
| Andere overlay open op het moment dat de grens valt | **Open vraag 2.** |
| Tabletklok loopt voor of achter op de server | De melding komt precies zoveel te vroeg of te laat. Een negatieve verstreken tijd wordt 0. Zie Tijdbron. |
| Overgang zomer-/wintertijd tijdens de dienst | Geen effect: de berekening werkt op absolute milliseconden, niet op lokale kloktijd. |
| Dienst langer dan 24 uur open | "Deze dienst staat al 26 uur open. Klopt dat?" Er is geen bovengrens en geen dagnotatie. |
| Dienst wordt ergens anders gesloten terwijl de melding hier openstaat | Dit tablet merkt dat pas bij de volgende `useOpenShift()`-refetch. "Dienst afsluiten" werkt dan nog steeds: `end_shift` is idempotent en raakt nul rijen, waarna `onShiftEnded` de stafkeuze toont. Het is dezelfde race die `dienst-afsluiten.md` → Randgevallen al accepteert. |
| Nieuwe dienst direct na het afsluiten van een oude | `DienstTabs` mount opnieuw met een nieuw `shift.id`. De oude snooze is weg of hoort bij een ander id, en telt dus niet. Een nieuwe dienst krijgt pas na 6 uur een melding. |
| Twee tabbladen op hetzelfde tablet | Elk tabblad heeft een eigen snooze in het geheugen, dus "Nog bezig" in het ene tabblad snoozet het andere niet. Geaccepteerd: dit is geen ondersteund gebruik van de gedeelde tablet (zelfde afweging als issue #29). |

## A11y (WCAG-AA)

- **Dialoogrol**: `role="dialog"` en `aria-modal="true"` via `Overlay`, met
  de titel als `aria-labelledby` en de "X uur"-zin als `aria-describedby`.
  Een schermlezer leest dus bij het openen de vraag zelf voor.
  `role="alertdialog"` zou semantisch iets preciezer zijn, maar `Overlay` zet
  de rol vast. Die rol instelbaar maken is een wijziging aan een gedeeld
  component die deze melding niet nodig heeft (de beschrijving wordt al
  voorgelezen). Daarom geen afwijkende rol.
- **Focus**: `Overlay` zet de focus bij het mounten op het dialoogvenster en
  geeft hem bij het unmounten terug aan het element dat daarvoor focus had,
  met een focus-trap zolang de melding open is. Voor de overgang van melding
  naar afsluitoverlay: zie Schermflow §2.
- **Toetsenbord**: beide knoppen zijn echte `<button type="button">`s.
  Escape = "Nog bezig".
- **Contrast en aanraakdoel**: de bestaande tokens en de classes van het
  knoppenpaar uit `AfrekenenOverlay` (hoogte 50px, ruim boven 44px). Het
  contrast van de accent-tokens wordt al door `test`
  (`accentContrast.test.ts`) bewaakt. Geen nieuwe kleuren.
- **Geen tijdsdruk**: de melding sluit nooit vanzelf en er zit geen timer op
  de knoppen (WCAG 2.2.1).

## `useShell()`-contract

Geen nieuwe invulling. De melding is de twaalfde consument van `Overlay.tsx` en
gebruikt de bestaande `"modal"`-tak van `useShell().overlay`. `density` en
`columns` spelen geen rol (twee regels tekst en twee knoppen).

## Testgevallen

**`test` (unit, `test/dienstTeLangOpen.test.ts`, `node --test`)**, tegen
`src/lib/dienstTeLangOpen.ts`, met vaste tijdstippen zoals
`test/ledger.test.ts` → `durationLabel` dat doet:

1. `shouldWarn`: 5u59m59s na de start → `false`; precies 6u00m → `true`;
   8u → `true` (geen snooze).
2. Snooze: gezet op 6u10m, dan `now` = 7u09m → `false`, en `now` = 7u10m →
   `true` (grens ≥, variant A van open vraag 1).
3. Tweede snooze: gezet op 7u10m, dan 8u09m → `false`, 8u10m → `true`.
4. `openHours`: 6u00m → 6, 6u59m → 6, 7u00m → 7, 26u → 26; een start 5
   minuten "in de toekomst" (klokverschil) → 0, en `shouldWarn` → `false`.

**`check:a11y` (Playwright, `e2e/a11y.spec.ts`)**: één nieuw scenario, "bar
shell (/) dienst-te-lang-open-melding has no WCAG2A/AA violations". Start of
hergebruik een open dienst met de bestaande `ensureShiftStarted()`, zet de
browserklok met Playwright's `page.clock` meer dan 6 uur na `started_at`,
wacht op `role="dialog"` met de titel, en scan. Geen databasemanipulatie van
`started_at` nodig. Na afloop "Nog bezig" tikken, zodat volgende scenario's
in dezelfde dienst geen melding in beeld hebben. Let op voor de Tester: elk
bestaand bar-scenario dat nu een al langer lopende dienst hergebruikt, kan
na deze feature de melding te zien krijgen als de CI-database een dienst van
meer dan 6 uur oud bevat. Dat vooraf controleren.

**`db:test`**: niets nieuws. Er is geen database-eigenschap om te bewijzen.

## Expliciet buiten scope

- **De drempel instelbaar maken** (beheerinstelling, `app_settings`-kolom,
  RPC om hem te wijzigen). Beslissing 1 kiest bewust voor een constante. Kan
  later: dan komen er een kolom en een schrijf-RPC bij volgens het patroon
  van `negatieve-saldolimiet.md`, en de pure functie krijgt de drempel als
  argument in plaats van als constante.
- **Melding of notificatie aan een beheerder** (mail, push, iets in
  beheer-modus of de portal) voor een dienst die open bleef na het
  dichtklappen van het tablet (beslissing 5).
- **Automatisch afsluiten** na X uur. Niet gevraagd, en het zou een
  serverside job en een "wie sloot af"-vraag opleveren
  (`dienst-afsluiten.md` → Nog te beslissen, punt 2).
- **Vastleggen wie "Nog bezig" tikte**, of dat er gesnoozed is (logboek,
  audit). De snooze is client-only (beslissing 3) en laat geen spoor na.
- **Snooze bewaren over een herlaadactie of tussen tabbladen**. Zie
  Snooze-staat.
- **Servertijd als "nu"**. Zie Tijdbron, klokverschil-risico.
- **`Overlay.tsx` stapelbaar maken** of de rol instelbaar maken. Alleen als
  Bram bij open vraag 2 optie B kiest, en dan als eigen wijziging.
- **Een gedeeld `Button`-component extraheren**. Het knoppenpaar volgt de
  bestaande classes. Extraheren is een aparte opschoonronde, net als #53.

## Architectuur-aantekening

Geen nieuwe ADR. Deze spec introduceert geen beslissing die een volgende
feature kan tegenspreken: geen geldpad, geen attributie, geen nieuwe
persistentie, geen wijziging aan `Overlay`. Wordt het bij open vraag 2 optie
A met een gedeelde "overlay open"-context in `src/components/`, dan is dat
een patroon waar elke toekomstige overlay-consument zich aan moet houden, en
dan schrijf ik de ADR erbij vóór de Developer begint. Er is ook geen
gate-signaal: niets hier is een terugkerende regel die een script zou moeten
bewaken.
