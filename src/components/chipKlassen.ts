import type { ButtonHTMLAttributes, Ref } from "react";

/**
 * Stijl en props van `Chip` (docs/features/knop.md → Aanvulling PR 2), zonder
 * JSX zodat `test/chip.test.ts` ze zonder renderer kan nalopen. Alle klassen
 * staan als volledige literal strings, zodat Tailwind ze bouwt en
 * `test/accentContrast.test.ts` de kleurparen kan nalopen. Leest `density`
 * niet: de maat is een rol bij de aanroeper (ADR 0026).
 */

export type ChipMaat = "normaal" | "groot";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-pressed"> & {
  /** `true`/`false` zet `aria-pressed`; weggelaten: geen `aria-pressed` (bv. een chip die een overlay opent). */
  geselecteerd?: boolean;
  maat?: ChipMaat;
  /** Alleen layout (`flex-none`, marges); geen kleur, rand, hoogte of padding. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

// Een chip is altijd een pil.
const VORM =
  "flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors";

const MAAT = {
  normaal: "h-control",
  groot: "h-control-lg",
} as const;

const KLEUR = {
  rust: "border border-border bg-surface text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-border",
  geselecteerd:
    "border border-accent bg-accent text-rail hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-accent",
} as const;

/** De klassen van een chip; apart geëxporteerd voor de unit-tests. */
export function chipKlassen({
  geselecteerd = false,
  maat = "normaal",
  className,
}: {
  geselecteerd?: boolean;
  maat?: ChipMaat;
  className?: string;
}): string {
  return [VORM, MAAT[maat], geselecteerd ? KLEUR.geselecteerd : KLEUR.rust, className]
    .filter(Boolean)
    .join(" ");
}

/** Wat `Chip` rendert: de klassen, het type en de overige attributen. */
export function chipOnderdelen(props: ChipProps) {
  const { geselecteerd, maat, className, type = "button", ...rest } = props;
  return {
    klassen: chipKlassen({ geselecteerd: geselecteerd === true, maat, className }),
    type,
    ariaPressed: geselecteerd,
    rest,
  };
}
