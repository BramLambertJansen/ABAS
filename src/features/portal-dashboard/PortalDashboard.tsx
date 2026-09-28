"use client";

import { useId, useState } from "react";
import { SaldoTab } from "./SaldoTab";
import { TransactiesTab } from "./TransactiesTab";
import { AccountTab } from "@/features/portal-profiel/AccountTab";

type Tab = "saldo" | "transacties" | "account";

/**
 * `/portal`'s eerste echte inhoud achter een ingelogde `lid`-sessie —
 * docs/features/portal-dashboard.md → Doel/Betrokken shell. Vervangt
 * `PortalShellHome.tsx`'s "Welkom, {naam}"-placeholder (portal-login.md).
 *
 * Container: een kleine header (naam + "Uitloggen", het enige dat overblijft
 * van de placeholder) boven een tab-omschakeling Saldo/Transacties/Account
 * (Account sinds docs/features/portal-profiel.md, #17 — de Uitloggen-knop
 * blijft in de header, geen tweede in het Account-tabblad), zelfde
 * `role="tablist"`-patroon als `DienstTabs.tsx`/`BeheerTabs.tsx` (spec →
 * Schermflow: twee bestaande, niet-gedeelde precedenten voor deze derde
 * kopie, geen blokkade voor dit ticket). Elk tabblad blijft alleen gemount
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
  const saldoTabId = useId();
  const transactiesTabId = useId();
  const accountTabId = useId();
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

      <div
        role="tablist"
        aria-label="Portaal-navigatie"
        className="mx-5 mt-4 flex flex-none gap-1 rounded-2xl bg-track p-1"
      >
        <button
          type="button"
          role="tab"
          id={saldoTabId}
          aria-selected={tab === "saldo"}
          aria-controls="saldo-panel"
          onClick={() => setTab("saldo")}
          className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
            tab === "saldo" ? "bg-white text-ink shadow-sm" : "text-muted-strong"
          }`}
        >
          Saldo
        </button>
        <button
          type="button"
          role="tab"
          id={transactiesTabId}
          aria-selected={tab === "transacties"}
          aria-controls="transacties-panel"
          onClick={() => setTab("transacties")}
          className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
            tab === "transacties" ? "bg-white text-ink shadow-sm" : "text-muted-strong"
          }`}
        >
          Transacties
        </button>
        <button
          type="button"
          role="tab"
          id={accountTabId}
          aria-selected={tab === "account"}
          aria-controls="account-panel"
          onClick={() => setTab("account")}
          className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
            tab === "account" ? "bg-white text-ink shadow-sm" : "text-muted-strong"
          }`}
        >
          Account
        </button>
      </div>

      {tab === "saldo" && (
        <div
          id="saldo-panel"
          role="tabpanel"
          aria-labelledby={saldoTabId}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SaldoTab />
        </div>
      )}

      {tab === "transacties" && (
        <div
          id="transacties-panel"
          role="tabpanel"
          aria-labelledby={transactiesTabId}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TransactiesTab />
        </div>
      )}

      {tab === "account" && (
        <div
          id="account-panel"
          role="tabpanel"
          aria-labelledby={accountTabId}
          className="flex min-h-0 flex-1 flex-col"
        >
          <AccountTab email={email} onProfileChanged={onProfileChanged} />
        </div>
      )}
    </main>
  );
}
