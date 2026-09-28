"use client";

import { useState } from "react";
import { isRateLimitedMessage } from "@/lib/authErrors";
import { createClient } from "@/lib/supabase/client";

/**
 * `/beheer`'s own, minimal e-mail-inlogformulier (ADR 0002/0003) — magic
 * link or wachtwoord, a beheerder's choice, both active (CLAUDE.md → Auth).
 * Not #15's full portal-login flow and not #24's self-service invite (see
 * docs/features/assortimentbeheer.md's intro) — accounts are provisioned
 * manually (docs/ARCHITECTURE.md → "Provisioning voor #14").
 *
 * Errors here are Supabase Auth responses, not RPC error codes — there's no
 * fixed vocabulary to switch on like start_shift's invalid_pin/no_bar_role,
 * so messages are mapped best-effort from what Supabase actually returns.
 * See docs/features/assortimentbeheer.md → Randgevallen "Verkeerde
 * inloggegevens op /beheer zelf".
 */
export type BeheerLoginErrorCode =
  | "invalid_credentials"
  | "rate_limited"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "magic_link_sent"; email: string }
  | { status: "error"; code: BeheerLoginErrorCode };

function toErrorCode(message: string | undefined): BeheerLoginErrorCode {
  const normalized = (message ?? "").toLowerCase();
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials")
  ) {
    return "invalid_credentials";
  }
  if (isRateLimitedMessage(message)) {
    return "rate_limited";
  }
  return "unknown";
}

export function useBeheerLogin() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function signInWithPassword(
    email: string,
    password: string
  ): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setState({ status: "error", code: toErrorCode(error.message) });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      setState({
        status: "error",
        code: toErrorCode(err instanceof Error ? err.message : undefined),
      });
      return false;
    }
  }

  /**
   * Lekt nooit een foutcode (issue #70 — geen e-mail-enumeratie): met
   * `shouldCreateUser: false` geeft Supabase voor een onbekend adres een
   * fout, en de mail-rate-limit raakt alleen een bestaand adres. Elke
   * uitkomst eindigt dus in dezelfde `magic_link_sent`-staat, fouten alleen
   * gelogd — zelfde patroon als `usePortalLogin.ts` en
   * `useWachtwoordResetAanvragen`. Het wachtwoordpad lekt niet en houdt
   * zijn foutcodes.
   */
  async function signInWithMagicLink(email: string): Promise<void> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // shouldCreateUser: false — beheerder-accounts are provisioned
          // manually (Supabase Studio/CLI), not self-service. Without this,
          // any e-mail address would silently get a brand-new, unlinked
          // auth.users row just by requesting a link — harmless for the
          // RPC (actor_not_found still rejects it, no members row
          // references it) but noise this app doesn't want to create.
          shouldCreateUser: false,
          // docs/features/portal-login.md → Betrokken shell, punt 2 /
          // Schermflow → `/auth/callback`: gedeelde callback voor `/beheer`
          // én `/portal` (Besloten door Bram, punt 3) — `?next=bar` stuurt
          // `/auth/callback` naar `server.ts` (de bar/beheer-cookienaam) en
          // uiteindelijk terug naar `/beheer`. `/beheer/callback` zelf blijft
          // ongewijzigd bestaan (backward-compat voor een mail die nog naar
          // de oude URL wijst).
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback?next=bar`
              : undefined,
        },
      });
      if (error) {
        console.error("useBeheerLogin (signInWithMagicLink):", error.message);
      }
    } catch (err) {
      console.error("useBeheerLogin (signInWithMagicLink):", err);
    }
    setState({ status: "magic_link_sent", email });
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    magicLinkSentTo: state.status === "magic_link_sent" ? state.email : null,
    signInWithPassword,
    signInWithMagicLink,
    reset: () => setState({ status: "idle" }),
  };
}
