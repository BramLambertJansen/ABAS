"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { maakRondeGuard } from "@/lib/verversen";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

/** Niet-gearchiveerde `activity_types`, alfabetisch op naam — de keuze bij
 *  het starten van een dienst (docs/features/activiteittypes.md →
 *  Schermflow §2). Smalle, ongeparametriseerde hook, zelfde tweedeling als
 *  useProducts()/useAlleProducten() (spec → RPC's → "Lezen"). `refetch()`
 *  bestaat zodat de lijst na een `activity_type_archived`-fout (race tussen
 *  kiezen en PIN bevestigen) opnieuw opgehaald kan worden. */
export type ActiviteitType = {
  id: string;
  name: string;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; activityTypes: ActiviteitType[] };

export function useActiviteitTypes(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const request = useRef(maakRondeGuard());

  const load = useCallback(async () => {
    const ronde = request.current.start();
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("activity_types")
        .select("id, name")
        .eq("archived", false)
        .order("name", { ascending: true });

      if (!request.current.isActueel(ronde)) return;
      if (error) throw error;

      const activityTypes: ActiviteitType[] = (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
      }));

      setState({ status: "ready", activityTypes });
    } catch (err) {
      if (!request.current.isActueel(ronde)) return;
      // Nooit de rauwe fout op een bar-tablet tonen — loggen voor wie
      // debugt, een vast Nederlands bericht op het scherm zelf.
      reportClientError(createClient, "useActiviteitTypes", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan de activiteittypes niet laden.", err),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const guard = request.current;
    load().catch(() => {
      if (!cancelled) {
        setState({ status: "error", message: "Onbekende fout." });
      }
    });
    return () => {
      cancelled = true;
      guard.annuleer();
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
