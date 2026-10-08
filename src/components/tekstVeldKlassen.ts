/**
 * Klassen van `TekstVeld` en `VeldFout` per tone
 * (docs/features/tekstveld-rail-contrast.md), zonder JSX zodat
 * `test/accentContrast.test.ts` de kleurparen zonder renderer kan nalopen.
 * Alle klassen staan als volledige literal strings, zodat Tailwind ze bouwt.
 *
 * Een rail-veld staat op `rail` of `surface-rail`; een licht veld op `surface`
 * of `canvas`. Op een ander vlak is AA niet gegarandeerd: voeg dat vlak eerst
 * aan de contrasttest toe. `placeholder` voegt elke input-tak zelf toe; `input`
 * bevat het daarom niet.
 */

export type TekstVeldTone = "rail" | "light";

const KLASSEN = {
  rail: {
    label: "text-xs font-bold text-rail-muted",
    input:
      "h-control-lg rounded-card border border-rail-border bg-rail px-4 text-sm font-semibold text-white outline-hidden focus:border-accent",
    hint: "text-xs font-semibold text-rail-muted",
    fout: "text-xs font-bold text-rail-error",
    prefix: "text-sm font-bold text-rail-muted",
    placeholder: "placeholder:text-rail-muted",
  },
  light: {
    label: "text-xs font-bold text-muted",
    input:
      "h-control-lg rounded-card border border-border bg-surface px-4 text-sm font-semibold text-ink outline-hidden focus:border-accent",
    hint: "text-xs font-semibold text-muted",
    fout: "text-xs font-bold text-danger",
    prefix: "text-sm font-bold text-muted",
    placeholder: "placeholder:text-muted",
  },
} as const;

/** De klassen per rol (`label`, `input`, `hint`, `fout`, `prefix`, `placeholder`). */
export function tekstVeldKlassen(tone: TekstVeldTone) {
  return KLASSEN[tone];
}
