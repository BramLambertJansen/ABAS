"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

export type MemberOption = {
  id: string;
  name: string;
  balanceCents: number;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; members: MemberOption[] };

/** Niet-gearchiveerde `members`, alfabetisch op naam — voor de ledenzoeker
 *  in het mandje-paneel (docs/features/verkoop.md → §2). Ongefilterd op
 *  rol, in tegenstelling tot useBarStaff(): elk niet-gearchiveerd lid kan
 *  afrekenen, ook een bardienst/beheerder die zelf iets koopt. `refetch()`
 *  wordt na een geslaagde `place_order` aangeroepen zodat een volgende
 *  zoekactie het bijgewerkte saldo toont, en na `member_not_found`/
 *  `insufficient_balance` (races, zie Randgevallen). */
export function useMembers(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("members")
        .select("id, name, balance_cents")
        .eq("archived", false)
        .order("name", { ascending: true });

      if (error) throw error;

      const members: MemberOption[] = (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        balanceCents: row.balance_cents as number,
      }));

      setState({ status: "ready", members });
    } catch (err) {
      // Never surface the raw error on a bar tablet mid-service — log it
      // for whoever's debugging, show a fixed Dutch message at the bar.
      reportClientError(createClient, "useMembers", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan de ledenlijst niet laden.", err),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) {
        setState({ status: "error", message: "Onbekende fout." });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
