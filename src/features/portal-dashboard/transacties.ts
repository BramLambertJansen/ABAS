import type { PortalTransaction } from "@/hooks/queries/usePortalTransactions";
import { PORTAL_TIME_ZONE } from "../../lib/verversen.ts";
import { methodLabel } from "../../lib/betaalmethode.ts";

/**
 * Pure logica achter het Transacties-tabblad (docs/features/
 * portal-dashboard.md → Schermflow §2): filteren op soort, groeperen per
 * maand, en de tekst per rij. Geen React, geen Supabase — zelfde scheiding
 * als `src/features/dienst-overzicht/ledger.ts`. Bedragen worden hier nooit
 * berekend, alleen weergegeven.
 */

export type TransactionFilter = "alles" | "uitgaven" | "opwaarderingen";

export type TransactionGroup = {
  /** Uniek per jaar+maand — niet alleen de maandnaam, anders vallen januari
   *  2026 en januari 2027 samen. */
  key: string;
  /** "Juli 2026" */
  label: string;
  items: PortalTransaction[];
};

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  timeZone: PORTAL_TIME_ZONE,
});
const monthFormatter = new Intl.DateTimeFormat("nl-NL", {
  month: "long",
  year: "numeric",
  timeZone: PORTAL_TIME_ZONE,
});
const monthPartsFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "numeric",
  timeZone: PORTAL_TIME_ZONE,
});

/** "28 jul" in Nederlandse tijd. */
export function dateLabel(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

function monthKey(iso: string): string {
  const parts = monthPartsFormatter.formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

function monthLabel(iso: string): string {
  const label = monthFormatter.format(new Date(iso));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "Bestelling" (wireframe-woord, lid-gericht — bewust anders dan de
 *  bar-tablet se eigen "verkoop"-badge) of "Opgewaardeerd". Blijft
 *  ongewijzigd voor een teruggedraaide bestelling: het is en blijft een
 *  bestelling, alleen doorgestreept (zie TransactieRij.tsx). */
export function transactionLabel(t: Pick<PortalTransaction, "kind">): string {
  return t.kind === "bestelling" ? "Bestelling" : "Opgewaardeerd";
}

/** Detail-subtitel voor één rij: itemomschrijving voor een bestelling
 *  ("2× pils, 1× chips"), "contant" voor een opwaardering. De status van een
 *  teruggedraaide bestelling zit hier bewust niet in (een afgekapte string
 *  verbergt hem op een smal scherm): die staat in `reversalLines` en de
 *  badge van `TransactieRij`. */
export function transactionDetail(t: PortalTransaction): string {
  if (t.kind === "opwaardering") return methodLabel(t.method);
  return t.itemsDescription && t.itemsDescription.length > 0 ? t.itemsDescription : "bestelling";
}

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

/** De regels "Door: {naam}" en "Reden: {reden}" van een teruggedraaide
 *  bestelling (besluit 3, spec → Wie terugdraaide). Letterlijk de waarde
 *  van de server; een ontbrekende of lege waarde laat alleen die regel
 *  vervallen. `reversedVia` (het kanaal) komt hier nooit in voor. Geen
 *  regels voor een gewone bestelling of opwaardering. */
export function reversalLines(t: PortalTransaction): string[] {
  if (!t.reversed) return [];
  const lines: string[] = [];
  if (hasText(t.reversedByName)) lines.push(`Door: ${t.reversedByName}`);
  if (hasText(t.reversalReason)) lines.push(`Reden: ${t.reversalReason}`);
  return lines;
}

/** Teken voor het bedrag: een teruggedraaide bestelling krijgt er geen
 *  (besluit 2), een opwaardering "+", een gewone bestelling "−". */
export function amountSign(t: PortalTransaction): "" | "+ " | "− " {
  if (t.reversed) return "";
  return t.kind === "opwaardering" ? "+ " : "− ";
}

export const REVERSAL_EXPLANATION =
  "Een teruggedraaide bestelling is niet meer afgeschreven; het bedrag staat al terug op je saldo.";

/** De uitlegregel hoort bij de rijen die je ziet: alleen als er minstens één
 *  teruggedraaide bestelling in staat. */
export function showReversalExplanation(visible: PortalTransaction[]): boolean {
  return visible.some((t) => t.reversed);
}

/** Aantal rijen in "Recente transacties" op Saldo (besluit 5). */
export const RECENT_TRANSACTIONS_LIMIT = 5;

/** De eerste N van de lijst zoals de server hem levert; teruggedraaide
 *  bestellingen tellen mee. Sorteert nooit (besluit 7). */
export function recentTransactions(transactions: PortalTransaction[]): PortalTransaction[] {
  return transactions.slice(0, RECENT_TRANSACTIONS_LIMIT);
}

/** Een teruggedraaide bestelling telt hier als "Uitgaven" (spec → Schermflow
 *  §2: "het is en blijft een bestelling"), niet als een aparte categorie. */
export function filterTransactions(
  transactions: PortalTransaction[],
  filter: TransactionFilter
): PortalTransaction[] {
  if (filter === "uitgaven") return transactions.filter((t) => t.kind === "bestelling");
  if (filter === "opwaarderingen") return transactions.filter((t) => t.kind === "opwaardering");
  return transactions;
}

/** Groepeert opeenvolgende transacties van dezelfde maand. Verwacht de
 *  lijst al gesorteerd (nieuwste eerst, zoals `list_own_transactions()` hem
 *  levert) — groepeert, herordent niet. */
export function groupByMonth(transactions: PortalTransaction[]): TransactionGroup[] {
  const groups: TransactionGroup[] = [];
  for (const t of transactions) {
    const key = monthKey(t.createdAt);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: monthLabel(t.createdAt), items: [] };
      groups.push(group);
    }
    group.items.push(t);
  }
  return groups;
}
