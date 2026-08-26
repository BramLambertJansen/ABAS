/**
 * Cents → Dutch euro display string ("€ 4,53", "-€ 1,00"). Display-only
 * formatting, shared by every screen that shows a price/saldo/total —
 * never used to *compute* an amount. Money itself is only ever computed
 * server-side inside an RPC (CLAUDE.md → Architectuurbeslissingen); this
 * just renders a `*_cents` integer that already came from the server (or,
 * for a client-side subtotal preview, from the already-loaded product
 * list — see docs/features/verkoop.md → Schermflow §2, "Totaal").
 */
const formatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

/** Parses a euro input like "2,50", "2.50", "2" into whole cents. Accepts
 *  either decimal separator (Dutch keyboards default to comma). Returns
 *  `null` for anything that isn't a valid, non-negative amount — callers
 *  treat `null` the same as "not a valid price yet", not as €0. Input
 *  parsing, not amount computation — CLAUDE.md → "Berekent nooit een bedrag
 *  client-side" is about totals/prices, which always come back from an RPC
 *  response (create_product/update_product_price return the row as
 *  stored); turning what a beheerder typed into the integer cents an RPC
 *  parameter expects isn't computing an amount. */
export function parseEuroToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "") return null;
  // Reject anything that isn't a plain decimal number (no leading `+`,
  // exponents, multiple dots, etc.) — parseFloat alone would silently
  // accept "2.50abc" as 2.5.
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
