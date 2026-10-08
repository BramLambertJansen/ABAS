import { toetsOnderdelen, type ToetsProps } from "./toetsKlassen";

export type { ToetsProps, ToetsSoort, ToetsTone } from "./toetsKlassen";

/**
 * Een toets zonder zichtbare naam (docs/features/knop.md → Aanvulling PR 2):
 * `soort="keypad"` (cijfertoets in `PinToetsenbord`, `tone` licht of rail) en
 * `soort="stap"` (± in het mandje). `aria-label` is verplicht via het type.
 * `className` is alleen voor layout; een lintregel bewaakt dat. Stijl en props
 * staan in `toetsKlassen.ts`.
 *
 * Leest `useShell()`/`density` niet.
 */
export function Toets(props: ToetsProps) {
  const { klassen, type, rest } = toetsOnderdelen(props);
  return <button {...rest} type={type} className={klassen} />;
}
