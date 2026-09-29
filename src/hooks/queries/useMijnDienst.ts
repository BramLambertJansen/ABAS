"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";
import { parseBarState, type BarState } from "@/lib/barState";

export type {
  AdminMelding,
  AdminMeldingReden,
  AdminOverzicht,
  AdminSession,
  AdminShift,
  BarMode,
  BarSessionInfo,
  BarSessionStatus,
  BarState,
  LastLeft,
  OpenShift,
  OtherShift,
} from "@/lib/barState";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; state: BarState };

/**
 * De toestand van deze bar-sessie (`my_bar_state()`, 0028): wie er ingelogd
 * is, de dienst van deze sessie, of er elders een dienst loopt en — voor een
 * beheerder — de meldingen. Vervangt `useOpenShift`, die "de" open dienst
 * las, ongeacht welke sessie (docs/features/dienst-per-sessie.md →
 * Schermflow). Een RPC en geen `select`, omdat "welke sessie ben ik" alleen
 * server-side bekend is; de RPC schrijft niet, dus lezen is geen hartslag.
 *
 * `enabled=false` doet niets (er is geen Supabase-sessie om te bevragen).
 * `refetch` toont weer "laden"; `poll` ververst stil op de achtergrond en
 * houdt de vorige toestand bij een mislukte poging — een netwerkstoring
 * middenin een dienst mag het scherm niet wegvegen.
 */
export function useMijnDienst(enabled: boolean = true): State & {
  refetch: () => void;
  poll: () => void;
} {
  const [state, setState] = useState<State>({ status: enabled ? "loading" : "idle" });
  const [tick, setTick] = useState(0);
  const [pollTick, setPollTick] = useState(0);

  const load = useCallback(async (silent: boolean): Promise<void> => {
    if (!silent) setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("my_bar_state");
      if (error) throw error;
      setState({ status: "ready", state: parseBarState(data) });
    } catch (err) {
      // Never surface the raw error (package name, URLs, stack) on a bar
      // tablet mid-service — log it for whoever's debugging, show a fixed
      // Dutch message to whoever's standing at the bar.
      reportClientError(createClient, "useMijnDienst", err);
      if (!silent) {
        setState({
          status: "error",
          message: loadErrorMessage("Kan de toestand van deze sessie niet laden.", err),
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    load(false).catch(() => {
      if (!cancelled) setState({ status: "error", message: "Onbekende fout." });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick, load]);

  useEffect(() => {
    if (!enabled || pollTick === 0) return;
    load(true).catch(() => {});
  }, [enabled, pollTick, load]);

  return {
    ...state,
    refetch: () => setTick((t) => t + 1),
    poll: () => setPollTick((t) => t + 1),
  };
}
