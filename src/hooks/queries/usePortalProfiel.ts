"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";
import type { PortalMemberRole } from "./usePortalSession";

/**
 * Eigen profiel voor het Account-tabblad — docs/features/portal-profiel.md →
 * Hooks. `has_pin` is de gegenereerde, leesbare kolom uit 0010; `pin_hash`
 * zelf blijft REVOKED.
 *
 * Expliciete `auth_user_id`-filter, verplicht volgens ADR 0012 → Beslissing
 * 2: een bardienst/beheerder-sessie leest via RLS álle `members`-rijen (ADR
 * 0007 beperkt alleen rol `lid`), dus deze read mag nooit op RLS leunen.
 * Zelfde patroon als `usePortalBalance.ts`.
 *
 * De e-mail voor de profielkaart komt niet hiervandaan maar uit
 * `usePortalSession()`: `members.email` is RPC-gated (ADR 0004).
 */
export type PortalProfiel = {
  name: string;
  role: PortalMemberRole;
  archived: boolean;
  hasPin: boolean;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; profiel: PortalProfiel };

const WHAT = "Kan je gegevens niet laden.";

export function usePortalProfiel(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        // usePortalSession() stuurt dan al terug naar PortalLogin.
        setState({ status: "error", message: `${WHAT} Log opnieuw in.` });
        return;
      }

      const { data, error } = await supabase
        .from("members")
        .select("name, role, archived, has_pin")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setState({ status: "error", message: `${WHAT} Log opnieuw in.` });
        return;
      }

      setState({
        status: "ready",
        profiel: {
          name: data.name as string,
          role: data.role as PortalMemberRole,
          archived: data.archived as boolean,
          hasPin: data.has_pin as boolean,
        },
      });
    } catch (err) {
      reportClientError(createClient, "usePortalProfiel", err);
      setState({ status: "error", message: loadErrorMessage(WHAT, err) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [tick, load]);

  return {
    ...state,
    // Vanuit een foutstaat ("Opnieuw proberen") eerst terug naar laden;
    // een refetch na een geslaagde actie laat de rijen staan tot de nieuwe
    // data er is, zodat de lijst niet even door de statusregel wordt
    // vervangen.
    refetch: () => {
      setState((s) => (s.status === "error" ? { status: "loading" } : s));
      setTick((t) => t + 1);
    },
  };
}
