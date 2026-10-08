# ADR 0026 — Controlmaat per rol, niet per density

Status: **goedgekeurd**

Toelichting: herziet ADR 0025 → R5. Bram liet de keuze op 2026-10-08 aan "wat
het beste past in het framework". Uitgewerkt in
[`docs/features/knop.md`](../features/knop.md).

## Context

ADR 0025 R5 besloot: "`density` bepaalt de controlmaat: comfortable 52px (bar),
compact 44px (portal)". De inventaris van 2026-10-08 (roadmap fase 3, stap 3)
laat zien dat de code iets anders doet. De maat volgt de rol van de knop, niet
de shell:

- In de bar zijn dialoog-, inlog-, rail- en afrekenknoppen 52px. Beheer en de
  inline acties in het mandje zijn 44px.
- In het portal zijn alle primaire knoppen 52px. Geen enkele is 44px.

`density` wordt nergens gelezen. R5 letterlijk toepassen maakt elke
portalknop 8px kleiner en elke beheerknop in de bar 8px groter, zonder dat
iemand daarom vroeg.

## Besluit

1. De hoogte van een control is een **expliciete rol** bij de aanroeper:
   - `maat="normaal"` is `h-control` (44px) en de standaard;
   - `maat="groot"` is `h-control-lg` (52px), voor de hoofdactie van een
     dialoog, een inlogscherm, een railscherm of het afrekenen.
2. `density` uit `useShell()` bepaalt de controlmaat **niet**. Het veld blijft
   bestaan. Waar het wel voor dient (spacing, dichtheid van lijsten) beslist
   een latere spec. Tot dan leest geen enkel component het.
3. R5 in ADR 0025 heet vanaf nu "herzien door ADR 0026".

## Waarom dit het beste in het raamwerk past

- **Zichtbaar bij de aanroeper.** De maat staat in de JSX. Een verborgen
  context die per shell anders uitpakt, doet dat niet. Een agent of reviewer
  ziet direct wat er gebouwd wordt.
- **Overdraagbaar.** Een volgend project op hetzelfde raamwerk heeft andere
  shells. "Hoofdactie is groot" werkt daar ook; "bar is groot" niet.
- **Geen ongevraagde verschuiving.** De huidige maten blijven gelijk.

## Gevolgen

- `Knop` heeft een prop `maat` en leest `density` niet.
- ADR 0025 R5 en roadmap fase 3 stap 3 worden bijgewerkt bij de bouw.
