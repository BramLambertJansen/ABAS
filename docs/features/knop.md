# Knop, Toets, Tegel en Chip

Status: **goedgekeurd**

Roadmap fase 3, stap 3 (ADR 0025 → R3; R5 herzien door
[ADR 0026](../adr/0026-controlmaat-per-rol.md)). Bouwt op de tokenschaal
([tokenschaal.md](tokenschaal.md)).

## Doel

Knoppen komen uit een paar gedeelde componenten met een variantobject. Een
feature kiest daarbij een **rol**, geen klassen. `className` op deze
componenten is alleen voor layout, en een lintregel bewaakt dat (R3). Daarna
vervalt `src/components/knopStijlen.ts`. De ratchet `no-restricted-syntax`
(rauwe `<button>` in features en shells) daalt daarbij.

Er komen **twee PR's** (Bram, 2026-10-08):

- **PR 1** — `Knop` (alle knoprollen), de lintregel, en de migratie van alle
  knop-rollen uit de inventaris (±118 plekken). `knopStijlen.ts` vervalt.
- **PR 2** — `Toets`, `Tegel`, `Chip`, de segment- en tabstijl en de optierijen
  (±30 plekken).

## Betrokken shell(s)

Beide, via gedeelde componenten in `src/components`. De maat is een rol, geen
shellkeuze (ADR 0026): `density` wordt niet gelezen.

## Datamodel

n.v.t. — alleen UI.

## RPC's

n.v.t. — er verandert geen data- of geldpad. De knoppen die een
geld-RPC aanroepen, krijgen alleen een andere markup; hun handlers en
`disabled`-logica blijven gelijk.

## Rolzichtbaarheid

n.v.t. — er verandert niets aan wie wat ziet.

## Hergebruik & UX-patronen

### Inventaris (2026-10-08, na #197)

Er zijn 144 `<button>`-elementen (130 in features en shells, 14 in
components), plus 6 `OverlaySluitKnop`'s met eigen klassen, 3
`UitloggenKnop`-className's, 3 `<Link>`'s die als knop gestyled zijn en 2
`li role=option`. Per rol:

| Rol | Aantal | Opmerking |
|---|---|---|
| primair | 43 | 11 wit op accent-active, 31 donker op accent, 1 anders |
| secundair (rand) | 35 | 14 `KNOP_RAND`, 16 handgeschreven, 5 rand zonder vlak |
| gevaar | 6 | drie stijlen: gevuld, rode rand, rode tekst |
| tekst/ghost | 27 | 13 licht, 14 op rail |
| rail (rand op rail) | 5 | |
| icoonknop | 2 | ⤺ in `Transactielijst` 44×44, × in `Mandje` 30×30 |
| toets | 3 | `PinToetsenbord`, ± in `Mandje` |
| tegel | 5 | modus-, lid-, product- en bezettingstegel |
| chip | 8 | selectiekleur wisselt |
| tab/segment | ±7 | selectiekleur wisselt |
| optierij | 12 | |
| overig | 7 | combobox-trigger, disclosure, waarschuwingsknoppen |

Maat per context, niet per shell (zie ADR 0026):
- groot (52px): dialoog-, inlog-, rail- en afrekenacties en alle primaire
  knoppen in het portal;
- normaal (44px): beheer en inline acties.

### Besluiten (Bram, 2026-10-08)

1. **Maat per rol** (ADR 0026). `maat="normaal"` (44, standaard) of
   `maat="groot"` (52).
2. **Eén primaire stijl:** donker op accent (`bg-accent text-rail`, hover
   `accent-hover`). Contrast: 5,18:1 in rust, 6,03:1 bij hover. De 11 knoppen
   met wit op accent-active krijgen deze stijl ook; dat is een zichtbare
   verandering in de bardialogen.
3. **Geselecteerde staat:**
   - een chip wordt donker op accent, net als primair;
   - een segment of tab wordt een wit vlak (`bg-surface`) met schaduw op
     `track`;
   - "wit op ink" (`StatusFilter`, beheertabs, logboekfilter, optie in
     `Transactielijst`) gaat naar een van deze twee;
   - de railtabs (`DienstTabs`) houden hun eigen railstijl.

   Dit geldt in PR 2.
4. **Twee PR's**, zie Doel.

### Technische invulling (goedgekeurd door Bram, 2026-10-08)

Bram liet de keuzes op raamwerkniveau aan "wat het beste past in het
framework". Hieronder staan ze apart, zodat hij ze bij de goedkeuring kan
aanpassen.

**`Knop`** (`src/components/Knop.tsx`), PR 1:

| Prop | Waarden | Standaard |
|---|---|---|
| `variant` | `primair` · `secundair` · `gevaar` · `tekst` | `secundair` |
| `tone` | `licht` · `rail` | `licht` |
| `maat` | `normaal` (h-control, `rounded-control`) · `groot` (h-control-lg, `rounded-card`) | `normaal` |
| `icoon` | alleen een icoon: vierkant (breedte = hoogte); `aria-label` verplicht via het type | — |
| `href` | rendert `next/link` met dezelfde stijl, in plaats van `<button>` | — |
| `className` | alleen layout (zie de lintregel) | — |
| overige | alle `button`-attributen (`type`, `onClick`, `disabled`, `aria-*`, `ref`) | `type="button"` |

Kleuren per variant en toon:

| Variant | Licht | Rail |
|---|---|---|
| primair | `bg-accent text-rail`, hover `accent-hover` | gelijk |
| secundair | `border-border bg-surface text-ink`, hover `border-ink` | `border-rail-border bg-surface-rail text-rail-light`, hover `rail-hover` |
| gevaar | `bg-danger text-white` (5,18:1), hover `bg-ink` | gelijk |
| tekst | `text-muted`, hover `text-ink`, `underline` | `text-rail-muted` (5,49:1), hover `text-rail-light` |

- **Uitgeschakeld:** zowel `disabled` als `aria-disabled` geven
  `cursor-not-allowed`.
  - Primair en gevaar krijgen `bg-track text-muted`.
  - Secundair en tekst krijgen `opacity-50`.
  - Hover verandert dan niets.
  - `aria-disabled` blijft de aanbevolen vorm waar de focus moet blijven;
    dat is het bestaande patroon in `CodeInvoer`.
- **Tekst:** `text-sm font-bold` voor elke variant. Afwijkende tekstmaten in
  knoppen (`text-[13px]`, `text-[15.5px]`, `text-xs` en dergelijke) vervallen.
  Kleine maten in tekstknoppen (`text-xs`) worden `text-sm`.
- **Tekstknop:** heeft altijd een hoogte (`maat`). Nu hebben 23 van de 27
  geen hoogte; ze worden minstens 44px als klikdoel. Daardoor kan de
  verticale ruimte rond die links iets groeien.
- **Icoonknop:** de × in `Mandje` gaat van 30 naar 44px. Dat is een
  toegankelijkheidswinst en zichtbaar in het mandje.
- **Vervalt:**
  - `knopStijlen.ts` (`KNOP_ACCENT_WIT`, `KNOP_ACCENT_DONKER`, `KNOP_RAND`,
    `KNOP_DIALOOG_MAAT`). De woordenlijst bovenin het bestand (Sluiten,
    Annuleren, Klaar, Terug, Contant, Uitnodiging) verhuist naar
    `src/components/README.md`.
  - `OverlaySluitKnop` wordt een dunne wrapper rond `Knop`, die het
    sluitgedrag van `Overlay` behoudt.
  - `UitloggenKnop` krijgt `variant`, `tone` en `maat` in plaats van
    `className`.

**Lintregel** (`eslint.config.mjs`, PR 1), in `src/features/**` en
`src/shells/**`, op `Knop` (in PR 2 ook op `Toets`, `Tegel` en `Chip`):
`className` mag geen klassen bevatten die beginnen met:
- `bg-`
- `text-`
- `border`
- `rounded`
- `shadow`
- `font-`
- `h-`, `min-h-`, `max-h-`
- `p-`, `px-`, `py-`, `pt-`, `pb-`, `pl-`, `pr-`
- `ring`
- `outline`
- `hover:`, `active:`, `disabled:`, `aria-`, `focus`

Toegestaan is layout, zoals:
- `flex-1`, `w-full`, `w-fit`, `self-*`, `order-*`;
- `m*`;
- `col-span-*`;
- `hidden` en breakpointvarianten daarvan.

De regel werkt met `no-restricted-syntax` op string- en template-literals in
het `className`-attribuut van deze componenten. De melding verwijst naar
`variant`, `tone` en `maat`.

**PR 2** staat hieronder, onder "Aanvulling PR 2".

### Staten, copy, toon, toegankelijkheid

- **Staten:** n.v.t. — er komt geen nieuw scherm bij. De pending- en
  disabled-logica van de aanroepers blijft gelijk; alleen de stijl komt uit
  `Knop`.
- **Copy:** geen nieuwe tekst. Alle bestaande knopteksten blijven letterlijk.
- **Toon:** `tone="rail"` op de donkere railschermen (inloggen, dienst
  starten, modus kiezen, hervatten). `useShell()` wordt niet gelezen.
- **Toegankelijkheid:**
  - De focusring komt uit de globale regel; `Knop` zet geen `outline-*`.
  - Een icoonknop heeft verplicht een `aria-label`, afgedwongen via het
    type.
  - Geen knop wordt kleiner dan nu. Tekstknoppen en de × worden groter.
  - Contrast: zie de tabel. `test/accentContrast.test.ts` krijgt de paren
    van `Knop` erbij.

## Randgevallen

| Situatie | Gedrag | Foutcode/tekst |
|---|---|---|
| `className="bg-accent"` op `Knop` in een feature | Lint faalt | "gebruik `variant`/`tone`/`maat`" |
| Klasse via een variabele (`className={x}`) | De lint ziet het niet | Reviewwerk |
| Knop in een `<form>` zonder `type` | `type="button"` is de standaard, dus geen onbedoelde submit | — |
| Submitknop | Expliciet `type="submit"` | — |
| `icoon` zonder `aria-label` | Typefout | — |
| `href` samen met `onClick`/`disabled` | Typefout: een link is niet uit te schakelen | — |
| Knop die een geld-RPC start | Handler en `disabled` ongewijzigd; alleen de markup verandert | — |

## Tests

- Unit (`test/`):
  - `Knop` rendert per variant en toon de juiste klassen;
  - `disabled` en `aria-disabled` geven de uitgeschakelde stijl;
  - de standaard is `type="button"`;
  - `href` rendert een link.
- Lint: een test zoals `test/tokenschaalReset.test.ts`. Die bewijst dat
  `className="bg-accent"` op `Knop` in een feature faalt, en dat
  `className="flex-1"` mag.
- Contrast: de paren uit de tabel in `test/accentContrast.test.ts`.
- e2e/a11y: de bestaande suites (`e2e/a11y.spec.ts`,
  `e2e/contrast-controls-bar.spec.ts`) blijven groen. Selectors op rol en
  naam blijven werken, want de knopteksten veranderen niet.
- Ratchet: `no-restricted-syntax` (rauwe `<button>`) daalt; `lint:prune`.
- Een screenshotvergelijking is niet mogelijk zolang er geen lokale Supabase
  draait (zie tokenschaal). De zichtbare veranderingen staan hierboven
  benoemd: primair wit wordt donker, gevaar wordt overal gevuld, en
  tekstknoppen en de × worden groter.

## Aanvulling PR 2 — Chip, Segment en Toets

Status van deze aanvulling: **goedgekeurd** (Bram, 2026-10-08), inclusief de
technische invulling.

### Besluiten (Bram, 2026-10-08)

1. **Omvang:** `Chip`, `Segment` en `Toets`. `Tegel` en de optierijen blijven
   eigen markup (te verschillend van opbouw voor één variantobject); ze krijgen
   een reden-commentaar in de code en staan hieronder onder "Bewust niet".
2. **Chip is altijd een pil** (`rounded-full`). De limietchips in
   `NegatieveLimietInstellingen` en de bedragchips in `OpwaarderenOverlay`
   (nu `rounded-control`) worden dus pillen. Dat is zichtbaar.
3. **Toets heeft een `soort`:** `keypad` en `stap`. De rail-keypadtoets blijft
   56px en is daarmee een eigen toetsmaat, geen token (eerder besluit).
4. **Selectie:**
   - een chip wordt donker op accent;
   - een segment of tab wordt een wit vlak met schaduw op `track`;
   - `BeheerTabs` krijgt dezelfde balk als `PortalDashboard`
     (`rounded-card bg-track p-1`). De zwarte geselecteerde tab verdwijnt;
   - de railtabs (`DienstTabs`) houden hun eigen railstijl;
   - `StatusFilter` is een chip, het filter in `LogboekLijst` een segment;
   - de keuzerij in `Transactielijst` (wit op ink) is een optierij en valt
     buiten PR 2.

### Technische invulling (goedgekeurd)

**`Chip`** (`src/components/Chip.tsx`, klassen in `chipKlassen.ts`):

| Prop | Waarden | Standaard |
|---|---|---|
| `geselecteerd` | `true` / `false` → `aria-pressed`; weggelaten → geen `aria-pressed` (de bezettingspil opent een overlay) | — |
| `maat` | `normaal` (h-control) · `groot` (h-control-lg, de bedragchips) | `normaal` |
| `className` | alleen layout | — |
| overige | `button`-attributen, `type="button"` standaard, `ref` | — |

- Vorm: altijd `rounded-full`, `px-4`, `text-sm font-bold`, `whitespace-nowrap`.
- Rust: `border border-border bg-surface text-ink`, hover `border-ink`.
- Geselecteerd: `border-accent bg-accent text-rail` (5,18:1), hover
  `bg-accent-hover`.
- Uitgeschakeld: zoals secundaire `Knop` (`opacity-50`, `cursor-not-allowed`,
  geen hover).
- `StatusFilter` en `BezettingKeuze` bouwen op `Chip`. De teller in
  `StatusFilter` blijft inhoud (children): `text-muted` in rust en in de
  geselecteerde chip `text-rail` (volle dekking; met `/70` haalt hij maar
  3,44:1).

**`Segment`** en **`SegmentBalk`** (`src/components/Segment.tsx`,
`segmentKlassen.ts`):

| Onderdeel | Gedrag |
|---|---|
| `SegmentBalk` | container: `rounded-card bg-track p-1`, `flex`; `role="group"` met `aria-label` of tablist, door de aanroeper |
| `Segment` | knop in de balk. Props: `geselecteerd`, `maat` (`normaal`), `className` voor layout (`flex-1`) |
| `Segment` rust | `text-muted-strong` (5,95:1 op `track`; `text-muted` haalt maar 4,36:1), hover `text-ink`; `rounded-control`, `h-control`, `text-sm font-bold` |
| `Segment` geselecteerd | `bg-surface text-ink shadow-segment` |

- `TabList` (`Tabs.tsx`) krijgt `stijl="segment"` of `stijl="eigen"`
  (standaard `eigen`, dus ongewijzigd). Met `segment` rendert `TabList` zelf de
  balk en de segmentklassen; `item.className` is dan niet nodig. Roving
  tabindex, toetsen en ARIA blijven zoals ze zijn.
- Consumenten: `PortalDashboard` (al een balk), `BeheerTabs` (nieuw: balk),
  `Assortiment` (galerij/lijst, `aria-pressed`), `LogboekLijst`
  (`aria-pressed`) en `TransactiesTab` (`aria-pressed`). `DienstTabs` blijft
  `eigen`.
- `Segment` met `aria-pressed` voor de drie filter-/weergaveknoppen; in een
  `TabList` krijgt de knop `role="tab"` en `aria-selected` van `TabList`.

**`Toets`** (`src/components/Toets.tsx`, klassen in `toetsKlassen.ts`):

| Prop | Waarden |
|---|---|
| `soort` | `keypad` · `stap` |
| `tone` | `licht` · `rail` (alleen `keypad`; standaard `licht`) |
| `className` | alleen layout |
| overige | `button`-attributen, `aria-label` verplicht via het type |

- `keypad` licht: `h-control-lg rounded-control border border-border
  bg-surface text-ink text-lg font-bold`, hover `border-accent`.
- `keypad` rail: `h-14 rounded-card border border-rail-border
  bg-surface-rail text-white text-lg font-bold`, hover `bg-rail-key-hover`.
  De `h-14` is de enige plek waar de schaal bewust wordt overschreden;
  `toetsKlassen.ts` zegt dat in een commentaar.
- `stap` (de ± in `Mandje`): `h-control w-11 rounded-control border
  border-border bg-surface text-ink text-dialog-title`.
- `PinToetsenbord` gebruikt `Toets soort="keypad"`; de ± in `Mandje` gebruikt
  `Toets soort="stap"`.

**Lintregel:** dezelfde `className`-regel als bij `Knop` geldt ook voor
`Chip`, `Segment`, `SegmentBalk` en `Toets` (`KNOP_ELEMENT` wordt
uitgebreid).

**Zichtbare veranderingen in PR 2:**
- chips: geselecteerd is accent in plaats van zwart of accent-active/wit;
  de twee rechthoekige chip-groepen worden pillen;
- `BeheerTabs` krijgt een grijze balk, geselecteerd is een wit vlak;
- `LogboekLijst`-filter en `TransactiesTab` krijgen de segmentstijl;
- toetsen: kleinere afwijkingen in rand, hover en tekst (`text-lg font-bold`
  blijft);
- de drie kale tekstlinks ("← terug naar inloggen/bardienst") worden
  `Knop href variant="tekst"`: onderstreept en 44px hoog.

**Bewust niet in PR 2:** `Tegel` (5: `ModusKeuze` ×2, `StaffPicker`,
`BezettingOverlay`-lidtegel, producttegel in `Assortiment`), optierijen (12) en
de "overig"-knoppen uit PR 1. Ze houden eigen markup met een
reden-commentaar. De `no-restricted-syntax`-ratchet voor rauwe `<button>`
houdt ze zichtbaar.

**Docs in dezelfde PR:** `.claude/rules/ui.md` noemt nog dat `Knop`, `Toets`,
`Tegel` en `Chip` en "`density` bepaalt de controlmaat" nog niet gebouwd zijn;
dat wordt de gebouwde stand van `Knop`, `Chip`, `Segment` en `Toets`, met
ADR 0026.

### Tests (PR 2)

- Unit per component, in de stijl van `test/knop.test.ts`: klassen per
  `geselecteerd`/`maat`/`soort`/`tone`, `type="button"` standaard,
  `aria-pressed` alleen als `geselecteerd` is gezet, volledige
  klasseliteralen, geen `useShell`.
- Lint: `test/knopLint.test.ts` uitbreiden naar `Chip`, `Segment`,
  `SegmentBalk` en `Toets`.
- Contrast: de paren `text-rail` op `accent` (geselecteerde chip), `ink` op
  `surface` (segment geselecteerd), `muted-strong` op `track` (segment in rust), `white` op
  `surface-rail` en `rail-border` (rail-keypad) in `accentContrast.test.ts`.
- e2e/a11y: `e2e/a11y.spec.ts` en de contrast-/focustests blijven groen.
  Tabtoetsenbordgedrag (pijlen, Home/End) blijft ongewijzigd.

## Expliciet buiten scope

- PR 2: `Tegel`, optierijen en de "overig"-knoppen blijven eigen markup (zie
  Aanvulling PR 2).
- `density` gebruiken voor iets anders dan de maat (ADR 0026, punt 2).
- De combobox-trigger van `Select`, de disclosure in `Transactielijst` en de
  knoppen in de waarschuwingsblokken in `Mandje` ("overig" in de inventaris).
  Die blijven in PR 1 eigen markup, met een reden in de code. Een eigen
  variant volgt alleen als de PR 2-spec daarom vraagt.
- `/design/systeem` (stap 6).
