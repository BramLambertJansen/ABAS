"use client";

import { useState } from "react";
import type { AdminMelding } from "@/hooks/queries/useMijnDienst";
import { formatTime } from "@/lib/date";
import { DienstAfsluitenOverlay } from "@/features/dienst-afsluiten/DienstAfsluitenOverlay";
import { useBarSessie } from "./BarSessieContext";
import { OvernemenOverlay } from "./OvernemenOverlay";
import { ADMIN_MELDING, adminMeldingReden, adminMeldingUitleg } from "./teksten";

/**
 * De melding "Dienst zonder apparaat" voor beheerders, in de app
 * (docs/features/dienst-per-sessie.md → Inactiviteit en de beheerdermelding,
 * Teksten → Melding voor de beheerder; besloten 8 en 9). Er komt één melding per
 * open dienst die zijn laatste actieve sessie kwijtraakt, ongeacht de oorzaak
 * (inactiviteit, uitloggen met "open laten", afmelden, rolwijziging). Ze is
 * opgelost zodra één beheerder de dienst overneemt of afsluit.
 *
 * In bar-modus: "Overnemen" en "Afsluiten". In beheer alleen "Afsluiten",
 * met de hint dat overnemen op de bar kan (het vraagt een bar-sessie op het
 * nieuwe apparaat, besloten 12a).
 */
export function AdminMeldingen({
  meldingen,
  modus,
  className = "",
}: {
  meldingen: AdminMelding[];
  modus: "bar" | "beheer";
  className?: string;
}) {
  const sessie = useBarSessie();
  const [overnemen, setOvernemen] = useState<AdminMelding | null>(null);
  const [afsluiten, setAfsluiten] = useState<AdminMelding | null>(null);

  if (meldingen.length === 0) return null;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {meldingen.map((melding) => (
        <section
          key={melding.id}
          aria-labelledby={`melding-${melding.id}`}
          className="flex flex-col gap-2 rounded-card border border-accent/60 bg-white p-4 text-left text-ink shadow-lg"
        >
          <h2 id={`melding-${melding.id}`} className="text-sm font-extrabold text-ink">
            {ADMIN_MELDING.titel}
          </h2>
          <p className="text-[12.5px] font-semibold leading-relaxed text-muted-strong">
            {adminMeldingUitleg({
              starter: melding.startedByName,
              activiteit: melding.activityTypeName,
              tijd: formatTime(melding.startedAt),
            })}{" "}
            {adminMeldingReden(melding.reason, melding.memberName)}
          </p>
          <div className="flex items-center gap-2">
            {modus === "bar" && (
              <button
                type="button"
                onClick={() => setOvernemen(melding)}
                className="ui-button-primary flex h-10 flex-1 items-center justify-center rounded-xl text-[13px] font-bold transition-colors"
              >
                {ADMIN_MELDING.overnemen}
              </button>
            )}
            <button
              type="button"
              onClick={() => setAfsluiten(melding)}
              className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-white text-[13px] font-bold text-ink transition-colors hover:border-ink"
            >
              {ADMIN_MELDING.afsluiten}
            </button>
          </div>
          {modus === "beheer" && (
            <p className="text-xs font-semibold text-muted">{ADMIN_MELDING.hintInBeheer}</p>
          )}
        </section>
      ))}

      {overnemen && (
        <OvernemenOverlay shiftId={overnemen.shiftId} onClose={() => setOvernemen(null)} />
      )}
      {afsluiten && (
        <DienstAfsluitenOverlay
          shift={{
            id: afsluiten.shiftId,
            startedByName: afsluiten.startedByName,
            startedAt: afsluiten.startedAt,
            activityTypeName: afsluiten.activityTypeName,
          }}
          variant="beheerder"
          onClose={() => setAfsluiten(null)}
          onShiftEnded={sessie.herlaad}
        />
      )}
    </div>
  );
}
