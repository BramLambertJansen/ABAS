/**
 * Pure toetslogica voor een tablist (APG "Tabs"), los van React zodat
 * `npm test` hem zonder browser kan testen. Gebruikt door
 * `src/components/Tabs.tsx`.
 * Spec: docs/features/dialogen-tabs-landmarks.md → 6. Tabs.
 */

export type TabOrientation = "horizontal" | "vertical";

/**
 * Doel-index voor een toets op de tab met index `current`, of `null` als de
 * toets niets met navigatie te maken heeft (of op de andere as ligt) en de
 * aanroeper hem dus niet mag afhandelen. `count` is het aantal gerenderde tabs:
 * niet-gerenderde tabs staan er niet in, dus pijlnavigatie slaat ze vanzelf
 * over. Wrap-around aan beide uiteinden.
 */
export function nextTabIndex(
  key: string,
  current: number,
  count: number,
  orientation: TabOrientation
): number | null {
  if (count <= 0 || current < 0 || current >= count) return null;
  const prevKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  switch (key) {
    case nextKey:
      return (current + 1) % count;
    case prevKey:
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
