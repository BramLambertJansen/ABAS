import type { PortalTransaction } from "@/hooks/queries/usePortalTransactions";

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

const dateFormatter = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
const monthFormatter = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });

/** "28 jul" in lokale tijd. */
export function dateLabel(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
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

function methodLabel(method: string | null): string {
  // Vandaag altijd "cash" (opwaarderen.md → Besloten: uitsluitend contant,
  // geen methode-toggle) — deze mapping bestaat zodat een toekomstige
  // tweede methode niet de rauwe database-waarde op het scherm zet.
  if (!method) return "";
  return method === "cash" ? "contant" : method;
}

/** Detail-subtitel voor één rij: itemomschrijving voor een bestelling
 *  ("2× pils, 1× chips"), "contant" voor een opwaardering. `showReversal`
 *  voegt "· teruggedraaid · {reden}" toe (Transacties-tabblad); de
 *  "Deze maand"-voorproefje op het Saldo-tabblad laat dat weg (spec →
 *  Schermflow §1 noemt alleen label/subtitel/bedrag, geen
 *  teruggedraaid-weergave voor die lijst). */
export function transactionDetail(t: PortalTransaction, showReversal: boolean): string {
  if (t.kind === "opwaardering") return methodLabel(t.method);
  const base = t.itemsDescription && t.itemsDescription.length > 0 ? t.itemsDescription : "bestelling";
  if (showReversal && t.reversed) {
    return `${base} · teruggedraaid · ${t.reversalReason ?? ""}`;
  }
  return base;
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
