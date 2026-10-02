"use client";

import { useId, useState, type ReactNode } from "react";
import { TabList, TabPanel, type TabItem } from "@/components/Tabs";
import type { OpenShift } from "@/hooks/queries/useMijnDienst";
import { DienstActief } from "@/features/bezetting-beheren/DienstActief";
import { DienstTeLangOpenMelding } from "@/features/dienst-te-lang-open/DienstTeLangOpenMelding";
import { OverlayPresenceProvider } from "@/components/OverlayPresence";
import { VerkoopScherm } from "./VerkoopScherm";
import { useBarSessie } from "@/features/bar-sessie/BarSessieContext";
import { AdminMeldingen } from "@/features/bar-sessie/AdminMeldingen";
import { UitloggenKnop } from "@/features/bar-sessie/UitloggenKnop";
import { ingelogdAls } from "@/features/bar-sessie/teksten";

type Tab = "verkoop" | "dienst";

const railTabClass = (selected: boolean) =>
  `relative flex w-[70px] flex-col items-center gap-[7px] rounded-[14px] pb-[9px] pt-[11px] text-center text-[10.5px] font-bold transition-colors ${
    selected
      ? "bg-accent/15 text-rail-error"
      : "text-rail-muted hover:bg-white/5 hover:text-white"
  }`;

function railLabel(icon: ReactNode, text: string) {
  return function RailLabel(selected: boolean) {
    return (
      <>
        <span
          aria-hidden="true"
          className={`absolute -left-[11px] bottom-[14px] top-[14px] w-[3px] rounded-r-[3px] ${
            selected ? "bg-accent" : "bg-transparent"
          }`}
        />
        {icon}
        {text}
      </>
    );
  };
}

const RAIL_TABS: TabItem[] = [
  {
    key: "verkoop",
    className: railTabClass,
    label: railLabel(
      <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
        <rect x="5.2" y="2.6" width="8.6" height="13.8" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
        <line x1="5.2" y1="7.2" x2="13.8" y2="7.2" stroke="currentColor" strokeWidth="1.6" />
      </svg>,
      "Verkoop"
    ),
  },
  {
    key: "dienst",
    className: railTabClass,
    label: railLabel(
      <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
        <line x1="4.2" y1="6.4" x2="14.2" y2="6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <polyline points="11.6,3.8 14.8,6.4 11.6,9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="14.8" y1="12.6" x2="4.8" y2="12.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <polyline points="7.4,10 4.2,12.6 7.4,15.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>,
      "Dienst"
    ),
  },
];

/**
 * Navigatie tussen Verkoop (standaard/actief na dienst-start of bij een
 * al-open dienst) en Dienst (`DienstActief`) — zie docs/features/verkoop.md
 * → Navigatie. Chrome naar designs/Bar App.dc.html: een donkere icon-rail
 * links (92px, "A"-merkteken, "DIENST"-label, één knop per scherm met
 * oranje streep bij het actieve scherm). Semantisch een verticale `tablist`
 * via het gedeelde `TabList` (`src/components/Tabs.tsx`): Omhoog/Omlaag,
 * Home/End, automatische activatie (twee tabs, lichte panelen). Het
 * panelgebied is het enige `main` van het actieve barscherm.
 *
 * Elk tabblad blijft alleen gemount terwijl het actief is (zelfde
 * mount/unmount-als-lifecycle-aanpak als Overlay.tsx, niet een
 * hidden-toggle) — zo krijgt Verkoop bij terugkeer altijd verse data
 * (assortiment, leden, bezetting) in plaats van een stale snapshot van
 * vóór het wisselen.
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
  const [tab, setTab] = useState<Tab>("verkoop");
  const idBase = useId();

  return (
    <OverlayPresenceProvider>
      <div className="flex h-screen w-full overflow-hidden bg-canvas font-sans text-ink antialiased">
        <nav
          aria-label="Bar"
          className="flex w-[80px] flex-none flex-col min-[1024px]:w-[92px] items-center gap-1 bg-rail pb-[18px] pt-5"
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

          <TabList
            idBase={idBase}
            label="Dienst-navigatie"
            orientation="vertical"
            activation="automatic"
            selected={tab}
            onSelect={(key) => setTab(key as Tab)}
            items={RAIL_TABS}
            className="flex flex-col items-center gap-1"
          />

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

        {/* Het enige main-landmark van het actieve barscherm (F28). Het omhult
            het tabpanel, want één element kan niet main én tabpanel zijn. De
            meldingen staan er als siblings van het panel in, zodat ze niet
            buiten elke landmark vallen; beide zijn `fixed` en dus zonder
            invloed op de layout. */}
        <main className="flex min-h-0 min-w-0 flex-1">
          {tab === "verkoop" && (
            <TabPanel idBase={idBase} tabKey="verkoop" className="flex min-h-0 min-w-0 flex-1">
              <VerkoopScherm shift={shift} />
            </TabPanel>
          )}

          {tab === "dienst" && (
            <TabPanel idBase={idBase} tabKey="dienst" className="flex min-h-0 min-w-0 flex-1">
              <DienstActief shift={shift} onShiftEnded={onShiftEnded} />
            </TabPanel>
          )}

          <DienstTeLangOpenMelding shift={shift} onShiftEnded={onShiftEnded} />

          {sessie.session?.memberRole === "beheerder" && sessie.notifications.length > 0 && (
            <AdminMeldingen
              meldingen={sessie.notifications}
              modus="bar"
              className="fixed right-4 top-4 z-40 w-[360px] max-w-[calc(100vw-2rem)]"
            />
          )}
        </main>
      </div>
    </OverlayPresenceProvider>
  );
}
