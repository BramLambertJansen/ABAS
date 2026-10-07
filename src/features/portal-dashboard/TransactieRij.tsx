import { formatCents } from "@/lib/money";
import type { PortalTransaction } from "@/hooks/queries/usePortalTransactions";
import { dateLabel, transactionDetail, transactionLabel } from "./transacties";

/** Dezelfde teruggedraaid-weergave in het saldo-overzicht en de volledige lijst. */
export function TransactieRij({
  transaction,
}: {
  transaction: PortalTransaction;
}) {
  const reversed = transaction.reversed;
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
          {dateLabel(transaction.createdAt)} · {transactionDetail(transaction, true)}
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
