"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { toSetOwnPinErrorCode, type SetOwnPinErrorCode } from "@/lib/ownPinErrors";

/** Mapping en type staan in src/lib/ownPinErrors.ts, gedeeld met
 *  usePortalSetOwnPin.ts (docs/features/portal-profiel.md → Hooks).
 *  `actor_not_found`/`no_bar_role` should never actually surface from
 *  "Mijn account" in practice (you can only reach that screen via an
 *  individual e-mail/wachtwoord-sessie that already resolved to an active
 *  bardienst/beheerder row, see useBeheerSession.ts) — kept anyway, same
 *  defensive reasoning as dienst-starten's `no_bar_role`/`member_not_found`
 *  messaging for a role/archive change that lands between screens. */
export type { SetOwnPinErrorCode };

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: SetOwnPinErrorCode };

/** Self-service PIN-toggle for the currently signed-in individual
 *  (docs/features/auth-methode-per-lid.md → RPC's). `p_pin` null = PIN
 *  uitzetten. The RPC identifies the caller via `auth.uid()` — there is no
 *  member-id parameter, this can only ever write the caller's own row. */
export function useSetOwnPin() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function setOwnPin(pin: string | null): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("set_own_pin", { p_pin: pin });

      if (error) {
        const code = toSetOwnPinErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useSetOwnPin", error);
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      const code = toSetOwnPinErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useSetOwnPin", err);
      setState({ status: "error", code });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    setOwnPin,
    reset: () => setState({ status: "idle" }),
  };
}
