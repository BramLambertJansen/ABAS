"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ProductenLijst } from "./ProductenLijst";
import { NegatieveLimietInstellingen } from "./NegatieveLimietInstellingen";

type Tab = "assortiment" | "instellingen";

/**
 * Navigatie tussen Assortiment (bestaande `ProductenLijst`, ongewijzigd) en
 * Instellingen (nieuw, issue #11 — `NegatieveLimietInstellingen`), ná een
 * bevestigde `/beheer`-sessie. Zie docs/features/negatieve-saldolimiet.md →
 * Betrokken shell / Navigatie: dit past exact hetzelfde `role="tablist"`-
 * patroon toe als `src/features/verkoop/DienstTabs.tsx` (bekeken als
 * referentie-implementatie), niet een nieuwe navigatiebeslissing —
 * `assortimentbeheer.md`'s eigen "geen tabbalk"-buiten-scope-punt klopte
 * alleen zolang er precies één scherm achter de beheer-login bestond.
 *
 * Elk tabblad blijft alleen gemount terwijl het actief is (zelfde
 * mount/unmount-lifecycle als `DienstTabs`, geen hidden-toggle) — zo krijgt
 * de Instellingen-tab bij elke terugkeer altijd een verse
 * `useAppSettings()`-lezing.
 *
 * De "Ingelogd als {naam} — uitloggen"-indicator en de
 * "← terug naar bardienst"-link staan hier, niet meer in
 * `ProductenLijst.tsx` — ze horen bij de sessie, niet bij één specifiek
 * tabblad (spec → Betrokken shell).
 */
export function BeheerTabs({
  name,
  onSignOut,
}: {
  name: string;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>("assortiment");
  const assortimentTabId = useId();
  const instellingenTabId = useId();

  return (
    <main className="flex min-h-screen w-full flex-col gap-5 bg-canvas px-6 py-6 font-sans text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-xs font-semibold text-muted hover:text-ink">
          ← terug naar bardienst
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted">
            Ingelogd als {name}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-9 items-center justify-center rounded-control border border-border bg-white px-3 text-xs font-bold text-ink transition-colors hover:border-accent"
          >
            Uitloggen
          </button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Beheer-navigatie"
        className="flex flex-none gap-2 border-b border-border pb-2"
      >
        <button
          type="button"
          role="tab"
          id={assortimentTabId}
          aria-selected={tab === "assortiment"}
          aria-controls="assortiment-panel"
          onClick={() => setTab("assortiment")}
          className={`flex min-h-[44px] items-center rounded-2xl px-4 text-sm font-bold transition-colors ${
            tab === "assortiment"
              ? "bg-accent-active text-white"
              : "text-muted hover:bg-white hover:text-ink"
          }`}
        >
          Assortiment
        </button>
        <button
          type="button"
          role="tab"
          id={instellingenTabId}
          aria-selected={tab === "instellingen"}
          aria-controls="instellingen-panel"
          onClick={() => setTab("instellingen")}
          className={`flex min-h-[44px] items-center rounded-2xl px-4 text-sm font-bold transition-colors ${
            tab === "instellingen"
              ? "bg-accent-active text-white"
              : "text-muted hover:bg-white hover:text-ink"
          }`}
        >
          Instellingen
        </button>
      </div>

      {tab === "assortiment" && (
        <div
          id="assortiment-panel"
          role="tabpanel"
          aria-labelledby={assortimentTabId}
          className="flex min-h-0 flex-1 flex-col gap-5"
        >
          <ProductenLijst />
        </div>
      )}

      {tab === "instellingen" && (
        <div
          id="instellingen-panel"
          role="tabpanel"
          aria-labelledby={instellingenTabId}
          className="flex min-h-0 flex-1 flex-col gap-5"
        >
          <NegatieveLimietInstellingen />
        </div>
      )}
    </main>
  );
}
