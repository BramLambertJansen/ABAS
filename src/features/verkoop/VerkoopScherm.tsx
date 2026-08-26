"use client";

import { useEffect, useMemo, useState } from "react";
import type { OpenShift } from "@/hooks/queries/useOpenShift";
import { useProducts } from "@/hooks/queries/useProducts";
import { useMembers } from "@/hooks/queries/useMembers";
import { useAppSettings } from "@/hooks/queries/useAppSettings";
import { useShiftMembers } from "@/hooks/queries/useShiftMembers";
import { formatCents } from "@/lib/money";
import { Assortiment } from "./Assortiment";
import { Mandje } from "./Mandje";
import { AfrekenenOverlay } from "./AfrekenenOverlay";
import { applyDelta, removeLine, type CartLine } from "./cart";
import { EMPTY_ROSTER_MESSAGE, placeOrderErrorMessage } from "./messages";

const TOAST_DURATION_MS = 4000;

/**
 * Het verkoopscherm: assortiment (links) + mandje-paneel (rechts,
 * permanent zichtbaar). Zie docs/features/verkoop.md — dit component is
 * de orchestrator: het houdt mandje-/lidkeuze-state bij en berekent het
 * client-subtotaal en de negatieflimiet-bewuste onvoldoende-saldo-check
 * (nooit meegestuurd aan `place_order` — puur voor weergave/guards).
 */
export function VerkoopScherm({ shift }: { shift: OpenShift }) {
  const products = useProducts();
  const members = useMembers();
  const appSettings = useAppSettings();
  const crew = useShiftMembers(shift.id);

  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const productList = useMemo(
    () => (products.status === "ready" ? products.products : []),
    [products]
  );
  const productById = useMemo(() => {
    const map = new Map<string, (typeof productList)[number]>();
    for (const product of productList) map.set(product.id, product);
    return map;
  }, [productList]);

  const cartDisplayLines = useMemo(
    () =>
      cartLines.map((line) => {
        const product = productById.get(line.productId);
        const unitPriceCents = product?.priceCents ?? 0;
        return {
          productId: line.productId,
          qty: line.qty,
          name: product?.name ?? "onbekend product",
          unitPriceCents,
          lineTotalCents: unitPriceCents * line.qty,
        };
      }),
    [cartLines, productById]
  );

  const subtotalCents = cartDisplayLines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  const memberList = members.status === "ready" ? members.members : [];
  const selectedMember = selectedMemberId
    ? (memberList.find((m) => m.id === selectedMemberId) ?? null)
    : null;

  const negativeLimitCents =
    appSettings.status === "ready" ? appSettings.settings.negativeLimitCents : 0;
  const lowBalanceThresholdCents =
    appSettings.status === "ready" ? appSettings.settings.lowBalanceThresholdCents : 0;

  const insufficientFunds =
    selectedMember !== null &&
    subtotalCents > selectedMember.balanceCents + negativeLimitCents;
  const shortfallCents = selectedMember
    ? subtotalCents - (selectedMember.balanceCents + negativeLimitCents)
    : 0;

  const crewList = crew.status === "ready" ? crew.members : [];
  const rosterEmpty = crew.status === "ready" && crewList.length === 0;

  const checkoutDisabled =
    selectedMember === null ||
    cartLines.length === 0 ||
    insufficientFunds ||
    rosterEmpty;

  function addOne(productId: string) {
    setCartLines((prev) => applyDelta(prev, productId, 1));
  }
  function inc(productId: string) {
    setCartLines((prev) => applyDelta(prev, productId, 1));
  }
  function dec(productId: string) {
    setCartLines((prev) => applyDelta(prev, productId, -1));
  }
  function remove(productId: string) {
    setCartLines((prev) => removeLine(prev, productId));
  }

  function chooseMember(id: string) {
    // "keep"-logica uit het ontwerp: een al opgebouwd mandje blijft intact
    // zolang er nog geen lid gekozen was, of hetzelfde lid opnieuw gekozen
    // wordt. Elk ander lid → leeg mandje (voorkomt per ongeluk afrekenen
    // bij de verkeerde persoon). Zie docs/features/verkoop.md → Schermflow
    // §2.
    if (!(selectedMemberId === null || selectedMemberId === id)) {
      setCartLines([]);
    }
    setSelectedMemberId(id);
    setMemberNotice(null);
  }

  function clearMember() {
    setSelectedMemberId(null);
    setCartLines([]);
    setMemberNotice(null);
  }

  function openCheckout() {
    if (checkoutDisabled) return;
    setCheckoutOpen(true);
  }

  function handleCheckoutSuccess(totalCents: number) {
    setCartLines([]);
    setSelectedMemberId(null);
    setCheckoutOpen(false);
    setToast(`Afgerekend — ${formatCents(totalCents)}.`);
    members.refetch();
  }

  function handleMemberNotFound() {
    setSelectedMemberId(null);
    setCheckoutOpen(false);
    setMemberNotice(placeOrderErrorMessage("member_not_found"));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {products.status === "loading" && (
          <p className="flex flex-1 items-center justify-center text-sm font-semibold text-muted" role="status">
            Assortiment laden…
          </p>
        )}
        {products.status === "error" && (
          <p className="flex flex-1 items-center justify-center text-sm font-semibold text-danger" role="alert">
            {products.message}
          </p>
        )}
        {products.status === "ready" && (
          <Assortiment products={productList} cart={cartLines} onAdd={addOne} />
        )}

        <Mandje
          members={memberList}
          membersStatus={members.status}
          membersErrorMessage={members.status === "error" ? members.message : null}
          lowBalanceThresholdCents={lowBalanceThresholdCents}
          selectedMember={selectedMember}
          onSelectMember={chooseMember}
          onClearMember={clearMember}
          memberNotice={memberNotice}
          cartLines={cartDisplayLines}
          subtotalCents={subtotalCents}
          insufficientFunds={insufficientFunds}
          shortfallCents={shortfallCents}
          onInc={inc}
          onDec={dec}
          onRemove={remove}
          rosterEmpty={rosterEmpty}
          rosterEmptyMessage={EMPTY_ROSTER_MESSAGE}
          checkoutDisabled={checkoutDisabled}
          onOpenCheckout={openCheckout}
        />
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center"
        >
          <span className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-lg">
            {toast}
          </span>
        </div>
      )}

      {checkoutOpen && selectedMember && (
        <AfrekenenOverlay
          shiftId={shift.id}
          member={selectedMember}
          crew={crewList}
          lines={cartDisplayLines}
          subtotalCents={subtotalCents}
          negativeLimitCents={negativeLimitCents}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={handleCheckoutSuccess}
          onMemberNotFound={handleMemberNotFound}
          onRefetchMembers={members.refetch}
          onRefetchProducts={products.refetch}
          onRefetchShiftMembers={crew.refetch}
        />
      )}
    </div>
  );
}
