"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logLocalError, reportClientError } from "@/lib/clientErrors";

/**
 * Tracks whether `/beheer` has an actual bardienst/beheerder session, not
 * merely "any Supabase Auth session": a session only counts as "signed-in"
 * here once it resolves, via `auth_user_id`, to an active `members` row with
 * role `bardienst` or `beheerder` — exactly the same check the RPC's run
 * themselves (`actor_not_found`/`no_admin_role`/`no_bar_role`). A `lid`-only
 * portal account, or an account without a member, is reported as "denied",
 * not "signed-in". (Before dienst-per-sessie the shared device account was
 * the usual "denied" case; that account is gone, ADR 0016.)
 *
 * Generalized from "beheerder-only" to "bardienst-of-beheerder"
 * (docs/features/auth-methode-per-lid.md, #42, ADR 0005): `/beheer` is the
 * guaranteed e-mail/wachtwoord-ingang for every member with either role, not
 * just beheerder — ModusKeuze.tsx (rendered by Assortimentbeheer.tsx when
 * there is a Supabase session but no registered bar session yet) is where the
 * actual bar-vs-beheer split happens, this hook only gates entry.
 *
 * "loading" while the initial getSession() round-trip (or the follow-up
 * members lookup) is in flight, "signed-out" when there's no session at
 * all, "denied" when there IS a session but it doesn't resolve to an active
 * bardienst/beheerder member (→ `BeheerLogin.tsx` shows a Nederlandse
 * foutmelding + the login form), "signed-in" only once a real
 * bardienst/beheerder session is confirmed.
 *
 * Whether the session is registered as a bar session, in which mode, and
 * whether it is still active, is not this hook's concern: that is
 * `useMijnDienst` (`my_bar_state()`), used by `BarSessieProvider`.
 */
export type BeheerSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "denied"; message: string }
  | {
      status: "signed-in";
      email: string;
      name: string;
      role: "bardienst" | "beheerder";
    };

export function useBeheerSession(): BeheerSessionState & {
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<BeheerSessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    // createClient() itself throws synchronously if Supabase isn't
    // configured (missing NEXT_PUBLIC_SUPABASE_URL/KEY — the same failure
    // src/middleware.ts guards against). Every other hook in this
    // directory only ever calls it inside a try/catch for that reason; do
    // the same here rather than let an uncaught error crash the whole
    // /beheer screen. Fallback is "signed-out": if the client can't even
    // be constructed there's no session to report, and the login form is
    // the correct thing to show either way.
    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = createClient();

      async function resolve(userId: string, email: string) {
        try {
          const { data, error } = await supabase
            .from("members")
            .select("name, role")
            .eq("auth_user_id", userId)
            .eq("archived", false)
            .maybeSingle();
          if (cancelled) return;
          if (error) throw error;
          if (!data) {
            // Same case as the RPC's own `actor_not_found` — no active
            // `members` row references this auth account at all. Covers
            // both the shared device account (never linked to a member)
            // and a stale/deleted link.
            setState({
              status: "denied",
              message:
                "Dit account is niet gekoppeld aan een lid — vraag een beheerder.",
            });
            return;
          }
          if (data.role !== "bardienst" && data.role !== "beheerder") {
            // Same case as the RPC's own `no_admin_role`/`no_bar_role` — a
            // real, linked member, just not one with bardienst-/
            // beheerrechten (e.g. a `lid`-only portal account).
            setState({
              status: "denied",
              message:
                "Dit account heeft geen bardienst- of beheerrechten — vraag een beheerder.",
            });
            return;
          }
          setState({
            status: "signed-in",
            email,
            name: data.name as string,
            role: data.role,
          });
        } catch (err) {
          // Can't confirm a bardienst/beheerder-koppeling — fail closed
          // (never "signed-in" without a confirmed match), log for
          // debugging.
          reportClientError(supabase, "useBeheerSession", err);
          if (!cancelled) {
            setState({
              status: "denied",
              message:
                "Kon niet controleren of dit account mag inloggen — probeer opnieuw in te loggen.",
            });
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
      logLocalError("useBeheerSession", err);
      setState({ status: "signed-out" });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function signOut() {
    try {
      const supabase = createClient();
      // Alleen deze sessie (`local`), nooit de andere apparaten van dit lid.
      await supabase.auth.signOut({ scope: "local" });
      // onAuthStateChange above picks up the resulting "signed-out" state.
    } catch (err) {
      logLocalError("useBeheerSession (signOut)", err);
    }
  }

  return { ...state, signOut };
}
