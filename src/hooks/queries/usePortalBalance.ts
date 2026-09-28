"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";
import { reportClientError } from "@/lib/clientErrors";

/**
 * Eigen naam + `balance_cents` van de ingelogde portal-sessie, voor elke rol
 * (ADR 0012) — docs/features/portal-dashboard.md → Betrokken shell. Platte
 * `select` via `portalClient.ts` (ADR 0009, niet `@/lib/supabase/client`);
 * geen RPC nodig, alleen de servernaam-op-een-andere-rij
 * (`usePortalTransactions.ts`) heeft dat wél (ADR 0010).
 *
 * De expliciete `.eq("auth_user_id", …)` is wat deze read tot de eigen rij
 * beperkt, niet RLS: `members_select` (0015, ADR 0007) versmalt alleen een
 * `lid`-sessie tot de eigen rij, een bardienst/beheerder-sessie leest via
 * RLS álle `members`-rijen (ADR 0012 → Beslissing 2). Zoekt op
 * `auth_user_id`, niet op een meegegeven id: dezelfde eigen-sessie-lookup
 * als `usePortalSession.ts`, geen los memberId-argument nodig.
 */
export type PortalBalance = {
  name: string;
  balanceCents: number;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; balance: PortalBalance };

export function usePortalBalance(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        // Geen sessie meer — usePortalSession() vangt dit elders af en stuurt
        // terug naar PortalLogin; hier gewoon een vaste boodschap, geen crash.
        setState({
          status: "error",
          message: "Kan het saldo niet laden. Log opnieuw in.",
        });
        return;
      }

      const { data, error } = await supabase
        .from("members")
        .select("name, balance_cents")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setState({
          status: "error",
          message: "Kan het saldo niet laden. Controleer de verbinding.",
        });
        return;
      }

      setState({
        status: "ready",
        balance: {
          name: data.name as string,
          balanceCents: data.balance_cents as number,
        },
      });
    } catch (err) {
      reportClientError(createClient, "usePortalBalance", err);
      setState({
        status: "error",
        message: "Kan het saldo niet laden. Controleer de verbinding.",
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
