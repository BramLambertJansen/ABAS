"use client";

import { useCallback, useRef, useState } from "react";
import { toPasswordUpdateErrorCode, type PasswordUpdateErrorCode } from "@/lib/authErrors";
import { createClient } from "@/lib/supabase/portalClient";
import { logLocalError } from "@/lib/clientErrors";
import { sessieNodigCode, verifieerCode, type CodeFout } from "@/lib/mfa";

/**
 * Wachtwoord vergeten op `/portal` — docs/features/portal-login.md →
 * Schermflow → "Wachtwoord vergeten". Analoog aan
 * `useWachtwoordHerstellen.ts` (`/beheer`), eigen bestand: dat bestand
 * importeert `@/lib/supabase/client`, wat de portal-only
 * `check:arch`-regel (ADR 0009) verbiedt. Verder identiek gedrag/contract —
 * zelfde twee stappen (aanvragen, nieuw wachtwoord instellen), zelfde
 * neutrale-melding-altijd-"sent"-vorm, zelfde `token_hash`/`type=recovery`-
 * verificatie op het moment van versturen (ADR 0008), zelfde
 * "terug naar inloggen, opnieuw inloggen"-afronding (spec →
 * "Wachtwoord vergeten", bewust géén "direct ingelogd").
 */

type RequestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "sent"; email: string };

/**
 * Stap 1 — herstellink aanvragen. Élke uitkomst wordt "sent", ook een
 * rate limit — geen e-mail-enumeratie (zelfde motivatie als
 * `useWachtwoordHerstellen.ts`'s `useWachtwoordResetAanvragen`, letterlijk
 * hergebruikt).
 */
export function usePortalWachtwoordHerstellen() {
  const [state, setState] = useState<RequestState>({ status: "idle" });

  async function requestReset(email: string): Promise<void> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/portal/wachtwoord-herstellen`,
      });
      if (error) {
        logLocalError("usePortalWachtwoordHerstellen", error.message);
      }
    } catch (err) {
      logLocalError("usePortalWachtwoordHerstellen", err);
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

export type PortalNieuwWachtwoordErrorCode = "link_invalid" | PasswordUpdateErrorCode;

type SetState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "code" }
  | { status: "done" }
  | { status: "error"; code: PortalNieuwWachtwoordErrorCode };

/**
 * Stap 3 — nieuw wachtwoord instellen met de `token_hash` uit de mail (ADR
 * 0008). Token wordt pas hier, bij verzenden, ingewisseld.
 */
export function usePortalNieuwWachtwoordInstellen(tokenHash: string | null) {
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
          logLocalError("usePortalNieuwWachtwoordInstellen (verifyOtp)", error.message);
          setState({ status: "error", code: "link_invalid" });
          return false;
        }
        verified.current = true;
      }

      // Een herstelsessie is aal1. Heeft het account een tweede factor, dan
      // eerst de code (docs/features/beheer-tweede-factor.md, ADR 0017);
      // anders weigert Supabase Auth met `insufficient_aal`. Het scherm vraagt
      // de code en roept daarna `setNewPassword` opnieuw aan.
      if (await sessieNodigCode(supabase.auth.mfa)) {
        setState({ status: "code" });
        return false;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        logLocalError("usePortalNieuwWachtwoordInstellen (updateUser)", error.message);
        setState({ status: "error", code: toPasswordUpdateErrorCode(error) });
        return false;
      }

      // Terug naar het inlogscherm, opnieuw inloggen (spec → "Wachtwoord
      // vergeten", zelfde besluit als wachtwoord-vergeten.md besluit 2).
      await supabase.auth.signOut();
      setState({ status: "done" });
      return true;
    } catch (err) {
      logLocalError("usePortalNieuwWachtwoordInstellen", err);
      setState({ status: "error", code: "unknown" });
      return false;
    }
  }

  /** De code uit de authenticator-app voor deze herstelsessie. `null` bij
   *  succes; daarna `setNewPassword` opnieuw. */
  const verifieer = useCallback(async (code: string): Promise<CodeFout | null> => {
    try {
      return await verifieerCode(createClient().auth.mfa, code);
    } catch (err) {
      logLocalError("usePortalNieuwWachtwoordInstellen (verify)", err);
      return "unknown";
    }
  }, []);

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    setNewPassword,
    verifieer,
  };
}
