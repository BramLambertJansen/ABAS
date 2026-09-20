"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Error codes `set_own_pin` (0008_pin_zelfbediening.sql) actually raises.
 *  Anything else valt terug op "unknown". `actor_not_found`/`no_bar_role`
 *  should never actually surface from "Mijn account" in practice (you can
 *  only reach that screen via an individual e-mail/wachtwoord-sessie that
 *  already resolved to an active bardienst/beheerder row, see
 *  useBeheerSession.ts) — kept anyway, same defensive reasoning as
 *  dienst-starten's `no_bar_role`/`member_not_found` messaging for a
 *  role/archive change that lands between screens. */
export type SetOwnPinErrorCode =
  | "invalid_pin_format"
  | "actor_not_found"
  | "no_bar_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: SetOwnPinErrorCode };

function toErrorCode(message: string | undefined): SetOwnPinErrorCode {
  if (
    message === "invalid_pin_format" ||
    message === "actor_not_found" ||
    message === "no_bar_role"
  ) {
    return message;
  }
  return "unknown";
}

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

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    setOwnPin,
    reset: () => setState({ status: "idle" }),
  };
}
