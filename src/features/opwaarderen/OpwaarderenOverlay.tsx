"use client";

import { useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { StatCard } from "@/components/StatCard";
import { formatCents, parseEuroToCents } from "@/lib/money";
import { useTopUp, type TopUpErrorCode } from "@/hooks/queries/useTopUp";
import type { MemberOption } from "@/hooks/queries/useMembers";
import type { ShiftMember } from "@/hooks/queries/useShiftMembers";
import {
  AMOUNT_CHIPS_CENTS,
  TOP_UP_CONFIRM_THRESHOLD_CENTS,
  TOP_UP_MAX_CENTS,
  topUpAmountTooHighMessage,
  topUpConfirmQuestion,
  topUpErrorMessage,
} from "./messages";

/**
 * Opwaardeer-overlay (modal, `src/components/Overlay.tsx` — de derde
 * consument, geen nieuwe overlay-beslissing). Zie
 * docs/features/opwaarderen.md → Schermflow §2 / Randgevallen. Het
 * served_by/bezetting-patroon hieronder is bewust 1-op-1 gekopieerd uit
 * AfrekenenOverlay.tsx, niet gegeneraliseerd — zie
 * docs/features/opwaarderen.md → Schermflow §2 voor de afweging.
 */
export function OpwaarderenOverlay({
  shiftId,
  member,
  crew,
  lowBalanceThresholdCents,
  onClose,
  onSuccess,
  onMemberNotFound,
  onRefetchMembers,
  onRefetchShiftMembers,
}: {
  shiftId: string;
  member: MemberOption;
  crew: ShiftMember[];
  lowBalanceThresholdCents: number;
  onClose: () => void;
  onSuccess: (amountCents: number) => void;
  onMemberNotFound: () => void;
  onRefetchMembers: () => void;
  onRefetchShiftMembers: () => void;
}) {
  const topUpMutation = useTopUp();
  const amountLimitId = useId();
  const [servedBy, setServedBy] = useState<string | null>(null);
  const [selectedChipCents, setSelectedChipCents] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [submitErrorCode, setSubmitErrorCode] = useState<TopUpErrorCode | null>(
    null
  );
  // Bevestigingsstap boven TOP_UP_CONFIRM_THRESHOLD_CENTS (app-review
  // 2026-09-21). Bewust een state-vlag binnen déze overlay en geen tweede,
  // gestapelde Overlay: een dialog bovenop een dialog zou de focus-trap van
  // Overlay.tsx dubbel opzetten (twee keydown-listeners die allebei op
  // Escape sluiten), en er is niets te tonen wat niet in deze dialog past.
  const [confirming, setConfirming] = useState(false);

  const needsPicker = crew.length >= 2;
  const effectiveServedBy = crew.length === 1 ? crew[0].id : servedBy;

  // Een vrij ingetikt bedrag overschrijft een eerder gekozen chip en
  // omgekeerd — nooit allebei tegelijk als bron van waarheid. `null` bij
  // een leeg/ongeldig invoerveld (parseEuroToCents, src/lib/money.ts).
  const customAmountCents =
    customAmount.trim() === "" ? null : parseEuroToCents(customAmount);
  const amountCents = customAmount.trim() !== "" ? customAmountCents : selectedChipCents;
  const hasValidAmount = amountCents !== null && amountCents > 0;
  // Boven de harde grens: knop uit, inline uitleg. `top_up` weigert dit ook
  // server-side met `amount_exceeds_max` (0016_top_up_maximumbedrag.sql) —
  // dit is de UX-helft, niet de afdwinging.
  const amountTooHigh = amountCents !== null && amountCents > TOP_UP_MAX_CENTS;
  const amountBookable = hasValidAmount && !amountTooHigh;
  const needsConfirmation =
    amountCents !== null && amountCents > TOP_UP_CONFIRM_THRESHOLD_CENTS;

  const pending = topUpMutation.status === "pending";
  const bookDisabled = !amountBookable || !effectiveServedBy || pending;

  // Elke bedragswijziging trekt een openstaande bevestiging in: anders zou
  // een bevestigd bedrag blijven staan terwijl er inmiddels een ander bedrag
  // geboekt zou worden — precies de vergissing die deze stap moet vangen.
  function chooseChip(cents: number) {
    setSelectedChipCents(cents);
    setCustomAmount("");
    setConfirming(false);
  }

  // Zelfde reden als AfrekenenOverlay.tsx: Escape/backdrop-click/
  // "annuleren" mogen niet sluiten terwijl top_up onderweg is — anders kan
  // de operator dezelfde opwaardering dubbel indienen vóórdat de eerste
  // aanroep klaar is.
  function handleClose() {
    if (pending) return;
    onClose();
  }

  async function handleBook() {
    if (!amountBookable || !effectiveServedBy || pending) return;

    // Eerste tik op een groot bedrag boekt niet, maar vraagt na. Pas de
    // tweede tik ("ja, … boeken") komt hier voorbij.
    if (needsConfirmation && !confirming) {
      setConfirming(true);
      setSubmitErrorCode(null);
      return;
    }

    const result = await topUpMutation.topUp(
      shiftId,
      member.id,
      amountCents,
      effectiveServedBy
    );

    if (result.ok) {
      onSuccess(result.amountCents);
      return;
    }

    switch (result.code) {
      case "served_by_not_on_shift":
        setServedBy(null);
        onRefetchShiftMembers();
        setSubmitErrorCode(result.code);
        break;
      case "member_not_found":
        onRefetchMembers();
        onMemberNotFound();
        break;
      default:
        setSubmitErrorCode(result.code);
    }
  }

  return (
    <Overlay title={`Saldo opwaarderen bij ${member.name}`} onClose={handleClose}>
      <p className="min-h-[1.25rem] text-sm font-bold text-rail-error" role="alert">
        {submitErrorCode ? topUpErrorMessage(submitErrorCode) : ""}
      </p>

      <StatCard
        variant="member"
        name={member.name}
        subtitle={`saldo ${formatCents(member.balanceCents)}${member.balanceCents < lowBalanceThresholdCents ? " — laag saldo" : ""}`}
      />

      <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-rail-muted">
        betaald met: contant
      </span>

      <div className="grid grid-cols-4 gap-2">
        {AMOUNT_CHIPS_CENTS.map((cents) => (
          <button
            key={cents}
            type="button"
            aria-pressed={selectedChipCents === cents && customAmount.trim() === ""}
            onClick={() => chooseChip(cents)}
            className={`flex h-12 items-center justify-center rounded-xl border text-sm font-extrabold transition-colors ${
              selectedChipCents === cents && customAmount.trim() === ""
                ? "border-accent bg-accent-active text-white"
                : "border-border bg-white text-ink hover:border-accent"
            }`}
          >
            {formatCents(cents)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="opwaarderen-bedrag" className="sr-only">
          Ander bedrag
        </label>
        <input
          id="opwaarderen-bedrag"
          type="text"
          inputMode="decimal"
          placeholder="ander bedrag"
          value={customAmount}
          onChange={(e) => {
            setCustomAmount(e.target.value);
            setSelectedChipCents(null);
            setConfirming(false);
          }}
          aria-describedby={amountTooHigh ? amountLimitId : undefined}
          aria-invalid={amountTooHigh || undefined}
          className="h-12 rounded-xl border border-border px-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        {amountTooHigh && (
          <p
            id={amountLimitId}
            className="text-xs font-bold text-rail-error"
            role="alert"
          >
            {topUpAmountTooHighMessage()}
          </p>
        )}
      </div>

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

      {confirming && amountCents !== null && (
        <p
          className="rounded-xl bg-warning-bg px-3 py-2 text-xs font-bold text-warning-fg"
          role="status"
        >
          {topUpConfirmQuestion(amountCents, member.name)}
        </p>
      )}

      <div className="mt-0.5 flex gap-2.5">
        <button
          type="button"
          disabled={pending}
          // In de bevestigingsstap is dit "terug" naar het bedrag, niet
          // "annuleren" van de hele overlay — anders is een verkeerd
          // ingetikt bedrag corrigeren alleen mogelijk door opnieuw te
          // beginnen, precies op het moment dat de operator al twijfelt.
          onClick={confirming ? () => setConfirming(false) : handleClose}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl border border-rail-border bg-rail text-sm font-bold text-white transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {confirming ? "terug" : "annuleren"}
        </button>
        <button
          type="button"
          disabled={bookDisabled}
          onClick={handleBook}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-accent-active text-sm font-bold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "bezig…"
            : confirming && amountCents !== null
              ? `ja, ${formatCents(amountCents)} boeken`
              : "boeken"}
        </button>
      </div>
    </Overlay>
  );
}
