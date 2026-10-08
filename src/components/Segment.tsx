import {
  segmentBalkKlassen,
  segmentOnderdelen,
  type SegmentBalkProps,
  type SegmentProps,
} from "./segmentKlassen";

export type { SegmentBalkProps, SegmentMaat, SegmentProps } from "./segmentKlassen";

/**
 * Een gesegmenteerde keuze (docs/features/knop.md → Aanvulling PR 2): een
 * `SegmentBalk` (grijze ondergrond) met `Segment`-knoppen. Geselecteerd is een
 * wit vlak met schaduw. `geselecteerd` zet `aria-pressed`. Voor tabs gebruik je
 * `TabList stijl="segment"` (`Tabs.tsx`), niet deze knop: die zet de tab-ARIA.
 *
 * De balk krijgt zijn rol (`role="group"` met `aria-label`) van de aanroeper.
 * `className` is alleen voor layout; een lintregel bewaakt dat. Stijl en props
 * staan in `segmentKlassen.ts`. Leest `useShell()`/`density` niet.
 */
export function SegmentBalk({ className, ...rest }: SegmentBalkProps) {
  return <div {...rest} className={segmentBalkKlassen(className)} />;
}

export function Segment(props: SegmentProps) {
  const { klassen, type, ariaPressed, rest } = segmentOnderdelen(props);
  return <button {...rest} type={type} aria-pressed={ariaPressed} className={klassen} />;
}
