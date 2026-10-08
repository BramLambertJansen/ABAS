"use client";

import { Knop } from "@/components/Knop";
import { Overlay } from "@/components/Overlay";
import {
  useAdminEndBarSession,
  type AdminEndBarSessionErrorCode,
} from "@/hooks/queries/useAdminEndBarSession";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import { BEHEERDER_INGREEP, afmeldenUitleg } from "./teksten";
import { useBarSessie } from "./BarSessieContext";

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
        <Knop
          maat="groot" className="flex-1"
          disabled={pending}
          onClick={onClose}
        >
          {BEHEERDER_INGREEP.annuleren}
        </Knop>
        <Knop
          variant="primair" maat="groot" className="flex-1"
          disabled={pending}
          onClick={bevestig}
        >
          {BEHEERDER_INGREEP.afmeldenKnop}
        </Knop>
      </div>
    </Overlay>
  );
}
