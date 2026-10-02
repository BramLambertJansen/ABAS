"use client";

import { useRef, useState } from "react";
import { useHerstelFocus } from "@/hooks/useHerstelFocus";
import { Overlay } from "@/components/Overlay";
import { StatCard } from "@/components/StatCard";
import { OnbekendeUitkomstMelding } from "@/components/OnbekendeUitkomstMelding";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { BezettingKeuze } from "@/components/BezettingKeuze";
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
  ready,
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
  ready: boolean;
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
  const herstelFocus = useHerstelFocus();
  const knopRef = useRef<HTMLButtonElement>(null);
  const [servedBy, setServedBy] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<PlaceOrderErrorCode | null>(
    null
  );

  const needsPicker = crew.length >= 2;
  const effectiveServedBy = crew.length === 1 ? crew[0].id :
    crew.some((member) => member.id === servedBy) ? servedBy : null;

  const insufficientFunds = subtotalCents > member.balanceCents + negativeLimitCents;
  const shortfallCents = subtotalCents - (member.balanceCents + negativeLimitCents);

  const pending = placeOrderMutation.status === "pending";
  // Geld: geen time-out, de blokkade blijft tot het verzoek klaar is.
  const { closeBlocked } = useOpslaanBlokkade(pending, { metTimeout: false });
  // Een tweede geldopdracht blijft geblokkeerd zolang de eerste kan slagen.
  const inVlucht = pending;
  // Onbekende uitkomst (netwerk, onbekende fout): pas weer afrekenen
  // nadat de gebruiker bewust "Ik heb gecontroleerd" koos (besluit C).
  const [gecontroleerd, setGecontroleerd] = useState(false);
  const uitkomstOnbekend = submitErrorCode === "unknown" && !gecontroleerd;
  const confirmDisabled =
    !ready || insufficientFunds || !effectiveServedBy || inVlucht || uitkomstOnbekend;

  // Escape/backdrop-click/"annuleren" mogen niet sluiten terwijl
  // place_order onderweg is: Overlay.tsx unmount't dan deze component (dus
  // ook usePlaceOrder()'s mutation-state) terwijl de RPC nog loopt — de
  // operator kon daarna zonder waarschuwing dezelfde bestelling opnieuw
  // openen en indienen vóórdat de eerste aanroep klaar was (dubbele
  // bestelling, dubbele saldo-afschrijving). Reviewbot op PR #41.
  async function handleConfirm() {
    if (!ready || !effectiveServedBy || inVlucht || uitkomstOnbekend) return;
    setGecontroleerd(false);

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
      case "unknown":
        // Uitkomst onbekend: ververs het saldo zodat de gebruiker kan controleren.
        onRefetchMembers();
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
      closeBlocked={closeBlocked}
    >
      {uitkomstOnbekend ? (
        <OnbekendeUitkomstMelding
          hangend={pending}
          onGecontroleerd={() => {
            setGecontroleerd(true);
            setSubmitErrorCode(null);
            onRefetchMembers();
            herstelFocus(
              knopRef.current?.disabled
                ? knopRef.current.closest<HTMLElement>('[role="dialog"]')
                : knopRef.current
            );
          }}
        />
      ) : (
        <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
          {submitErrorCode ? placeOrderErrorMessage(submitErrorCode) : ""}
        </p>
      )}

      <StatCard
        variant="member"
        name={member.name}
        subtitle={`saldo ${formatCents(member.balanceCents)}`}
      />

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

      <div className="h-px bg-border" />

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

      {!ready && (
        <p role="alert" className="text-sm font-bold text-danger">
          Controleer het mandje en de actuele lid- en bezettingsgegevens voordat je afrekent.
        </p>
      )}

      {needsPicker && (
        <BezettingKeuze
          legend="Wie geeft uit?"
          crew={crew}
          selectedId={servedBy}
          onSelect={setServedBy}
        />
      )}

      <div className="mt-0.5 flex gap-2.5">
        <button
          type="button"
          disabled={closeBlocked}
          onClick={onClose}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          annuleren
        </button>
        <button
          type="button"
          ref={knopRef}
          disabled={confirmDisabled}
          onClick={handleConfirm}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-accent-active text-sm font-bold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-track disabled:text-muted"
        >
          {pending ? "bezig…" : "ja, afrekenen"}
        </button>
      </div>
    </Overlay>
  );
}
