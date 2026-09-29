"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Error codes `remove_shift_member` (0001_init.sql, fixed by
 *  supabase/migrations/0003_remove_shift_member_requires_open_shift.sql to
 *  actually raise shift_not_open) can raise. Anything else falls through to
 *  "unknown". No member_not_eligible here — removing has no eligibility
 *  check, only add does. Same pattern as useStartShift.ts →
 *  StartShiftErrorCode. *
 *  De zes sessiecodes van de guard (`SessionErrorCode`, dienst-per-sessie,
 *  0028/0029; zie usePlaceOrder.ts) zijn bekende domeinuitkomsten: niet
 *  gemeld aan `client_errors`, maar naar de centrale afhandeling
 *  (`notifySessionCode`). `no_bar_role` betekent sinds 0028 "het lid van
 *  deze bar-sessie heeft geen bar-rol meer". */
export type RemoveShiftMemberErrorCode =
  | SessionErrorCode
  | "shift_not_open"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: RemoveShiftMemberErrorCode };

function toErrorCode(message: string | undefined): RemoveShiftMemberErrorCode {
  if (isSessionErrorCode(message)) {
    notifySessionCode(message);
    return message;
  }
  if (message === "shift_not_open") {
    return message;
  }
  return "unknown";
}

export function useRemoveShiftMember() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function removeShiftMember(
    shiftId: string,
    memberId: string
  ): Promise<boolean> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("remove_shift_member", {
        p_shift_id: shiftId,
        p_member_id: memberId,
      });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useRemoveShiftMember", error);
        setState({ status: "error", code });
        return false;
      }
      setState({ status: "idle" });
      return true;
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useRemoveShiftMember", err);
      setState({ status: "error", code });
      return false;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    removeShiftMember,
    reset: () => setState({ status: "idle" }),
  };
}
