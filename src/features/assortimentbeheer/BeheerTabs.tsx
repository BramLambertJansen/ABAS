"use client";

import { useId, useState } from "react";
import { ProductenLijst } from "./ProductenLijst";
import { NegatieveLimietInstellingen } from "./NegatieveLimietInstellingen";
import { ActiviteitstypesInstellingen } from "./ActiviteitstypesInstellingen";
import { LedenLijst } from "../ledenbeheer/LedenLijst";
import { LogboekLijst } from "../logboek/LogboekLijst";
import { DienstenApparaten } from "../bar-beheer/DienstenApparaten";
import { AdminMeldingen } from "../bar-sessie/AdminMeldingen";
import { useBarSessie } from "../bar-sessie/BarSessieContext";

type Tab = "assortiment" | "leden" | "instellingen" | "logboek" | "diensten";

/**
 * Navigatie tussen Assortiment (bestaande `ProductenLijst`, ongewijzigd),
 * Leden (nieuw, ledenbeheer — `LedenLijst`, eigen featuremap
 * `src/features/ledenbeheer/`, zie docs/features/ledenbeheer.md →
 * Betrokken shell voor waarom dit een gewone cross-feature-import is, geen
 * `check:arch`-overtreding) en Instellingen (issue #11 —
 * `NegatieveLimietInstellingen`), ná een bevestigde `/beheer`-sessie. Zie
 * docs/features/negatieve-saldolimiet.md → Betrokken shell / Navigatie: dit
 * past exact hetzelfde `role="tablist"`-patroon toe als
 * `src/features/verkoop/DienstTabs.tsx` (bekeken als referentie-
 * implementatie), niet een nieuwe navigatiebeslissing —
 * `assortimentbeheer.md`'s eigen "geen tabbalk"-buiten-scope-punt klopte
 * alleen zolang er precies één scherm achter de beheer-login bestond.
 * Tabvolgorde (Assortiment/Leden/Instellingen) is aan de Developer, geen
 * architectuurkeuze (docs/features/ledenbeheer.md → Betrokken shell).
 *
 * Logboek is de vierde tab (docs/features/logboek.md → Betrokken shell,
 * `LogboekLijst` — `src/features/logboek/`), achteraan de balk: de eerste
 * drie tabs bewerken de huidige staat (assortiment, leden, instellingen),
 * Logboek is er alleen een terugblik op — tabvolgorde is expliciet aan de
 * Developer gelaten (docs/features/logboek.md → Navigatie).
 *
 * Elk tabblad blijft alleen gemount terwijl het actief is (zelfde
 * mount/unmount-lifecycle als `DienstTabs`, geen hidden-toggle) — zo krijgt
 * elke tab bij elke terugkeer altijd een verse leeshook-lezing.
 *
 * De "Ingelogd als {naam} — uitloggen"-indicator staat hier, niet meer in
 * `ProductenLijst.tsx` — ze hoort bij de sessie, niet bij één specifiek
 * tabblad (spec → Betrokken shell). De "← terug naar bardienst"-link is
 * vervallen (dienst-per-sessie, ADR 0016): een beheersessie kan niet naar de
 * bar, modus wisselen is uitloggen.
 *
 * Diensten (`DienstenApparaten`, alleen voor een beheerder) is het overzicht
 * van open diensten en ingelogde apparaten, met afsluiten en afmelden
 * (docs/features/dienst-per-sessie.md → Beheer). De meldingen "Dienst zonder
 * apparaat" staan boven de tabpanelen, zodat ze op elke tab zichtbaar zijn.
 */
export function BeheerTabs({
  name,
  role,
  onSignOut,
}: {
  name: string;
  role: "bardienst" | "beheerder";
  onSignOut: () => void;
}) {
  const sessie = useBarSessie();
  const [tab, setTab] = useState<Tab>("assortiment");
  const assortimentTabId = useId();
  const ledenTabId = useId();
  const instellingenTabId = useId();
  const logboekTabId = useId();
  const dienstenTabId = useId();

  return (
    <main className="flex min-h-screen w-full flex-col bg-canvas font-sans text-ink antialiased">
      {/* Eén kopbalk zoals het prototype (`beheerOpen`): terug-link, tabs als
          pillen (actief = donker), rechts de BEHEER-badge en uitloggen. */}
      <header className="flex h-[60px] flex-none items-center gap-3.5 border-b border-border bg-white px-5">
        <div
          role="tablist"
          aria-label="Beheer-navigatie"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            role="tab"
            id={assortimentTabId}
            aria-selected={tab === "assortiment"}
            aria-controls="assortiment-panel"
            onClick={() => setTab("assortiment")}
            className={`flex h-9 items-center whitespace-nowrap rounded-[10px] px-[15px] text-[12.5px] font-extrabold transition-colors ${
              tab === "assortiment"
                ? "bg-ink text-white"
                : "text-muted-strong hover:bg-border-subtle"
            }`}
          >
            Assortiment
          </button>
          <button
            type="button"
            role="tab"
            id={ledenTabId}
            aria-selected={tab === "leden"}
            aria-controls="leden-panel"
            onClick={() => setTab("leden")}
            className={`flex h-9 items-center whitespace-nowrap rounded-[10px] px-[15px] text-[12.5px] font-extrabold transition-colors ${
              tab === "leden"
                ? "bg-ink text-white"
                : "text-muted-strong hover:bg-border-subtle"
            }`}
          >
            Leden
          </button>
          <button
            type="button"
            role="tab"
            id={instellingenTabId}
            aria-selected={tab === "instellingen"}
            aria-controls="instellingen-panel"
            onClick={() => setTab("instellingen")}
            className={`flex h-9 items-center whitespace-nowrap rounded-[10px] px-[15px] text-[12.5px] font-extrabold transition-colors ${
              tab === "instellingen"
                ? "bg-ink text-white"
                : "text-muted-strong hover:bg-border-subtle"
            }`}
          >
            Instellingen
          </button>
          {role === "beheerder" && (
            <button
              type="button"
              role="tab"
              id={dienstenTabId}
              aria-selected={tab === "diensten"}
              aria-controls="diensten-panel"
              onClick={() => setTab("diensten")}
              className={`flex h-9 items-center whitespace-nowrap rounded-[10px] px-[15px] text-[12.5px] font-extrabold transition-colors ${
                tab === "diensten"
                  ? "bg-ink text-white"
                  : "text-muted-strong hover:bg-border-subtle"
              }`}
            >
              Diensten
            </button>
          )}
          {role === "beheerder" && (
            <button
              type="button"
              role="tab"
              id={logboekTabId}
              aria-selected={tab === "logboek"}
              aria-controls="logboek-panel"
              onClick={() => setTab("logboek")}
              className={`flex h-9 items-center whitespace-nowrap rounded-[10px] px-[15px] text-[12.5px] font-extrabold transition-colors ${
                tab === "logboek"
                  ? "bg-ink text-white"
                  : "text-muted-strong hover:bg-border-subtle"
              }`}
            >
              Logboek
            </button>
          )}
        </div>

        <div className="ml-auto flex flex-none items-center gap-2.5">
          <span className="hidden whitespace-nowrap text-xs font-semibold text-muted lg:inline">
            Ingelogd als {name}
          </span>
          <span className="whitespace-nowrap rounded-full bg-ink px-[11px] py-1.5 text-[9.5px] font-extrabold tracking-[0.11em] text-white">
            BEHEER
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-9 flex-none items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-border px-3.5 text-xs font-extrabold text-muted transition-colors hover:border-accent hover:text-accent-active"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M8.4 2.6h2a1.2 1.2 0 0 1 1.2 1.2v6.4a1.2 1.2 0 0 1-1.2 1.2h-2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="7.2"
                y1="7"
                x2="2.6"
                y2="7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <polyline
                points="4.6,5 2.6,7 4.6,9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Uitloggen
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-[18px]">
        {role === "beheerder" && sessie.notifications.length > 0 && (
          <AdminMeldingen meldingen={sessie.notifications} modus="beheer" className="max-w-xl" />
        )}

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

        {tab === "leden" && (
          <div
            id="leden-panel"
            role="tabpanel"
            aria-labelledby={ledenTabId}
            className="flex min-h-0 flex-1 flex-col gap-5"
          >
            <LedenLijst />
          </div>
        )}

        {tab === "instellingen" && (
          <div
            id="instellingen-panel"
            role="tabpanel"
            aria-labelledby={instellingenTabId}
            className="flex min-h-0 flex-1 flex-wrap items-start gap-5"
          >
            <NegatieveLimietInstellingen />
            {/* Nieuwe kaart naast (niet in plaats van) NegatieveLimietInstellingen
              — responsief, scrollbaar raster (issue #18, chat37.md), geen
              vierde tab. Zie docs/features/activiteittypes.md → Schermflow §1. */}
            <ActiviteitstypesInstellingen />
          </div>
        )}

        {tab === "diensten" && role === "beheerder" && (
          <div
            id="diensten-panel"
            role="tabpanel"
            aria-labelledby={dienstenTabId}
            className="flex min-h-0 flex-1 flex-col gap-5"
          >
            <DienstenApparaten />
          </div>
        )}

        {tab === "logboek" && role === "beheerder" && (
          <div
            id="logboek-panel"
            role="tabpanel"
            aria-labelledby={logboekTabId}
            className="flex min-h-0 flex-1 flex-col gap-5"
          >
            <LogboekLijst />
          </div>
        )}
      </div>
    </main>
  );
}
