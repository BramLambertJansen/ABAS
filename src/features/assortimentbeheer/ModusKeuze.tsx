"use client";

import { AuroraMerk } from "@/components/AuroraMerk";

/**
 * Modus-keuze ná een geslaagde `/beheer`-sessie (ADR 0003 → Beslissing 2,
 * ongewijzigd door ADR 0005) — Bar of Beheer, losse instanties, geen
 * wisselknop binnen deze sessie. Sinds dienst-per-sessie (ADR 0016) legt de
 * keuze de modus ook server-side vast: `register_bar_session(p_mode)`
 * registreert de sessie in die modus, en een sessie wisselt daarna nooit meer
 * van modus (modus wisselen = uitloggen). "Bar" registreert en gaat dan naar
 * `/` (de bar-schermen, met een eigen sessie); "Beheer" registreert en laat
 * de aanroeper (`Assortimentbeheer.tsx`) naar `BeheerTabs` overschakelen.
 *
 * "Beheer" is er alleen voor een beheerder: de server registreert een
 * beheersessie alleen voor die rol (`no_admin_role`), en een tegel die altijd
 * faalt hoort er niet te staan. "Mijn account" is er niet meer: de PIN zet je
 * voortaan alleen in de portal (besloten, vraag 10).
 */
export function ModusKeuze({
  name,
  role,
  pending,
  errorMessage,
  onChooseBar,
  onChooseBeheer,
  onSignOut,
}: {
  name: string;
  role: "bardienst" | "beheerder";
  pending: boolean;
  errorMessage: string | null;
  onChooseBar: () => void;
  onChooseBeheer: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="relative isolate flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-auto bg-rail px-6 py-8 font-sans text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(238,90,36,0.16),transparent_60%)]"
      />
      <AuroraMerk tone="dark">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Welkom, {name}</h1>
      </AuroraMerk>

      <div className="flex w-full max-w-[500px] flex-col items-center gap-5">
        <p className="h-5 text-center text-sm font-bold text-rail-error" role="alert">
          {errorMessage ?? ""}
        </p>
        <div className="flex w-full gap-3.5">
          <button
            type="button"
            disabled={pending}
            onClick={onChooseBar}
            className="flex flex-1 flex-col items-center gap-2.5 rounded-[18px] border border-rail-border bg-rail-card px-[18px] py-6 text-center transition-colors hover:border-accent hover:bg-[#23262d] disabled:opacity-50"
          >
            <svg width="22" height="22" viewBox="0 0 19 19" fill="none" aria-hidden="true" className="text-rail-light">
              <rect x="5.2" y="2.6" width="8.6" height="13.8" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
              <line x1="5.2" y1="7.2" x2="13.8" y2="7.2" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span className="text-[14.5px] font-extrabold text-white">Bar</span>
            <span className="text-[11.5px] font-semibold leading-snug text-rail-muted">
              Verkopen, saldo&apos;s opwaarderen, dienst draaien
            </span>
          </button>

          {role === "beheerder" && (
            <button
              type="button"
              disabled={pending}
              onClick={onChooseBeheer}
              className="flex flex-1 flex-col items-center gap-2.5 rounded-[18px] border border-rail-border bg-rail-card px-[18px] py-6 text-center transition-colors hover:border-accent hover:bg-[#23262d] disabled:opacity-50"
            >
              <svg width="22" height="22" viewBox="0 0 19 19" fill="none" aria-hidden="true" className="text-rail-light">
                <rect x="4" y="8.4" width="11" height="7.4" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M6.6 8.4V6.3a2.9 2.9 0 0 1 5.8 0v2.1" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span className="text-[14.5px] font-extrabold text-white">Beheer</span>
              <span className="text-[11.5px] font-semibold leading-snug text-rail-muted">
                Assortiment, leden en instellingen
              </span>
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="text-xs font-semibold text-rail-muted hover:text-rail-light"
      >
        Uitloggen
      </button>
    </main>
  );
}
