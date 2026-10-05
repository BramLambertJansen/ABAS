"use client";

import { usePortalAppSettings } from "@/hooks/queries/usePortalAppSettings";
import { usePortalBalance } from "@/hooks/queries/usePortalBalance";
import { usePortalTransactions } from "@/hooks/queries/usePortalTransactions";
import { formatCents } from "@/lib/money";
import { TerugdraaiUitleg, TransactieRij } from "./TransactieRij";
import { recentTransactions, showReversalExplanation } from "./transacties";

/**
 * Saldo-tabblad, standaard bij het openen van `PortalDashboard` — spec →
 * Schermflow §1: hero-kaart, laag-saldo-kaart (alleen strikt onder de
 * drempel, zelfde grens als `Mandje.tsx`), een altijd zichtbare, statische
 * opwaardeer-melding (geen knop/sheet, zie de spec's "Onderzocht in
 * /designs/" punt 3) en een korte "Recente transacties"-lijst (de laatste
 * vijf, over maandgrenzen heen; teruggedraaide tellen mee) met een knop naar
 * het Transacties-tabblad.
 */
export function SaldoTab({ onShowAll }: { onShowAll: () => void }) {
  const balance = usePortalBalance();
  const appSettings = usePortalAppSettings();
  const transactions = usePortalTransactions();

  // Randgeval (spec → Randgevallen): zolang de drempel nog niet geladen is,
  // nooit de laag-saldo-kaart tonen — een `threshold = 0`-placeholder zou
  // ten onrechte "niet laag" concluderen.
  const lowBalanceThresholdCents =
    appSettings.status === "ready" ? appSettings.settings.lowBalanceThresholdCents : null;
  const balanceCents = balance.status === "ready" ? balance.balance.balanceCents : null;
  const isLowBalance =
    balanceCents !== null &&
    lowBalanceThresholdCents !== null &&
    balanceCents < lowBalanceThresholdCents;

  const recent =
    transactions.status === "ready" ? recentTransactions(transactions.transactions) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto p-5">
      {balance.status === "loading" && (
        <p className="py-8 text-center text-sm font-bold text-muted" role="status">
          Saldo laden…
        </p>
      )}
      {balance.status === "error" && (
        <p className="py-8 text-center text-sm font-bold text-danger" role="alert">
          {balance.message}
        </p>
      )}

      {balance.status === "ready" && (
        <>
          <div className="flex flex-none flex-col gap-1.5 rounded-[22px] bg-ink p-6 text-white">
            <span className="text-[11px] font-bold tracking-[0.1em] text-white/60">
              HUIDIG SALDO
            </span>
            <span className="text-4xl font-extrabold tracking-tight">
              {formatCents(balance.balance.balanceCents)}
            </span>
            <span className="text-xs font-semibold text-white/60">
              {isLowBalance && lowBalanceThresholdCents !== null
                ? `onder de grens van ${formatCents(lowBalanceThresholdCents)}`
                : "Je saldo bij Aurora"}
            </span>
          </div>

          {isLowBalance && lowBalanceThresholdCents !== null && (
            <div className="flex flex-none flex-col gap-1 rounded-[22px] bg-warning-bg p-4">
              <span className="text-sm font-extrabold text-warning-fg">Saldo bijna op</span>
              <p className="text-xs font-medium leading-relaxed text-warning-fg">
                Onder {formatCents(lowBalanceThresholdCents)} vraagt de bardienst je mogelijk om
                je saldo aan te vullen. Waardeer op bij de bar.
              </p>
            </div>
          )}

          <div className="flex flex-none flex-col gap-1 rounded-[22px] border border-border bg-white p-4">
            <p className="text-sm font-bold text-ink">
              Zelf opwaarderen via iDEAL komt in een volgende versie. Voor nu waardeer je op bij
              de bar.
            </p>
            <p className="text-xs font-medium text-muted">
              Contant — de bardienst boekt het direct bij op je saldo.
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold tracking-[0.1em] text-muted">
                RECENTE TRANSACTIES
              </h2>
              {transactions.status === "ready" && recent.length > 0 && (
                <button
                  type="button"
                  onClick={onShowAll}
                  className="flex h-9 flex-none items-center whitespace-nowrap rounded-[10px] px-2 text-xs font-extrabold text-accent-active underline"
                >
                  Alle transacties
                </button>
              )}
            </div>

            {transactions.status === "loading" && (
              <p className="py-6 text-center text-sm font-bold text-muted" role="status">
                Transacties laden…
              </p>
            )}
            {transactions.status === "error" && (
              <p className="py-6 text-center text-sm font-bold text-danger" role="alert">
                {transactions.message}
              </p>
            )}
            {transactions.status === "ready" && recent.length === 0 && (
              <div className="flex flex-col items-center gap-1 rounded-[22px] border border-border bg-white px-4 py-8 text-center">
                <span className="text-sm font-bold text-muted">Nog geen transacties</span>
                <span className="text-xs font-medium text-muted">
                  Elke bestelling en opwaardering komt hier te staan
                </span>
              </div>
            )}
            {transactions.status === "ready" && recent.length > 0 && (
              <>
                <ul className="rounded-[22px] border border-border bg-white px-3">
                  {recent.map((t) => (
                    <TransactieRij key={t.id} transaction={t} />
                  ))}
                </ul>
                {showReversalExplanation(recent) && <TerugdraaiUitleg />}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
