"use client";

import { Overlay } from "@/components/Overlay";
import { StatCard } from "@/components/StatCard";
import { MemberPill } from "@/components/MemberPill";
import { formatCents } from "@/lib/money";
import type { OpenShift } from "@/hooks/queries/useMijnDienst";
import { useShiftMembers } from "@/hooks/queries/useShiftMembers";
import { useShiftSummary } from "@/hooks/queries/useShiftSummary";
import { useEndShift, type EndShiftErrorCode } from "@/hooks/queries/useEndShift";
import {
  useAdminEndShift,
  type AdminEndShiftErrorCode,
} from "@/hooks/queries/useAdminEndShift";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import { formatTime } from "@/lib/date";
import { BEHEERDER_INGREEP } from "@/features/bar-sessie/teksten";

/** `end_shift` gooit sinds dienst-per-sessie alleen de sessiecodes van de
 *  guard (geen koppeling met deze dienst, sessie beëindigd, ...): die krijgen
 *  één centrale melding, geen inline regel. Al het andere is `unknown`
 *  (netwerk-/onverwachte fout). Zie docs/features/dienst-afsluiten.md →
 *  "Nieuwe mutatiehook: useEndShift". */
function endShiftErrorMessage(code: EndShiftErrorCode): string {
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  return "er ging iets mis, probeer het opnieuw";
}

/** Fouten van `admin_end_shift` (een beheerder sluit een dienst op een ander
 *  apparaat): "deze dienst is al afgesloten" is de enige die de beheerder zelf
 *  kan begrijpen; de sessiecodes gaan naar de centrale melding. */
function adminEndShiftErrorMessage(code: AdminEndShiftErrorCode): string {
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  if (code === "shift_not_open") return BEHEERDER_INGREEP.foutDienstAlDicht;
  return BEHEERDER_INGREEP.foutOverig;
}

/**
 * Overzicht + bevestiging voor het afsluiten van de actieve dienst (modal,
 * `src/components/Overlay.tsx`-consument). Zie
 * docs/features/dienst-afsluiten.md → Schermflow.
 *
 * Sinds dienst-per-sessie ook voor een beheerder die een dienst afsluit die op
 * een ander apparaat loopt (`variant="beheerder"`, `admin_end_shift`, besloten
 * 12a), met dezelfde samenvatting en één extra regel: "Deze dienst loopt op een
 * ander apparaat. Daar stopt hij ook." De eigen dienst sluit via `end_shift`.
 * `DienstTabs` gebruikt de eigen variant ook voor de uitlogkeuze.
 */
export function DienstAfsluitenOverlay({
  shift,
  onClose,
  onShiftEnded,
  variant = "eigen",
}: {
  shift: OpenShift;
  onClose: () => void;
  onShiftEnded: () => void;
  variant?: "eigen" | "beheerder";
}) {
  const shiftSummary = useShiftSummary(shift.id);
  const shiftMembers = useShiftMembers(shift.id);
  const eigenAfsluiten = useEndShift();
  const beheerderAfsluiten = useAdminEndShift();

  const beheerder = variant === "beheerder";
  const pending = beheerder
    ? beheerderAfsluiten.status === "pending"
    : eigenAfsluiten.status === "pending";
  const foutMelding = beheerder
    ? beheerderAfsluiten.errorCode
      ? adminEndShiftErrorMessage(beheerderAfsluiten.errorCode)
      : ""
    : eigenAfsluiten.errorCode
      ? endShiftErrorMessage(eigenAfsluiten.errorCode)
      : "";

  // Zelfde reden als AfrekenenOverlay.tsx: niet unmounten terwijl end_shift
  // nog loopt.
  function handleClose() {
    if (pending) return;
    onClose();
  }

  async function handleConfirm() {
    if (pending) return;
    const ok = beheerder
      ? await beheerderAfsluiten.adminEndShift(shift.id)
      : await eigenAfsluiten.endShift(shift.id);
    if (ok) {
      onClose();
      onShiftEnded();
    }
  }

  return (
    <Overlay
      title={beheerder ? BEHEERDER_INGREEP.afsluitenTitel : "Dienst afsluiten"}
      description={`Gestart door ${shift.startedByName} om ${formatTime(
        shift.startedAt
      )} — een overzicht van deze dienst voordat je 'm afsluit.`}
      onClose={handleClose}
    >
      {beheerder && (
        <p className="text-sm font-semibold text-muted">{BEHEERDER_INGREEP.afsluitenExtraRegel}</p>
      )}

      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {foutMelding}
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
          className="ui-action flex flex-1 items-center justify-center border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          annuleren
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleConfirm}
          className="ui-action ui-button-primary flex flex-1 items-center justify-center text-sm font-bold transition-colors disabled:cursor-not-allowed"
        >
          {pending ? "bezig…" : "dienst afsluiten"}
        </button>
      </div>
    </Overlay>
  );
}
