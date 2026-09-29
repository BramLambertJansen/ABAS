"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Foutcodes van `resume_orphan_shift` (0030). `not_in_shift_crew`: de
 *  aanroeper staat niet in de bezetting van die dienst. `shift_not_orphan`: de
 *  dienst heeft (intussen) een actieve koppeling. `session_has_shift`: deze
 *  sessie werkt al in een dienst. `shift_not_open`: de dienst is dicht of
 *  onbekend. Bekende domeinuitkomsten, geen fouten: niet naar `client_errors`. */
export type ResumeOrphanShiftErrorCode =
  | SessionErrorCode
  | "not_in_shift_crew"
  | "shift_not_orphan"
  | "session_has_shift"
  | "shift_not_open"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: ResumeOrphanShiftErrorCode };

function toErrorCode(message: string | undefined): ResumeOrphanShiftErrorCode {
  if (
    isSessionErrorCode(message) ||
    message === "not_in_shift_crew" ||
    message === "shift_not_orphan" ||
    message === "session_has_shift" ||
    message === "shift_not_open"
  ) {
    return message as ResumeOrphanShiftErrorCode;
  }
  return "unknown";
}

/**
 * Een bardienst uit de bezetting hervat een wees-dienst (open dienst zonder
 * actieve koppeling) op dit apparaat (besloten, vraag 24 (ii);
 * docs/features/dienst-per-sessie.md → Zoals gebouwd). De sessie krijgt een
 * nieuwe koppeling en de beheerdermelding is opgelost. Een dienst met een
 * actieve koppeling elders blijft onaantastbaar (12d): dan is de code
 * `shift_not_orphan`.
 */
export function useResumeOrphanShift() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function resumeOrphanShift(shiftId: string): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("resume_orphan_shift", { p_shift_id: shiftId });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useResumeOrphanShift", error);
        else if (isSessionErrorCode(code)) notifySessionCode(code);
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useResumeOrphanShift", err);
      setState({ status: "error", code });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    resumeOrphanShift,
    reset: () => setState({ status: "idle" }),
  };
}
