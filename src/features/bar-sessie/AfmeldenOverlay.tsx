"use client";

import { Overlay } from "@/components/Overlay";
import {
  useAdminEndBarSession,
  type AdminEndBarSessionErrorCode,
} from "@/hooks/queries/useAdminEndBarSession";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import { BEHEERDER_INGREEP, afmeldenUitleg } from "./teksten";
import { useBarSessie } from "./BarSessieContext";
import { KNOP_ACCENT_WIT, KNOP_RAND } from "@/components/knopStijlen";

function foutTekst(code: AdminEndBarSessionErrorCode): string {
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  return BEHEERDER_INGREEP.foutOverig;
}

/**
 * "Apparaat afmelden?" (docs/features/dienst-per-sessie.md → Teksten →
 * Afmelden): een beheerder meldt een sessie af, bv. van een verloren of
 * gestolen tablet (besloten, 12c). De sessie stopt meteen; loopt daar een
 * dienst, dan blijft die open zonder apparaat.
 */
export function AfmeldenOverlay({
  sessieId,
  naam,
  onClose,
}: {
  sessieId: string;
  naam: string;
  onClose: () => void;
}) {
  const sessie = useBarSessie();
  const afmelden = useAdminEndBarSession();
  const pending = afmelden.status === "pending";

  async function bevestig() {
    if (pending) return;
    const ok = await afmelden.endBarSession(sessieId);
    if (ok) {
      sessie.toonToast(BEHEERDER_INGREEP.afmeldenToast);
      onClose();
    }
    sessie.ververs();
  }

  return (
    <Overlay
      title={BEHEERDER_INGREEP.afmeldenTitel}
      description={afmeldenUitleg(naam)}
      onClose={onClose}
      closeBlocked={pending}
    >
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {afmelden.errorCode ? foutTekst(afmelden.errorCode) : ""}
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className={`flex h-control-lg flex-1 items-center justify-center rounded-card text-sm font-bold ${KNOP_RAND}`}
        >
          {BEHEERDER_INGREEP.annuleren}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={bevestig}
          className={`flex h-control-lg flex-1 items-center justify-center rounded-card text-sm font-bold ${KNOP_ACCENT_WIT}`}
        >
          {BEHEERDER_INGREEP.afmeldenKnop}
        </button>
      </div>
    </Overlay>
  );
}
