"use client";

import { useState } from "react";
import { Overlay } from "@/components/Overlay";
import { formatCents } from "@/lib/money";
import { usePlaceOrder, type PlaceOrderErrorCode } from "@/hooks/queries/usePlaceOrder";
import type { MemberOption } from "@/hooks/queries/useMembers";
import type { ShiftMember } from "@/hooks/queries/useShiftMembers";
import type { CartDisplayLine } from "./types";
import { insufficientBalanceMessage, placeOrderErrorMessage } from "./messages";

/**
 * Afrekenbevestiging (modal, `src/components/Overlay.tsx` — de tweede
 * consument, geen nieuwe overlay-beslissing). Zie
 * docs/features/verkoop.md → Schermflow §3 / Randgevallen.
 */
export function AfrekenenOverlay({
  shiftId,
  member,
  crew,
  lines,
  subtotalCents,
  negativeLimitCents,
  onClose,
  onSuccess,
  onMemberNotFound,
  onRefetchMembers,
  onRefetchProducts,
  onRefetchShiftMembers,
}: {
  shiftId: string;
  member: MemberOption;
  crew: ShiftMember[];
  lines: CartDisplayLine[];
  subtotalCents: number;
  negativeLimitCents: number;
  onClose: () => void;
  onSuccess: (totalCents: number) => void;
  onMemberNotFound: () => void;
  onRefetchMembers: () => void;
  onRefetchProducts: () => void;
  onRefetchShiftMembers: () => void;
}) {
  const placeOrderMutation = usePlaceOrder();
  const [servedBy, setServedBy] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<PlaceOrderErrorCode | null>(
    null
  );

  const needsPicker = crew.length >= 2;
  const effectiveServedBy = crew.length === 1 ? crew[0].id : servedBy;

  const insufficientFunds = subtotalCents > member.balanceCents + negativeLimitCents;
  const shortfallCents = subtotalCents - (member.balanceCents + negativeLimitCents);

  const pending = placeOrderMutation.status === "pending";
  const confirmDisabled = insufficientFunds || !effectiveServedBy || pending;

  async function handleConfirm() {
    if (!effectiveServedBy || pending) return;

    const result = await placeOrderMutation.placeOrder(
      shiftId,
      member.id,
      lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      effectiveServedBy
    );

    if (result.ok) {
      onSuccess(result.totalCents);
      return;
    }

    switch (result.code) {
      case "insufficient_balance":
        // Geen losstaande melding — de banner hierboven licht opnieuw op
        // zodra het ververste saldo binnen is (zelfde tekst, zie
        // docs/features/verkoop.md → Randgevallen).
        onRefetchMembers();
        setSubmitErrorCode(null);
        break;
      case "served_by_not_on_shift":
        setServedBy(null);
        onRefetchShiftMembers();
        setSubmitErrorCode(result.code);
        break;
      case "member_not_found":
        onRefetchMembers();
        onMemberNotFound();
        break;
      case "product_not_available":
        onRefetchProducts();
        setSubmitErrorCode(result.code);
        break;
      default:
        setSubmitErrorCode(result.code);
    }
  }

  return (
    <Overlay
      title={`Afrekenen bij ${member.name}`}
      description="Het bedrag gaat van het saldo af en de kassa staat daarna klaar voor de volgende."
      onClose={onClose}
    >
      <p className="min-h-[1.25rem] text-sm font-bold text-danger" role="alert">
        {submitErrorCode ? placeOrderErrorMessage(submitErrorCode) : ""}
      </p>

      <div className="flex flex-col gap-1 rounded-2xl bg-canvas p-3">
        <span className="text-sm font-bold text-ink">{member.name}</span>
        <span className="text-xs font-semibold text-muted">
          saldo {formatCents(member.balanceCents)}
        </span>
      </div>

      <ul className="flex max-h-[180px] flex-col gap-1.5 overflow-auto">
        {lines.map((line) => (
          <li
            key={line.productId}
            className="flex justify-between text-sm font-semibold text-muted"
          >
            <span>
              {line.qty}× {line.name}
            </span>
            <span className="font-bold text-ink">
              {formatCents(line.lineTotalCents)}
            </span>
          </li>
        ))}
      </ul>

      <div className="h-px bg-border-subtle" />

      <div className="flex items-baseline justify-between">
        <span className="text-sm font-extrabold text-ink">Totaal</span>
        <span className="text-xl font-extrabold text-ink">
          {formatCents(subtotalCents)}
        </span>
      </div>

      {insufficientFunds && (
        <p
          className="rounded-xl bg-warning-bg px-3 py-2 text-xs font-bold text-warning-fg"
          role="alert"
        >
          {insufficientBalanceMessage(shortfallCents)}
        </p>
      )}

      {needsPicker && (
        <fieldset className="flex flex-col gap-2 rounded-2xl bg-canvas p-3">
          <legend className="flex w-full items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
              Wie geeft uit?
            </span>
            <span className="text-[10.5px] font-bold text-muted">
              {servedBy ? "gekozen" : "verplicht"}
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {crew.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={servedBy === option.id}
                onClick={() => setServedBy(option.id)}
                className={`min-h-[40px] rounded-xl border px-3 text-xs font-bold transition-colors ${
                  servedBy === option.id
                    ? "border-accent bg-accent-active text-white"
                    : "border-border bg-white text-ink hover:border-accent"
                }`}
              >
                {option.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-0.5 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl border border-border text-sm font-bold text-ink transition-colors hover:border-ink"
        >
          annuleren
        </button>
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={handleConfirm}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-accent-active text-sm font-bold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "bezig…" : "ja, afrekenen"}
        </button>
      </div>
    </Overlay>
  );
}
