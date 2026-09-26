import { formatCents } from "@/lib/money";
import type { PortalTransaction } from "@/hooks/queries/usePortalTransactions";
import { dateLabel, transactionDetail, transactionLabel } from "./transacties";

/**
 * Eén transactierij, gedeeld door `SaldoTab`'s "Deze maand"-voorproefje en
 * `TransactiesTab`'s volledige, gegroepeerde lijst — zelfde velden
 * (label/subtitel/bedrag), zie docs/features/portal-dashboard.md →
 * Schermflow. Alleen `TransactiesTab` toont de teruggedraaid-weergave
 * (`showReversal`): doorgestreept, subtitel aangevuld, `sr-only`-toevoeging
 * bij het bedrag (WCAG AA — niet uitsluitend doorstrepen als signaal),
 * zelfde conventie als `src/features/dienst-overzicht/Transactielijst.tsx`.
 * Geen ⤺-knop: een lid kan hier nooit iets terugdraaien (spec → Schermflow
 * §2).
 */
export function TransactieRij({
  transaction,
  showReversal,
}: {
  transaction: PortalTransaction;
  showReversal: boolean;
}) {
  const reversed = showReversal && transaction.reversed;
  const isCredit = transaction.kind === "opwaardering";

  return (
    <li className="flex items-center gap-3 border-b border-border-subtle py-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`truncate text-sm font-bold ${reversed ? "text-muted line-through" : "text-ink"}`}
        >
          {transactionLabel(transaction)}
        </span>
        <span className="truncate text-xs font-medium text-muted">
          {dateLabel(transaction.createdAt)} · {transactionDetail(transaction, showReversal)}
        </span>
      </div>
      <span
        className={`flex-none whitespace-nowrap text-sm font-extrabold ${
          reversed ? "text-muted line-through" : isCredit ? "text-success" : "text-ink"
        }`}
      >
        {isCredit ? "+ " : "− "}
        {formatCents(transaction.amountCents)}
        {reversed && <span className="sr-only"> (teruggedraaid)</span>}
      </span>
    </li>
  );
}
