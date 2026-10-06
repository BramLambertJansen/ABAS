"use client";

import { Overlay } from "@/components/Overlay";
import {
  useAdminTakeOverShift,
  type AdminTakeOverShiftErrorCode,
} from "@/hooks/queries/useAdminTakeOverShift";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import { BEHEERDER_INGREEP } from "./teksten";
import { useBarSessie } from "./BarSessieContext";
import { KNOP_ACCENT_WIT, KNOP_RAND } from "@/components/knopStijlen";

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
      onClose={onClose}
      closeBlocked={pending}
    >
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {overnemen.errorCode ? foutTekst(overnemen.errorCode) : ""}
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className={`flex h-[50px] flex-1 items-center justify-center rounded-2xl text-sm font-bold ${KNOP_RAND}`}
        >
          {BEHEERDER_INGREEP.annuleren}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={bevestig}
          className={`flex h-[50px] flex-1 items-center justify-center rounded-2xl text-sm font-bold ${KNOP_ACCENT_WIT}`}
        >
          {BEHEERDER_INGREEP.overnemenKnop}
        </button>
      </div>
    </Overlay>
  );
}
