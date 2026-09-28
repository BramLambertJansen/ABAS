"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";

/**
 * `app_settings.low_balance_threshold_cents`, gelezen via `portalClient.ts`
 * — docs/features/portal-dashboard.md → Betrokken shell: **geen hergebruik
 * van `useAppSettings.ts`**, die importeert `@/lib/supabase/client` (de
 * bar/device-cookie), wat voor een portal-sessie het verkeerde — of
 * afwezige — device-cookie zou lezen (ADR 0009). Alleen deze ene kolom, niet
 * `negative_limit_cents`: dit scherm heeft geen saldo-check nodig, alleen de
 * laag-saldo-waarschuwing.
 */
export type PortalAppSettings = {
  lowBalanceThresholdCents: number;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; settings: PortalAppSettings };

export function usePortalAppSettings(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("app_settings")
        .select("low_balance_threshold_cents")
        .single();

      if (error) throw error;

      setState({
        status: "ready",
        settings: {
          lowBalanceThresholdCents: data.low_balance_threshold_cents as number,
        },
      });
    } catch (err) {
      console.error("usePortalAppSettings:", err);
      setState({
        status: "error",
        message: "Kan de instellingen niet laden. Controleer de verbinding.",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) setState({ status: "error", message: "Onbekende fout." });
    });
    return () => {
      cancelled = true;
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
