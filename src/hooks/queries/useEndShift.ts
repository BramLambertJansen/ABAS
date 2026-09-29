"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";

/** Error codes `end_shift` actually raises. Tot 0023 raisede het niets
 *  (0001_init.sql: alleen een `update ... where ended_at is null`);
 *  0023_bar_rpcs_weigeren_lid.sql voegt `no_bar_role` toe voor een
 *  lid-sessie. Anything else (network failure, unexpected server error)
 *  falls through to "unknown". Same pattern as useAddShiftMember.ts /
 *  useRemoveShiftMember.ts. */
export type EndShiftErrorCode = "no_bar_role" | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: EndShiftErrorCode };

function toErrorCode(message: string | undefined): EndShiftErrorCode {
  if (message === "no_bar_role") {
    return message;
  }
  return "unknown";
}

/** Booleaanse `Promise<boolean>`-vorm, geen resultaatdata — `end_shift`
 *  retourneert `void`. Zelfde vorm als useAddShiftMember/
 *  useRemoveShiftMember. Zie docs/features/dienst-afsluiten.md →
 *  "Nieuwe mutatiehook: useEndShift". */
export function useEndShift() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function endShift(shiftId: string): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("end_shift", {
        p_shift_id: shiftId,
      });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useEndShift", error);
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useEndShift", err);
      setState({ status: "error", code });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    endShift,
    reset: () => setState({ status: "idle" }),
  };
}
