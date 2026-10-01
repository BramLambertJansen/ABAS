"use client";

import { useEffect, useRef } from "react";

/**
 * Focus naar een nieuwe stap binnen hetzelfde scherm
 * (docs/features/beheer-tweede-factor.md → Schermflow → Toegankelijkheid,
 * besloten 12; het patroon komt uit `BarInloggen`). Alleen na een wissel door
 * de gebruiker, niet bij de eerste weergave: de aanroeper roept de
 * teruggegeven `markeer()` aan in de handler van die actie (een knop, een
 * verstuurde code), en zodra `stap` daarna verandert gaat de focus naar
 * `doel(stap)` — meestal de kop van die stap (een `h1`/`h2` met
 * `tabIndex={-1}`). Verandert `stap` zonder `markeer()` (laden, een
 * antwoord van de server), dan blijft de focus waar hij is.
 *
 * `doel` mag `null` geven: dan geen focus voor die stap.
 */
export function useFocusNaWissel<S>(
  stap: S,
  doel: (stap: S) => HTMLElement | null | undefined
): () => void {
  const naWissel = useRef(false);
  const doelRef = useRef(doel);

  // De nieuwste `doel` zonder de focus-effect opnieuw te laten draaien bij
  // elke render; dit effect staat vóór het focus-effect, en effecten draaien
  // in volgorde.
  useEffect(() => {
    doelRef.current = doel;
  });

  useEffect(() => {
    if (!naWissel.current) return;
    naWissel.current = false;
    doelRef.current(stap)?.focus();
  }, [stap]);

  return markeer;

  function markeer() {
    naWissel.current = true;
  }
}
