"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type BarStaffMember = {
  id: string;
  name: string;
  role: "bardienst" | "beheerder";
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; staff: BarStaffMember[] };

/** Non-archived bardienst/beheerder members — who's eligible to start a
 *  shift. `lid`-only members never appear here (start_shift rejects them
 *  server-side anyway; filtering here is just so the staff-picker doesn't
 *  offer a choice that can only fail). */
export function useBarStaff(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("members")
          .select("id, name, role")
          .in("role", ["bardienst", "beheerder"])
          .eq("archived", false)
          .order("name", { ascending: true });

        if (cancelled) return;
        if (error) throw error;

        setState({ status: "ready", staff: (data ?? []) as BarStaffMember[] });
      } catch (err) {
        if (cancelled) return;
        // Same rule as useOpenShift: never show the raw error on the
        // tablet, log it for debugging instead.
        console.error("useBarStaff:", err);
        setState({
          status: "error",
          message: "Kan de bardienst-lijst niet laden. Controleer de verbinding.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
