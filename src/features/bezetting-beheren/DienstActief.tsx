"use client";

import { useEffect, useRef, useState } from "react";
import { LeesFout } from "@/components/LeesFout";
import { useLeesHerstel } from "@/hooks/useLeesHerstel";
import type { OpenShift } from "@/hooks/queries/useMijnDienst";
import { useShiftMembers } from "@/hooks/queries/useShiftMembers";
import { useShiftSummary } from "@/hooks/queries/useShiftSummary";
import { useShiftLedger } from "@/hooks/queries/useShiftLedger";
import { formatCents } from "@/lib/money";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { BezettingOverlay } from "./BezettingOverlay";
import { BezettingPil } from "./BezettingPil";
import { DienstAfsluitenOverlay } from "@/features/dienst-afsluiten/DienstAfsluitenOverlay";
import { Transactielijst } from "@/features/dienst-overzicht/Transactielijst";
import { durationLabel, ordersPerMember } from "@/features/dienst-overzicht/ledger";
import { TerugdraaienOverlay } from "@/features/bestelling-terugdraaien/TerugdraaienOverlay";
import type { LedgerEntry } from "@/hooks/queries/useShiftLedger";
import { ZijPaneel } from "@/components/ZijPaneel";

const DURATION_TICK_MS = 30_000;
const TOAST_DURATION_MS = 4000;

function formatStartedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "Dienst"-scherm (het tweede tabblad van DienstTabs). Zie
 * docs/features/bezetting-beheren.md → Schermflow. Indeling naar
 * designs/Bar App.dc.html → `isShift`: links de titel met bezettingspil en
 * de donkere omzetkaart, rechts een paneel met wie de dienst startte, de
 * activiteit, de bezetting en "dienst afsluiten".
 *
 * Onder de omzetkaart de transactielijst en in het paneel het aantal
 * bonnen per persoon en de duur van de dienst
 * (docs/features/dienst-overzicht.md). Vanuit de lijst kan de bardienst
 * een bestelling van deze dienst terugdraaien; het paneel telt de
 * correcties (docs/features/bestelling-terugdraaien.md → Bar).
 */
export function DienstActief({
  shift,
  onShiftEnded,
}: {
  shift: OpenShift;
  onShiftEnded: () => void;
}) {
  const shiftMembers = useShiftMembers(shift.id);
  const bezettingKopRef = useRef<HTMLHeadingElement>(null);
  const bezettingHerstel = useLeesHerstel(shiftMembers, bezettingKopRef);
  const shiftSummary = useShiftSummary(shift.id);
  const ledger = useShiftLedger(shift.id);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [afsluitenOverlayOpen, setAfsluitenOverlayOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [reverseEntry, setReverseEntry] = useState<LedgerEntry | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), DURATION_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const members = shiftMembers.status === "ready" ? shiftMembers.members : [];
  const receipts = ordersPerMember(
    ledger.status === "ready" ? ledger.entries : []
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto px-[26px] pb-[22px] pt-6">
        <header className="flex flex-none flex-wrap items-center gap-3.5">
          <h1 className="text-screen-title font-extrabold leading-none tracking-tight text-ink">
            Dienst
          </h1>
          <BezettingPil
            members={members}
            loading={shiftMembers.status === "loading"}
            onOpen={() => setOverlayOpen(true)}
          />
        </header>

        <section
          aria-label="Omzet deze dienst"
          className="flex flex-none flex-col gap-[13px] rounded-[18px] bg-rail px-5 pb-4 pt-[15px] shadow-shift"
        >
          <div className="flex min-w-0 flex-col gap-[5px]">
            <span className="text-[9.5px] font-extrabold tracking-[0.14em] text-rail-muted">
              OMZET DEZE DIENST
            </span>
            {shiftSummary.status === "loading" && (
              <span className="text-sm font-semibold text-rail-muted" role="status">
                Omzet laden…
              </span>
            )}
            {shiftSummary.status === "error" && (
              <span className="text-sm font-semibold text-rail-error" role="alert">
                Kan de omzet niet laden.
              </span>
            )}
            {shiftSummary.status === "ready" && (
              <div className="flex min-w-0 items-baseline gap-[13px]">
                <span className="flex-none text-[31px] font-extrabold leading-none tracking-[-0.04em] text-white">
                  {formatCents(shiftSummary.summary.salesTotalCents)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-rail-muted">
                  {shiftSummary.summary.orderCount === 1
                    ? "1 bestelling"
                    : `${shiftSummary.summary.orderCount} bestellingen`}
                </span>
              </div>
            )}
          </div>
          {shiftSummary.status === "ready" && (
            <>
              <div className="h-px bg-rail-border" />
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-x-4 gap-y-[11px]">
                <Stat
                  label="OPGEWAARDEERD"
                  value={formatCents(shiftSummary.summary.topUpsTotalCents)}
                />
                <Stat label="GESTART" value={formatStartedAt(shift.startedAt)} />
                <Stat
                  label="BEZETTING"
                  value={shiftMembers.status === "ready" ? String(members.length) : "…"}
                />
              </dl>
            </>
          )}
        </section>

        <Transactielijst
          ledger={ledger}
          onRetry={ledger.refetch}
          showServedBy={members.length > 1}
          onReverse={setReverseEntry}
        />
      </div>

      <ZijPaneel as="aside">
        <h2 className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
          Dienst actief
        </h2>
        <div className="flex flex-none items-center gap-3">
          <InitialsAvatar name={shift.startedByName} size="md" tone="light" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15.5px] font-extrabold tracking-[-0.015em] text-ink">
              {shift.startedByName}
            </span>
            <span className="text-xs font-semibold text-muted">
              gestart om {formatStartedAt(shift.startedAt)} ·{" "}
              {durationLabel(shift.startedAt, now)}
            </span>
          </div>
          {/* Alleen null voor een dienst gestart vóór 0019_activiteittypes.sql
              — zie barState.ts (OpenShift) (docs/features/activiteittypes.md →
              Schermflow §3). */}
          {shift.activityTypeName && (
            <span
              title={shift.activityTypeName}
              className="max-w-[45%] flex-none truncate whitespace-nowrap rounded-full bg-border-subtle px-[11px] py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-strong"
            >
              <span className="sr-only">Activiteit: </span>
              {shift.activityTypeName}
            </span>
          )}
        </div>

        <div className="h-px flex-none bg-border-subtle" />

        <div className="flex flex-none flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2.5">
            <h3
              ref={bezettingKopRef}
              tabIndex={-1}
              className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted"
            >
              Bezetting
            </h3>
            <button
              type="button"
              onClick={() => setOverlayOpen(true)}
              aria-label="Bezetting wijzigen"
              className="text-[11px] font-bold text-muted transition-colors hover:text-ink"
            >
              wijzigen
            </button>
          </div>

          {shiftMembers.status === "loading" && !bezettingHerstel.toonFout && (
            <p className="text-sm font-semibold text-muted" role="status">
              Bezetting laden…
            </p>
          )}
          {bezettingHerstel.toonFout && (
            <LeesFout
              tone="light"
              className="items-start text-left"
              message={bezettingHerstel.message}
              onRetry={bezettingHerstel.retry}
              bezig={bezettingHerstel.bezig}
            />
          )}
          {shiftMembers.status === "ready" && members.length === 0 && (
            <p className="text-sm font-semibold text-muted">Nog niemand</p>
          )}
          {members.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-[9px]">
                  <InitialsAvatar name={member.name} size="chip" tone="light" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                    {member.name}
                  </span>
                  <span className="flex-none text-metadata font-extrabold text-muted">
                    {ledger.status !== "ready"
                      ? "…"
                      : receiptLabel(receipts.get(member.id) ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="h-px flex-none bg-border-subtle" />
        <div className="min-h-0 flex-1" />

        {shiftSummary.status === "ready" && shiftSummary.summary.reversalCount > 0 && (
          <p className="flex-none rounded-[13px] bg-danger-bg px-[13px] py-[11px] text-metadata font-bold text-danger">
            {shiftSummary.summary.reversalCount === 1
              ? "1 correctie deze dienst"
              : `${shiftSummary.summary.reversalCount} correcties deze dienst`}
          </p>
        )}

        <button
          type="button"
          onClick={() => setAfsluitenOverlayOpen(true)}
          className="flex h-control-lg flex-none items-center justify-center rounded-[14px] bg-rail text-sm font-extrabold text-white transition-colors hover:bg-black"
        >
          Dienst afsluiten
        </button>
      </ZijPaneel>

      {overlayOpen && (
        <BezettingOverlay
          shiftId={shift.id}
          members={members}
          membersStatus={shiftMembers.status}
          onMembersChanged={shiftMembers.refetch}
          onClose={() => setOverlayOpen(false)}
        />
      )}

      {reverseEntry && (
        <TerugdraaienOverlay
          shiftId={shift.id}
          entry={reverseEntry}
          crew={members}
          onClose={() => setReverseEntry(null)}
          onReversed={(refundedCents) => {
            setReverseEntry(null);
            setToast(`Bestelling teruggedraaid · ${formatCents(refundedCents)}`);
            ledger.refetch();
            shiftSummary.refetch();
          }}
          onRefetchCrew={shiftMembers.refetch}
          onRefetchLedger={ledger.refetch}
        />
      )}

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

      {afsluitenOverlayOpen && (
        <DienstAfsluitenOverlay
          shift={shift}
          onClose={() => setAfsluitenOverlayOpen(false)}
          onShiftEnded={onShiftEnded}
        />
      )}
    </div>
  );
}

function receiptLabel(n: number): string {
  if (n === 0) return "—";
  return `${n} ${n === 1 ? "bon" : "bonnen"}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-[9px] font-extrabold leading-tight tracking-widest text-rail-muted">
        {label}
      </dt>
      <dd className="whitespace-nowrap text-[15px] font-extrabold tracking-[-0.02em] text-rail-bright">
        {value}
      </dd>
    </div>
  );
}
