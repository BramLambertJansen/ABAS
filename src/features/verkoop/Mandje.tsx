"use client";

import { useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import type { MemberOption } from "@/hooks/queries/useMembers";
import type { CartDisplayLine } from "./types";
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
    <div className="flex w-full max-w-sm min-h-0 flex-none flex-col gap-3 overflow-auto border-l border-border bg-white p-4">
      {selectedMember ? (
        <div className="flex flex-none flex-col gap-2 rounded-2xl border border-border-subtle bg-canvas p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-ink">
                {selectedMember.name}
              </p>
              <p
                className={`text-xs font-bold ${
                  selectedMember.balanceCents < lowBalanceThresholdCents
                    ? "text-danger"
                    : "text-muted"
                }`}
              >
                saldo {formatCents(selectedMember.balanceCents)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearMember}
              className="min-h-[40px] flex-none rounded-xl border border-border px-3 text-xs font-bold text-muted transition-colors hover:border-ink hover:text-ink"
            >
              wissel
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex-none">
          <label htmlFor="verkoop-member-search" className="sr-only">
            Zoek lid op naam
          </label>
          <input
            id="verkoop-member-search"
            type="search"
            placeholder="Zoek lid op naam"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm font-medium text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
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
            <ul className="mt-1 flex max-h-64 flex-col gap-1 overflow-auto rounded-2xl border border-border bg-white p-1.5 shadow-lg">
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
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-canvas"
                  >
                    <span className="truncate text-sm font-bold text-ink">
                      {member.name}
                    </span>
                    <span
                      className={`flex-none text-xs font-extrabold ${
                        member.balanceCents < lowBalanceThresholdCents
                          ? "text-danger"
                          : "text-muted"
                      }`}
                    >
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
        <h2 className="text-base font-extrabold text-ink">Huidige bestelling</h2>
        <span className="text-xs font-bold text-muted">
          {cartLines.length === 0
            ? ""
            : `${cartLines.reduce((sum, l) => sum + l.qty, 0)} stuks`}
        </span>
      </div>

      {cartLines.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-6 text-sm font-semibold text-muted">
          nog niets getikt
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
          {cartLines.map((line) => (
            <li
              key={line.productId}
              className="flex items-center gap-2 border-b border-border-subtle py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{line.name}</p>
                <p className="text-xs font-semibold text-muted">
                  {formatCents(line.unitPriceCents)} p/st
                </p>
              </div>
              <div className="flex flex-none items-center gap-1 rounded-xl bg-canvas p-1">
                <button
                  type="button"
                  onClick={() => onDec(line.productId)}
                  aria-label={`Eén ${line.name} minder`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-base font-bold text-muted hover:border-accent hover:text-accent"
                >
                  −
                </button>
                <span className="min-w-[24px] text-center text-sm font-extrabold">
                  {line.qty}
                </span>
                <button
                  type="button"
                  onClick={() => onInc(line.productId)}
                  aria-label={`Eén ${line.name} meer`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-base font-bold text-muted hover:border-accent hover:text-accent"
                >
                  +
                </button>
              </div>
              <span className="w-16 flex-none text-right text-sm font-extrabold text-ink">
                {formatCents(line.lineTotalCents)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(line.productId)}
                aria-label={`Verwijder ${line.name} uit het mandje`}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-danger"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="h-px flex-none bg-border-subtle" />

      <div className="flex flex-none flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-extrabold text-ink">Totaal</span>
          <span className="text-xl font-extrabold text-ink">
            {formatCents(subtotalCents)}
          </span>
        </div>
        {selectedMember && balanceAfterCents !== null && (
          <div className="flex justify-between text-xs font-semibold text-muted">
            <span>Saldo na afrekenen</span>
            <span className={balanceAfterCents < 0 ? "text-danger" : undefined}>
              {formatCents(balanceAfterCents)}
            </span>
          </div>
        )}
      </div>

      {insufficientFunds && (
        <p
          className="flex-none rounded-xl bg-warning-bg px-3 py-2 text-xs font-bold text-warning-fg"
          role="alert"
        >
          {insufficientBalanceMessage(shortfallCents)}
        </p>
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
        className="flex min-h-[52px] flex-none items-center justify-center rounded-2xl bg-accent-active text-sm font-extrabold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        Tik afrekenen
      </button>
    </div>
  );
}
