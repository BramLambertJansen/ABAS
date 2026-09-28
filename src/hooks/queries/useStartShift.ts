"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";

/** Error codes `start_shift` (0001_init.sql, uitgebreid in
 *  0019_activiteittypes.sql met een verplichte p_activity_type_id, en in
 *  0021_start_shift_een_open_dienst.sql met `shift_already_open`) actually
 *  raises. Anything else (network failure, unexpected server error) falls
 *  through to "unknown". The three activity_type_*-codes are handled
 *  separately from the rest by the one caller (DienstStarten.tsx, see
 *  isActivityTypeErrorCode) — they navigate back to the activiteitkeuze
 *  step instead of showing on the PIN screen, per
 *  docs/features/activiteittypes.md → Schermflow §2 stap 5. */
export type StartShiftErrorCode =
  | "invalid_pin"
  | "no_bar_role"
  | "member_not_found"
  | "invalid_activity_type"
  | "activity_type_not_found"
  | "activity_type_archived"
  | "shift_already_open"
  | "unknown";

/** True for the three foutcodes that belong to the activiteitkeuze-stap,
 *  not the PIN-stap — zie docs/features/activiteittypes.md → Schermflow §2
 *  stap 5 / Randgevallen. */
export function isActivityTypeErrorCode(code: StartShiftErrorCode): boolean {
  return (
    code === "invalid_activity_type" ||
    code === "activity_type_not_found" ||
    code === "activity_type_archived"
  );
}

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: StartShiftErrorCode };

function toErrorCode(message: string | undefined): StartShiftErrorCode {
  if (
    message === "invalid_pin" ||
    message === "no_bar_role" ||
    message === "member_not_found" ||
    message === "invalid_activity_type" ||
    message === "activity_type_not_found" ||
    message === "activity_type_archived" ||
    message === "shift_already_open"
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
    pin: string,
    activityTypeId: string
  ): Promise<StartShiftResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("start_shift", {
        p_member_id: memberId,
        p_pin: pin,
        p_activity_type_id: activityTypeId,
      });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useStartShift", error);
        setState({ status: "error", code });
        return { ok: false, code };
      }
      setState({ status: "idle" });
      return { ok: true };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useStartShift", err);
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
