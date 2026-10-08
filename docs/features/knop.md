# Knop, Toets, Tegel en Chip

Status: **voorstel**

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

### Voorstel — technische invulling (door Claude, ter goedkeuring)

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

**PR 2** krijgt bij de start een eigen aanvulling op deze spec: `Toets`,
`Tegel` en `Chip` met hun props, en de segmentstijl. Besluit 3 legt daarvoor
de kleuren al vast.

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

## Expliciet buiten scope

- PR 2: `Toets`, `Tegel`, `Chip`, segmenten, tabs en optierijen. Die krijgen
  een eigen aanvulling op deze spec.
- `density` gebruiken voor iets anders dan de maat (ADR 0026, punt 2).
- De combobox-trigger van `Select`, de disclosure in `Transactielijst` en de
  knoppen in de waarschuwingsblokken in `Mandje` ("overig" in de inventaris).
  Die blijven in PR 1 eigen markup, met een reden in de code. Een eigen
  variant volgt alleen als de PR 2-spec daarom vraagt.
- `/design/systeem` (stap 6).
