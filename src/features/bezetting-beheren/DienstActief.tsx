"use client";

import { useState } from "react";
import type { OpenShift } from "@/hooks/queries/useOpenShift";
import { useShiftMembers } from "@/hooks/queries/useShiftMembers";
import { BezettingOverlay } from "./BezettingOverlay";
import { MemberPill } from "@/components/MemberPill";

function formatStartedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "Dienst actief"-scherm. Vervangt dienst-starten's
 * ShiftActivePlaceholder (#6) nu bezetting beheren (#7) gebouwd is — de
 * "Gestart door X om HH:MM"-tekst is hierheen verhuisd, ongewijzigd. Zie
 * docs/features/bezetting-beheren.md → Schermflow.
 */
export function DienstActief({ shift }: { shift: OpenShift }) {
  const shiftMembers = useShiftMembers(shift.id);
  const [overlayOpen, setOverlayOpen] = useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-lg text-white"
        >
          ✓
        </span>
        <h2 className="text-lg font-extrabold text-white">Dienst actief</h2>
        <p className="max-w-xs text-sm font-medium text-rail-muted">
          Gestart door {shift.startedByName} om {formatStartedAt(shift.startedAt)}.
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-rail-border bg-rail-card p-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-rail-muted">
          Bezetting
        </h3>

        {shiftMembers.status === "loading" && (
          <p className="text-sm font-semibold text-rail-muted" role="status">
            Bezetting laden…
          </p>
        )}

        {shiftMembers.status === "error" && (
          <p className="text-sm font-semibold text-rail-error" role="alert">
            {shiftMembers.message}
          </p>
        )}

        {shiftMembers.status === "ready" &&
          shiftMembers.members.length === 0 && (
            <p className="text-sm font-semibold text-rail-muted">
              Nog niemand
            </p>
          )}

        {shiftMembers.status === "ready" &&
          shiftMembers.members.length > 0 && (
            <ul className="flex w-full flex-wrap items-center justify-center gap-2">
              {shiftMembers.members.map((member) => (
                <MemberPill key={member.id} name={member.name} />
              ))}
            </ul>
          )}

        <button
          type="button"
          onClick={() => setOverlayOpen(true)}
          className="flex h-11 w-full items-center justify-center rounded-2xl border border-rail-border bg-rail px-4 text-sm font-bold text-white transition-colors hover:border-accent"
        >
          Bezetting wijzigen
        </button>
      </div>

      <p className="max-w-xs text-xs font-medium text-rail-muted">
        Verkoop en dienst afsluiten volgen in latere schermen.
      </p>

      {overlayOpen && (
        <BezettingOverlay
          shiftId={shift.id}
          members={shiftMembers.status === "ready" ? shiftMembers.members : []}
          onMembersChanged={shiftMembers.refetch}
          onClose={() => setOverlayOpen(false)}
        />
      )}
    </div>
  );
}
