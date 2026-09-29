"use client";

import { useState } from "react";
import type { OtherShift } from "@/hooks/queries/useMijnDienst";
import { formatTime } from "@/lib/date";
import { DienstAfsluitenOverlay } from "@/features/dienst-afsluiten/DienstAfsluitenOverlay";
import { OvernemenOverlay } from "@/features/bar-sessie/OvernemenOverlay";
import { useBarSessie } from "@/features/bar-sessie/BarSessieContext";
import { BEHEERDER_INGREEP, DIENST_ELDERS, dienstElders, dienstEldersWees, dienstEldersWeesBezetting } from "@/features/bar-sessie/teksten";
import { useResumeOrphanShift } from "@/hooks/queries/useResumeOrphanShift";
import { isSessionErrorCode } from "@/lib/barSessie";

/** Foutregel bij "Dienst hervatten". Alleen bestaande, goedgekeurde teksten:
 *  bij `shift_not_orphan`/`not_in_shift_crew` verandert het scherm zelf na het
 *  verversen (andere uitleg, geen knop), en een sessiecode krijgt de centrale
 *  melding. */
function hervatFout(code: string | null): string {
  if (!code || isSessionErrorCode(code)) return "";
  switch (code) {
    case "shift_not_orphan":
    case "not_in_shift_crew":
      return "";
    case "session_has_shift":
      return BEHEERDER_INGREEP.foutAlEigenDienst;
    case "shift_not_open":
      return BEHEERDER_INGREEP.foutDienstAlDicht;
    default:
      return BEHEERDER_INGREEP.foutOverig;
  }
}

/**
 * "Er loopt al een dienst" (docs/features/dienst-per-sessie.md → Schermflow
 * punt 4, Teksten → Dienst loopt op een ander apparaat): fase 1 is stand (a),
 * dus een dienst hoort bij de sessie waarin hij gestart is en een ander
 * apparaat kan er niet in werken. Dit scherm laat zien wie de dienst startte,
 * wanneer, wie er ingelogd is en de laatste activiteit — of dat er geen
 * apparaat meer ingelogd is (een wees-dienst).
 *
 * Een bardienst buiten de bezetting kan hier niets doen. Een bardienst die in
 * de bezetting van een wees-dienst staat, ziet "Dienst hervatten" (vraag 24
 * (ii)); een dienst met een actieve koppeling elders blijft onaantastbaar
 * (12d). Een beheerder ziet "Overnemen" (alleen
 * vanuit bar-modus, want het vraagt een bar-sessie op dit apparaat) en
 * "Afsluiten" (`DienstAfsluitenOverlay` met de extra regel).
 */
export function DienstElders({ shift, isBeheerder }: { shift: OtherShift; isBeheerder: boolean }) {
  const sessie = useBarSessie();
  const [overnemenOpen, setOvernemenOpen] = useState(false);
  const [afsluitenOpen, setAfsluitenOpen] = useState(false);
  const hervatten = useResumeOrphanShift();
  const hervatPending = hervatten.status === "pending";
  // Alleen een wees-dienst waarin deze sessie in de bezetting staat. Een
  // beheerder in de bezetting houdt Overnemen en Afsluiten.
  const kanHervatten = shift.orphan && shift.inBezetting && !isBeheerder;

  async function hervat() {
    if (hervatPending) return;
    const ok = await hervatten.resumeOrphanShift(shift.id);
    // Geslaagd, of de toestand klopte niet meer (`shift_not_orphan`,
    // `not_in_shift_crew`, `shift_not_open`, `session_has_shift`): opnieuw
    // ophalen, dan toont het scherm de juiste toestand zonder foutregel.
    if (ok) sessie.herlaad();
    else sessie.ververs();
  }

  const eerste = shift.sessions[0] ?? null;
  const uitleg = shift.orphan
    ? (kanHervatten ? dienstEldersWeesBezetting : dienstEldersWees)({
        starter: shift.startedByName,
        tijd: formatTime(shift.startedAt),
        activiteit: shift.activityTypeName,
      })
    : dienstElders({
        starter: shift.startedByName,
        tijd: formatTime(shift.startedAt),
        activiteit: shift.activityTypeName,
        naam: eerste?.memberName ?? null,
        laatstActief: eerste ? formatTime(eerste.lastActivityAt) : null,
      });

  return (
    <section
      aria-labelledby="dienst-elders-titel"
      className="flex w-full max-w-sm flex-col items-center gap-4 rounded-card border border-rail-border bg-rail-card p-6 text-center"
    >
      <h2 id="dienst-elders-titel" className="text-base font-extrabold text-white">
        {DIENST_ELDERS.titel}
      </h2>
      <p className="text-sm font-semibold leading-relaxed text-rail-light">{uitleg}</p>

      {isBeheerder ? (
        <div className="flex w-full gap-2.5">
          <button
            type="button"
            onClick={() => setOvernemenOpen(true)}
            className="flex h-[52px] flex-1 items-center justify-center rounded-[15px] bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover"
          >
            {DIENST_ELDERS.overnemen}
          </button>
          <button
            type="button"
            onClick={() => setAfsluitenOpen(true)}
            className="flex h-[52px] flex-1 items-center justify-center rounded-[15px] border border-rail-border text-sm font-bold text-rail-light transition-colors hover:border-accent"
          >
            {DIENST_ELDERS.afsluiten}
          </button>
        </div>
      ) : kanHervatten ? (
        <>
          <button
            type="button"
            disabled={hervatPending}
            onClick={hervat}
            className="flex h-[52px] w-full items-center justify-center rounded-[15px] bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {DIENST_ELDERS.hervatten}
          </button>
          <p className="text-sm font-bold text-danger empty:hidden" role="alert">
            {hervatFout(hervatten.errorCode)}
          </p>
        </>
      ) : (
        <p className="text-xs font-semibold text-rail-muted">{DIENST_ELDERS.voorBardienst}</p>
      )}

      {overnemenOpen && (
        <OvernemenOverlay shiftId={shift.id} onClose={() => setOvernemenOpen(false)} />
      )}
      {afsluitenOpen && (
        <DienstAfsluitenOverlay
          shift={shift}
          variant="beheerder"
          onClose={() => setAfsluitenOpen(false)}
          onShiftEnded={sessie.herlaad}
        />
      )}
    </section>
  );
}
