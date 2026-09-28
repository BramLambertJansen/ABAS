"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

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
 *  `refetch()`, zelfde vorm als useMembers()/useAlleProducten() — nodig
 *  sinds #11 (docs/features/negatieve-saldolimiet.md) een schrijfpad naar
 *  `negative_limit_cents` toevoegde (`update_negative_limit`) en het
 *  instellingenscherm na een geslaagde wijziging een verse lezing nodig
 *  heeft. */
export function useAppSettings(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("app_settings")
        .select("negative_limit_cents, low_balance_threshold_cents")
        .single();

      if (error) throw error;

      setState({
        status: "ready",
        settings: {
          negativeLimitCents: data.negative_limit_cents as number,
          lowBalanceThresholdCents: data.low_balance_threshold_cents as number,
        },
      });
    } catch (err) {
      // Same rule as useOpenShift: never show the raw error on the
      // tablet, log it for debugging instead.
      reportClientError(createClient, "useAppSettings", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan de instellingen niet laden.", err),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) {
        setState({ status: "error", message: "Onbekende fout." });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
