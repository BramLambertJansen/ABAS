import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from "react";

/**
 * Stijl en props van `Knop` (docs/features/knop.md, ADR 0026), zonder JSX zodat
 * `test/knop.test.ts` ze zonder renderer kan nalopen. Alle klassen staan als
 * volledige literal strings, zodat Tailwind ze bouwt en
 * `test/accentContrast.test.ts` de kleurparen kan nalopen. Leest `density`
 * niet: de maat is een rol bij de aanroeper.
 */

export type KnopVariant = "primair" | "secundair" | "gevaar" | "tekst";
export type KnopTone = "licht" | "rail";
export type KnopMaat = "normaal" | "groot";

type Gedeeld = {
  variant?: KnopVariant;
  tone?: KnopTone;
  maat?: KnopMaat;
  /** Alleen layout (`flex-1`, `w-full`, marges); geen kleur, rand, hoogte of padding. */
  className?: string;
};

/** Een icoonknop is vierkant en heeft altijd een toegankelijke naam. */
type IcoonRegel = { icoon?: false } | { icoon: true; "aria-label": string };

type KnopAlsKnop = Gedeeld &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
    href?: undefined;
    ref?: Ref<HTMLButtonElement>;
  };

/** Een link is niet uit te schakelen en heeft geen klikhandler: dat is een knop. */
type KnopAlsLink = Gedeeld &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href" | "onClick"> & {
    href: string;
    onClick?: never;
    disabled?: never;
    ref?: Ref<HTMLAnchorElement>;
  };

export type KnopProps = (KnopAlsKnop | KnopAlsLink) & IcoonRegel;

const VORM = "flex items-center justify-center text-sm font-bold transition-colors";

const MAAT = {
  normaal: "h-control rounded-control px-4",
  groot: "h-control-lg rounded-card px-4",
} as const;

// Tekstknop: geen horizontale padding, zodat de tekst op dezelfde plek blijft staan.
const MAAT_TEKST = {
  normaal: "h-control rounded-control",
  groot: "h-control-lg rounded-card",
} as const;

const MAAT_ICOON = {
  normaal: "h-control w-11 flex-none rounded-control no-underline",
  groot: "h-control-lg w-13 flex-none rounded-card no-underline",
} as const;

const KLEUR = {
  primair: {
    licht:
      "bg-accent text-rail hover:bg-accent-hover active:bg-accent-hover disabled:cursor-not-allowed disabled:bg-track disabled:text-muted aria-disabled:cursor-not-allowed aria-disabled:bg-track aria-disabled:text-muted aria-disabled:hover:bg-track aria-disabled:active:bg-track",
    rail:
      "bg-accent text-rail hover:bg-accent-hover active:bg-accent-hover disabled:cursor-not-allowed disabled:bg-track disabled:text-muted aria-disabled:cursor-not-allowed aria-disabled:bg-track aria-disabled:text-muted aria-disabled:hover:bg-track aria-disabled:active:bg-track",
  },
  secundair: {
    licht:
      "border border-border bg-surface text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-border",
    rail:
      "border border-rail-border bg-surface-rail text-rail-light hover:bg-rail-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-rail aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-surface-rail",
  },
  gevaar: {
    licht:
      "bg-danger text-white hover:bg-ink active:bg-ink disabled:cursor-not-allowed disabled:bg-track disabled:text-muted aria-disabled:cursor-not-allowed aria-disabled:bg-track aria-disabled:text-muted aria-disabled:hover:bg-track aria-disabled:active:bg-track",
    rail:
      "bg-danger text-white hover:bg-ink active:bg-ink disabled:cursor-not-allowed disabled:bg-track disabled:text-muted aria-disabled:cursor-not-allowed aria-disabled:bg-track aria-disabled:text-muted aria-disabled:hover:bg-track aria-disabled:active:bg-track",
  },
  tekst: {
    licht:
      "text-muted underline hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:text-muted",
    rail:
      "text-rail-muted underline hover:text-rail-light disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-rail-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:text-rail-muted",
  },
} as const;

/** De klassen van een knop; apart geëxporteerd voor de unit-tests. */
export function knopKlassen({
  variant = "secundair",
  tone = "licht",
  maat = "normaal",
  icoon = false,
  className,
}: Gedeeld & { icoon?: boolean }): string {
  const afmeting = icoon ? MAAT_ICOON[maat] : variant === "tekst" ? MAAT_TEKST[maat] : MAAT[maat];
  return [VORM, afmeting, KLEUR[variant][tone], className].filter(Boolean).join(" ");
}

/** Wat `Knop` rendert: een link of een knop, met de klassen en de overige attributen. */
export function knopOnderdelen(props: KnopProps) {
  const { variant, tone, maat, icoon, className } = props;
  const klassen = knopKlassen({ variant, tone, maat, icoon: icoon === true, className });
  if (props.href !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gedeelde props horen niet op de <a>
    const { variant: _v, tone: _t, maat: _m, icoon: _i, className: _c, ...rest } = props;
    return { soort: "link" as const, klassen, rest };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gedeelde props horen niet op de <button>
  const { variant: _v, tone: _t, maat: _m, icoon: _i, className: _c, type = "button", ...rest } = props;
  return { soort: "knop" as const, klassen, type, rest };
}
