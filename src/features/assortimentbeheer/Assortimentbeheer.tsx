"use client";

import { useBeheerSession } from "@/hooks/queries/useBeheerSession";
import { BeheerLogin } from "./BeheerLogin";
import { BeheerTabs } from "./BeheerTabs";

/**
 * `/beheer`'s top-level screen (issue #14, docs/features/assortimentbeheer.md;
 * uitgebreid met een tabbalk in issue #11,
 * docs/features/negatieve-saldolimiet.md). Zonder actieve beheer-sessie: het
 * inlogformulier — dat geldt ook als er wél een sessie is maar die niet naar
 * een actieve `members`-rij met rol `beheerder` herleidt (bv. de gedeelde
 * device-sessie, zie useBeheerSession.ts), met een duidelijke foutmelding
 * erbij. Met een bevestigde beheerder-sessie: `BeheerTabs` (Assortiment |
 * Instellingen), geen tussenliggende bar/beheer-modus-keuze (ADR 0003 →
 * "Geen zichtbare 'bar'-knop in #14's inlogflow" — er is vandaag nog geen
 * bar-bestemming om naar te routeren vanaf deze e-mail-sessie).
 */
export function Assortimentbeheer() {
  const session = useBeheerSession();

  if (session.status === "loading") {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-canvas px-6 py-10 font-sans text-ink">
        <p className="text-sm font-semibold text-muted" role="status">
          Bezig met laden…
        </p>
      </main>
    );
  }

  if (session.status === "signed-out") {
    return <BeheerLogin />;
  }

  if (session.status === "denied") {
    return <BeheerLogin deniedMessage={session.message} />;
  }

  return <BeheerTabs name={session.name} onSignOut={session.signOut} />;
}
