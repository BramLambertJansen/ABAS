import Link from "next/link";
import { knopOnderdelen, type KnopProps } from "./knopKlassen";

export type { KnopMaat, KnopProps, KnopTone, KnopVariant } from "./knopKlassen";

/**
 * De knop van de app (docs/features/knop.md, ADR 0026). Een feature kiest een
 * rol, geen klassen: `variant`, `tone` en `maat`. `className` is alleen voor
 * layout (`flex-1`, `w-full`, `self-end`, marges); een lintregel bewaakt dat.
 * Stijl en props staan in `knopKlassen.ts`.
 *
 * Leest `useShell()`/`density` niet: de maat is een rol bij de aanroeper.
 * Uitgeschakeld (`disabled` én `aria-disabled`) heeft dezelfde stijl; hover
 * verandert dan niets. `aria-disabled` is de vorm waar de focus moet blijven.
 * De focusring komt uit de globale regel in globals.css.
 */
export function Knop(props: KnopProps) {
  const onderdelen = knopOnderdelen(props);
  if (onderdelen.soort === "link") {
    const { href, ...rest } = onderdelen.rest;
    return <Link {...rest} href={href} className={onderdelen.klassen} />;
  }
  return <button {...onderdelen.rest} type={onderdelen.type} className={onderdelen.klassen} />;
}
