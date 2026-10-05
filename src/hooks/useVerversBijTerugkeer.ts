"use client";

import { useEffect, useRef } from "react";
import {
  MIN_VERVERS_INTERVAL_MS,
  moetVerversen,
  type VerversBron,
} from "@/lib/verversen";

/**
 * Ververst bij terugkeer naar het tabblad (`visibilitychange` naar
 * `visible`) en bij verbindingherstel (`online`) — docs/features/
 * leesfouten-herstel-actuele-data.md, besluit 3. De beslisregel staat in
 * `moetVerversen` (`src/lib/verversen.ts`): nooit een tweede lezing naast een
 * lopende, terugkeer pas na 30 s of na een mislukte poging, `online`
 * altijd. Een verborgen tabblad ververst niet. Geen polling, geen interval;
 * de listeners verdwijnen bij unmount. De huidige waarden gaan via een ref,
 * zodat de listeners één keer worden aangemaakt.
 */
export function useVerversBijTerugkeer(opts: {
  /** Klokstand (ms) van de oudste geslaagde lezing; `null` = nog nooit geladen. */
  laatsteSuccesMs: number | null;
  bezig: boolean;
  laatsteMislukt: boolean;
  ververs: () => void;
}): void {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    function probeer(bron: VerversBron) {
      if (document.visibilityState !== "visible") return;
      const huidig = ref.current;
      if (
        moetVerversen({
          laatsteSuccesMs: huidig.laatsteSuccesMs,
          nuMs: Date.now(),
          minIntervalMs: MIN_VERVERS_INTERVAL_MS,
          bezig: huidig.bezig,
          laatsteMislukt: huidig.laatsteMislukt,
          bron,
        })
      ) {
        huidig.ververs();
      }
    }
    const opZichtbaar = () => probeer("zichtbaar");
    const opOnline = () => probeer("online");
    document.addEventListener("visibilitychange", opZichtbaar);
    window.addEventListener("online", opOnline);
    return () => {
      document.removeEventListener("visibilitychange", opZichtbaar);
      window.removeEventListener("online", opOnline);
    };
  }, []);
}
