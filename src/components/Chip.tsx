import { chipOnderdelen, type ChipProps } from "./chipKlassen";

export type { ChipMaat, ChipProps } from "./chipKlassen";

/**
 * De keuzepil van de app (docs/features/knop.md → Aanvulling PR 2): filters,
 * categorieën, bedrag- en persoonskeuze. Altijd een pil; geselecteerd is donker
 * op accent. `geselecteerd` zet `aria-pressed`; zonder die prop (een chip die
 * een overlay opent) staat er geen. `className` is alleen voor layout; een
 * lintregel bewaakt dat. Stijl en props staan in `chipKlassen.ts`.
 *
 * Leest `useShell()`/`density` niet.
 */
export function Chip(props: ChipProps) {
  const { klassen, type, ariaPressed, rest } = chipOnderdelen(props);
  return <button {...rest} type={type} aria-pressed={ariaPressed} className={klassen} />;
}
