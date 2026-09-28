"use client";

import { useState } from "react";
import { isRateLimitedMessage } from "@/lib/authErrors";
import { createClient } from "@/lib/supabase/portalClient";
import { logLocalError } from "@/lib/clientErrors";

/**
 * `/portal`'s own e-mail-inlogformulier — docs/features/portal-login.md →
 * Schermflow stap 1. Eigen bestand, geen import van `useBeheerLogin.ts`: die
 * importeert `@/lib/supabase/client`, wat de portal-only `check:arch`-regel
 * (ADR 0009) verbiedt — zie de spec → "Herbruik" voor de volledige
 * motivatie. Structureel wel hetzelfde patroon (magic link/wachtwoord,
 * dezelfde statusvorm), maar op twee punten bewust anders dan
 * `useBeheerLogin.ts`:
 *
 *   - `shouldCreateUser: true` (Besloten door Bram, punt 2) — elk geldig
 *     e-mailadres krijgt een werkende link, `link_lid_member_account()`
 *     bepaalt daarna of er iets te koppelen valt.
 *   - `signInWithMagicLink` toont nooit een foutcode: elke uitkomst eindigt
 *     in dezelfde `magic_link_sent`-staat (issue #70, UI-maskering, ADR 0013 — geen
 *     e-mail-enumeratie), fouten alleen gelogd. Exact hetzelfde patroon als
 *     `useWachtwoordResetAanvragen` in `useWachtwoordHerstellen.ts`. Alleen
 *     het wachtwoordpad heeft hier een zichtbare foutcode — dat pad lekt
 *     sowieso niet ("onjuist e-mailadres of wachtwoord"), zie
 *     `PortalLoginErrorCode`.
 */
export type PortalLoginErrorCode = "invalid_credentials" | "rate_limited" | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "magic_link_sent"; email: string }
  | { status: "error"; code: PortalLoginErrorCode };

function toErrorCode(message: string | undefined): PortalLoginErrorCode {
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

export function usePortalLogin() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function signInWithPassword(email: string, password: string): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
   * `shouldCreateUser: true` (Besloten door Bram, punt 2) en een altijd
   * geslaagde eindstaat (issue #70) — zie het bestandscomment hierboven.
   */
  async function signInWithMagicLink(email: string): Promise<void> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback?next=portal`
              : undefined,
        },
      });
      if (error) {
        logLocalError("usePortalLogin (signInWithMagicLink)", error.message);
      }
    } catch (err) {
      logLocalError("usePortalLogin (signInWithMagicLink)", err);
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
