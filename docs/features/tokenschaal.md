# Tokenschaal en gereset thema

Status: **voorstel**

Roadmap fase 3, stap 2 (ADR 0025 → R4, voorbereiding op R5). Bouwt voort op
stap 1 (Tailwind v4, #185).

## Doel

Eén vaste schaal voor controlhoogte, radius en surface. Een agent of developer
kiest dan een rol in plaats van een getal. Het thema wordt gereset
(`--*: initial`): daarna bestaat alleen nog wat `@theme` in
`src/app/globals.css` zelf declareert. `no-unknown-classes` keurt daardoor
standaardklassen af die niet bij het ontwerp horen, zoals `bg-red-500`,
`rounded-3xl` en `shadow-2xl`.

Deze stap legt de schaal vast en bouwt nog geen componenten. `Knop`, `Toets`,
`Tegel` en `Chip`, en `density` als bron van de maat, volgen in stap 3 (R3/R5).

## Betrokken shell(s)

Beide. De tokens staan in het gedeelde thema. Hoe `density` de maat kiest
(comfortable 52px voor de bar, compact 44px voor het portal, ADR 0025 R5) is
stap 3. Deze spec legt alleen vast welke tokens daarvoor bestaan.

## Datamodel

n.v.t. — alleen CSS en klassen.

## RPC's

n.v.t. — raakt geen data of geld.

## Rolzichtbaarheid

n.v.t. — er verandert niets aan wie wat ziet.

## Hergebruik & UX-patronen

### Inventaris (bronliteralen in `src`, 2026-10-07, na #185)

Deze inventaris is de basis voor de besluiten hieronder.

**Controlhoogte.** Er zijn 8 hoogtes die op een control-rol lijken:

| Klasse | px | Keer | Onder meer in |
|---|---|---|---|
| `h-11` | 44 | 39 | `TekstVeld`, `StatusFilter`, `Overlay`, `LeesFout`, portalhome |
| `h-[52px]` | 52 | 25 | `ZoekVeld`, `TekstVeld`, `CodeInvoer`, `Assortiment`, `HervatScherm` |
| `h-[50px]` | 50 | 16 | `LidZoeker`, `knopStijlen` (`KNOP_DIALOOG_MAAT`), dienst-afsluiten, sessie-overlays |
| `h-12` | 48 | 15 | `Select`, `TekstVeld`, opwaarderen, wachtwoord herstellen |
| `h-10` | 40 | 8 | `Select`, `AdminMeldingen`, `Transactielijst` |
| `h-9` | 36 | 8 | `DienstStarten`, `DienstenApparaten`, avatar |
| `h-[54px]` | 54 | 7 | `PinToetsenbord`, `TekstVeld`, `PortalLogin`, `Mandje` |
| `h-[42px]` | 42 | 4 | `LedenLijst`, `DienstTabs`, `ProductenLijst` |

Plus `min-h-[44px]` (5×) en `min-h-11` (3×). Een deel van `h-9`/`h-10` zijn
avatars en iconen, geen controls.

**Radius.** 13 waarden naast elkaar:

| Klasse | px | Keer |
|---|---|---|
| `rounded-control` | 12 | 70 |
| `rounded-2xl` | 16 | 51 |
| `rounded-card` | 16 | 28 |
| `rounded-full` | — | 20 |
| `rounded-[15px]` | 15 | 12 |
| `rounded-xl` | 12 | 11 |
| `rounded-[13px]` | 13 | 9 |
| `rounded-[22px]` | 22 | 9 |
| `rounded-[10px]` | 10 | 7 |
| `rounded-[14px]` | 14 | 6 |
| `rounded-[11px]` | 11 | 5 |
| `rounded-lg` | 8 | 4 |
| `rounded-[9px]` | 9 | 4 |
| `rounded-[20px]` / `[18px]` | 20 / 18 | 2 / 2 |
| `rounded-t-[28px]` | 28 | 1 (sheet) |
| `rounded-md` | 6 | 1 |

`rounded-2xl` en `rounded-card` zijn allebei 16px, en `rounded-xl` en
`rounded-control` allebei 12px. Er zijn dus twee namen voor dezelfde maat.

**Surface.** Wit vlak: `bg-white` 98×. Achtergrond: `bg-canvas` 42×.
Donkere kaart: `bg-rail-card` 15×. Schaduwen: `shadow-surface` en
`shadow-surface-hover` bestaan al. Er zijn daarnaast 13 andere schaduwtokens,
plus `shadow-lg` (5×) en `shadow-xs` (2×) uit de standaardset.

**Standaardschalen die `src` nog gebruikt.** Na een reset moeten deze terug
in `@theme`, of naar een eigen token:

- spacing: alle `p-*`, `m-*`, `gap-*`, `w-*`/`h-*`, via de basis `--spacing`;
- breakpoints: `sm:` 10×, `md:` 2×, `lg:` 1×. Ook `min-[700px]:` 10× en
  `min-[1024px]:` 1×; die blijven werken zonder token;
- tekstmaten: `text-sm` 243×, `text-xs` 112×, `text-base` 19×, `text-xl` 6×,
  `text-lg` 5×, `text-2xl` 2×, `text-4xl` 2×;
- kleuren: `white` (ruim 150× over `bg-`, `text-` en `ring-`), `black` 1×;
- containers: `max-w-sm` 24×, `max-w-xs` 6×, `max-w-xl` 4×, `max-w-md` 2×,
  `max-w-5xl` 1×;
- gewichten: `font-bold` 235×, `font-semibold` 133×, `font-extrabold` 112×,
  `font-medium` 43×;
- regelhoogte: `leading-relaxed` 11×, `leading-none` 9×, `leading-tight` 5×,
  `leading-snug` 4×, `leading-normal` 1×;
- letterafstand: `tracking-tight` 17×, `tracking-wide` 11×,
  `tracking-widest` 5×, `tracking-wider` 1×;
- radius: `xl`, `2xl`, `lg`, `md`;
- schaduw: `lg`, `xs`;
- `font-mono` 1×.

### Besluiten

1. **Controlhoogte — besloten (Bram, 2026-10-07).** Er komen twee tokens:
   `h-control` = 44px en `h-control-lg` = 52px (`--height-control`,
   `--height-control-lg`). Dat sluit aan op R5: `density` kiest daar in stap 3
   een van de twee.
   - 48, 50 en 54px schuiven naar 52px. 40 en 42px schuiven naar 44px.
   - Dit zijn kleine, zichtbare verschuivingen. Ze worden per scherm
     gecontroleerd met de screenshotvergelijking (zie Tests).
   - `min-h-[44px]` en `min-h-11` worden `min-h-control`.
   - Nog open: `h-9` (36px) is deels avatar of icoon, deels misschien een
     control. Dat wordt per geval vastgesteld en aan Bram voorgelegd.

2. **Radiusschaal — besloten (Bram, 2026-10-07).** De schaal wordt:

   | Token | px | Voor |
   |---|---|---|
   | `rounded-sm` (`--radius-sm`) | 8 | kleine chips, productafbeeldingen |
   | `rounded-control` | 12 | controls (bestaat al) |
   | `rounded-card` | 16 | kaarten (bestaat al) |
   | `rounded-panel` (`--radius-panel`) | 22 | grote kaarten en tegels |
   | `rounded-sheet` (`--radius-sheet`) | 28 | bovenrand van de sheet |
   | `rounded-full` | — | pillen, avatars |

   - Elke andere waarde gaat naar de dichtstbijzijnde stap. Dat wordt per
     geval bekeken.
   - `rounded-xl` wordt `rounded-control`, `rounded-2xl` wordt
     `rounded-card`, `rounded-lg` wordt `rounded-sm` en `rounded-md` (6px)
     wordt `rounded-sm`.
   - Na de reset bestaan `xl`, `2xl`, `lg` en `md` niet meer.
   - `rounded-sm` is na de reset 8px en niet meer de v4-standaard van 4px.
     Die naam is daarom alleen veilig zolang het thema gereset is.

3. **Surface — besloten (Bram, 2026-10-07).** Er komt per laag een kleurtoken:
   - `--color-surface` (#ffffff) is het lichte vlak: kaarten, velden en
     lijsten op `canvas`. Overal waar `bg-white` als vlak dient, wordt het
     `bg-surface`.
   - `--color-surface-rail` (#1e2127) is het donkere vlak. `bg-rail-card` wordt
     `bg-surface-rail` en `--color-rail-card` vervalt, zodat er één naam per
     waarde is.
   - `bg-canvas` blijft de achtergrond.
   - `white` blijft bestaan voor tekst en iconen op accent of rail, en voor de
     transparante varianten (`bg-white/16` en dergelijke).
   - Schaduwen blijven apart (`shadow-surface` en `shadow-surface-hover`
     bestaan al).
   - Of een `bg-white` een vlak is of iets anders, wordt per geval bepaald.

4. **Omvang — besloten (Bram, 2026-10-07).** Alles gebeurt in deze stap, in
   één PR:
   - tokens toevoegen;
   - het thema resetten;
   - elke bestaande consumer migreren naar `h-control`/`h-control-lg`, de
     radiusschaal en `bg-surface`/`bg-surface-rail`.

   Na een daling legt `npm run lint:prune` de ratchet vast. Elk scherm uit de
   schermmatrix van de audit krijgt een screenshotvergelijking vóór en na.

### Per geval vast te stellen tijdens de bouw

De Developer kiest hier niet zelf. Hij legt een lijst voor aan Bram:

- `h-9` (36px): is het een control (→ 44px) of een avatar/icoon (blijft)?
- Radius 9/10/11/13/14/15/18/20px: welke stap wordt het? De dichtstbijzijnde
  ligt soms precies in het midden.
- `bg-white`: is het een vlak (→ `bg-surface`) of wit als kleur (blijft)?

### Wat vaststaat (ADR 0025 R4)

- Het thema wordt volledig gereset met `--*: initial` aan het begin van
  `@theme`. Wat `src` van de standaardset nodig heeft, komt expliciet terug
  (zie de inventaris). Wat niet terugkomt, is na de reset een onbekende klasse
  en faalt in de lint.
- Geen nieuwe componenten in deze stap.
- Staten (laden, leeg, fout, pending, succes, verouderd): n.v.t. — geen
  nieuw scherm.
- Copy: n.v.t. — geen zichtbare tekst.
- Toon en shell: n.v.t. tot stap 3 (`useShell().density`).
- Toegankelijkheid: controls blijven minstens zo groot als nu. Dezelfde
  contrastparen houden AA (`test/accentContrast.test.ts` leest `@theme`). De
  focusring uit stap 1 blijft ongewijzigd.

## Randgevallen

| Situatie | Gedrag | Foutcode/tekst |
|---|---|---|
| Nieuwe code gebruikt `bg-red-500` of een andere niet-gedeclareerde standaardklasse | Lint faalt (`better-tailwindcss/no-unknown-classes`) | — |
| Klasse alleen in een string buiten `src` | Wordt niet gegenereerd (bronscan `source("../")`, stap 1) | — |
| Dynamisch samengestelde klasse (`h-${maat}`) | Wordt niet gegenereerd; lint ziet hem niet | Reviewwerk: klassen voluit schrijven |
| Arbitrary hoogte of radius (`h-[52px]`, `rounded-[15px]`) | Wordt in deze stap gemigreerd; nieuwe faalt in de lint | — |
| Andere arbitrary waarde (tekstmaat, padding) | Blijft in de ratchet; buiten scope | — |

## Tests

- `npm run build`, en daarna een vergelijking van de gegenereerde CSS vóór en
  na de reset. Elke klasse die `src` gebruikt, moet blijven bestaan, tenzij
  hij bewust naar een token is gemigreerd.
- `check:a11y` en de bestaande e2e-contrast- en focustests
  (`e2e/contrast-controls-bar.spec.ts`) blijven groen.
- `test/accentContrast.test.ts` blijft groen.
- Nieuw: een test die bevestigt dat een niet-gedeclareerde standaardklasse
  (`bg-red-500`) door `no-unknown-classes` wordt geweigerd. Zo bewijst de test
  dat de reset werkt.
- Bij zichtbare verschuivingen (besluit 1/2): een screenshotvergelijking per
  scherm uit de audit (`docs/audits/2026-10-06-componenten-tokens/`).

## Expliciet buiten scope

- `Knop`/`Toets`/`Tegel`/`Chip` en de lintregel tegen maatklassen in
  `className` (stap 3, R3).
- `density` die de controlmaat kiest (stap 3, R5).
- Typografierollen voorbij de bestaande `text-screen-title` … `text-detail`,
  en de 10 arbitrary tekstmaten (`text-[10.5px]` enz.).
- Spacing-schaal, en de arbitrary paddings en gaps.
- `/design/systeem` met screenshots (stap 6).
