"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";

/** `end_shift` (0001_init.sql) never raises — no `raise exception` in its
 *  body, just an `update ... where ended_at is null`. Anything that ends up
 *  here is therefore a network failure or otherwise unexpected error, not a
 *  code the RPC itself produced. Same `toErrorCode`-fallback shape as the
 *  other shift/bezetting mutation hooks (useAddShiftMember.ts,
 *  useRemoveShiftMember.ts) for consistency, even though the union is
 *  trivially small here. */
export type EndShiftErrorCode = "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: EndShiftErrorCode };

function toErrorCode(): EndShiftErrorCode {
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
        reportClientError(supabase, "useEndShift", error);
        setState({ status: "error", code: toErrorCode() });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      reportClientError(createClient, "useEndShift", err);
      setState({
        status: "error",
        code: toErrorCode(),
      });
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
