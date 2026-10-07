/** Mandje-regel: alleen product-id + aantal. Nooit een prijs of totaal —
 *  die worden altijd uit de al-geladen productlijst afgeleid voor weergave
 *  (client-subtotaal, puur ter info) en nooit meegestuurd aan
 *  `place_order` (CLAUDE.md → Architectuurbeslissingen). */
export type CartLine = { productId: string; qty: number };

/** Immutable +/− op een mandje-regel. Een regel die op 0 of lager komt
 *  verdwijnt uit het mandje — zelfde gedrag als de losse "verwijderen"-
 *  knop, alleen bereikt via de stepper. */
export function applyDelta(
  lines: CartLine[],
  productId: string,
  delta: number
): CartLine[] {
  const index = lines.findIndex((line) => line.productId === productId);
  const huidig = lines[index];
  if (index === -1 || !huidig) {
    return delta > 0 ? [...lines, { productId, qty: delta }] : lines;
  }
  const nextQty = huidig.qty + delta;
  if (nextQty <= 0) {
    return lines.filter((_, i) => i !== index);
  }
  const next = lines.slice();
  next[index] = { productId, qty: nextQty };
  return next;
}

export function removeLine(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

/** Wist het kiezen van dit lid het mandje? Eén regel voor `chooseMember`
 *  (doet het wissen) en `Mandje` (toont daarvoor eerst de bevestiging).
 *  Alleen bij een ánder lid dan het laatst gekozen lid én een gevuld mandje:
 *  zonder eerder lid of met hetzelfde lid blijft het mandje staan (geen
 *  afrekening bij de verkeerde betaler, docs/features/verkoop.md → §2).
 *  `lastMemberId` overleeft "wissel", `selectedMemberId` niet. */
export function lidwisselWistMandje(
  lastMemberId: string | null,
  memberId: string,
  aantalRegels: number
): boolean {
  return lastMemberId !== null && lastMemberId !== memberId && aantalRegels > 0;
}
