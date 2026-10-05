"use client";

import { createClient } from "@/lib/supabase/portalClient";
import { reportClientError } from "@/lib/clientErrors";
import type { VerversInfo } from "@/lib/verversen";
import { useStaleLezing, VasteLeesFout } from "./useStaleLezing";

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

/**
 * Stale-while-revalidate (docs/features/leesfouten-herstel-actuele-data.md):
 * `refetch()` laat een getoond saldo staan terwijl hij ververst en houdt het
 * bij een mislukte verversing (`ververs.mislukt`); alleen een mislukte
 * eerste ronde is `error`. De machine staat in `useStaleLezing`.
 */
export function usePortalBalance(): State & { ververs: VerversInfo; refetch: () => void } {
  const { state, ververs, refetch } = useStaleLezing<PortalBalance>({
    wat: "Kan het saldo niet laden.",
    report: (err) => reportClientError(createClient, "usePortalBalance", err),
    load: async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        // Geen sessie meer: usePortalSession() vangt dit elders af en stuurt
        // terug naar PortalLogin; hier gewoon een vaste boodschap, geen crash.
        throw new VasteLeesFout("Kan het saldo niet laden. Log opnieuw in.");
      }

      const { data, error } = await supabase
        .from("members")
        .select("name, balance_cents")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new VasteLeesFout("Kan het saldo niet laden. Log opnieuw in.");

      return {
        name: data.name as string,
        balanceCents: data.balance_cents as number,
      };
    },
  });

  if (state.status === "ready") {
    return { status: "ready", balance: state.data, ververs, refetch };
  }
  if (state.status === "error") {
    return { status: "error", message: state.message, ververs, refetch };
  }
  return { status: "loading", ververs, refetch };
}
