"use client";

import { useRef, useState } from "react";
import { isRateLimitedMessage } from "@/lib/authErrors";
import { createClient } from "@/lib/supabase/client";
import { logLocalError } from "@/lib/clientErrors";

/**
 * Wachtwoord vergeten op `/beheer` — docs/features/wachtwoord-vergeten.md.
 * Twee losse hooks voor de twee schermen: aanvragen (BeheerLogin.tsx) en
 * een nieuw wachtwoord instellen (/beheer/wachtwoord-herstellen). Alleen
 * Supabase Auth-calls, geen tabel of RPC.
 */

type RequestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "sent"; email: string };

/**
 * Stap 1 — herstellink aanvragen. Élke uitkomst wordt "sent": dezelfde
 * melding of het adres nu bekend is of niet (spec → besluit 4, geen
 * e-mail-enumeratie). Ook een rate limit: GoTrue raakt die alleen als er
 * echt gemaild wordt, dus alleen bij een bestaand adres — een aparte
 * "te veel pogingen"-melding zou verraden dat het adres een account heeft
 * (Reviewer PR #69, besloten door Bram 2026-09-23). Niet "fixen" door op
 * error.code/429 te matchen. Het restlek via de Auth-API zelf is bewust
 * geaccepteerd, zie ADR 0013.
 */
export function useWachtwoordResetAanvragen() {
  const [state, setState] = useState<RequestState>({ status: "idle" });

  async function requestReset(email: string): Promise<void> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/beheer/wachtwoord-herstellen`,
      });
      if (error) {
        logLocalError("useWachtwoordResetAanvragen", error.message);
      }
    } catch (err) {
      logLocalError("useWachtwoordResetAanvragen", err);
    }
    setState({ status: "sent", email });
  }

  return {
    status: state.status,
    sentTo: state.status === "sent" ? state.email : null,
    requestReset,
    reset: () => setState({ status: "idle" }),
  };
}

export type NieuwWachtwoordErrorCode =
  | "link_invalid"
  | "weak_password"
  | "same_password"
  | "rate_limited"
  | "unknown";

type SetState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done" }
  | { status: "error"; code: NieuwWachtwoordErrorCode };

function toSetErrorCode(error: { code?: string; message?: string }): NieuwWachtwoordErrorCode {
  if (error.code === "weak_password") return "weak_password";
  if (error.code === "same_password") return "same_password";
  if (isRateLimitedMessage(error.message)) return "rate_limited";
  return "unknown";
}

/**
 * Stap 3 — nieuw wachtwoord instellen met de `token_hash` uit de mail
 * (ADR 0008). Het token wordt pas hier, bij verzenden, ingewisseld — niet
 * bij het openen van de pagina, zodat een mailscanner die de link vooraf
 * opent het niet verbruikt. Is `verifyOtp` al gelukt en faalde daarna
 * `updateUser`, dan slaat een tweede poging `verifyOtp` over: het token is
 * dan op, maar de herstelsessie bestaat (spec → Randgevallen).
 */
export function useNieuwWachtwoordInstellen(tokenHash: string | null) {
  const [state, setState] = useState<SetState>(
    tokenHash ? { status: "idle" } : { status: "error", code: "link_invalid" }
  );
  const verified = useRef(false);

  async function setNewPassword(password: string): Promise<boolean> {
    if (!tokenHash) {
      setState({ status: "error", code: "link_invalid" });
      return false;
    }
    setState({ status: "pending" });
    try {
      const supabase = createClient();

      if (!verified.current) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (error) {
          logLocalError("useNieuwWachtwoordInstellen (verifyOtp)", error.message);
          setState({ status: "error", code: "link_invalid" });
          return false;
        }
        verified.current = true;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        logLocalError("useNieuwWachtwoordInstellen (updateUser)", error.message);
        setState({ status: "error", code: toSetErrorCode(error) });
        return false;
      }

      // Terug naar het inlogscherm, opnieuw inloggen (spec → besluit 2).
      // src/middleware.ts herstelt daarna de gedeelde tablet-sessie, net
      // als na een gewone /beheer-uitlog.
      await supabase.auth.signOut();
      setState({ status: "done" });
      return true;
    } catch (err) {
      logLocalError("useNieuwWachtwoordInstellen", err);
      setState({ status: "error", code: "unknown" });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    setNewPassword,
  };
}
