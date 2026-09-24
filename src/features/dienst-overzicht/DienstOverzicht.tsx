"use client";

import { useEffect, useState } from "react";
import type { OpenShift } from "@/hooks/queries/useOpenShift";
import { useShiftMembers } from "@/hooks/queries/useShiftMembers";
import { useShiftSummary } from "@/hooks/queries/useShiftSummary";
import { useShiftLedger } from "@/hooks/queries/useShiftLedger";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { formatCents } from "@/lib/money";
import { BezettingOverlay } from "@/features/bezetting-beheren/BezettingOverlay";
import { DienstAfsluitenOverlay } from "@/features/dienst-afsluiten/DienstAfsluitenOverlay";
import { Transactielijst } from "./Transactielijst";
import { clockLabel, durationLabel, ordersPerMember } from "./ledger";

const DURATION_TICK_MS = 30_000;

/**
 * Het Dienst-scherm, gelijkgetrokken met het ontwerp
 * (`designs/Bar App.dc.html`, `isShift`: regel 132–215 en 340–371) — zie
 * docs/features/dienst-overzicht.md. Links de omzetkaart en de
 * transactielijst, rechts wie de dienst draait, de bezetting met het
 * aantal bonnen per persoon, en "dienst afsluiten". Vervangt het eerdere
 * "Dienst actief"-kaartje (DienstActief.tsx); de bezetting- en
 * afsluit-overlays zijn ongewijzigd hergebruikt.
 *
 * Alleen lezen: terugdraaien/correcties uit het ontwerp zijn een aparte
 * feature (nieuwe geld-RPC), zie de spec → Expliciet buiten scope.
 */
export function DienstOverzicht({
  shift,
  onShiftEnded,
}: {
  shift: OpenShift;
  onShiftEnded: () => void;
}) {
  const shiftMembers = useShiftMembers(shift.id);
  const summary = useShiftSummary(shift.id);
  const ledger = useShiftLedger(shift.id);
  const [crewOverlayOpen, setCrewOverlayOpen] = useState(false);
  const [afsluitenOverlayOpen, setAfsluitenOverlayOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), DURATION_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const crew = shiftMembers.status === "ready" ? shiftMembers.members : [];
  const entries = ledger.status === "ready" ? ledger.entries : [];
  const receipts = ordersPerMember(entries);
  const crewFirstName = crew.length ? crew[0].name.split(" ")[0] : "";
  const crewLabel =
    crew.length <= 1 ? crewFirstName : `${crewFirstName} +${crew.length - 1}`;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden px-[26px] pb-[22px] pt-6">
        <div className="flex flex-none flex-wrap items-center gap-3.5">
          <h1 className="text-[25px] font-extrabold leading-none tracking-[-0.025em]">
            Dienst
          </h1>
          <button
            type="button"
            onClick={() => setCrewOverlayOpen(true)}
            aria-label={`Bezetting van deze dienst: ${crewLabel || "nog niemand"}`}
            className="flex h-10 flex-none items-center gap-[9px] rounded-full border border-border bg-white px-[7px] transition-colors hover:border-ink"
          >
            {crew.length > 0 && (
              <span className="flex items-center">
                {crew.slice(0, 3).map((member, i) => (
                  <span
                    key={member.id}
                    className={`rounded-full ring-2 ring-white ${i > 0 ? "-ml-2" : ""}`}
                  >
                    <InitialsAvatar name={member.name} size="chip" tone="light" />
                  </span>
                ))}
              </span>
            )}
            <span className="whitespace-nowrap pl-1 text-[12.5px] font-bold text-ink-soft">
              {crewLabel || "nog niemand"}
            </span>
            <span
              aria-hidden="true"
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-border-subtle text-[15px] font-extrabold text-ink-soft"
            >
              +
            </span>
          </button>
        </div>

        <div className="flex flex-none flex-col gap-[13px] rounded-[18px] bg-rail px-5 pb-4 pt-[15px] shadow-[0_14px_34px_-22px_rgba(22,24,28,0.9)]">
          <div className="flex min-w-0 flex-col gap-[5px]">
            <span className="whitespace-nowrap text-[9.5px] font-extrabold tracking-[0.14em] text-rail-muted">
              OMZET DEZE DIENST
            </span>
            <div className="flex min-w-0 items-baseline gap-[13px]">
              <span className="flex-none whitespace-nowrap text-[31px] font-extrabold leading-none tracking-[-0.04em] text-white">
                {summary.status === "ready"
                  ? formatCents(summary.summary.salesTotalCents)
                  : "…"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-rail-muted">
                {shift.activityTypeName
                  ? `${shift.activityTypeName} · op rekening`
                  : "op rekening"}
              </span>
            </div>
            {summary.status === "error" && (
              <p className="text-xs font-semibold text-rail-error" role="alert">
                {summary.message}
              </p>
            )}
          </div>
          <div className="h-px bg-rail-border" />
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-x-4 gap-y-[11px]">
            <ShiftStat
              label="BESTELLINGEN"
              value={
                summary.status === "ready"
                  ? String(summary.summary.orderCount)
                  : "…"
              }
            />
            <ShiftStat
              label="OPGEWAARDEERD"
              value={
                summary.status === "ready"
                  ? formatCents(summary.summary.topUpsTotalCents)
                  : "…"
              }
            />
          </dl>
        </div>

        <Transactielijst ledger={ledger} showServedBy={crew.length > 1} />
      </div>

      <aside
        aria-label="Dienstgegevens"
        className="flex min-h-0 w-[372px] flex-none flex-col gap-3 overflow-auto border-l border-border bg-white p-[18px]"
      >
        <div className="flex flex-none items-center gap-3">
          <InitialsAvatar name={shift.startedByName} size="lg" tone="light" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15.5px] font-extrabold tracking-[-0.015em]">
              {shift.startedByName}
            </span>
            <span className="text-xs font-semibold text-muted">
              sinds {clockLabel(shift.startedAt)} ·{" "}
              {durationLabel(shift.startedAt, now)}
            </span>
          </div>
          {/* Alleen null voor een dienst gestart vóór 0019_activiteittypes.sql
              — zie useOpenShift.ts. */}
          {shift.activityTypeName && (
            <span className="flex-none whitespace-nowrap rounded-full bg-border-subtle px-[11px] py-1.5 text-[10px] font-extrabold tracking-[0.08em] text-ink-soft">
              {shift.activityTypeName}
            </span>
          )}
        </div>

        <div className="h-px flex-none bg-border-subtle" />

        <section aria-labelledby="bezetting-kop" className="flex flex-none flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2.5">
            <h2
              id="bezetting-kop"
              className="text-[10px] font-extrabold tracking-[0.12em] text-muted"
            >
              BEZETTING
            </h2>
            <button
              type="button"
              onClick={() => setCrewOverlayOpen(true)}
              aria-label="Bezetting wijzigen"
              className="text-[11px] font-bold text-muted transition-colors hover:text-ink"
            >
              wijzigen
            </button>
          </div>

          {shiftMembers.status === "loading" && (
            <p className="text-[13px] font-semibold text-muted" role="status">
              Bezetting laden…
            </p>
          )}
          {shiftMembers.status === "error" && (
            <p className="text-[13px] font-semibold text-danger" role="alert">
              {shiftMembers.message}
            </p>
          )}
          {shiftMembers.status === "ready" && crew.length === 0 && (
            <p className="text-[13px] font-semibold text-muted">Nog niemand</p>
          )}
          {crew.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {crew.map((member) => {
                const n = receipts.get(member.id) ?? 0;
                return (
                  <li key={member.id} className="flex items-center gap-[9px]">
                    <InitialsAvatar name={member.name} size="chip" tone="light" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                      {member.name}
                    </span>
                    <span className="flex-none text-[12.5px] font-extrabold text-muted">
                      {ledger.status !== "ready"
                        ? "…"
                        : n === 0
                          ? "—"
                          : `${n} ${n === 1 ? "bon" : "bonnen"}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="h-px flex-none bg-border-subtle" />
        <div className="min-h-0 flex-1" />

        <button
          type="button"
          onClick={() => setAfsluitenOverlayOpen(true)}
          className="flex h-[52px] flex-none items-center justify-center rounded-[14px] bg-rail text-sm font-extrabold text-white transition-colors hover:bg-black"
        >
          dienst afsluiten
        </button>
      </aside>

      {crewOverlayOpen && (
        <BezettingOverlay
          shiftId={shift.id}
          members={crew}
          onMembersChanged={shiftMembers.refetch}
          onClose={() => setCrewOverlayOpen(false)}
        />
      )}

      {afsluitenOverlayOpen && (
        <DienstAfsluitenOverlay
          shift={shift}
          onClose={() => setAfsluitenOverlayOpen(false)}
          onShiftEnded={onShiftEnded}
        />
      )}
    </>
  );
}

function ShiftStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-[9px] font-extrabold leading-[1.3] tracking-[0.1em] text-rail-muted">
        {label}
      </dt>
      <dd className="whitespace-nowrap text-[15px] font-extrabold tracking-[-0.02em] text-rail-value">
        {value}
      </dd>
    </div>
  );
}
