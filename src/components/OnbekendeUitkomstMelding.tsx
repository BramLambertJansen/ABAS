"use client";

import { GECONTROLEERD_KNOP, ONBEKENDE_UITKOMST_GELD_TEKST } from "@/lib/opslaan";

/**
 * Een geldverzoek (afrekenen, opwaarderen, nieuw lid) waarvan de uitkomst
 * onbekend is: netwerkfout, onbekende serverfout of een time-out. Geen
 * "probeer opnieuw" en geen automatische tweede poging
 * (docs/features/opslaan-sluiten-pending.md, besluit C): de gebruiker
 * controleert eerst het saldo of de transacties en kiest daarna bewust
 * "Ik heb gecontroleerd". Dit is een ontmoediging, geen bewijs: zonder
 * idempotentiesleutel in de RPC blijft een tweede poging dubbel kunnen boeken.
 */
export function OnbekendeUitkomstMelding({
  onGecontroleerd,
  hangend = false,
}: {
  onGecontroleerd: () => void;
  /** Het verzoek loopt nog: bevestigen is dan niet mogelijk (uitkomst volgt nog). */
  hangend?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-warning-bg px-3 py-2.5">
      <p className="text-sm font-bold text-warning-fg" role="alert">
        {ONBEKENDE_UITKOMST_GELD_TEKST}
      </p>
      <button
        type="button"
        onClick={hangend ? undefined : onGecontroleerd}
        disabled={hangend}
        className="flex h-11 items-center disabled:cursor-not-allowed disabled:opacity-50 justify-center rounded-control border border-border bg-white px-4 text-sm font-bold text-ink transition-colors hover:border-ink"
      >
        {GECONTROLEERD_KNOP}
      </button>
    </div>
  );
}
