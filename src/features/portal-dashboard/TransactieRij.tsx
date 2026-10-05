import { formatCents } from "@/lib/money";
import type { PortalTransaction } from "@/hooks/queries/usePortalTransactions";
import {
  REVERSAL_EXPLANATION,
  amountSign,
  dateLabel,
  reversalLines,
  transactionDetail,
  transactionLabel,
} from "./transacties";

/**
 * Eén transactierij, gedeeld door `SaldoTab`'s "Recente transacties" en
 * `TransactiesTab`'s volledige, gegroepeerde lijst — identiek op beide
 * plekken (docs/features/portaltransacties-consistent.md). Een
 * teruggedraaide bestelling: label en bedrag doorgestreept (bedrag zonder
 * teken), een zichtbare badge "Teruggedraaid" (tekst, niet alleen kleur of
 * doorhaling) en "Door: {naam}" / "Reden: {reden}" op eigen, afbrekende
 * regels — nooit in de subtitel, zodat niets wegvalt op 320px. De rij wordt
 * dan gewoon hoger; het bedrag blijft op één regel. Geen ⤺-knop: een lid
 * kan hier nooit iets terugdraaien.
 */
export function TransactieRij({ transaction }: { transaction: PortalTransaction }) {
  const reversed = transaction.reversed;
  const isCredit = transaction.kind === "opwaardering";
  const lines = reversalLines(transaction);

  return (
    <li className="flex items-start gap-3 border-b border-border-subtle py-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`break-words text-sm font-bold ${reversed ? "text-muted line-through" : "text-ink"}`}
          >
            {transactionLabel(transaction)}
          </span>
          {reversed && (
            <span className="rounded-md bg-track px-1.5 py-0.5 text-[11px] font-bold text-ink">
              Teruggedraaid
            </span>
          )}
        </span>
        <span className="break-words text-xs font-medium text-muted">
          {dateLabel(transaction.createdAt)} · {transactionDetail(transaction)}
        </span>
        {lines.map((line) => (
          <span key={line} className="break-words text-xs font-medium text-muted">
            {line}
          </span>
        ))}
      </div>
      <span
        className={`flex-none whitespace-nowrap text-sm font-extrabold ${
          reversed ? "text-muted line-through" : isCredit ? "text-success" : "text-ink"
        }`}
      >
        {amountSign(transaction)}
        {formatCents(transaction.amountCents)}
      </span>
    </li>
  );
}

/** Uitlegregel onder een lijst met minstens één teruggedraaide bestelling
 *  (besluit 1). Gewone tekst, geen `sr-only`. */
export function TerugdraaiUitleg() {
  return <p className="text-xs font-medium text-muted-strong">{REVERSAL_EXPLANATION}</p>;
}
