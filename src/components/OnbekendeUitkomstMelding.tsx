"use client";
import type { MoneyOperation } from "@/lib/moneyRequest";
import type { MoneyResolution } from "@/hooks/queries/usePendingMoneyRequests";
import { ONBEKENDE_UITKOMST_GELD_TEKST } from "@/lib/opslaan";
import { GeldActieHerstel } from "./GeldActieHerstel";

/** Recovery uses the captured UUID and server proof; no automatic retry or reset. */
export function OnbekendeUitkomstMelding({ operation, context, onResolved }: {
  operation: MoneyOperation;
  context: string;
  onResolved: (resolution: MoneyResolution) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-warning-bg px-3 py-2.5 text-warning-fg">
      <p className="text-sm font-bold" role="alert">{ONBEKENDE_UITKOMST_GELD_TEKST}</p>
      <GeldActieHerstel operation={operation} context={context} onResolved={onResolved} />
    </div>
  );
}
