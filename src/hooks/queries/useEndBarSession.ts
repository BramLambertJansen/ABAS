"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logLocalError, reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, type SessionErrorCode } from "@/lib/barSessie";

/** Foutcodes van `end_bar_session` (0028): de zes sessiecodes van de guard
 *  (dan is de sessie al weg en logt de client alsnog lokaal uit),
 *  `invalid_reason` en `unknown`. */
export type EndBarSessionErrorCode = SessionErrorCode | "invalid_reason" | "unknown";

export type EndBarSessionResult = { ok: true } | { ok: false; code: EndBarSessionErrorCode };

type State = { status: "idle" } | { status: "pending" } | { status: "error"; code: EndBarSessionErrorCode };

function toErrorCode(message: string | undefined): EndBarSessionErrorCode {
  if (isSessionErrorCode(message) || message === "invalid_reason") return message as EndBarSessionErrorCode;
  return "unknown";
}

/**
 * Uitloggen (besloten, vraag 17; docs/features/dienst-per-sessie.md → RPC's
 * → `end_bar_session`). Met een open dienst kiest de gebruiker eerst:
 * `closeShift = true` sluit de dienst zoals `end_shift`; `false` laat hem
 * open, met een melding aan een beheerder. Daarna roept dit
 * `signOut({ scope: "local" })` aan.
 *
 * Een sessiecode betekent dat de sessie al weg is (beëindigd, inactief, ...):
 * dan is uitloggen alleen nog lokaal opruimen, en doet dit dat. Een
 * onverwachte fout laat de sessie staan en geeft `ok: false`: de gebruiker
 * dacht misschien een dienst af te sluiten, dus stil uitloggen zou liegen.
 *
 * `reason = "niet_hervat"` is voor een beheersessie die na "browser dicht en
 * weer open" niet wordt hervat (ADR 0016 → Beslissing 8).
 */
export function useEndBarSession() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function endBarSession(
    closeShift: boolean,
    reason: "uitgelogd" | "niet_hervat" = "uitgelogd"
  ): Promise<EndBarSessionResult> {
    setState({ status: "pending" });
    const supabase = createClient();
    try {
      const { error } = await supabase.rpc("end_bar_session", {
        p_close_shift: closeShift,
        p_reason: reason,
      });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown" || code === "invalid_reason") {
          if (code === "unknown") reportClientError(supabase, "useEndBarSession", error);
          setState({ status: "error", code });
          return { ok: false, code };
        }
        // Sessiecode: de sessie is al weg, hieronder alleen lokaal opruimen.
      }
    } catch (err) {
      reportClientError(createClient, "useEndBarSession", err);
      setState({ status: "error", code: "unknown" });
      return { ok: false, code: "unknown" };
    }

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) logLocalError("useEndBarSession (signOut)", error.message);
    } catch (err) {
      logLocalError("useEndBarSession (signOut)", err);
    }
    setState({ status: "idle" });
    return { ok: true };
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    endBarSession,
    reset: () => setState({ status: "idle" }),
  };
}
