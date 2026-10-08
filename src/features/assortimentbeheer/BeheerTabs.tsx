"use client";

import { Knop } from "@/components/Knop";
import { useId, useState } from "react";
import { TabList, TabPanel, type TabItem } from "@/components/Tabs";
import { ProductenLijst } from "./ProductenLijst";
import { NegatieveLimietInstellingen } from "./NegatieveLimietInstellingen";
import { ActiviteitstypesInstellingen } from "./ActiviteitstypesInstellingen";
import { LedenLijst } from "../ledenbeheer/LedenLijst";
import { LogboekLijst } from "../logboek/LogboekLijst";
import { DienstenApparaten } from "../bar-beheer/DienstenApparaten";
import { AdminMeldingen } from "../bar-sessie/AdminMeldingen";
import { useBarSessie } from "../bar-sessie/BarSessieContext";

type Tab = "assortiment" | "leden" | "instellingen" | "logboek" | "diensten";

// Wat hier staat is wat gerenderd wordt: Diensten en Logboek alleen voor de
// beheerder, dus pijlnavigatie slaat ze voor een bardienst vanzelf over.
const BARDIENST_TABS: TabItem[] = [
  { key: "assortiment", label: "Assortiment" },
  { key: "leden", label: "Leden" },
  { key: "instellingen", label: "Instellingen" },
];
const BEHEERDER_TABS: TabItem[] = [
  ...BARDIENST_TABS,
  { key: "diensten", label: "Diensten" },
  { key: "logboek", label: "Logboek" },
];

/**
 * Navigatie tussen Assortiment (bestaande `ProductenLijst`, ongewijzigd),
 * Leden (nieuw, ledenbeheer — `LedenLijst`, eigen featuremap
 * `src/features/ledenbeheer/`, zie docs/features/ledenbeheer.md →
 * Betrokken shell voor waarom dit een gewone cross-feature-import is, geen
 * `check:arch`-overtreding) en Instellingen (issue #11 —
 * `NegatieveLimietInstellingen`), ná een bevestigde `/beheer`-sessie. Zie
 * docs/features/negatieve-saldolimiet.md → Betrokken shell / Navigatie: dit
 * gebruikt het gedeelde `TabList`/`TabPanel`
 * (`src/components/Tabs.tsx`, manuele activatie: pijlen verplaatsen de focus,
 * Enter/Space activeert) —
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
  const idBase = useId();

  return (
    <main className="flex min-h-screen w-full flex-col bg-canvas font-sans text-ink antialiased">
      {/* Eén kopbalk zoals het prototype (`beheerOpen`): terug-link, tabs in
          een segmentbalk (actief = wit vlak), rechts de BEHEER-badge en uitloggen. */}
      <header className="flex min-h-[60px] flex-none flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-border bg-surface px-5 py-2">
        <TabList
          idBase={idBase}
          label="Beheer-navigatie"
          activation="manual"
          selected={tab}
          onSelect={(key) => setTab(key as Tab)}
          items={role === "beheerder" ? BEHEERDER_TABS : BARDIENST_TABS}
          stijl="segment"
          className="flex-wrap"
        />

        <div className="ml-auto flex flex-none items-center gap-2.5">
          <span className="hidden whitespace-nowrap text-xs font-semibold text-muted lg:inline">
            Ingelogd als {name}
          </span>
          <span className="whitespace-nowrap rounded-full bg-ink px-[11px] py-1.5 text-[9.5px] font-extrabold tracking-[0.11em] text-white">
            BEHEER
          </span>
          <Knop
            className="flex-none gap-2 whitespace-nowrap"
            onClick={onSignOut}
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
          </Knop>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-[18px]">
        {role === "beheerder" && sessie.notifications.length > 0 && (
          <AdminMeldingen meldingen={sessie.notifications} modus="beheer" className="max-w-xl" />
        )}

        {tab === "assortiment" && (
          <TabPanel idBase={idBase} tabKey="assortiment" className="flex min-h-0 flex-1 flex-col gap-5">
            <ProductenLijst />
          </TabPanel>
        )}

        {tab === "leden" && (
          <TabPanel idBase={idBase} tabKey="leden" className="flex min-h-0 flex-1 flex-col gap-5">
            <LedenLijst />
          </TabPanel>
        )}

        {tab === "instellingen" && (
          <TabPanel idBase={idBase} tabKey="instellingen" className="flex min-h-0 flex-1 flex-wrap items-start gap-5">
            <NegatieveLimietInstellingen />
            {/* Nieuwe kaart naast (niet in plaats van) NegatieveLimietInstellingen
              — responsief, scrollbaar raster (issue #18, chat37.md), geen
              vierde tab. Zie docs/features/activiteittypes.md → Schermflow §1. */}
            <ActiviteitstypesInstellingen />
          </TabPanel>
        )}

        {tab === "diensten" && role === "beheerder" && (
          <TabPanel idBase={idBase} tabKey="diensten" className="flex min-h-0 flex-1 flex-col gap-5">
            <DienstenApparaten />
          </TabPanel>
        )}

        {tab === "logboek" && role === "beheerder" && (
          <TabPanel idBase={idBase} tabKey="logboek" className="flex min-h-0 flex-1 flex-col gap-5">
            <LogboekLijst />
          </TabPanel>
        )}
      </div>
    </main>
  );
}
