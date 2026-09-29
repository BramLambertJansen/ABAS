"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Foutcodes van `admin_end_shift` (0028): de guard-codes, de
 *  ADR 0002-actorcheck en `shift_not_open` ("deze dienst is al afgesloten"). */
export type AdminEndShiftErrorCode =
  | SessionErrorCode
  | "actor_not_found"
  | "no_admin_role"
  | "shift_not_open"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: AdminEndShiftErrorCode };

function toErrorCode(message: string | undefined): AdminEndShiftErrorCode {
  if (
    isSessionErrorCode(message) ||
    message === "actor_not_found" ||
    message === "no_admin_role" ||
    message === "shift_not_open"
  ) {
    return message as AdminEndShiftErrorCode;
  }
  return "unknown";
}

/**
 * Een beheerder sluit een dienst af vanaf een ander apparaat, vanuit bar-modus
 * én vanuit beheer (besloten, 12a; docs/features/dienst-per-sessie.md →
 * Beheerder). De dienst sluit voor alle koppelingen; omzet en samenvatting
 * horen bij de dienst, er gaat niets verloren.
 */
export function useAdminEndShift() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function adminEndShift(shiftId: string): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_end_shift", { p_shift_id: shiftId });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useAdminEndShift", error);
        else if (isSessionErrorCode(code)) notifySessionCode(code);
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useAdminEndShift", err);
      setState({ status: "error", code });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    adminEndShift,
    reset: () => setState({ status: "idle" }),
  };
}
