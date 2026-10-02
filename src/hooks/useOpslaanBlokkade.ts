"use client";

import { useEffect, useState } from "react";
import { PENDING_TIMEOUT_MS } from "@/lib/opslaan";

/**
 * Sluitblokkade tijdens een lopende opslag, met een uitweg
 * (docs/features/opslaan-sluiten-pending.md, besluit A en 30 seconden).
 *
 * `closeBlocked` is waar zolang `pending` waar is, maar hoogstens
 * `PENDING_TIMEOUT_MS`: hangt het verzoek langer, dan valt de blokkade zodat
 * de gebruiker niet voor altijd vastzit en is `timedOut` waar, "de uitkomst is
 * onbekend". Het verzoek zelf wordt niet afgebroken: komt het antwoord later
 * alsnog, dan verwerkt de aanroeper dat gewoon.
 *
 * Geldoverlays (Afrekenen, Opwaarderen, Nieuw lid) geven `{ metTimeout: false }`
 * mee (besluit 1 Bram, 2026-10-02): geen time-out, `closeBlocked` blijft
 * staan tot het verzoek echt klaar is en `timedOut` is nooit waar.
 */
export function useOpslaanBlokkade(
  pending: boolean,
  { metTimeout = true }: { metTimeout?: boolean } = {},
): { closeBlocked: boolean; timedOut: boolean } {
  const [timedOutFor, setTimedOutFor] = useState(false);

  useEffect(() => {
    if (!pending || !metTimeout) {
      setTimedOutFor(false);
      return;
    }
    const timer = setTimeout(() => setTimedOutFor(true), PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending, metTimeout]);

  const timedOut = metTimeout && pending && timedOutFor;
  return { closeBlocked: pending && !timedOut, timedOut };
}
