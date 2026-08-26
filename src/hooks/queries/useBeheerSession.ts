"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Tracks whether `/beheer`'s own e-mail-login session is active — ADR 0002's
 * mechanism: `/beheer` replaces the shared bar-tablet device session with a
 * beheerder's own Supabase Auth session (magic link/wachtwoord, see
 * useBeheerLogin.ts). This hook only reports *session* state (is anyone
 * logged in via e-mail, and what's their name) — it does NOT decide who's
 * allowed to write. That's the RPC's job (`no_admin_role`/`actor_not_found`,
 * see useCreateProduct.ts etc.) per docs/features/assortimentbeheer.md →
 * Rolzichtbaarheid: anyone with an account can log in and see the list, only
 * a `beheerder` can actually write.
 *
 * "loading" while the initial getSession() round-trip is in flight,
 * "signed-out" when there's no session at all (→ show BeheerLogin),
 * "signed-in" once a session exists — `name` falls back to the session's
 * e-mail if no `members` row references this auth account (see
 * docs/features/assortimentbeheer.md → Randgevallen "ingelogd account
 * bestaat niet (meer) als members-rij" — the RPC still rejects any write
 * with actor_not_found in that case, this hook just can't show a real name).
 */
export type BeheerSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string; name: string };

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
            .select("name")
            .eq("auth_user_id", userId)
            .maybeSingle();
          if (cancelled) return;
          if (error) throw error;
          setState({
            status: "signed-in",
            email,
            name: (data?.name as string | undefined) ?? email,
          });
        } catch (err) {
          // Name lookup failing shouldn't block showing the signed-in state
          // itself — fall back to the e-mail address, log for debugging.
          console.error("useBeheerSession (name lookup):", err);
          if (!cancelled) {
            setState({ status: "signed-in", email, name: email });
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
  }, []);

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

  return { ...state, signOut };
}
