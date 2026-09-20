"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Tracks whether `/beheer` has an actual bardienst/beheerder session, not
 * merely "any Supabase Auth session" — `src/middleware.ts` auto-signs the
 * shared bar-tablet device account in on almost every request (including
 * `/beheer`) whenever there's no session yet, so `supabase.auth.getSession()`
 * returning a `user` does NOT by itself mean an individual logged in via
 * `BeheerLogin.tsx` (ADR 0002's mechanism: `/beheer`'s own e-mail-login
 * *replaces* that shared session — "no session" and "the device session" are
 * different cases). A session only counts as "signed-in" here once it
 * resolves, via `auth_user_id`, to an active `members` row with role
 * `bardienst` or `beheerder` — exactly the same check the RPC's run
 * themselves (`actor_not_found`/`no_admin_role`/`no_bar_role`).
 *
 * Generalized from "beheerder-only" to "bardienst-of-beheerder"
 * (docs/features/auth-methode-per-lid.md, #42, ADR 0004): `/beheer` is now
 * the guaranteed e-mail/wachtwoord-ingang for every member with either role,
 * not just beheerder — ModusKeuze.tsx (rendered by Assortimentbeheer.tsx on
 * "signed-in") is where the actual bar-vs-beheer split happens, this hook
 * only gates entry. No fallback to the session's e-mail as a display name
 * when the members lookup doesn't match: a device-session or a `lid`-only
 * member's e-mail-session is reported as "denied", not "signed-in".
 *
 * "loading" while the initial getSession() round-trip (or the follow-up
 * members lookup) is in flight, "signed-out" when there's no session at
 * all, "denied" when there IS a session but it doesn't resolve to an active
 * bardienst/beheerder member (→ `BeheerLogin.tsx` shows a Nederlandse
 * foutmelding + the login form), "signed-in" only once a real
 * bardienst/beheerder session is confirmed — with `hasPin` (`has_pin`, the
 * `pin_hash is not null` generated column, for that same row) alongside it,
 * so "Mijn account"
 * (MijnAccountOverlay.tsx) doesn't need a second leeshook for the one
 * boolean it displays.
 */
export type BeheerSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "denied"; message: string }
  | { status: "signed-in"; email: string; name: string; hasPin: boolean };

export function useBeheerSession(): BeheerSessionState & {
  signOut: () => Promise<void>;
  /** Re-runs the members lookup against the current session — used after
   *  `set_own_pin` so ModusKeuze's `hasPin` (and therefore
   *  MijnAccountOverlay's status line, once reopened) reflects the change
   *  without requiring a fresh sign-in. */
  refetch: () => void;
} {
  const [state, setState] = useState<BeheerSessionState>({ status: "loading" });
  const [tick, setTick] = useState(0);

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
            .select("name, role, has_pin")
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
            hasPin: data.has_pin as boolean,
          });
        } catch (err) {
          // Can't confirm a bardienst/beheerder-koppeling — fail closed
          // (never "signed-in" without a confirmed match), log for
          // debugging.
          console.error("useBeheerSession (role lookup):", err);
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
      console.error("useBeheerSession:", err);
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
      // onAuthStateChange above picks up the resulting "signed-out" state —
      // src/middleware.ts's existing `if (!session)` step re-establishes
      // the shared device session on the next bar-shell request, no action
      // needed here beyond signing out (ADR 0002 → Beslissing, stap 3).
    } catch (err) {
      console.error("useBeheerSession (signOut):", err);
    }
  }

  return { ...state, signOut, refetch: () => setTick((t) => t + 1) };
}
