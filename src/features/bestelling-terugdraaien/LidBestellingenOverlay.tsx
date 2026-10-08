"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LeesFout } from "@/components/LeesFout";
import { useLeesHerstel } from "@/hooks/useLeesHerstel";
import { Overlay } from "@/components/Overlay";
import { RoleBadge } from "@/components/RoleBadge";
import { formatCents } from "@/lib/money";
import { dagKop, klokTijd } from "@/lib/date";
import {
  MEMBER_ORDERS_LIMIT,
  useMemberOrders,
  type MemberOrder,
} from "@/hooks/queries/useMemberOrders";
import {
  useReverseOrderAsAdmin,
  type ReverseOrderErrorCode,
} from "@/hooks/queries/useReverseOrder";
import { REVERSE_REASON_MAX_LENGTH, reverseOrderErrorMessage } from "./messages";

const TOAST_DURATION_MS = 3500;
// Via een constante i.p.v. een letterlijke `role="beheerder"`: jsx-a11y
// leest die prop van RoleBadge anders als een (ongeldige) ARIA-rol.
const ADMIN_ROLE = "beheerder" as const;

/**
 * Bestelling terugdraaien in beheer (docs/features/bestelling-terugdraaien.md
 * → Beheer): een beheerder in de eigen e-mailsessie (ADR 0002) kiest een
 * bestelling van dit lid — ook uit een afgesloten dienst — en bevestigt in
 * de rij zelf, zoals de bevestiging in het ontwerp. De reden geldt voor de
 * volgende terugdraaiing en blijft staan zodat meerdere vergissingen met
 * dezelfde reden achter elkaar kunnen.
 */
export function LidBestellingenOverlay({
  memberId,
  memberName,
  onClose,
  onChanged,
}: {
  memberId: string;
  memberName: string;
  onClose: () => void;
  /** Na elke geslaagde terugdraaiing: het saldo van het lid is veranderd. */
  onChanged: () => void;
}) {
  const orders = useMemberOrders(memberId);
  const lijstRef = useRef<HTMLDivElement>(null);
  const herstel = useLeesHerstel(orders, lijstRef);
  const mutation = useReverseOrderAsAdmin();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ReverseOrderErrorCode | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pending = mutation.status === "pending";
  const reasonMissing = reason.trim() === "";

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  async function confirmReverse(order: MemberOrder) {
    if (pending || reasonMissing) return;
    const result = await mutation.reverse(order.id, reason);
    setConfirmingId(null);
    if (result.ok) {
      setErrorCode(null);
      setToast(`Bestelling teruggedraaid · ${formatCents(result.refundedCents)}`);
      orders.refetch();
      onChanged();
      return;
    }
    if (result.code === "already_reversed" || result.code === "order_not_found") {
      orders.refetch();
    }
    setErrorCode(result.code);
  }

  return (
    <Overlay
      title="Bestelling terugdraaien"
      description={`Bestellingen van ${memberName}. Het saldo gaat terug naar het lid.`}
      onClose={onClose}
      closeBlocked={pending}
    >
      <RoleBadge role={ADMIN_ROLE} tone="light" />

      <div aria-live="polite" role="status" className="empty:-mt-4">
        {toast && <p className="text-sm font-bold text-ink">{toast}</p>}
      </div>

      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {errorCode ? reverseOrderErrorMessage(errorCode) : ""}
      </p>

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
          className="h-control-lg w-full rounded-control border border-border bg-surface px-3.5 text-detail font-semibold text-ink focus-visible:outline-hidden placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
        />
      </div>

      <div
        ref={lijstRef}
        role="group"
        aria-label="Bestellingen"
        tabIndex={-1}
        className="flex max-h-[300px] flex-col gap-2 overflow-auto"
      >
        {orders.status === "loading" && !herstel.toonFout && (
          <p className="py-5 text-center text-metadata font-semibold text-muted" role="status">
            Bestellingen laden…
          </p>
        )}
        {herstel.toonFout && (
          <LeesFout
            tone="light"
            className="py-5"
            message={herstel.message}
            onRetry={herstel.retry}
            bezig={herstel.bezig}
          />
        )}
        {orders.status === "ready" && orders.orders.length === 0 && (
          <p className="py-5 text-center text-metadata font-semibold text-muted">
            geen bestellingen van dit lid
          </p>
        )}
        {orders.status === "ready" && orders.beperkt && (
          <p className="text-metadata font-bold text-muted-strong">
            Alleen de laatste {MEMBER_ORDERS_LIMIT} bestellingen van {memberName} staan hier. Oudere
            bestellingen zijn niet te zien in beheer.
          </p>
        )}
        {orders.status === "ready" && orders.orders.length > 0 && (
          <ul className="flex flex-col gap-2">
            {orders.orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                memberName={memberName}
                confirming={confirmingId === order.id}
                reasonMissing={reasonMissing}
                pending={pending}
                onAsk={() => setConfirmingId(order.id)}
                onCancel={() => setConfirmingId(null)}
                onConfirm={() => confirmReverse(order)}
              />
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={onClose}
        className="flex h-control w-full items-center justify-center rounded-control border border-border bg-surface text-sm font-bold text-ink transition-colors hover:border-ink disabled:opacity-50"
      >
        Sluiten
      </button>
    </Overlay>
  );
}

function OrderRow({
  order,
  memberName,
  confirming,
  reasonMissing,
  pending,
  onAsk,
  onCancel,
  onConfirm,
}: {
  order: MemberOrder;
  memberName: string;
  confirming: boolean;
  reasonMissing: boolean;
  pending: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const when = `${dagKop(order.createdAt, new Date())} ${klokTijd(order.createdAt)}`;
  const items = `${order.itemCount} ${order.itemCount === 1 ? "item" : "items"}`;

  if (order.reversed) {
    return (
      <li className="flex items-center gap-3 rounded-control border border-border bg-canvas px-3.5 py-3">
        <span className="flex-none text-metadata font-bold text-muted">{when}</span>
        <span className="min-w-0 flex-1 truncate text-detail font-bold text-ink">{items}</span>
        <span className="flex-none text-detail font-extrabold text-muted line-through">
          {formatCents(order.totalCents)}
        </span>
        <span className="flex-none text-xs font-extrabold text-muted">teruggedraaid</span>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onAsk}
        aria-expanded={confirming}
        className={`flex items-center gap-3 rounded-control border px-3.5 py-3 text-left transition-colors ${
          confirming ? "border-danger bg-danger-bg" : "border-border hover:border-danger"
        }`}
      >
        <span className="flex-none text-metadata font-bold text-muted">{when}</span>
        <span className="min-w-0 flex-1 truncate text-detail font-bold text-ink">{items}</span>
        <span className="flex-none text-detail font-extrabold text-ink">
          {formatCents(order.totalCents)}
        </span>
        <span className="flex-none text-xs font-extrabold text-danger">terugdraaien →</span>
      </button>
      {confirming && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-danger-bg px-3.5 py-3">
          <span className="min-w-0 flex-1 text-metadata font-bold text-ink">
            {reasonMissing
              ? "Vul eerst een reden in."
              : `Terugdraaien zet ${formatCents(order.totalCents)} terug op het saldo van ${memberName}.`}
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex h-control flex-none items-center rounded-control border border-border bg-surface px-3.5 text-metadata font-extrabold text-ink transition-colors hover:border-ink disabled:opacity-50"
          >
            annuleren
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || reasonMissing}
            className="flex h-control flex-none items-center rounded-control bg-danger px-4 text-metadata font-extrabold text-white transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:bg-track disabled:text-muted"
          >
            {pending ? "bezig…" : "terugdraaien"}
          </button>
        </div>
      )}
    </li>
  );
}
