"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Foutcodes van `admin_take_over_shift` (0028). `session_has_shift`: deze
 *  sessie werkt al in een dienst ("je werkt al in een dienst — sluit die
 *  eerst af"). */
export type AdminTakeOverShiftErrorCode =
  | SessionErrorCode
  | "actor_not_found"
  | "no_admin_role"
  | "session_has_shift"
  | "shift_not_open"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: AdminTakeOverShiftErrorCode };

function toErrorCode(message: string | undefined): AdminTakeOverShiftErrorCode {
  if (
    isSessionErrorCode(message) ||
    message === "actor_not_found" ||
    message === "no_admin_role" ||
    message === "session_has_shift" ||
    message === "shift_not_open"
  ) {
    return message as AdminTakeOverShiftErrorCode;
  }
  return "unknown";
}

/**
 * Een beheerder neemt een dienst over op dit apparaat (besloten, 12a en 12b;
 * docs/features/dienst-per-sessie.md → Beheerder): alleen vanuit bar-modus,
 * want het vraagt een bar-sessie op het nieuwe apparaat. De bestaande
 * koppeling krijgt `overgenomen`, de beheerder komt in de bezetting en de
 * openstaande meldingen voor deze dienst zijn opgelost.
 */
export function useAdminTakeOverShift() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function takeOverShift(shiftId: string): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_take_over_shift", { p_shift_id: shiftId });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useAdminTakeOverShift", error);
        else if (isSessionErrorCode(code)) notifySessionCode(code);
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useAdminTakeOverShift", err);
      setState({ status: "error", code });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    takeOverShift,
    reset: () => setState({ status: "idle" }),
  };
}
