/**
 * Gedeelde kleur- en toestandsklassen voor knoppen (T12, #132). Platte
 * stringconstanten, geen component: de knoppen verschillen in maat, vorm en
 * schaduw (`flex-1`, `h-[50px]`, `h-[54px]`), en dat blijft bij de aanroeper.
 * Hier staat alleen wat het contrast en de toestanden bewaakt. Tailwind scant
 * `./src/**\/*.{ts,tsx}`, dus klassen in dit bestand worden gebouwd.
 *
 * Woordenlijst voor knop- en dialoogteksten (vast):
 * - Sluiten: een weergave of dialoog sluiten, zonder iets af te breken of te
 *   bevestigen (de Sluiten-knop van `Overlay`).
 * - Annuleren: een lopende handeling of invoer afbreken (uitgesproken
 *   werkwoord; niet "Annuleer").
 * - Klaar: alleen een bewerkscherm waarvan de wijzigingen al live zijn
 *   opgeslagen afronden (nu alleen `BezettingOverlay`).
 * - Terug: alleen navigeren, of de "weggooien?"-vraag verlaten
 *   (`WEGGOOIEN_TERUG_KNOP`, mandje).
 * - Contant: de betaalmethode in de UI; "cash" komt nooit op het scherm
 *   (`methodLabel`).
 * - Uitnodiging: nooit "Invite" in UI-tekst.
 *
 * Controlmaten (nieuw werk kiest uit deze twee): knop/invoer `h-11` (44px)
 * met `rounded-control`; grote primaire dialoogknop `KNOP_DIALOOG_MAAT`.
 */

/**
 * Witte tekst op een accentknop. Rust `accent-active` (4,83:1), hover en
 * ingedrukt `accent-pressed` (5,61:1): de hover wordt donkerder, nooit
 * `accent`/`accent-hover` (die halen geen 4,5:1 met wit). Uitgeschakeld
 * (`disabled:`) valt buiten WCAG 1.4.3; `disabled:` staat in Tailwind na
 * `hover:`/`active:`, dus de hoverkleur lekt niet door.
 */
export const KNOP_ACCENT_WIT =
  "bg-accent-active text-white transition-colors hover:bg-accent-pressed active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-track disabled:text-muted";

/** Donkere tekst op accent; hover is lichter (`accent-hover`, 6,03:1). */
export const KNOP_ACCENT_DONKER =
  "bg-accent text-rail transition-colors hover:bg-accent-hover active:bg-accent-hover disabled:cursor-not-allowed disabled:bg-track disabled:text-muted";

/** Witte knop met rand (Sluiten, Annuleren). */
export const KNOP_RAND =
  "border border-border bg-white text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";

/** De tweede (grote) maat: primaire dialoogknop. */
export const KNOP_DIALOOG_MAAT = "h-[50px] rounded-2xl";
