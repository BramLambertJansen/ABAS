"use client";

import { useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { StatCard } from "@/components/StatCard";
import { BezettingKeuze } from "@/components/BezettingKeuze";
import { formatCents } from "@/lib/money";
import type { LedgerEntry } from "@/hooks/queries/useShiftLedger";
import type { ShiftMember } from "@/hooks/queries/useShiftMembers";
import {
  useReverseOrderAtBar,
  type ReverseOrderErrorCode,
} from "@/hooks/queries/useReverseOrder";
import { clockLabel } from "@/features/dienst-overzicht/ledger";
import { REVERSE_REASON_MAX_LENGTH, reverseOrderErrorMessage } from "./messages";

/**
 * Bestelling terugdraaien op de bar (docs/features/bestelling-terugdraaien.md
 * → Bar): tijdens de open dienst, voor een bestelling van die dienst.
 * Verplichte reden, en wie het doet komt uit de bezetting (BezettingKeuze),
 * precies zoals "wie geeft uit?" bij afrekenen. Het bedrag komt van de
 * server (orders.total_cents); hier wordt alleen getoond wat al geladen is.
 */
export function TerugdraaienOverlay({
  shiftId,
  entry,
  crew,
  onClose,
  onReversed,
  onRefetchCrew,
  onRefetchLedger,
}: {
  shiftId: string;
  entry: LedgerEntry;
  crew: ShiftMember[];
  onClose: () => void;
  onReversed: (refundedCents: number) => void;
  onRefetchCrew: () => void;
  onRefetchLedger: () => void;
}) {
  const mutation = useReverseOrderAtBar();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [reversedBy, setReversedBy] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ReverseOrderErrorCode | null>(null);

  const needsPicker = crew.length >= 2;
  const effectiveReversedBy = crew.length === 1 ? crew[0].id : reversedBy;
  const pending = mutation.status === "pending";
  const confirmDisabled = !reason.trim() || !effectiveReversedBy || pending;

  // Zelfde reden als AfrekenenOverlay: niet sluiten terwijl de RPC loopt,
  // anders kan dezelfde terugdraaiing opnieuw geopend en ingediend worden
  // vóór de eerste klaar is (de server weigert de tweede wel —
  // already_reversed — maar de operator ziet dan een verwarrende fout).
  async function handleConfirm() {
    if (confirmDisabled || !effectiveReversedBy) return;
    const result = await mutation.reverse(entry.id, shiftId, reason, effectiveReversedBy);
    if (result.ok) {
      onReversed(result.refundedCents);
      return;
    }
    switch (result.code) {
      case "reversed_by_not_on_shift":
        setReversedBy(null);
        onRefetchCrew();
        break;
      case "already_reversed":
      case "order_not_found":
        onRefetchLedger();
        break;
    }
    setErrorCode(result.code);
  }

  const items = `${entry.itemCount} ${entry.itemCount === 1 ? "item" : "items"}`;

  return (
    <Overlay
      title="Bestelling terugdraaien"
      description="Het saldo gaat terug naar het lid. De bestelling blijft zichtbaar in de dienst, doorgestreept."
      onClose={onClose}
      closeBlocked={pending}
    >
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {errorCode ? reverseOrderErrorMessage(errorCode) : ""}
      </p>

      <StatCard
        variant="member"
        name={entry.memberName ?? "Losse verkoop"}
        subtitle={`${clockLabel(entry.createdAt)} · ${items} · ${formatCents(entry.amountCents)} terug`}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={reasonId}
          className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted"
        >
          Reden
        </label>
        <input
          id={reasonId}
          type="text"
          value={reason}
          maxLength={REVERSE_REASON_MAX_LENGTH}
          placeholder="bv. verkeerd lid getikt"
          onChange={(e) => {
            setReason(e.target.value);
            if (errorCode === "reason_required") setErrorCode(null);
          }}
          className="h-12 w-full rounded-[13px] border border-border bg-white px-3.5 text-[13.5px] font-semibold text-ink focus-visible:outline-none placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
        />
      </div>

      {needsPicker && (
        <BezettingKeuze
          legend="Wie draait terug?"
          crew={crew}
          selectedId={reversedBy}
          onSelect={(id) => {
            setReversedBy(id);
            if (errorCode === "reversed_by_not_on_shift") setErrorCode(null);
          }}
        />
      )}

      <div className="mt-0.5 flex gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          annuleren
        </button>
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={handleConfirm}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-danger text-sm font-bold text-white transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:bg-track disabled:text-muted"
        >
          {pending ? "bezig…" : "terugdraaien"}
        </button>
      </div>
    </Overlay>
  );
}
