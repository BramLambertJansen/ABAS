"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** A row from `members`, projected for ledenbeheer — eigen hook, geen
 *  uitbreiding van useMembers() (zie docs/features/ledenbeheer.md →
 *  Leeshook): useMembers() is gebouwd voor de verkoop-ledenzoeker (alleen
 *  niet-gearchiveerde leden, geen role/archived-veld). Ledenbeheer heeft het
 *  tegenovergestelde nodig — elk lid, archived of niet, mét role en
 *  archived — vandaar een eigen type in plaats van MemberOption. */
export type LedenbeheerLid = {
  id: string;
  name: string;
  role: "lid" | "bardienst" | "beheerder";
  balanceCents: number;
  archived: boolean;
  email: string | null;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; members: LedenbeheerLid[] };

/** Elk lid (archived of niet — anders is een gearchiveerd lid niet terug te
 *  vinden om terug te zetten), alfabetisch op naam. Writes gaan via
 *  create_member/update_member_name/set_member_archived/set_member_role,
 *  nooit een directe insert/update — `members` is REVOKEd voor
 *  `authenticated` sinds 0001_init.sql. */
export function useAlleLeden(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("members")
        .select("id, name, role, balance_cents, archived, email")
        .order("name", { ascending: true });

      if (error) throw error;

      const members: LedenbeheerLid[] = (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        role: row.role as LedenbeheerLid["role"],
        balanceCents: row.balance_cents as number,
        archived: row.archived as boolean,
        email: row.email as string | null,
      }));

      setState({ status: "ready", members });
    } catch (err) {
      // Nooit de rauwe fout tonen op een bar-tablet — loggen voor wie
      // debugt, vaste Nederlandse boodschap, zelfde patroon als
      // useMembers/useAlleProducten.
      console.error("useAlleLeden:", err);
      setState({
        status: "error",
        message: "Kan de ledenlijst niet laden. Controleer de verbinding.",
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
