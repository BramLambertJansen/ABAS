"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatCents } from "@/lib/money";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { LidZoeker } from "@/components/LidZoeker";
import type { MemberOption } from "@/hooks/queries/useMembers";
import type { CartDisplayLine } from "./types";
import { ZijPaneel } from "@/components/ZijPaneel";
import {
  insufficientBalanceMessage,
  lidwisselAankondiging,
  lidwisselBevestigVraag,
  placeOrderErrorMessage,
} from "./messages";
import { lidwisselWistMandje } from "./cart";

/**
 * Rechterkant/mandje-paneel, permanent zichtbaar: ledenkeuze, mandje-
 * regels, totaal, onvoldoende-saldo-banner, afrekenen-knop. Zie
 * docs/features/verkoop.md → Schermflow §2.
 */
export function Mandje({
  lastMemberId,
  memberQuery,
  setMemberQuery,
  members,
  membersStatus,
  membersErrorMessage,
  lowBalanceThresholdCents,
  selectedMember,
  onSelectMember,
  onClearMember,
  memberNotice,
  checkoutNotice,
  cartLines,
  subtotalCents,
  insufficientFunds,
  shortfallCents,
  onInc,
  onDec,
  onRemove,
  rosterEmpty,
  rosterEmptyMessage,
  checkoutDisabled,
  onOpenCheckout,
  topupDisabled,
  onOpenTopup,
}: {
  /** Laatst gekozen lid; overleeft "wissel" (zie `lidwisselWistMandje`). */
  lastMemberId: string | null;
  memberQuery: string;
  setMemberQuery: (query: string) => void;
  members: MemberOption[];
  membersStatus: "loading" | "error" | "ready";
  membersErrorMessage: string | null;
  lowBalanceThresholdCents: number;
  selectedMember: MemberOption | null;
  onSelectMember: (id: string) => void;
  onClearMember: () => void;
  memberNotice: string | null;
  checkoutNotice: string | null;
  cartLines: CartDisplayLine[];
  subtotalCents: number;
  insufficientFunds: boolean;
  shortfallCents: number;
  onInc: (productId: string) => void;
  onDec: (productId: string) => void;
  onRemove: (productId: string) => void;
  rosterEmpty: boolean;
  rosterEmptyMessage: string;
  checkoutDisabled: boolean;
  onOpenCheckout: () => void;
  topupDisabled: boolean;
  onOpenTopup: () => void;
}) {
  const totalQty = cartLines.reduce((sum, l) => sum + l.qty, 0);
  // Lidwissel met een gevuld mandje: eerst een inline bevestiging (geen
  // gestapelde overlay, ADR 0014). Vluchtige state, hoort niet in de draft:
  // bij een tabwissel verdwijnt hij en blijft het mandje onaangeroerd.
  const [bevestig, setBevestig] = useState<{ id: string; name: string } | null>(null);
  const [lidVerdwenen, setLidVerdwenen] = useState(false);
  const terugRef = useRef<HTMLButtonElement>(null);
  const vraagId = useId();
  const lidNaamRef = useRef<HTMLParagraphElement>(null);
  const focusOpLid = useRef(false);

  // Na "Wissen en kiezen" verdwijnen bevestiging en zoeker; de focus gaat naar
  // de naam in het lidkaartje (niet naar body).
  useEffect(() => {
    if (selectedMember && focusOpLid.current) {
      focusOpLid.current = false;
      lidNaamRef.current?.focus();
    }
  }, [selectedMember]);

  useEffect(() => {
    if (bevestig) terugRef.current?.focus();
  }, [bevestig]);

  // Lid verdwijnt uit de verse ledenlijst (gearchiveerd) terwijl de
  // bevestiging openstaat: de bevestiging vervalt met de bestaande melding.
  useEffect(() => {
    if (!bevestig || membersStatus !== "ready") return;
    if (!members.some((m) => m.id === bevestig.id)) {
      setBevestig(null);
      setLidVerdwenen(true);
    }
  }, [bevestig, members, membersStatus]);

  function chooseMember(id: string) {
    setLidVerdwenen(false);
    if (lidwisselWistMandje(lastMemberId, id, cartLines.length)) {
      const member = members.find((m) => m.id === id);
      if (member) setBevestig({ id, name: member.name });
      return;
    }
    onSelectMember(id);
    setMemberQuery("");
  }

  function bevestigWissen() {
    if (!bevestig) return;
    const { id } = bevestig;
    // De bevestiging sluit bij de eerste tik: een dubbele tik wisselt één keer.
    setBevestig(null);
    focusOpLid.current = true;
    onSelectMember(id);
    setMemberQuery("");
  }

  const balanceAfterCents = selectedMember
    ? selectedMember.balanceCents - subtotalCents
    : null;

  return (
    <ZijPaneel>
      {selectedMember ? (
        // Naar designs/Bar App.dc.html → `hasMember`: avatar + naam, rechts
        // "SALDO" met het bedrag groot; daaronder opwaarderen + wissel.
        <div className="flex flex-none flex-col gap-[9px]">
          <div className="flex items-center gap-[11px]">
            <InitialsAvatar
              name={selectedMember.name}
              size="md"
              tone="light"
            />
            <p
              ref={lidNaamRef}
              tabIndex={-1}
              className="min-w-0 flex-1 break-words text-base font-extrabold tracking-[-0.015em] text-ink outline-none"
            >
              {selectedMember.name}
            </p>
            <div className="flex flex-none flex-col items-end gap-px">
              <span className="text-[10.5px] font-bold tracking-[0.08em] text-muted">
                SALDO
              </span>
              <span
                className={`text-xl font-extrabold tracking-[-0.03em] ${
                  selectedMember.balanceCents < lowBalanceThresholdCents
                    ? "text-danger"
                    : "text-ink"
                }`}
              >
                {formatCents(selectedMember.balanceCents)}
              </span>
              {selectedMember.balanceCents < lowBalanceThresholdCents && (
                <span className="text-[10.5px] font-bold text-danger">laag saldo</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={topupDisabled}
              onClick={onOpenTopup}
              className="flex h-10 flex-1 items-center justify-center rounded-[11px] border border-border text-[12.5px] font-bold text-ink transition-colors hover:border-accent hover:text-accent-active disabled:cursor-not-allowed disabled:opacity-50"
            >
              saldo opwaarderen
            </button>
            <button
              type="button"
              onClick={onClearMember}
              className="flex h-10 flex-none items-center justify-center rounded-[11px] border border-border px-4 text-[12.5px] font-bold text-muted transition-colors hover:border-ink hover:text-ink"
            >
              wissel
            </button>
          </div>
        </div>
      ) : (
        <>
          {lastMemberId !== null && cartLines.length > 0 && !bevestig && (
            <p className="flex-none text-xs font-bold text-ink" role="status">
              {lidwisselAankondiging(totalQty)}
            </p>
          )}
          <LidZoeker
            query={memberQuery}
            onQueryChange={setMemberQuery}
            members={members}
            status={membersStatus}
            errorMessage={membersErrorMessage}
            lowBalanceThresholdCents={lowBalanceThresholdCents}
            onSelect={chooseMember}
          />
          {bevestig && (
            <div
              role="group"
              aria-labelledby={vraagId}
              className="flex flex-none flex-col gap-2 rounded-control bg-warning-bg px-[13px] py-[11px] text-warning-fg"
            >
              <p id={vraagId} className="text-[12.5px] font-bold">
                {lidwisselBevestigVraag(bevestig.name)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  ref={terugRef}
                  onClick={() => {
                    setBevestig(null);
                    // Terug naar de zoeker, met de zoekterm intact.
                    document.getElementById("verkoop-member-search")?.focus();
                  }}
                  className="flex h-11 flex-1 items-center justify-center rounded-[9px] border border-warning-fg text-xs font-extrabold"
                >
                  Terug
                </button>
                <button
                  type="button"
                  onClick={bevestigWissen}
                  className="flex h-11 flex-1 items-center justify-center rounded-[9px] bg-accent-active px-3 text-xs font-extrabold text-white"
                >
                  Wissen en kiezen
                </button>
              </div>
            </div>
          )}
          {lidVerdwenen && (
            <p className="flex-none text-xs font-bold text-danger" role="alert">
              {placeOrderErrorMessage("member_not_found")}
            </p>
          )}
        </>
      )}

      {memberNotice && (
        <p className="flex-none text-xs font-bold text-danger" role="alert">
          {memberNotice}
        </p>
      )}

      {checkoutNotice && (
        <p className="flex-none text-xs font-bold text-danger" role="status">
          {checkoutNotice}
        </p>
      )}

      <div className="h-px flex-none bg-border-subtle" />

      <div className="flex flex-none items-center justify-between">
        <h2 className="text-base font-extrabold tracking-[-0.015em] text-ink">
          Huidige bestelling
        </h2>
        {cartLines.length > 0 && (
          <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11.5px] font-extrabold text-danger">
            {`${totalQty} stuks`}
          </span>
        )}
      </div>

      {cartLines.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-6">
          <span aria-hidden="true" className="h-[46px] w-[46px] rounded-[14px] border-[1.5px] border-dashed border-border" />
          <p className="text-[13px] font-semibold text-muted">nog niets getikt</p>
        </div>
      ) : (
        <ul className="-mx-0.5 -my-1 flex min-h-0 flex-1 flex-col overflow-auto">
          {cartLines.map((line) => (
            <li
              key={line.productId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 border-b border-border-subtle px-0.5 py-[9px]"
            >
              {/* Twee regels: naam bovenaan, stepper en regeltotaal eronder, de
                  verwijderknop rechtsboven. In één rij liet het 300px-zijpaneel
                  (768px portret) de naam ~26px over (tablet-bruikbaarheid.md).
                  De DOM- en tabvolgorde blijft min, plus, verwijderen; alleen de
                  plaatsing is een grid. De volledige naam blijft zichtbaar. */}
              <div className="col-start-1 row-start-1 min-w-0 self-start">
                <p className="break-words text-sm font-bold leading-tight text-ink">
                  {line.name}
                </p>
                <p className="text-[11.5px] font-semibold text-muted">
                  {formatCents(line.unitPriceCents)} p/st
                </p>
              </div>
              <div className="col-start-1 row-start-2 flex w-fit items-center gap-0.5 rounded-control bg-canvas p-[3px]">
                <button
                  type="button"
                  onClick={() => onDec(line.productId)}
                  aria-label={`Eén ${line.name} minder`}
                  className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-border bg-white pb-0.5 text-[19px] font-bold leading-none text-muted transition-colors hover:border-accent hover:text-accent-active"
                >
                  −
                </button>
                <span className="min-w-[28px] text-center text-[15px] font-extrabold">
                  {line.qty}
                </span>
                <button
                  type="button"
                  onClick={() => onInc(line.productId)}
                  aria-label={`Eén ${line.name} meer`}
                  className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-border bg-white pb-0.5 text-[19px] font-bold leading-none text-muted transition-colors hover:border-accent hover:text-accent-active"
                >
                  +
                </button>
              </div>
              <span className="col-start-2 row-start-2 min-w-[58px] text-right text-sm font-extrabold text-ink">
                {formatCents(line.lineTotalCents)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(line.productId)}
                aria-label={`Verwijder ${line.name} uit het mandje`}
                className="col-start-2 row-start-1 flex h-[30px] w-[30px] items-center justify-center justify-self-end self-start rounded-[9px] text-[15px] font-bold text-muted hover:bg-canvas hover:text-danger"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="h-px flex-none bg-border-subtle" />

      <div className="flex flex-none flex-col gap-[7px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[17px] font-extrabold tracking-[-0.015em] text-ink">Totaal</span>
          <span className="text-[23px] font-extrabold tracking-[-0.03em] text-ink">
            {formatCents(subtotalCents)}
          </span>
        </div>
        {selectedMember && balanceAfterCents !== null && (
          <div className="flex justify-between text-[12.5px] font-semibold text-muted">
            <span>Saldo na afrekenen</span>
            <span className={balanceAfterCents < 0 ? "text-danger" : undefined}>
              {formatCents(balanceAfterCents)}
            </span>
          </div>
        )}
      </div>

      {insufficientFunds && (
        <div
          className="flex flex-none items-center gap-2.5 rounded-control bg-warning-bg px-[13px] py-[11px] text-[12.5px] font-bold text-warning-fg"
          role="alert"
        >
          <span className="flex-1">{insufficientBalanceMessage(shortfallCents)}</span>
          <button
            type="button"
            disabled={topupDisabled}
            onClick={onOpenTopup}
            className="flex-none rounded-[9px] bg-warning-fg px-3 py-2 text-xs font-extrabold text-warning-bg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            opwaarderen
          </button>
        </div>
      )}

      {rosterEmpty && (
        <p className="flex-none rounded-xl bg-warning-bg px-3 py-2 text-xs font-bold text-warning-fg" role="alert">
          {rosterEmptyMessage}
        </p>
      )}

      <button
        type="button"
        disabled={checkoutDisabled}
        onClick={onOpenCheckout}
        className="flex h-[54px] flex-none items-center justify-center gap-2.5 rounded-card bg-accent-active text-[15.5px] font-extrabold tracking-[-0.01em] text-white shadow-[0_12px_26px_-12px_rgba(238,90,36,1)] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-track disabled:text-muted disabled:shadow-none"
      >
        <span>
          Tik afrekenen
          {cartLines.length > 0 && ` · ${formatCents(subtotalCents)}`}
        </span>
        <span aria-hidden="true" className="text-[17px]">
          →
        </span>
      </button>
    </ZijPaneel>
  );
}
