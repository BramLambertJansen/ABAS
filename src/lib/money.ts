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
