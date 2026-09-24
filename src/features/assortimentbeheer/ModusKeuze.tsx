"use client";

import Link from "next/link";
import { useState } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { MijnAccountOverlay } from "./MijnAccountOverlay";

/**
 * Modus-keuze ná een geslaagde `/beheer`-sessie (ADR 0003 → Beslissing 2,
 * ongewijzigd door ADR 0005) — Bar of Beheer, losse instanties, geen
 * wisselknop binnen deze sessie. "Bar" navigeert naar `/` (de bestaande
 * PIN-flow, #6/#7 — functioneel identiek ongeacht hoe hierheen ingelogd
 * is, ADR 0003 → Beslissing 3): dit bouwt geen tweede bar-mechanisme, enkel
 * een tweede weg ernaartoe. "Beheer" laat de aanroeper (`Assortimentbeheer.tsx`)
 * naar `BeheerTabs` overschakelen, binnen dezelfde sessie.
 *
 * "Mijn account" (docs/features/auth-methode-per-lid.md → Definitieve
 * keuzes punt 3 / Schermflow stap 6) is de derde, bewust kleinere ingang —
 * de enige plek waar `set_own_pin` kan werken, omdat dit scherm altijd op
 * een individuele e-mail/wachtwoord-sessie draait (nooit de gedeelde
 * device-sessie waarop de PIN-stafkeuze zelf draait). Niet rolafhankelijk
 * zichtbaar — elk lid dat hier komt is al bardienst of beheerder
 * (`useBeheerSession.ts` sluit een `lid`-only account al uit vóór dit
 * scherm ooit rendert), en geen rolgebaseerde filtering van de Bar/Beheer-
 * tegels zelf (ADR 0003 → Beslissing 4, spec → Expliciet buiten scope).
 */
export function ModusKeuze({
  name,
  hasPin,
  onChooseBeheer,
  onSignOut,
  onPinChanged,
}: {
  name: string;
  hasPin: boolean;
  onChooseBeheer: () => void;
  onSignOut: () => Promise<void>;
  onPinChanged: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);

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
        <div className="flex w-full gap-3.5">
          <Link href="/" className="flex flex-1 flex-col items-center gap-2.5 rounded-[18px] border border-rail-border bg-rail-card px-[18px] py-6 text-center transition-colors hover:border-accent hover:bg-[#23262d]">
            <svg width="22" height="22" viewBox="0 0 19 19" fill="none" aria-hidden="true" className="text-rail-light">
              <rect x="5.2" y="2.6" width="8.6" height="13.8" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
              <line x1="5.2" y1="7.2" x2="13.8" y2="7.2" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span className="text-[14.5px] font-extrabold text-white">Bar</span>
            <span className="text-[11.5px] font-semibold leading-snug text-rail-muted">
              Verkopen, saldo&apos;s opwaarderen, dienst draaien
            </span>
          </Link>

          <button type="button" onClick={onChooseBeheer} className="flex flex-1 flex-col items-center gap-2.5 rounded-[18px] border border-rail-border bg-rail-card px-[18px] py-6 text-center transition-colors hover:border-accent hover:bg-[#23262d]">
            <svg width="22" height="22" viewBox="0 0 19 19" fill="none" aria-hidden="true" className="text-rail-light">
              <rect x="4" y="8.4" width="11" height="7.4" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M6.6 8.4V6.3a2.9 2.9 0 0 1 5.8 0v2.1" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span className="text-[14.5px] font-extrabold text-white">Beheer</span>
            <span className="text-[11.5px] font-semibold leading-snug text-rail-muted">
              Assortiment, leden en instellingen
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          className="text-center text-xs font-semibold text-rail-muted hover:text-rail-light"
        >
          Mijn account
        </button>
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="text-xs font-semibold text-rail-muted hover:text-rail-light"
      >
        Uitloggen
      </button>

      {accountOpen && (
        <MijnAccountOverlay
          hasPin={hasPin}
          onClose={() => setAccountOpen(false)}
          onChanged={onPinChanged}
        />
      )}
    </main>
  );
}
