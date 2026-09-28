"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";

/** Error codes `add_shift_member` (0001_init.sql) actually raises. Anything
 *  else (network failure, unexpected server error) falls through to
 *  "unknown". Same pattern as useStartShift.ts → StartShiftErrorCode. */
export type AddShiftMemberErrorCode =
  | "shift_not_open"
  | "member_not_eligible"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: AddShiftMemberErrorCode };

function toErrorCode(message: string | undefined): AddShiftMemberErrorCode {
  if (message === "shift_not_open" || message === "member_not_eligible") {
    return message;
  }
  return "unknown";
}

export function useAddShiftMember() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function addShiftMember(
    shiftId: string,
    memberId: string
  ): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("add_shift_member", {
        p_shift_id: shiftId,
        p_member_id: memberId,
      });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useAddShiftMember", error);
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useAddShiftMember", err);
      setState({ status: "error", code });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    addShiftMember,
    reset: () => setState({ status: "idle" }),
  };
}
