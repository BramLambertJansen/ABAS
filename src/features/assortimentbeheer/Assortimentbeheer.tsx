"use client";

import { useBeheerSession } from "@/hooks/queries/useBeheerSession";
import { BeheerLogin } from "./BeheerLogin";
import { ProductenLijst } from "./ProductenLijst";

/**
 * `/beheer`'s top-level screen (issue #14, docs/features/assortimentbeheer.md).
 * A tijdelijk, minimaal koppelpunt met z'n eigen e-mail-inlogstap (ADR
 * 0002/0003) — geen tabbalk, geen navigatiestructuur. Zonder actieve
 * beheer-sessie: het inlogformulier. Met een actieve sessie: direct de
 * productenlijst, geen tussenliggende bar/beheer-modus-keuze (ADR 0003 →
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

  return <ProductenLijst name={session.name} onSignOut={session.signOut} />;
}
