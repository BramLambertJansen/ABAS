"use client";

import { useState } from "react";
import { useBeheerSession } from "@/hooks/queries/useBeheerSession";
import { BeheerLogin } from "./BeheerLogin";
import { BeheerTabs } from "./BeheerTabs";
import { ModusKeuze } from "./ModusKeuze";

/**
 * `/beheer`'s top-level screen (issue #14, docs/features/assortimentbeheer.md;
 * uitgebreid met een tabbalk in issue #11,
 * docs/features/negatieve-saldolimiet.md; en met een modus-keuze in issue
 * #42, docs/features/auth-methode-per-lid.md). Zonder actieve sessie: het
 * inlogformulier — dat geldt ook als er wél een sessie is maar die niet naar
 * een actieve `members`-rij met rol `bardienst`/`beheerder` herleidt (bv. de
 * gedeelde device-sessie, zie useBeheerSession.ts), met een duidelijke
 * foutmelding erbij.
 *
 * Met een bevestigde bardienst/beheerder-sessie: `ModusKeuze` (Bar | Beheer |
 * Mijn account, ADR 0003 → Beslissing 2, ongewijzigd door ADR 0004) — vóór
 * #42 ging een bevestigde sessie hier direct naar `BeheerTabs`, dat gedrag
 * geldt nu alleen nog ná het kiezen van de "Beheer"-tegel. `mode` is lokale
 * state, geen aparte route: eenmaal op "beheer" is er geen weg terug naar de
 * modus-keuze binnen dezelfde sessie (ADR 0003: modi zijn losse instanties,
 * geen wisselknop) — alleen `BeheerTabs`'s eigen "Uitloggen" brengt je terug
 * bij het inlogformulier.
 */
export function Assortimentbeheer() {
  const session = useBeheerSession();
  const [mode, setMode] = useState<"kiezen" | "beheer">("kiezen");

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

  if (mode === "beheer") {
    return <BeheerTabs name={session.name} onSignOut={session.signOut} />;
  }

  return (
    <ModusKeuze
      name={session.name}
      hasPin={session.hasPin}
      onChooseBeheer={() => setMode("beheer")}
      onSignOut={session.signOut}
      onPinChanged={session.refetch}
    />
  );
}
