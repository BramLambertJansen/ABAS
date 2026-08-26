"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Error codes `start_shift` (0001_init.sql) actually raises. Anything else
 *  (network failure, unexpected server error) falls through to "unknown". */
export type StartShiftErrorCode =
  | "invalid_pin"
  | "no_bar_role"
  | "member_not_found"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: StartShiftErrorCode };

function toErrorCode(message: string | undefined): StartShiftErrorCode {
  if (
    message === "invalid_pin" ||
    message === "no_bar_role" ||
    message === "member_not_found"
  ) {
    return message;
  }
  return "unknown";
}

export function useStartShift() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function startShift(memberId: string, pin: string): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("start_shift", {
        p_member_id: memberId,
        p_pin: pin,
      });
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
    startShift,
    reset: () => setState({ status: "idle" }),
  };
}
