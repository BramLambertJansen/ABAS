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

/** Discriminated result in plaats van een kale boolean, om dezelfde reden
 *  als usePlaceOrder.ts → PlaceOrderResult: de aanroeper heeft de foutcode
 *  meteen nodig, niet pas een render later. `errorCode` hieronder is
 *  React-state en is binnen dezelfde tick na `await startShift(...)` nog de
 *  waarde van de vorige render — wie erop reageert (DienstStarten.tsx
 *  ververst de stafkeuze bij `no_bar_role`/`member_not_found`) moet de code
 *  uit het resultaat lezen, niet uit de hook. */
export type StartShiftResult =
  | { ok: true }
  | { ok: false; code: StartShiftErrorCode };

export function useStartShift() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function startShift(
    memberId: string,
    pin: string
  ): Promise<StartShiftResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("start_shift", {
        p_member_id: memberId,
        p_pin: pin,
      });
      if (error) {
        const code = toErrorCode(error.message);
        setState({ status: "error", code });
        return { ok: false, code };
      }
      setState({ status: "idle" });
      return { ok: true };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      setState({ status: "error", code });
      return { ok: false, code };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    startShift,
    reset: () => setState({ status: "idle" }),
  };
}
