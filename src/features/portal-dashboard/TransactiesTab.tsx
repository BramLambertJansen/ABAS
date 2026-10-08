"use client";

import { useMemo, useRef, useState } from "react";
import { LeesFout } from "@/components/LeesFout";
import { Segment, SegmentBalk } from "@/components/Segment";
import { VerversStatus } from "@/components/VerversStatus";
import { useFocusNaHerstel } from "@/hooks/useFocusNaHerstel";
import { useVerversBijTerugkeer } from "@/hooks/useVerversBijTerugkeer";
import { usePortalTransactions } from "@/hooks/queries/usePortalTransactions";
import { TerugdraaiUitleg, TransactieRij } from "./TransactieRij";
import {
  filterTransactions,
  groupByMonth,
  showReversalExplanation,
  type TransactionFilter,
} from "./transacties";

const FILTERS: { id: TransactionFilter; label: string }[] = [
  { id: "alles", label: "Alles" },
  { id: "uitgaven", label: "Uitgaven" },
  { id: "opwaarderingen", label: "Opwaarderingen" },
];

/**
 * Transacties-tabblad — spec → Schermflow §2: filters (client-side op de
 * al geladen lijst, geen extra query per filter), groepering per maand
 * (nieuwste eerst), en een "Einde van de lijst"-voettekst — er is (v1) geen
 * paginering (spec → Expliciet buiten scope).
 *
 * Actualiteit (docs/features/leesfouten-herstel-actuele-data.md):
 * `VerversStatus` boven de filters ververst de transacties; het gekozen
 * filter is client-state en blijft staan. Bekende data blijft zichtbaar bij
 * een mislukte verversing; een mislukte eerste lezing krijgt `LeesFout`.
 */
export function TransactiesTab() {
  const transactions = usePortalTransactions();
  const [filter, setFilter] = useState<TransactionFilter>("alles");
  const filtersRef = useRef<HTMLDivElement>(null);
  useFocusNaHerstel(transactions.status, filtersRef);
  const { ververs } = transactions;
  useVerversBijTerugkeer({
    laatsteSuccesMs: ververs.bijgewerktOp,
    bezig: ververs.bezig,
    laatsteMislukt: ververs.mislukt || transactions.status === "error",
    ververs: transactions.refetch,
  });

  const allTransactions =
    transactions.status === "ready" ? transactions.transactions : null;
  const visible = useMemo(
    () => filterTransactions(allTransactions ?? [], filter),
    [allTransactions, filter]
  );
  const groups = useMemo(() => groupByMonth(visible), [visible]);
  const hasAnyTransaction = (allTransactions?.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
      {transactions.status === "ready" && (
        <VerversStatus
          bijgewerktOp={ververs.bijgewerktOp}
          bezig={ververs.bezig}
          mislukt={ververs.mislukt}
          message={ververs.message}
          onVerversen={transactions.refetch}
        />
      )}

      <SegmentBalk
        ref={filtersRef}
        tabIndex={-1}
        role="group"
        aria-label="Filter op soort transactie"
        className="flex-none flex-wrap"
      >
        {FILTERS.map((f) => (
          <Segment
            key={f.id}
            geselecteerd={filter === f.id}
            onClick={() => setFilter(f.id)}
            className="min-w-fit max-w-full flex-1"
          >
            {f.label}
          </Segment>
        ))}
      </SegmentBalk>

      {transactions.status === "loading" && (
        <p className="py-10 text-center text-sm font-bold text-muted" role="status">
          Transacties laden…
        </p>
      )}
      {transactions.status === "error" && (
        <LeesFout
          tone="light"
          className="py-10"
          message={transactions.message}
          onRetry={transactions.refetch}
          bezig={ververs.bezig}
        />
      )}

      {transactions.status === "ready" && groups.length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-panel border border-border bg-surface px-4 py-10 text-center">
          {!hasAnyTransaction ? (
            <>
              <span className="text-sm font-bold text-muted">Nog geen transacties</span>
              <span className="text-xs font-medium text-muted">
                Elke bestelling en opwaardering komt hier te staan
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-muted">Geen transacties voor dit filter</span>
          )}
        </div>
      )}

      {transactions.status === "ready" &&
        groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-none flex-col gap-2">
            <h2 className="text-[11px] font-bold tracking-widest text-muted">
              {group.label.toUpperCase()}
            </h2>
            <ul className="rounded-panel border border-border bg-surface px-3">
              {group.items.map((t) => (
                <TransactieRij key={t.id} transaction={t} />
              ))}
            </ul>
          </section>
        ))}

      {transactions.status === "ready" && showReversalExplanation(visible) && (
        <TerugdraaiUitleg />
      )}

      {transactions.status === "ready" && groups.length > 0 && (
        <p className="py-1 text-center text-xs font-semibold text-muted">Einde van de lijst</p>
      )}
    </div>
  );
}
