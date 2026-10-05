"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TabList, TabPanel, tabElementId, type TabItem } from "@/components/Tabs";
import { SaldoTab } from "./SaldoTab";
import { TransactiesTab } from "./TransactiesTab";
import { AccountTab } from "@/features/portal-profiel/AccountTab";

type Tab = "saldo" | "transacties" | "account";

const portalTabClass = (selected: boolean) =>
  `flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
    selected ? "bg-white text-ink shadow-sm" : "text-muted-strong"
  }`;

const PORTAL_TABS: TabItem[] = [
  { key: "saldo", label: "Saldo", className: portalTabClass },
  { key: "transacties", label: "Transacties", className: portalTabClass },
  { key: "account", label: "Account", className: portalTabClass },
];

/**
 * `/portal`'s eerste echte inhoud achter een ingelogde `lid`-sessie —
 * docs/features/portal-dashboard.md → Doel/Betrokken shell. Vervangt
 * `PortalShellHome.tsx`'s "Welkom, {naam}"-placeholder (portal-login.md).
 *
 * Container: een kleine header (naam + "Uitloggen", het enige dat overblijft
 * van de placeholder) boven een tab-omschakeling Saldo/Transacties/Account
 * (Account sinds docs/features/portal-profiel.md, #17 — de Uitloggen-knop
 * blijft in de header, geen tweede in het Account-tabblad), via
 * het gedeelde `TabList`/`TabPanel` (`src/components/Tabs.tsx`), met manuele
 * activatie: pijlen verplaatsen de focus, Enter/Space activeert. Elk tabblad blijft alleen gemount
 * terwijl het actief is (zelfde mount/unmount-lifecycle als `DienstTabs`),
 * zodat een tab bij terugkeer altijd een verse leeshook-lezing krijgt — er
 * is geen live-subscriptie in v1 (spec → Randgevallen).
 *
 * Geen `useShell()`-contract: deze feature bestaat uitsluitend binnen
 * `shells/portal`, er is geen tweede shell om capabilities voor te
 * onderscheiden (spec → Betrokken shell, zelfde constatering als
 * `portal-login.md`).
 */
export function PortalDashboard({
  name,
  email,
  onSignOut,
  onProfileChanged,
}: {
  name: string;
  email: string;
  onSignOut: () => void;
  /** `refetch` van de sessie-instantie in `PortalShellHome`, zodat de
   *  header na een naamwijziging in het Account-tabblad meeververst
   *  (portal-profiel.md → Schermflow §1). */
  onProfileChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("saldo");
  const idBase = useId();
  // "Alle transacties" verwijdert zijn eigen knop uit de DOM (het Saldo-panel
  // unmount); de focus gaat dan naar de tab "Transacties" i.p.v. naar body.
  const focusTransactiesTab = useRef(false);

  useEffect(() => {
    if (tab === "transacties" && focusTransactiesTab.current) {
      focusTransactiesTab.current = false;
      document.getElementById(tabElementId(idBase, "transacties"))?.focus();
    }
  }, [tab, idBase]);
  const firstName = name.trim().split(/\s+/)[0] || name;

  return (
    <main className="flex min-h-screen w-full flex-col bg-canvas font-sans text-ink antialiased">
      <header className="flex flex-none items-center justify-between gap-3 border-b border-border bg-white px-5 py-4">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-lg font-extrabold tracking-tight text-ink">
            Hoi {firstName}
          </h1>
          {/* Zelfde tekst als de vervangen placeholder (PortalShellHome.tsx)
              — alleen niet langer zichtbaar, de header toont nu al de naam
              als h1. sr-only geeft screenreadergebruikers dezelfde
              sessie-context. */}
          <span className="sr-only">Ingelogd als {email}.</span>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-9 flex-none items-center whitespace-nowrap rounded-[10px] border border-border px-3.5 text-xs font-extrabold text-muted transition-colors hover:border-accent hover:text-accent-active"
        >
          Uitloggen
        </button>
      </header>

      <TabList
        idBase={idBase}
        label="Portaal-navigatie"
        activation="manual"
        selected={tab}
        onSelect={(key) => setTab(key as Tab)}
        items={PORTAL_TABS}
        className="mx-5 mt-4 flex flex-none gap-1 rounded-2xl bg-track p-1"
      />

      {tab === "saldo" && (
        <TabPanel idBase={idBase} tabKey="saldo" className="flex min-h-0 flex-1 flex-col">
          <SaldoTab
            onShowAll={() => {
              focusTransactiesTab.current = true;
              setTab("transacties");
            }}
          />
        </TabPanel>
      )}

      {tab === "transacties" && (
        <TabPanel idBase={idBase} tabKey="transacties" className="flex min-h-0 flex-1 flex-col">
          <TransactiesTab />
        </TabPanel>
      )}

      {tab === "account" && (
        <TabPanel idBase={idBase} tabKey="account" className="flex min-h-0 flex-1 flex-col">
          <AccountTab email={email} onProfileChanged={onProfileChanged} />
        </TabPanel>
      )}
    </main>
  );
}
