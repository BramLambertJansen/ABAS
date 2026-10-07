---
name: nieuw-component
description: Maak of wijzig een gedeeld UI-component in src/components voor ABAS. Controleert eerst de catalogus op hergebruik, en legt variant, toegankelijkheid en de README-rij vast. Gebruik vóór je nieuwe UI maakt die op meer dan één plek kan voorkomen.
---

# /nieuw-component

## Wat er al is

!`node scripts/kit/catalogus.mjs componenten`

## Stappen

1. **Bestaat het al?** Lees de lijst hierboven. Past een bestaand component
   met een extra variant: breid dat uit in plaats van een nieuw te maken.
   Twee bijna-gelijke componenten zijn een reviewfout.
2. **API**: props voor betekenis (`tone`, `maat`, `variant`, `status`), niet
   voor stijl. `className` alleen voor layout van de buitenkant (marge, grid,
   flex) — geen kleur, maat of radius (ADR 0025, besluit 3).
3. **Stijl**: alleen tokens uit het `@theme`-blok in `src/app/globals.css`; geen arbitrary values,
   geen `!`. Ontbreekt een token: dat is een vraag aan Bram, geen
   `h-[52px]`.
4. **Shell**: maat en dichtheid uit `useShell()`, nooit uit `matchMedia`.
5. **Toegankelijkheid**: semantisch element, toegankelijke naam,
   `focus-visible:ring-*`, minimaal 44px doel, aria-disabled waar focus moet
   blijven. Contrast van elk bg/tekst-paar binnen één klasse-literal (de
   contrasttest leest dat).
6. **README**: voeg een rij toe aan de keuzehulp in `src/components/README.md`
   (taak, bouwblok, varianten/states/consumers). `node scripts/kit/catalogus.mjs
   --ontbrekend` moet leeg blijven.
7. Draai `npm run check:fast`.
