"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";
import { logLocalError, reportClientError } from "@/lib/clientErrors";
import { toPasswordUpdateErrorCode, type PasswordUpdateErrorCode } from "@/lib/authErrors";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: PasswordUpdateErrorCode };

/**
 * Eigen wachtwoord wijzigen in de portal — docs/features/portal-profiel.md →
 * RPC's → "Wachtwoord: geen RPC". `auth.updateUser({ password })` via
 * `portalClient.ts`; de ingelogde sessie is het bewijs, er wordt geen huidig
 * wachtwoord gevraagd (besluit 3). Geen `signOut()` na afloop, ook niet van
 * andere sessies (besluit 4) — anders dan de herstelflow in
 * `usePortalWachtwoordHerstellen.ts`, die wel uitlogt.
 *
 * Staat Supabase "Secure password change" aan en valt de sessie buiten het
 * venster, dan geeft Supabase `reauthentication_needed`; de gedeelde
 * mapping in src/lib/authErrors.ts maakt daar `reauth_required` van.
 */
export function usePortalWachtwoordWijzigen() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function changePassword(password: string): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const code = toPasswordUpdateErrorCode(error);
        // Een domeinuitkomst (zwak, gelijk, herauthenticatie, rate limit)
        // is geen onverwachte fout; alleen "unknown" gaat naar de log.
        if (code === "unknown") {
          reportClientError(supabase, "usePortalWachtwoordWijzigen", error);
        } else {
          logLocalError("usePortalWachtwoordWijzigen", error.message);
        }
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      reportClientError(createClient, "usePortalWachtwoordWijzigen", err);
      setState({ status: "error", code: "unknown" });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    changePassword,
    reset: () => setState({ status: "idle" }),
  };
}
