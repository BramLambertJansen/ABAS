---
paths:
  - "src/components/**"
  - "src/features/**"
  - "src/shells/**"
  - "src/app/**/*.tsx"
---

# UI, shells en design system

- `src/shells/bar`: tablet/desktop (nooit telefoon, supportuitspraak), PWA zonder
  offline of service-worker-caching. `src/shells/portal`: telefoon-first, ook
  desktop. Verschillen lees je via `useShell()` (`density`, `overlay`,
  `columns`), nooit via `matchMedia`/`userAgent`/`isMobile`.
- Eerste bouw van een scherm: UX en visueel uit `/designs/` (live op
  `/design`). Daarna is het in-app design system de waarheid; afwijken van de
  wireframe is evolutie, geen defect.
- Hergebruik: `node scripts/kit/catalogus.mjs` toont de componenten met hun
  exports en de rij uit `src/components/README.md`. Kopieer geen klasseketens
  uit een ander bestand: dat is een component dat ontbreekt.
- Geen arbitrary Tailwind-waarden (`h-[52px]`, `text-[10px]`) of `!`; kies een
  token. Lint faalt erop; bestaande gevallen staan in de ratchet.
- Toegankelijk vanaf de eerste regel: semantische HTML, zichtbare focus
  (`focus-visible:ring-*`, nooit alleen `outline-hidden`), WCAG 2.1 AA-contrast,
  doelen minimaal 44px, volledig met toetsenbord.
- Sluiten, Annuleren en Klaar volgen `src/components/README.md` → "Sluiten en
  taal".

Tailwind v4 met gereset thema (`--*: initial`, #185 en de tokenschaal in
`docs/features/tokenschaal.md`): alleen wat `@theme` in `src/app/globals.css`
declareert bestaat. Controlhoogte `h-control` (44) / `h-control-lg` (52),
radius `sm`/`control`/`card`/`panel`/`sheet`/`full`, vlakken `bg-surface` /
`bg-surface-rail`. Een standaardklasse buiten het thema (`bg-red-500`) faalt in
de lint; breid het thema niet uit zonder ontwerpbesluit.

Knoppen komen uit `Knop`, `Chip`, `Segment`/`SegmentBalk` en `Toets`
(`docs/features/knop.md`). Je kiest een rol via props (`variant`, `tone`,
`maat`, `geselecteerd`, `soort`), nooit via klassen: `className` op deze
componenten is alleen layout en de lint bewaakt dat. De controlmaat volgt de
rol, niet de shell (ADR 0026): `maat="normaal"` (44px) of `maat="groot"` (52px,
hoofdactie van een dialoog, inlog- of afrekenscherm). `density` bepaalt de maat
niet. `Tegel` en optierijen hebben nog geen component; houd eigen markup en zet
er een reden-commentaar bij.

Een nieuw component in `src/components` krijgt een voorbeeld in
`src/app/design/systeem/voorbeelden.tsx` (`check:catalogus`); een uitzondering
vraagt een code en Brams akkoord.

Besloten maar nog niet gebouwd (ADR 0025 → roadmap): `<AsyncInhoud>` en een
copycatalogus.
