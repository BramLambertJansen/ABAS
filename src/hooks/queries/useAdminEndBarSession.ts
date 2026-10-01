"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Foutcodes van `admin_end_bar_session` (0028). `target_session_ended`: de
 *  afgemelde sessie was al beëindigd (niet de sessiecode `session_ended`, die
 *  gaat over de eigen sessie). */
export type AdminEndBarSessionErrorCode =
  | SessionErrorCode
  | "actor_not_found"
  | "no_admin_role"
  | "session_not_found"
  | "target_session_ended"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: AdminEndBarSessionErrorCode };

function toErrorCode(message: string | undefined): AdminEndBarSessionErrorCode {
  if (
    isSessionErrorCode(message) ||
    message === "actor_not_found" ||
    message === "no_admin_role" ||
    message === "session_not_found" ||
    message === "target_session_ended"
  ) {
    return message as AdminEndBarSessionErrorCode;
  }
  return "unknown";
}

/**
 * Een beheerder meldt het apparaat van een collega af (besloten, 12c; voor
 * een verloren of gestolen tablet): de sessie stopt meteen, een dienst zonder
 * apparaat geeft een melding, en het PIN-vertrouwen van dat apparaat vervalt.
 * Vanuit beide modi.
 */
export function useAdminEndBarSession() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function endBarSession(barSessionId: string): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_end_bar_session", {
        p_bar_session_id: barSessionId,
      });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useAdminEndBarSession", error);
        else if (isSessionErrorCode(code)) notifySessionCode(code);
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useAdminEndBarSession", err);
      setState({ status: "error", code });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    endBarSession,
    reset: () => setState({ status: "idle" }),
  };
}
