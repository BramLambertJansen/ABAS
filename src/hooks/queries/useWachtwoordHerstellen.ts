"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Wachtwoord vergeten op `/beheer` — docs/features/wachtwoord-vergeten.md.
 * Twee losse hooks voor de twee schermen: aanvragen (BeheerLogin.tsx) en
 * een nieuw wachtwoord instellen (/beheer/wachtwoord-herstellen). Alleen
 * Supabase Auth-calls, geen tabel of RPC.
 */

function isRateLimited(message: string | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("too many");
}

type RequestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "sent"; email: string }
  | { status: "rate_limited" };

/**
 * Stap 1 — herstellink aanvragen. Elke uitkomst behalve een rate limit
 * wordt "sent": dezelfde melding of het adres nu bekend is of niet (spec →
 * besluit 4, geen e-mail-enumeratie). De rate limit geldt voor het hele
 * project, niet per adres, dus die mag wél zichtbaar zijn.
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
        if (isRateLimited(error.message)) {
          setState({ status: "rate_limited" });
          return;
        }
        console.error("useWachtwoordResetAanvragen:", error.message);
      }
    } catch (err) {
      console.error("useWachtwoordResetAanvragen:", err);
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
  if (isRateLimited(error.message)) return "rate_limited";
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
          console.error("useNieuwWachtwoordInstellen (verifyOtp):", error.message);
          setState({ status: "error", code: "link_invalid" });
          return false;
        }
        verified.current = true;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("useNieuwWachtwoordInstellen (updateUser):", error.message);
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
      console.error("useNieuwWachtwoordInstellen:", err);
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
