"use client";

import { useCallback, useEffect, useState } from "react";
import { logLocalError } from "@/lib/clientErrors";
import type { BarNaam } from "@/lib/barLoginTypes";

export type { BarNaam };

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; namen: BarNaam[] };

/**
 * De openbare namenlijst van het startscherm: alle niet-gearchiveerde
 * bardienstleden en beheerders, ook wie geen PIN heeft
 * (docs/features/dienst-per-sessie.md → Inloggen op de bar, punt 1; besloten,
 * vraag 5). Er is nog geen sessie, dus geen RLS-lezing: de lijst komt uit een
 * server-only entrypoint (`GET /inloggen/namen`). Vervangt `useBarStaff` op
 * het startscherm; `BezettingOverlay` leest via `useShiftCandidates` met de
 * persoonlijke sessie, zonder PIN-filter.
 */
export function useBarNamen(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/inloggen/namen", { cache: "no-store" });
      const body = (await response.json()) as { ok?: boolean; namen?: BarNaam[] };
      if (!response.ok || !body.ok || !Array.isArray(body.namen)) {
        throw new Error(`namenlijst: status ${response.status}`);
      }
      setState({ status: "ready", namen: body.namen });
    } catch (err) {
      // Er is geen sessie, dus ook geen `log_client_error` (ADR 0015): alleen
      // lokaal loggen, en een vaste tekst op het scherm.
      logLocalError("useBarNamen", err);
      setState({
        status: "error",
        message: "Kan de namenlijst niet laden. Controleer de verbinding en probeer het opnieuw.",
      });
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
