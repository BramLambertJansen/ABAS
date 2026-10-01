"use client";

import { useId, useState, type ReactNode } from "react";
import type { OpenShift } from "@/hooks/queries/useMijnDienst";
import { DienstActief } from "@/features/bezetting-beheren/DienstActief";
import { DienstTeLangOpenMelding } from "@/features/dienst-te-lang-open/DienstTeLangOpenMelding";
import { OverlayPresenceProvider, useOpenOverlayCount } from "@/components/OverlayPresence";
import { VerkoopScherm } from "./VerkoopScherm";
import { useBarSessie } from "@/features/bar-sessie/BarSessieContext";
import { AdminMeldingen } from "@/features/bar-sessie/AdminMeldingen";
import { UitloggenKnop } from "@/features/bar-sessie/UitloggenKnop";
import { useVerkoopDraft } from "./useVerkoopDraft";
import { useMandjeMelding } from "@/features/bar-sessie/BarSessieContext";
import { ingelogdAls } from "@/features/bar-sessie/teksten";

type Tab = "verkoop" | "dienst";

/**
 * Navigatie tussen Verkoop (standaard/actief na dienst-start of bij een
 * al-open dienst) en Dienst (`DienstActief`) — zie docs/features/verkoop.md
 * → Navigatie. Chrome naar designs/Bar App.dc.html: een donkere icon-rail
 * links (92px, "A"-merkteken, "DIENST"-label, één knop per scherm met
 * oranje streep bij het actieve scherm). Semantisch een verticale
 * `tablist`, zodat toetsenbord en schermlezer dezelfde tabs zien als
 * voorheen.
 *
 * Alleen het actieve tabblad is gemount en haalt bij terugkeer verse data
 * op. De verkoopdraft leeft hier, boven de tabpanelen, zodat invoer de
 * tabwissel overleeft zonder gelddata als actueel te beschouwen.
 *
 * Sinds dienst-per-sessie (docs/features/dienst-per-sessie.md → Schermflow
 * punt 5) onderaan de rail "Ingelogd als {naam}" en "Uitloggen" (met de
 * keuze uit vraag 17 als de dienst nog loopt), en voor een beheerder de
 * meldingen "Dienst zonder apparaat" rechtsboven.
 *
 * `OverlayPresenceProvider` omvat de tabpanelen én de melding "Dienst staat
 * nog open" (docs/features/dienst-te-lang-open.md, ADR 0014): de melding is
 * een sibling van de tabpanelen, dus verschijnt over beide tabs heen en
 * overleeft (met zijn snooze) elke tabwissel.
 */
export function DienstTabs({
  shift,
  onShiftEnded,
}: {
  shift: OpenShift;
  onShiftEnded: () => void;
}) {
  const sessie = useBarSessie();
  const draft = useVerkoopDraft();
  useMandjeMelding(draft.cartLines.length > 0);
  const [tab, setTab] = useState<Tab>("verkoop");
  const verkoopTabId = useId();
  const dienstTabId = useId();

  return (
    <OverlayPresenceProvider>
      <div className="flex h-screen w-full overflow-hidden bg-canvas font-sans text-ink antialiased">
        <nav
          aria-label="Bar"
          className="flex w-[92px] flex-none flex-col items-center gap-1 bg-rail pb-[18px] pt-5"
        >
          <div
            aria-hidden="true"
            className="flex h-[42px] w-[42px] items-center justify-center rounded-[13px] bg-accent text-[19px] font-extrabold tracking-tight text-white shadow-[0_6px_16px_-4px_rgba(238,90,36,0.7)]"
          >
            A
          </div>
          <span className="mb-4 mt-[9px] rounded-full bg-accent/20 px-2 py-1 text-[8.5px] font-extrabold tracking-[0.13em] text-rail-error">
            DIENST
          </span>

          <div
            role="tablist"
            aria-label="Dienst-navigatie"
            aria-orientation="vertical"
            className="flex flex-col items-center gap-1"
          >
            <RailTab
              id={verkoopTabId}
              controls="verkoop-panel"
              selected={tab === "verkoop"}
              onSelect={() => setTab("verkoop")}
              icon={
                <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
                  <rect x="5.2" y="2.6" width="8.6" height="13.8" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
                  <line x1="5.2" y1="7.2" x2="13.8" y2="7.2" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              }
            >
              Verkoop
            </RailTab>
            <RailTab
              id={dienstTabId}
              controls="dienst-panel"
              selected={tab === "dienst"}
              onSelect={() => setTab("dienst")}
              icon={
                <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
                  <line x1="4.2" y1="6.4" x2="14.2" y2="6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <polyline points="11.6,3.8 14.8,6.4 11.6,9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="14.8" y1="12.6" x2="4.8" y2="12.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <polyline points="7.4,10 4.2,12.6 7.4,15.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            >
              Dienst
            </RailTab>
          </div>

          <div className="mt-auto flex w-full flex-col items-center gap-2 px-1.5 pt-4">
            {sessie.session && (
              <p className="break-words text-center text-[9.5px] font-semibold leading-tight text-rail-muted">
                {ingelogdAls(sessie.session.memberName)}
              </p>
            )}
            <UitloggenKnop
              shift={shift}
              className="flex w-[70px] items-center justify-center rounded-[10px] border border-rail-border py-2 text-[10.5px] font-bold text-rail-muted transition-colors hover:border-accent hover:text-white"
            />
          </div>
        </nav>

        {tab === "verkoop" && (
          <div
            id="verkoop-panel"
            role="tabpanel"
            aria-labelledby={verkoopTabId}
            className="flex min-h-0 min-w-0 flex-1"
          >
            <VerkoopScherm shift={shift} draft={draft} />
          </div>
        )}

        {tab === "dienst" && (
          <div
            id="dienst-panel"
            role="tabpanel"
            aria-labelledby={dienstTabId}
            className="flex min-h-0 min-w-0 flex-1"
          >
            <DienstActief shift={shift} onShiftEnded={onShiftEnded} />
          </div>
        )}

        <DienstTeLangOpenMelding shift={shift} onShiftEnded={onShiftEnded} />

        {sessie.session?.memberRole === "beheerder" && sessie.notifications.length > 0 && (
          <AdminMeldingen
            meldingen={sessie.notifications}
            modus="bar"
            className="fixed right-4 top-4 z-40 w-[360px] max-w-[calc(100vw-2rem)]"
          />
        )}
      </div>
    </OverlayPresenceProvider>
  );
}

function RailTab({
  id,
  controls,
  selected,
  onSelect,
  icon,
  children,
}: {
  id: string;
  controls: string;
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  // Een modal moet eerst sluiten: ook een toetsenbordklik buiten de
  // dialoog mag een lopende boeking niet unmounten en opnieuw aanbieden.
  const overlayOpen = useOpenOverlayCount() > 0;
  return (
    <button
      type="button"
      disabled={overlayOpen}
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={controls}
      onClick={onSelect}
      className={`relative flex w-[70px] flex-col items-center gap-[7px] rounded-[14px] pb-[9px] pt-[11px] text-center text-[10.5px] font-bold transition-colors ${
        selected
          ? "bg-accent/15 text-rail-error"
          : "text-rail-muted hover:bg-white/5 hover:text-white"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute -left-[11px] bottom-[14px] top-[14px] w-[3px] rounded-r-[3px] ${
          selected ? "bg-accent" : "bg-transparent"
        }`}
      />
      {icon}
      {children}
    </button>
  );
}
