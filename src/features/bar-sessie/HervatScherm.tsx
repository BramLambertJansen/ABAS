"use client";

import { Knop } from "@/components/Knop";
import { StartScherm } from "@/components/StartScherm";
import { AuroraMerk } from "@/components/AuroraMerk";
import { formatTime } from "@/lib/date";
import { useBarSessie } from "./BarSessieContext";
import { UitloggenKnop } from "./UitloggenKnop";
import { HERVATTEN, hervatTitel, hervatUitleg, hervatUitlegMetDienst } from "./teksten";

/**
 * "Verder als {naam}?" (docs/features/dienst-per-sessie.md → Schermflow punt
 * 3, Teksten → Hervatscherm): de browser was dicht en is weer open, en de
 * sessie bestaat nog. Iedereen die het apparaat in handen heeft mag
 * bevestigen (besloten); pas na "Verder" volgt de hartslag. "Uitloggen" volgt
 * de gewone uitloglogica, met de keuze uit vraag 17 als er een dienst loopt.
 */
export function HervatScherm() {
  const sessie = useBarSessie();
  const session = sessie.session;
  if (!session) return null;
  const shift = sessie.shift;

  return (
    <StartScherm>
      <AuroraMerk tone="dark">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">
          {hervatTitel(session.memberName)}
        </h1>
      </AuroraMerk>

      <div className="flex max-w-sm flex-col items-center gap-1.5 text-center">
        <p className="text-sm font-semibold text-rail-light">{hervatUitleg(session.memberName)}</p>
        {shift && (
          <p className="text-sm font-semibold text-rail-muted">
            {hervatUitlegMetDienst(shift.activityTypeName, formatTime(shift.startedAt))}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Knop
          variant="primair" tone="rail" maat="groot" className="w-full"
          onClick={sessie.bevestig}
        >
          {HERVATTEN.verder}
        </Knop>
        <UitloggenKnop
          shift={shift}
          tone="rail"
          maat="groot"
          className="w-full"
        >
          {HERVATTEN.uitloggen}
        </UitloggenKnop>
      </div>
    </StartScherm>
  );
}
