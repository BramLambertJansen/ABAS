"use client";

import { createClient } from "@/lib/supabase/portalClient";
import { reportClientError } from "@/lib/clientErrors";
import type { VerversInfo } from "@/lib/verversen";
import { useStaleLezing } from "./useStaleLezing";

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

/** Stale-while-revalidate via `useStaleLezing`: bij een mislukte verversing
 *  blijft de laatst bekende drempel staan (docs/features/
 *  leesfouten-herstel-actuele-data.md → Saldo-tab). */
export function usePortalAppSettings(): State & { ververs: VerversInfo; refetch: () => void } {
  const { state, ververs, refetch } = useStaleLezing<PortalAppSettings>({
    wat: "Kan de instellingen niet laden.",
    report: (err) => reportClientError(createClient, "usePortalAppSettings", err),
    load: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("app_settings")
        .select("low_balance_threshold_cents")
        .single();

      if (error) throw error;

      return { lowBalanceThresholdCents: data.low_balance_threshold_cents as number };
    },
  });

  if (state.status === "ready") {
    return { status: "ready", settings: state.data, ververs, refetch };
  }
  if (state.status === "error") {
    return { status: "error", message: state.message, ververs, refetch };
  }
  return { status: "loading", ververs, refetch };
}
