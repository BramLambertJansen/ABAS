/**
 * VERVALT (docs/features/knop.md, PR 1): niets in src/ importeert dit bestand
 * meer, de knoppen komen uit `Knop` (src/components/Knop.tsx). Het bestand
 * staat er alleen nog omdat `test/accentContrast.test.ts` het importeert;
 * verwijder het samen met die import. De woordenlijst voor knopteksten staat
 * nu in src/components/README.md → "Sluiten en taal".
 */

/**
 * Witte tekst op een accentknop. Rust `accent-active` (4,83:1), hover en
 * ingedrukt `accent-pressed` (5,61:1): de hover wordt donkerder, nooit
 * `accent`/`accent-hover` (die halen geen 4,5:1 met wit). Uitgeschakeld
 * (`disabled:`) valt buiten WCAG 1.4.3; `disabled:` staat in Tailwind na
 * `hover:`/`active:`, dus de hoverkleur lekt niet door.
 */
export const KNOP_ACCENT_WIT =
  "bg-accent-active text-white transition-colors hover:bg-accent-pressed active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-track disabled:text-muted aria-disabled:cursor-not-allowed aria-disabled:bg-track aria-disabled:text-muted aria-disabled:hover:bg-track aria-disabled:active:bg-track";

/** Donkere tekst op accent; hover is lichter (`accent-hover`, 6,03:1). */
export const KNOP_ACCENT_DONKER =
  "bg-accent text-rail transition-colors hover:bg-accent-hover active:bg-accent-hover disabled:cursor-not-allowed disabled:bg-track disabled:text-muted aria-disabled:cursor-not-allowed aria-disabled:bg-track aria-disabled:text-muted aria-disabled:hover:bg-track aria-disabled:active:bg-track";

/** Witte knop met rand (Sluiten, Annuleren). */
export const KNOP_RAND =
  "border border-border bg-surface text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
