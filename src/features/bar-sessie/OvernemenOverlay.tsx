"use client";

import { Overlay } from "@/components/Overlay";
import {
  useAdminTakeOverShift,
  type AdminTakeOverShiftErrorCode,
} from "@/hooks/queries/useAdminTakeOverShift";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import { BEHEERDER_INGREEP } from "./teksten";
import { useBarSessie } from "./BarSessieContext";

function foutTekst(code: AdminTakeOverShiftErrorCode): string {
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  switch (code) {
    case "session_has_shift":
      return BEHEERDER_INGREEP.foutAlEigenDienst;
    case "shift_not_open":
      return BEHEERDER_INGREEP.foutDienstAlDicht;
    default:
      return BEHEERDER_INGREEP.foutOverig;
  }
}

/**
 * "Dienst overnemen?" (docs/features/dienst-per-sessie.md → Teksten →
 * Overnemen): een beheerder neemt een dienst over die op een ander apparaat
 * loopt of geen apparaat meer heeft. Alleen vanuit bar-modus (besloten, 12a).
 * De dienst gaat verder op dit apparaat; de overnemer komt in de bezetting.
 */
export function OvernemenOverlay({
  shiftId,
  onClose,
}: {
  shiftId: string;
  onClose: () => void;
}) {
  const sessie = useBarSessie();
  const overnemen = useAdminTakeOverShift();
  const pending = overnemen.status === "pending";

  function sluit() {
    if (pending) return;
    onClose();
  }

  async function bevestig() {
    if (pending) return;
    const ok = await overnemen.takeOverShift(shiftId);
    if (ok) {
      sessie.toonToast(BEHEERDER_INGREEP.overnemenToast);
      onClose();
      sessie.herlaad();
    } else {
      // Een verouderd scherm (bv. de dienst is intussen gesloten): de toestand
      // verversen, de fout blijft in beeld.
      sessie.ververs();
    }
  }

  return (
    <Overlay
      title={BEHEERDER_INGREEP.overnemenTitel}
      description={BEHEERDER_INGREEP.overnemenUitleg}
      onClose={sluit}
    >
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {overnemen.errorCode ? foutTekst(overnemen.errorCode) : ""}
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={sluit}
          className="ui-action flex flex-1 items-center justify-center border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {BEHEERDER_INGREEP.annuleren}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={bevestig}
          className="ui-action ui-button-primary flex flex-1 items-center justify-center text-sm font-bold transition-colors disabled:cursor-not-allowed"
        >
          {BEHEERDER_INGREEP.overnemenKnop}
        </button>
      </div>
    </Overlay>
  );
}
