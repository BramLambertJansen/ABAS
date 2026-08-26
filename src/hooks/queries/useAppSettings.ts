"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AppSettings = {
  negativeLimitCents: number;
  lowBalanceThresholdCents: number;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; settings: AppSettings };

/** De enige rij in `app_settings`. Eén hook voor beide velden — dit
 *  scherm (#8) gebruikt alleen `negativeLimitCents` (saldo-check bij
 *  afrekenen), #9 (laag-saldo-signalering) heeft straks
 *  `lowBalanceThresholdCents` nodig uit dezelfde rij. Geen reden voor twee
 *  hooks op één single-row tabel — zie docs/features/verkoop.md → RPC's.
 *  Geen `refetch()`: de instelling wijzigt vandaag nergens in de UI (#11,
 *  "negatieflimiet zelf instellen", is niet gebouwd), dus er is geen
 *  moment waarop een herlaad zinvol zou zijn. */
export function useAppSettings(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("app_settings")
          .select("negative_limit_cents, low_balance_threshold_cents")
          .single();

        if (cancelled) return;
        if (error) throw error;

        setState({
          status: "ready",
          settings: {
            negativeLimitCents: data.negative_limit_cents as number,
            lowBalanceThresholdCents: data.low_balance_threshold_cents as number,
          },
        });
      } catch (err) {
        if (cancelled) return;
        // Same rule as useOpenShift: never show the raw error on the
        // tablet, log it for debugging instead.
        console.error("useAppSettings:", err);
        setState({
          status: "error",
          message: "Kan de instellingen niet laden. Controleer de verbinding.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
