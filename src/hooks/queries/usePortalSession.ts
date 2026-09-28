"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";
import { logLocalError, reportClientError } from "@/lib/clientErrors";

/**
 * Tracks whether `/portal` has a session that resolves to a `members`-row —
 * analoog aan `useBeheerSession.ts`, eigen bestand (portalClient.ts, ADR
 * 0009, zie docs/features/portal-login.md → "Herbruik").
 *
 * Sinds ADR 0012 (docs/features/portal-profiel.md, #17, besluit 1) is de
 * portal het lid-deel voor **elke** rol: een sessie die naar een
 * `members`-rij herleidt is `signed-in`, ongeacht `role`. `role` en
 * `archived` gaan mee in de state, zodat het Account-tabblad de PIN-rij
 * alleen voor bar-rollen toont. Alleen een sessie zónder gekoppelde
 * `members`-rij rapporteert `denied`, met dezelfde neutrale melding als
 * voorheen. Let op (ADR 0012 → Beslissing 2): een bardienst/beheerder-sessie
 * leest via RLS álle `members`-rijen, dus deze lookup filtert expliciet op
 * de eigen `auth_user_id` — nooit op RLS leunen.
 *
 * Geen `archived`-filter op de members-lookup, in tegenstelling tot
 * `useBeheerSession.ts`: `0015_lid_leest_alleen_eigen_rijen.sql`'s
 * `caller_is_lid()` filtert bewust ook niet op `archived` ("een gearchiveerd
 * lid dat nog een sessie heeft moet zijn eigen historie kunnen inzien") —
 * dezelfde grens geldt hier voor de sessie-gate zelf.
 *
 * Cookie-isolatie (ADR 0009) maakt dit hook onbereikbaar voor de gedeelde
 * bar-tablet-device-sessie: `sb-portal-auth-token` bestaat pas na een
 * daadwerkelijke portal-login, dus een bar-sessie levert hier altijd
 * `signed-out` op, ongeacht wat de bar-sessie zelf is (spec →
 * Cookie-isolatie, acceptatiecriterium 4).
 */
export type PortalSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "denied"; message: string }
  | {
      status: "signed-in";
      email: string;
      name: string;
      role: PortalMemberRole;
      archived: boolean;
    };

export type PortalMemberRole = "lid" | "bardienst" | "beheerder";

const DENIED_MESSAGE = "Dit account is niet gekoppeld aan een lid.";

export function usePortalSession(): PortalSessionState & {
  signOut: () => Promise<void>;
  refetch: () => void;
} {
  const [state, setState] = useState<PortalSessionState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = createClient();

      async function resolve(userId: string, email: string) {
        try {
          const { data, error } = await supabase
            .from("members")
            .select("name, role, archived")
            .eq("auth_user_id", userId)
            .maybeSingle();
          if (cancelled) return;
          if (error) throw error;
          if (!data) {
            setState({ status: "denied", message: DENIED_MESSAGE });
            return;
          }
          setState({
            status: "signed-in",
            email,
            name: data.name as string,
            role: data.role as PortalMemberRole,
            archived: data.archived as boolean,
          });
        } catch (err) {
          reportClientError(supabase, "usePortalSession", err);
          if (!cancelled) {
            setState({ status: "denied", message: DENIED_MESSAGE });
          }
        }
      }

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          resolve(session.user.id, session.user.email ?? "");
        } else {
          setState({ status: "signed-out" });
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        if (session?.user) {
          resolve(session.user.id, session.user.email ?? "");
        } else {
          setState({ status: "signed-out" });
        }
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch (err) {
      logLocalError("usePortalSession", err);
      setState({ status: "signed-out" });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [tick]);

  async function signOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      logLocalError("usePortalSession (signOut)", err);
    }
  }

  return { ...state, signOut, refetch: () => setTick((t) => t + 1) };
}
