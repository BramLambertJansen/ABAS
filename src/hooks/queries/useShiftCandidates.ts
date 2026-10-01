"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

export type ShiftCandidate = {
  id: string;
  name: string;
  role: "bardienst" | "beheerder";
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; candidates: ShiftCandidate[] };

/** Alleen de kandidaten om aan de bezetting toe te voegen. Een actieve
 *  barrol is vereist, een PIN niet (add_shift_member, ADR 0016).
 *  De openbare loginlijst en de PIN-opties hebben hun eigen serverpad;
 *  bestaande crew komt uit useShiftMembers, ook na rol-/archiefwijzigingen. */
export function useShiftCandidates(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ status: "loading" });
      try {
        const { data, error } = await createClient()
          .from("members")
          .select("id, name, role")
          .in("role", ["bardienst", "beheerder"])
          .eq("archived", false)
          .order("name", { ascending: true });
        if (cancelled) return;
        if (error) throw error;
        setState({ status: "ready", candidates: (data ?? []) as ShiftCandidate[] });
      } catch (err) {
        if (cancelled) return;
        reportClientError(createClient, "useShiftCandidates", err);
        setState({
          status: "error",
          message: loadErrorMessage("Kan de bardienst-lijst niet laden.", err),
        });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [tick]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
