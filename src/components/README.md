# components/

Shared, reusable UI building blocks. Search here before writing a new one —
see CLAUDE.md → "Componenten zijn herbruikbaar totdat bewezen anders."

## Gedeelde opmaak

`src/app/globals.css` bevat de gedeelde stijlen voor bediening:

- `ui-button-primary`: oranje primaire actie met donkere tekst, een
  contrasterende hoverkleur en dezelfde disabled-stijl voor `disabled` en
  `aria-disabled`. Het attribuut en de bestaande submit-guards bepalen gedrag.
- `ui-action`: volledige dialoogactie, 52px hoog en `rounded-control`.
  Compacte acties in lijsten behouden hun eigen hoogte.
- `ui-field-focus` en `ui-field-group-focus`: dezelfde focusrand en ring voor
  losse invoervelden en samengestelde velden (zoals een eurobedrag).

Kleuren, afrondingen en de bedieningshoogte staan in `tailwind.config.ts`.
Manrope wordt eenmaal met `next/font/local` geladen in de root-layout; het
fontbestand en de OFL-licentie staan in `src/app/fonts/`.
