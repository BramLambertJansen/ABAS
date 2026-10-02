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
 */
export function useOpslaanBlokkade(pending: boolean): { closeBlocked: boolean; timedOut: boolean } {
  const [timedOutFor, setTimedOutFor] = useState(false);

  useEffect(() => {
    if (!pending) {
      setTimedOutFor(false);
      return;
    }
    const timer = setTimeout(() => setTimedOutFor(true), PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const timedOut = pending && timedOutFor;
  return { closeBlocked: pending && !timedOut, timedOut };
}
