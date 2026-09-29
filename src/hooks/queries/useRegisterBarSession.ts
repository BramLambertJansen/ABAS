"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Foutcodes van `register_bar_session` (0028). `mode_locked`: deze sessie
 *  staat al in de andere modus (modus wisselen = uitloggen, ADR 0003). */
export type RegisterBarSessionErrorCode =
  | SessionErrorCode
  | "invalid_mode"
  | "no_admin_role"
  | "mode_locked"
  | "unknown";

export type RegisterBarSessionResult =
  | { ok: true }
  | { ok: false; code: RegisterBarSessionErrorCode };

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: RegisterBarSessionErrorCode };

function toErrorCode(message: string | undefined): RegisterBarSessionErrorCode {
  if (
    isSessionErrorCode(message) ||
    message === "invalid_mode" ||
    message === "no_admin_role" ||
    message === "mode_locked"
  ) {
    return message as RegisterBarSessionErrorCode;
  }
  return "unknown";
}

/**
 * De keuze "Bar" of "Beheer" in `ModusKeuze` na een e-maillogin op `/beheer`
 * registreert de sessie in die modus (docs/features/dienst-per-sessie.md →
 * RPC's → `register_bar_session`). Een sessie krijgt één modus en houdt die.
 * De PIN-login en de namenlijstlogin registreren server-side
 * (`register_bar_session_server`), altijd in modus bar.
 */
export function useRegisterBarSession() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function registerBarSession(mode: "bar" | "beheer"): Promise<RegisterBarSessionResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("register_bar_session", { p_mode: mode });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useRegisterBarSession", error);
        else if (isSessionErrorCode(code)) notifySessionCode(code);
        setState({ status: "error", code });
        return { ok: false, code };
      }
      setState({ status: "idle" });
      return { ok: true };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useRegisterBarSession", err);
      setState({ status: "error", code });
      return { ok: false, code };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    registerBarSession,
    reset: () => setState({ status: "idle" }),
  };
}
