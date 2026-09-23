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
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-canvas px-6 py-10 font-sans text-ink">
      <AuroraMerk>
        <h1 className="text-xl font-extrabold tracking-tight">Welkom, {name}</h1>
      </AuroraMerk>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link
          href="/"
          className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-white p-6 text-center transition-colors hover:border-accent"
        >
          <span className="text-base font-extrabold text-ink">Bar</span>
          <span className="text-xs font-medium text-muted">
            Verkopen, saldo&apos;s opwaarderen, dienst draaien
          </span>
        </Link>

        <button
          type="button"
          onClick={onChooseBeheer}
          className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-white p-6 text-center transition-colors hover:border-accent"
        >
          <span className="text-base font-extrabold text-ink">Beheer</span>
          <span className="text-xs font-medium text-muted">
            Assortiment, leden en instellingen
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          className="text-center text-xs font-semibold text-muted hover:text-ink"
        >
          Mijn account
        </button>
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="text-xs font-semibold text-muted hover:text-ink"
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
