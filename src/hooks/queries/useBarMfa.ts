"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logLocalError } from "@/lib/clientErrors";
import { leesMfaStatus, verifieerCode, type CodeFout } from "@/lib/mfa";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; factorId: string | null; aal2: boolean };

/**
 * De tweede factor van de ingelogde sessie in de bar-shell (`/beheer`,
 * docs/features/beheer-tweede-factor.md, ADR 0017): heeft het account een
 * geverifieerde TOTP-factor, en is deze sessie al aal2? Voor `ModusKeuze`:
 * zonder factor staat de tegel Beheer uit, met een factor en aal1 vraagt
 * "Beheer" eerst de code. Met de bar-client (ADR 0009); de portal heeft een
 * eigen hook.
 *
 * `verifieer(code)`: `challenge` + `verify`. Daarna is dezelfde sessie aal2
 * (het `session_id` blijft gelijk). Geeft `null` bij succes, anders de fout.
 */
export function useBarMfa(enabled: boolean) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const status = await leesMfaStatus(createClient().auth.mfa);
        if (cancelled) return;
        setState(status.ok ? { status: "ready", factorId: status.factorId, aal2: status.aal2 } : { status: "error" });
      } catch (err) {
        logLocalError("useBarMfa", err);
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  const verifieer = useCallback(async (code: string): Promise<CodeFout | null> => {
    try {
      const fout = await verifieerCode(createClient().auth.mfa, code);
      if (!fout) setState((s) => (s.status === "ready" ? { ...s, aal2: true } : s));
      return fout;
    } catch (err) {
      logLocalError("useBarMfa (verify)", err);
      return "unknown";
    }
  }, []);

  return {
    ...state,
    verifieer,
    refetch: () => setTick((t) => t + 1),
  };
}
