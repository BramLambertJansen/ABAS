import type { ButtonHTMLAttributes, HTMLAttributes, Ref } from "react";

/**
 * Stijl en props van `Segment` en `SegmentBalk` (docs/features/knop.md →
 * Aanvulling PR 2), zonder JSX zodat `test/segment.test.ts` ze zonder renderer
 * kan nalopen. Alle klassen staan als volledige literal strings. `TabList`
 * gebruikt `segmentBalkKlassen` en `segmentKlassen` direct (stijl="segment").
 * Leest `density` niet (ADR 0026).
 */

export type SegmentMaat = "normaal" | "groot";

export type SegmentProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-pressed"> & {
  /** `true`/`false` zet `aria-pressed`; weggelaten: geen `aria-pressed`. */
  geselecteerd?: boolean;
  maat?: SegmentMaat;
  /** Alleen layout (`flex-1`); geen kleur, rand, hoogte of padding. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

export type SegmentBalkProps = Omit<HTMLAttributes<HTMLDivElement>, "className"> & {
  /** Alleen layout (`mx-5`, `mt-4`, `flex-wrap`); geen kleur, rand of padding. */
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

const VORM =
  "flex items-center justify-center whitespace-nowrap rounded-control px-4 text-sm font-bold transition-colors";

const MAAT = {
  normaal: "h-control",
  groot: "h-control-lg",
} as const;

const KLEUR = {
  rust: "text-muted-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
  geselecteerd: "bg-surface text-ink shadow-segment disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
} as const;

/** De klassen van de balk om de segmenten; apart geëxporteerd voor de unit-tests. */
export function segmentBalkKlassen(className?: string): string {
  return ["flex gap-1 rounded-card bg-track p-1", className].filter(Boolean).join(" ");
}

/** De klassen van een segment; apart geëxporteerd voor de unit-tests. */
export function segmentKlassen({
  geselecteerd = false,
  maat = "normaal",
  className,
}: {
  geselecteerd?: boolean;
  maat?: SegmentMaat;
  className?: string;
}): string {
  return [VORM, MAAT[maat], geselecteerd ? KLEUR.geselecteerd : KLEUR.rust, className]
    .filter(Boolean)
    .join(" ");
}

/** Wat `Segment` rendert: de klassen, het type en de overige attributen. */
export function segmentOnderdelen(props: SegmentProps) {
  const { geselecteerd, maat, className, type = "button", ...rest } = props;
  return {
    klassen: segmentKlassen({ geselecteerd: geselecteerd === true, maat, className }),
    type,
    ariaPressed: geselecteerd,
    rest,
  };
}
