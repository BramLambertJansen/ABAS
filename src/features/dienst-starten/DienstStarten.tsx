"use client";

import { useState } from "react";
import { useLeesHerstel } from "@/hooks/useLeesHerstel";
import { StartScherm } from "@/components/StartScherm";
import { AuroraMerk } from "@/components/AuroraMerk";
import {
  useActiviteitTypes,
  type ActiviteitType,
} from "@/hooks/queries/useActiviteitTypes";
import {
  useStartShift,
  isActivityTypeErrorCode,
  type StartShiftErrorCode,
} from "@/hooks/queries/useStartShift";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import { useBarSessie } from "@/features/bar-sessie/BarSessieContext";
import { AdminMeldingen } from "@/features/bar-sessie/AdminMeldingen";
import { UitloggenKnop } from "@/features/bar-sessie/UitloggenKnop";
import { STARTSCHERM, ingelogdAls } from "@/features/bar-sessie/teksten";
import { ActiviteitKeuze } from "./ActiviteitKeuze";
import { DienstElders } from "./DienstElders";

/** Foutmelding voor de activiteitkeuze — zie docs/features/activiteittypes.md →
 *  Schermflow §2 stap 5 / Randgevallen. De sessiecodes krijgen één centrale
 *  melding; `shift_already_open`/`session_has_shift` vernieuwen de toestand
 *  (het scherm wisselt dan zelf naar "Er loopt al een dienst" of de eigen
 *  dienst) en tonen niets. */
function activityErrorMessage(code: StartShiftErrorCode): string {
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  switch (code) {
    case "invalid_activity_type":
      return "kies een activiteit";
    case "activity_type_not_found":
      return "dit activiteittype bestaat niet meer — kies opnieuw";
    case "activity_type_archived":
      return "dit activiteittype is niet meer actief — kies opnieuw";
    case "shift_already_open":
    case "session_has_shift":
      return "";
    default:
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * De bar-sessie zonder eigen dienst (docs/features/dienst-per-sessie.md →
 * Schermflow punt 4, en punt 7 na afsluiten): bovenaan "Ingelogd als {naam}"
 * en "Uitloggen", daaronder
 *
 * - geen open dienst: de activiteitkeuze (`ActiviteitKeuze`), en één tik start
 *   de dienst. Er is geen PIN-stap meer: de login op de namenlijst is de
 *   authenticatie van de starter, en de starter is het lid van de sessie
 *   (`start_shift(p_activity_type_id)`, 0029);
 * - een dienst op een ander apparaat: `DienstElders`;
 * - voor een beheerder ook de meldingen "Dienst zonder apparaat".
 *
 * De eigen dienst (`DienstTabs`) rendert `BarApp`, niet dit scherm.
 */
export function DienstStarten() {
  const sessie = useBarSessie();
  const activiteitTypes = useActiviteitTypes();
  const typesHerstel = useLeesHerstel(activiteitTypes);
  const startShiftMutation = useStartShift();
  const [gekozen, setGekozen] = useState(false);

  const session = sessie.session;
  if (!session) return null;
  const isBeheerder = session.memberRole === "beheerder";

  async function kiesActiviteit(activityType: ActiviteitType) {
    if (startShiftMutation.status === "pending") return;
    setGekozen(true);
    startShiftMutation.reset();
    const result = await startShiftMutation.startShift(activityType.id);
    if (result.ok || result.code === "shift_already_open" || result.code === "session_has_shift") {
      // Geslaagd, of intussen loopt er al een dienst (bv. een tweede tabblad):
      // gewoon de toestand ophalen, net als na een geslaagde start.
      sessie.herlaad();
      return;
    }
    if (isActivityTypeErrorCode(result.code)) {
      // Race: het type is gearchiveerd tussen kiezen en starten. Terug naar de
      // keuze met een ververste lijst.
      activiteitTypes.refetch();
    }
    setGekozen(false);
  }

  return (
    <StartScherm>

      <div className="absolute right-6 top-5 flex items-center gap-3">
        <span className="text-xs font-semibold text-rail-muted">{ingelogdAls(session.memberName)}</span>
        <UitloggenKnop
          shift={null}
          className="flex h-9 items-center rounded-[10px] border border-rail-border px-3.5 text-xs font-bold text-rail-muted transition-colors hover:border-accent hover:text-rail-light"
        />
      </div>

      <AuroraMerk tone="dark">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">{STARTSCHERM.titel}</h1>
      </AuroraMerk>

      {isBeheerder && sessie.notifications.length > 0 && (
        <AdminMeldingen meldingen={sessie.notifications} modus="bar" className="w-full max-w-sm" />
      )}

      {sessie.otherShift ? (
        <DienstElders shift={sessie.otherShift} isBeheerder={isBeheerder} />
      ) : (
        <ActiviteitKeuze
          staffName={session.memberName}
          activityTypes={
            activiteitTypes.status === "ready" ? activiteitTypes.activityTypes : []
          }
          loading={activiteitTypes.status === "loading" && !typesHerstel.toonFout}
          loadErrorMessage={typesHerstel.toonFout ? typesHerstel.message : null}
          onRetryLoad={typesHerstel.retry}
          retryLoadBezig={typesHerstel.bezig}
          errorMessage={
            startShiftMutation.errorCode
              ? activityErrorMessage(startShiftMutation.errorCode) || null
              : null
          }
          pending={startShiftMutation.status === "pending" || gekozen}
          onSelect={kiesActiviteit}
        />
      )}
    </StartScherm>
  );
}
