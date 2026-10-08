import type { ButtonHTMLAttributes, Ref } from "react";

/**
 * Stijl en props van `Toets` (docs/features/knop.md → Aanvulling PR 2), zonder
 * JSX zodat `test/toets.test.ts` ze zonder renderer kan nalopen. Alle klassen
 * staan als volledige literal strings. Leest `density` niet (ADR 0026).
 *
 * De rail-keypadtoets is `h-14` (56px): dat is de enige plek waar de
 * controlschaal (44/52) bewust wordt overschreden, een eigen toetsmaat en geen
 * token (besluit Bram, 2026-10-08).
 */

export type ToetsSoort = "keypad" | "stap";
export type ToetsTone = "licht" | "rail";

type Gedeeld = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label"> & {
  /** Een toets heeft geen zichtbare naam: de toegankelijke naam is verplicht. */
  "aria-label": string;
  /** Alleen layout; geen kleur, rand, hoogte of padding. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

export type ToetsProps =
  | (Gedeeld & { soort: "keypad"; tone?: ToetsTone })
  | (Gedeeld & { soort: "stap"; tone?: never });

const VORM = "flex items-center justify-center border font-bold transition-colors";

const KEYPAD = {
  licht:
    "h-control-lg rounded-control border-border bg-surface text-ink text-lg hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
  rail: "h-14 rounded-card border-rail-border bg-surface-rail text-white text-lg hover:bg-rail-key-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-rail",
} as const;

const STAP =
  "h-control w-11 rounded-control border-border bg-surface pb-0.5 text-ink text-dialog-title leading-none hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border";

/** De klassen van een toets; apart geëxporteerd voor de unit-tests. */
export function toetsKlassen({
  soort,
  tone = "licht",
  className,
}: {
  soort: ToetsSoort;
  tone?: ToetsTone;
  className?: string;
}): string {
  const kleur = soort === "stap" ? STAP : KEYPAD[tone];
  return [VORM, kleur, className].filter(Boolean).join(" ");
}

/** Wat `Toets` rendert: de klassen, het type en de overige attributen. */
export function toetsOnderdelen(props: ToetsProps) {
  const { soort, tone, className, type = "button", ...rest } = props;
  return { klassen: toetsKlassen({ soort, tone, className }), type, rest };
}
