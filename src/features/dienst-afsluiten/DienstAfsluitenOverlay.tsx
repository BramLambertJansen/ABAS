"use client";

import { Overlay } from "@/components/Overlay";
import { StatCard } from "@/components/StatCard";
import { MemberPill } from "@/components/MemberPill";
import { formatCents } from "@/lib/money";
import type { OpenShift } from "@/hooks/queries/useOpenShift";
import { useShiftMembers } from "@/hooks/queries/useShiftMembers";
import { useShiftSummary } from "@/hooks/queries/useShiftSummary";
import { useEndShift, type EndShiftErrorCode } from "@/hooks/queries/useEndShift";
import { NO_BAR_ROLE_SESSION_MESSAGE } from "@/lib/staff";

function formatStartedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `end_shift` gooit alleen `no_bar_role` (lid-sessie, sinds
 *  0023_bar_rpcs_weigeren_lid.sql); al het andere is `unknown`
 *  (netwerk-/onverwachte fout). Zie docs/features/dienst-afsluiten.md →
 *  "Nieuwe mutatiehook: useEndShift". */
function endShiftErrorMessage(code: EndShiftErrorCode): string {
  switch (code) {
    case "no_bar_role":
      return NO_BAR_ROLE_SESSION_MESSAGE;
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * Overzicht + bevestiging voor het afsluiten van de actieve dienst (modal,
 * `src/components/Overlay.tsx`-consument). Zie
 * docs/features/dienst-afsluiten.md → Schermflow.
 */
export function DienstAfsluitenOverlay({
  shift,
  onClose,
  onShiftEnded,
}: {
  shift: OpenShift;
  onClose: () => void;
  onShiftEnded: () => void;
}) {
  const shiftSummary = useShiftSummary(shift.id);
  const shiftMembers = useShiftMembers(shift.id);
  const endShiftMutation = useEndShift();

  const pending = endShiftMutation.status === "pending";

  // Zelfde reden als AfrekenenOverlay.tsx: niet unmounten terwijl end_shift
  // nog loopt.
  function handleClose() {
    if (pending) return;
    onClose();
  }

  async function handleConfirm() {
    if (pending) return;
    const ok = await endShiftMutation.endShift(shift.id);
    if (ok) {
      onClose();
      onShiftEnded();
    }
  }

  return (
    <Overlay
      title="Dienst afsluiten"
      description={`Gestart door ${shift.startedByName} om ${formatStartedAt(
        shift.startedAt
      )} — een overzicht van deze dienst voordat je 'm afsluit.`}
      onClose={handleClose}
    >
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {endShiftMutation.errorCode ? endShiftErrorMessage(endShiftMutation.errorCode) : ""}
      </p>

      {(shiftSummary.status === "loading" ||
        shiftMembers.status === "loading") && (
        <p className="text-sm font-semibold text-muted" role="status">
          Overzicht laden…
        </p>
      )}

      {(shiftSummary.status === "error" || shiftMembers.status === "error") && (
        <p className="text-sm font-semibold text-danger" role="alert">
          Kan het overzicht niet laden. De dienst kan wel afgesloten worden.
        </p>
      )}

      {shiftSummary.status === "ready" && (
        <div className="flex flex-col gap-3">
          <StatCard
            variant="metric"
            label="Omzet deze dienst"
            value={formatCents(shiftSummary.summary.salesTotalCents)}
            subtitle={`${shiftSummary.summary.orderCount} bestelling(en)`}
          />

          <StatCard
            variant="metric"
            label="Opgewaardeerd (contant)"
            value={formatCents(shiftSummary.summary.topUpsTotalCents)}
          />
        </div>
      )}

      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-canvas p-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted">
          Bezetting
        </h3>

        {shiftMembers.status === "ready" && shiftMembers.members.length === 0 && (
          <p className="text-sm font-semibold text-muted">Nog niemand</p>
        )}

        {shiftMembers.status === "ready" && shiftMembers.members.length > 0 && (
          <ul className="flex w-full flex-wrap items-center justify-center gap-2">
            {shiftMembers.members.map((member) => (
              <MemberPill key={member.id} name={member.name} tone="light" />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-0.5 flex gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={handleClose}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          annuleren
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleConfirm}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-accent-active text-sm font-bold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-track disabled:text-muted"
        >
          {pending ? "bezig…" : "dienst afsluiten"}
        </button>
      </div>
    </Overlay>
  );
}
