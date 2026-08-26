"use client";

import { useId, useState } from "react";
import type { OpenShift } from "@/hooks/queries/useOpenShift";
import { DienstActief } from "@/features/bezetting-beheren/DienstActief";
import { VerkoopScherm } from "./VerkoopScherm";

type Tab = "verkoop" | "dienst";

/**
 * Navigatie tussen Verkoop (standaard/actief na dienst-start of bij een
 * al-open dienst) en Dienst (bestaande `DienstActief`-inhoud, ongewijzigd)
 * — zie docs/features/verkoop.md → Navigatie. De exacte chrome is bewust
 * eenvoudig gehouden (een tabbar, geen nabouw van het ontwerp se donkere
 * icon-rail): de spec legt alleen vast dát er navigatie is met Verkoop als
 * standaard, niet de pixels.
 *
 * Elk tabblad blijft alleen gemount terwijl het actief is (zelfde
 * mount/unmount-als-lifecycle-aanpak als Overlay.tsx, niet een
 * hidden-toggle) — zo krijgt Verkoop bij terugkeer altijd verse data
 * (assortiment, leden, bezetting) in plaats van een stale snapshot van
 * vóór het wisselen.
 */
export function DienstTabs({ shift }: { shift: OpenShift }) {
  const [tab, setTab] = useState<Tab>("verkoop");
  const verkoopTabId = useId();
  const dienstTabId = useId();

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas font-sans text-ink">
      <div role="tablist" aria-label="Dienst-navigatie" className="flex flex-none gap-2 border-b border-border bg-white px-4 py-2">
        <button
          type="button"
          role="tab"
          id={verkoopTabId}
          aria-selected={tab === "verkoop"}
          aria-controls="verkoop-panel"
          onClick={() => setTab("verkoop")}
          className={`flex min-h-[44px] items-center rounded-2xl px-4 text-sm font-bold transition-colors ${
            tab === "verkoop"
              ? "bg-accent-active text-white"
              : "text-muted hover:bg-canvas hover:text-ink"
          }`}
        >
          Verkoop
        </button>
        <button
          type="button"
          role="tab"
          id={dienstTabId}
          aria-selected={tab === "dienst"}
          aria-controls="dienst-panel"
          onClick={() => setTab("dienst")}
          className={`flex min-h-[44px] items-center rounded-2xl px-4 text-sm font-bold transition-colors ${
            tab === "dienst"
              ? "bg-accent-active text-white"
              : "text-muted hover:bg-canvas hover:text-ink"
          }`}
        >
          Dienst
        </button>
      </div>

      {tab === "verkoop" && (
        <div
          id="verkoop-panel"
          role="tabpanel"
          aria-labelledby={verkoopTabId}
          className="flex min-h-0 flex-1 flex-col"
        >
          <VerkoopScherm shift={shift} />
        </div>
      )}

      {tab === "dienst" && (
        <div
          id="dienst-panel"
          role="tabpanel"
          aria-labelledby={dienstTabId}
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 bg-rail px-6 py-10 text-white"
        >
          <DienstActief shift={shift} />
        </div>
      )}
    </div>
  );
}
