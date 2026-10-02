"use client";

import { useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import type { MemberOption } from "@/hooks/queries/useMembers";
import type { CartDisplayLine } from "./types";
import { ZijPaneel } from "@/components/ZijPaneel";
import { insufficientBalanceMessage, NO_MEMBERS_FOUND_MESSAGE } from "./messages";

/**
 * Rechterkant/mandje-paneel, permanent zichtbaar: ledenkeuze, mandje-
 * regels, totaal, onvoldoende-saldo-banner, afrekenen-knop. Zie
 * docs/features/verkoop.md → Schermflow §2.
 */
export function Mandje({
  members,
  membersStatus,
  membersErrorMessage,
  lowBalanceThresholdCents,
  selectedMember,
  onSelectMember,
  onClearMember,
  memberNotice,
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
  members: MemberOption[];
  membersStatus: "loading" | "error" | "ready";
  membersErrorMessage: string | null;
  lowBalanceThresholdCents: number;
  selectedMember: MemberOption | null;
  onSelectMember: (id: string) => void;
  onClearMember: () => void;
  memberNotice: string | null;
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
  const [memberQuery, setMemberQuery] = useState("");

  const trimmedQuery = memberQuery.trim().toLowerCase();
  const matches = useMemo(
    () =>
      trimmedQuery
        ? members.filter((m) => m.name.toLowerCase().includes(trimmedQuery))
        : [],
    [members, trimmedQuery]
  );

  function chooseMember(id: string) {
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
            <p className="min-w-0 flex-1 truncate text-base font-extrabold tracking-[-0.015em] text-ink">
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
        <div className="relative flex-none">
          <svg
            width="17"
            height="17"
            viewBox="0 0 17 17"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none absolute left-[18px] top-[17px]"
          >
            <circle cx="7.2" cy="7.2" r="5" stroke="#aca69e" strokeWidth="1.7" />
            <line x1="11" y1="11" x2="15" y2="15" stroke="#aca69e" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <label htmlFor="verkoop-member-search" className="sr-only">
            Zoek lid op naam
          </label>
          <input
            id="verkoop-member-search"
            type="search"
            placeholder="Zoek lid op naam"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            className="h-[50px] w-full rounded-card border border-border bg-white pl-[46px] pr-[18px] text-[14.5px] font-medium text-ink shadow-[0_1px_2px_rgba(27,30,35,0.03)] outline-none placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
          />

          {membersStatus === "loading" && trimmedQuery && (
            <p className="mt-1 text-xs font-semibold text-muted" role="status">
              Leden laden…
            </p>
          )}

          {membersStatus === "error" && (
            <p className="mt-1 text-xs font-semibold text-danger" role="alert">
              {membersErrorMessage}
            </p>
          )}

          {membersStatus === "ready" && trimmedQuery && (
            <ul className="absolute inset-x-0 top-14 z-30 flex max-h-[300px] flex-col overflow-auto rounded-card border border-border bg-white p-[7px] shadow-[0_18px_40px_-12px_rgba(27,30,35,0.28)]">
              {matches.length === 0 && (
                <li className="px-3 py-2 text-center text-xs font-semibold text-muted">
                  {NO_MEMBERS_FOUND_MESSAGE}
                </li>
              )}
              {matches.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => chooseMember(member.id)}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-canvas"
                  >
                    <InitialsAvatar name={member.name} size="sm" tone="light" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                      {member.name}
                    </span>
                    <span
                      className={`flex flex-none items-center gap-1 text-[13px] font-extrabold ${
                        member.balanceCents < lowBalanceThresholdCents
                          ? "text-danger"
                          : "text-muted"
                      }`}
                    >
                      {member.balanceCents < lowBalanceThresholdCents && (
                        <>
                          <span aria-hidden="true">⚠</span>
                          <span className="sr-only">laag saldo,</span>
                        </>
                      )}
                      {formatCents(member.balanceCents)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {memberNotice && (
        <p className="flex-none text-xs font-bold text-danger" role="alert">
          {memberNotice}
        </p>
      )}

      <div className="h-px flex-none bg-border-subtle" />

      <div className="flex flex-none items-center justify-between">
        <h2 className="text-base font-extrabold tracking-[-0.015em] text-ink">
          Huidige bestelling
        </h2>
        {cartLines.length > 0 && (
          <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11.5px] font-extrabold text-danger">
            {`${cartLines.reduce((sum, l) => sum + l.qty, 0)} stuks`}
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
              className="flex flex-none items-center gap-2 border-b border-border-subtle px-0.5 py-[9px]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{line.name}</p>
                <p className="text-[11.5px] font-semibold text-muted">
                  {formatCents(line.unitPriceCents)} p/st
                </p>
              </div>
              <div className="flex flex-none items-center gap-0.5 rounded-control bg-canvas p-[3px]">
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
              <span className="min-w-[58px] flex-none text-right text-sm font-extrabold text-ink">
                {formatCents(line.lineTotalCents)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(line.productId)}
                aria-label={`Verwijder ${line.name} uit het mandje`}
                className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] text-[15px] font-bold text-muted hover:bg-canvas hover:text-danger"
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
