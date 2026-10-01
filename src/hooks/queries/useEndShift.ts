"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Error codes `end_shift` actually raises: sinds dienst-per-sessie (0029)
 *  alleen de sessiecodes van de guard — `end_shift` is geen stille no-op meer
 *  voor een onbekende of al gesloten dienst maar `session_not_on_shift`.
 *  Anything else (network failure, unexpected server error) falls through to
 *  "unknown". Same pattern as useAddShiftMember.ts / useRemoveShiftMember.ts. *
 *  De zes sessiecodes van de guard (`SessionErrorCode`, dienst-per-sessie,
 *  0028/0029; zie usePlaceOrder.ts) zijn bekende domeinuitkomsten: niet
 *  gemeld aan `client_errors`, maar naar de centrale afhandeling
 *  (`notifySessionCode`). `no_bar_role` betekent sinds 0028 "het lid van
 *  deze bar-sessie heeft geen bar-rol meer". */
export type EndShiftErrorCode = SessionErrorCode | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: EndShiftErrorCode };

function toErrorCode(message: string | undefined): EndShiftErrorCode {
  if (isSessionErrorCode(message)) {
    notifySessionCode(message);
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
