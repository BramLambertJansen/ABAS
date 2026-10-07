"use client";

import { useState } from "react";
import { formatTime } from "@/lib/date";
import { DienstAfsluitenOverlay } from "@/features/dienst-afsluiten/DienstAfsluitenOverlay";
import { AfmeldenOverlay } from "@/features/bar-sessie/AfmeldenOverlay";
import { useBarSessie } from "@/features/bar-sessie/BarSessieContext";
import { ADMIN_MELDING, BEHEERDER_INGREEP } from "@/features/bar-sessie/teksten";
import type { AdminShift, AdminSession } from "@/hooks/queries/useMijnDienst";

/**
 * Het beheeroverzicht van diensten en apparaten (docs/features/
 * dienst-per-sessie.md → Schermflow → Beheer, Beheerder: afsluiten, overnemen,
 * afmelden): in modus `beheer` de open dienst of diensten met hun koppelingen
 * en de laatste activiteit, en de actieve bar-sessies, met "Afsluiten"
 * (`DienstAfsluitenOverlay`, dezelfde samenvatting, met de extra regel dat de
 * dienst op een ander apparaat ook stopt) en "Afmelden" per sessie. De meldingen
 * "Dienst zonder apparaat" staan boven de tabs (`BeheerTabs`), zichtbaar op
 * elke tab.
 *
 * Overnemen kan hier niet: het vraagt een bar-sessie op het nieuwe apparaat
 * (besloten, 12a), dat is een beheerder in bar-modus.
 *
 * De data komt uit `my_bar_state()` (BarSessieProvider ververst elke 30
 * seconden), niet uit losse tabelqueries.
 */
export function DienstenApparaten() {
  const sessie = useBarSessie();
  const [afsluiten, setAfsluiten] = useState<AdminShift | null>(null);
  const [afmelden, setAfmelden] = useState<AdminSession | null>(null);

  const admin = sessie.admin;
  if (!admin) {
    return (
      <p className="text-sm font-semibold text-muted" role="status">
        Bezig met laden…
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section
        aria-labelledby="beheer-diensten-titel"
        className="flex min-w-[320px] max-w-xl flex-1 flex-col gap-3 rounded-card border border-border bg-white p-5"
      >
        <h2 id="beheer-diensten-titel" className="text-base font-extrabold tracking-tight">
          Diensten
        </h2>
        {admin.shifts.length === 0 && (
          <p className="text-sm font-semibold text-muted">Er loopt geen dienst.</p>
        )}
        <ul className="flex flex-col gap-3">
          {admin.shifts.map((shift) => (
            <li
              key={shift.id}
              className="flex flex-col gap-2 rounded-card border border-border bg-canvas p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-extrabold text-ink">
                    {shift.startedByName}
                  </span>
                  <span className="text-xs font-semibold text-muted">
                    sinds {formatTime(shift.startedAt)}
                    {shift.activityTypeName ? ` · ${shift.activityTypeName}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAfsluiten(shift)}
                  className="flex h-9 flex-none items-center rounded-control border border-border bg-white px-3.5 text-xs font-extrabold text-ink transition-colors hover:border-ink"
                >
                  {ADMIN_MELDING.afsluiten}
                </button>
              </div>
              {shift.sessions.length === 0 ? (
                <p className="text-xs font-semibold text-danger">
                  Er is geen apparaat meer ingelogd in deze dienst.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {shift.sessions.map((s) => (
                    <li key={s.barSessionId} className="text-xs font-semibold text-muted-strong">
                      {s.memberName} · laatst actief om {formatTime(s.lastActivityAt)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="beheer-apparaten-titel"
        className="flex min-w-[320px] max-w-xl flex-1 flex-col gap-3 rounded-card border border-border bg-white p-5"
      >
        <h2 id="beheer-apparaten-titel" className="text-base font-extrabold tracking-tight">
          Ingelogd
        </h2>
        {admin.sessions.length === 0 && (
          <p className="text-sm font-semibold text-muted">Niemand is ingelogd.</p>
        )}
        <ul className="flex flex-col gap-2">
          {admin.sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-canvas px-3.5 py-2.5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-extrabold text-ink">{s.memberName}</span>
                <span className="text-xs font-semibold text-muted">
                  {s.mode === "beheer" ? "beheer" : "bar"} · laatst actief om{" "}
                  {formatTime(s.lastActivityAt)}
                </span>
              </div>
              {!s.isOwn && (
                <button
                  type="button"
                  onClick={() => setAfmelden(s)}
                  aria-label={`${BEHEERDER_INGREEP.afmeldenKnop}: ${s.memberName}`}
                  className="flex h-9 flex-none items-center rounded-control border border-border bg-white px-3.5 text-xs font-extrabold text-ink transition-colors hover:border-ink"
                >
                  {BEHEERDER_INGREEP.afmeldenKnop}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {afsluiten && (
        <DienstAfsluitenOverlay
          shift={afsluiten}
          variant="beheerder"
          onClose={() => setAfsluiten(null)}
          onShiftEnded={sessie.herlaad}
        />
      )}
      {afmelden && (
        <AfmeldenOverlay
          sessieId={afmelden.id}
          naam={afmelden.memberName}
          onClose={() => setAfmelden(null)}
        />
      )}
    </div>
  );
}
