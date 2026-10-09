"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { maakRondeGuard } from "@/lib/verversen";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

/** Elk `activity_types`-type, gearchiveerd of niet — de Instellingen-kaart
 *  (docs/features/activiteittypes.md → Schermflow §1), zelfde reden als
 *  useAlleProducten(): een gearchiveerd type moet vindbaar blijven om het
 *  weer terug te zetten. Niet genoemd `ActiviteitType` — zie
 *  useAlleProducten.ts se `AssortimentProduct`-precedent, een eigen
 *  projectie voor deze ene leesbehoefte, geen centraal domeintype. */
export type AlleActiviteitType = {
  id: string;
  name: string;
  archived: boolean;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; activityTypes: AlleActiviteitType[] };

/** Actief-dan-gearchiveerd gesorteerd (`archived` oplopend zet false vóór
 *  true), dan naam — zelfde volgorde als het ontwerp
 *  (designs/Bar App.dc.html regel 3231). */
export function useAlleActiviteitTypes(): State & { refetch: () => void } {
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
        .select("id, name, archived")
        .order("archived", { ascending: true })
        .order("name", { ascending: true });

      if (!request.current.isActueel(ronde)) return;
      if (error) throw error;

      const activityTypes: AlleActiviteitType[] = (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        archived: row.archived as boolean,
      }));

      setState({ status: "ready", activityTypes });
    } catch (err) {
      if (!request.current.isActueel(ronde)) return;
      reportClientError(createClient, "useAlleActiviteitTypes", err);
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
