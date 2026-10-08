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

Besloten maar nog niet gebouwd (ADR 0025 → roadmap): `Knop`/`Toets`/`Tegel`/`Chip` met een variantobject
(`className` alleen voor layout), `density` bepaalt de controlmaat
(comfortable 52px, compact 44px), `<AsyncInhoud>` en een copycatalogus,
`/design/systeem` met screenshots.
