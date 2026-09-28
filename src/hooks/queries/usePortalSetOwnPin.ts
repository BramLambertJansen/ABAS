"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";
import { reportClientError } from "@/lib/clientErrors";
import { toSetOwnPinErrorCode, type SetOwnPinErrorCode } from "@/lib/ownPinErrors";

export type SetOwnPinResult = { ok: true } | { ok: false; code: SetOwnPinErrorCode };

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: SetOwnPinErrorCode };

/**
 * Eigen bar-PIN instellen, overschrijven of uitzetten vanuit de portal —
 * docs/features/portal-profiel.md → RPC's → "Bestaand, ongewijzigd:
 * set_own_pin". Zelfde RPC en zelfde contract als `useSetOwnPin.ts`
 * (`/beheer` → "Mijn account"), eigen bestand omdat dat bestand
 * `@/lib/supabase/client` importeert (ADR 0009). Mapping en teksten zijn
 * gedeeld via src/lib/ownPinErrors.ts. `pin` null = PIN uitzetten.
 */
export function usePortalSetOwnPin() {
  const [state, setState] = useState<State>({ status: "idle" });

  /** Geeft de uitkomst ook direct terug (niet alleen via `errorCode`), zodat
   *  de sheet op `no_bar_role`/`actor_not_found` kan reageren zonder effect. */
  async function setOwnPin(pin: string | null): Promise<SetOwnPinResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("set_own_pin", { p_pin: pin });

      if (error) {
        const code = toSetOwnPinErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "usePortalSetOwnPin", error);
        setState({ status: "error", code });
        return { ok: false, code };
      }
      setState({ status: "idle" });
      return { ok: true };
    } catch (err) {
      const code = toSetOwnPinErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "usePortalSetOwnPin", err);
      setState({ status: "error", code });
      return { ok: false, code };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    setOwnPin,
    reset: () => setState({ status: "idle" }),
  };
}
