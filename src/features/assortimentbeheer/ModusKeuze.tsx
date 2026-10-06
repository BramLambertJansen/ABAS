"use client";

import { useRef } from "react";
import { StartScherm } from "@/components/StartScherm";
import { AuroraMerk } from "@/components/AuroraMerk";
import { CodeInvoer } from "@/components/CodeInvoer";
import { BEHEERDER_INGREEP } from "@/features/bar-sessie/teksten";
import { TWEESTAP_TEKSTEN, type CodeFout } from "@/lib/mfa";
import { useFocusNaWissel } from "@/hooks/useFocusNaWissel";

/** Kan deze beheerder nu "Beheer" kiezen? Sinds ADR 0017 eist beheer een
 *  tweede factor: zonder geverifieerde factor staat de tegel uit. */
export type BeheerTegel = "laden" | "geen_factor" | "beschikbaar";

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
 *
 * Tweede factor (docs/features/beheer-tweede-factor.md, ADR 0017): zonder
 * geverifieerde factor staat de tegel "Beheer" uit, met de uitleg om eerst in
 * de portal tweestapsverificatie in te stellen ("Bar" werkt gewoon). Met een
 * factor en een aal1-sessie toont een tik op "Beheer" eerst de code-invoer
 * (`codeStap`); na de code registreert de aanroeper de beheersessie.
 *
 * Focus (besloten 12): een tik op "Beheer" zet de focus op de kop van de
 * code-stap, "Annuleren" zet hem terug op de tegel "Beheer".
 */
export function ModusKeuze({
  name,
  role,
  pending,
  errorMessage,
  onChooseBar,
  onChooseBeheer,
  onSignOut,
  beheerTegel = "beschikbaar",
  codeStap = false,
  onVerifieerCode,
  onAnnuleerCode,
}: {
  name: string;
  role: "bardienst" | "beheerder";
  pending: boolean;
  errorMessage: string | null;
  onChooseBar: () => void;
  onChooseBeheer: () => void;
  onSignOut: () => void;
  beheerTegel?: BeheerTegel;
  /** Toon de code-invoer in plaats van de tegels. */
  codeStap?: boolean;
  onVerifieerCode?: (code: string) => Promise<CodeFout | null>;
  onAnnuleerCode?: () => void;
}) {
  const beheerUit = pending || beheerTegel !== "beschikbaar";
  const codeKopRef = useRef<HTMLHeadingElement>(null);
  const beheerTegelRef = useRef<HTMLButtonElement>(null);
  const markeerWissel = useFocusNaWissel(codeStap, (code) =>
    code ? codeKopRef.current : beheerTegelRef.current
  );
  return (
    <StartScherm>
      <AuroraMerk tone="dark">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Welkom, {name}</h1>
      </AuroraMerk>

      {codeStap && onVerifieerCode ? (
        <div className="flex w-full max-w-[260px] flex-col items-center gap-[18px]">
          <h2
            ref={codeKopRef}
            tabIndex={-1}
            className="text-center text-base font-extrabold text-white outline-none"
          >
            {TWEESTAP_TEKSTEN.modusKeuzeTitel}
          </h2>
          <CodeInvoer tone="rail" onVerifieer={onVerifieerCode} />
          <button
            type="button"
            onClick={() => {
              markeerWissel();
              onAnnuleerCode?.();
            }}
            className="text-xs font-semibold text-rail-muted hover:text-rail-light"
          >
            {BEHEERDER_INGREEP.annuleren}
          </button>
        </div>
      ) : (
      <div className="flex w-full max-w-[500px] flex-col items-center gap-5">
        <p className="h-5 text-center text-sm font-bold text-rail-error" role="alert">
          {errorMessage ?? ""}
        </p>
        <div className="flex w-full gap-3.5">
          <button
            type="button"
            disabled={pending}
            onClick={onChooseBar}
            className="flex flex-1 flex-col items-center gap-2.5 rounded-[18px] border border-rail-border bg-rail-card px-[18px] py-6 text-center transition-colors hover:border-accent hover:bg-rail-hover disabled:opacity-50"
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
            // aria-disabled, niet disabled: de tegel zonder factor moet
            // focusbaar en voorleesbaar blijven, met de uitleg erin.
            <button
              ref={beheerTegelRef}
              type="button"
              aria-disabled={beheerUit}
              onClick={() => {
                if (beheerUit) return;
                markeerWissel();
                onChooseBeheer();
              }}
              className={`flex flex-1 flex-col items-center gap-2.5 rounded-[18px] border border-rail-border bg-rail-card px-[18px] py-6 text-center transition-colors ${
                beheerUit ? "cursor-not-allowed" : "hover:border-accent hover:bg-rail-hover"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 19 19" fill="none" aria-hidden="true" className="text-rail-light">
                <rect x="4" y="8.4" width="11" height="7.4" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M6.6 8.4V6.3a2.9 2.9 0 0 1 5.8 0v2.1" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span className="text-[14.5px] font-extrabold text-white">Beheer</span>
              <span className="text-[11.5px] font-semibold leading-snug text-rail-muted">
                Assortiment, leden en instellingen
              </span>
              {beheerTegel === "geen_factor" && (
                <span className="text-[11.5px] font-bold leading-snug text-rail-light">
                  {TWEESTAP_TEKSTEN.beheerZonderFactor}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
      )}

      <button
        type="button"
        onClick={onSignOut}
        className="text-xs font-semibold text-rail-muted hover:text-rail-light"
      >
        Uitloggen
      </button>
    </StartScherm>
  );
}
