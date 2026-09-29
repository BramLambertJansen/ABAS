"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Error codes `start_shift` (0001_init.sql, sinds 0029 `start_shift(
 *  p_activity_type_id)` zonder PIN) actually raises. Anything else (network
 *  failure, unexpected server error) falls through to "unknown".
 *
 *  De starter is het lid van de ingelogde bar-sessie: de login op de
 *  namenlijst is zijn authenticatie (docs/features/dienst-per-sessie.md →
 *  RPC's), dus `invalid_pin`, `member_not_found` en de eigen `no_bar_role`
 *  van vóór 0029 bestaan niet meer. De zes sessiecodes van de guard
 *  (`SessionErrorCode`; zie usePlaceOrder.ts) zijn bekende domeinuitkomsten
 *  met centrale afhandeling. `shift_already_open`: er loopt al een dienst
 *  (stand (a), fase 1) — het scherm ververst zijn toestand.
 *  `session_has_shift`: deze sessie werkt al in een dienst.
 *
 *  De drie activity_type_*-codes horen bij de activiteitkeuze (docs/features/
 *  activiteittypes.md → Schermflow §2 stap 5): het scherm blijft op de
 *  keuze en ververst de lijst. */
export type StartShiftErrorCode =
  | SessionErrorCode
  | "shift_already_open"
  | "session_has_shift"
  | "invalid_activity_type"
  | "activity_type_not_found"
  | "activity_type_archived"
  | "unknown";

/** True for the three foutcodes that belong to the activiteitkeuze, not to
 *  the state of the shift/session — zie docs/features/activiteittypes.md →
 *  Schermflow §2 stap 5 / Randgevallen. */
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
  if (isSessionErrorCode(message)) {
    notifySessionCode(message);
    return message;
  }
  if (
    message === "shift_already_open" ||
    message === "session_has_shift" ||
    message === "invalid_activity_type" ||
    message === "activity_type_not_found" ||
    message === "activity_type_archived"
  ) {
    return message;
  }
  return "unknown";
}

/** Discriminated result in plaats van een kale boolean, om dezelfde reden
 *  als usePlaceOrder.ts → PlaceOrderResult: de aanroeper heeft de foutcode
 *  meteen nodig, niet pas een render later. */
export type StartShiftResult =
  | { ok: true }
  | { ok: false; code: StartShiftErrorCode };

export function useStartShift() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function startShift(activityTypeId: string): Promise<StartShiftResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("start_shift", {
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
