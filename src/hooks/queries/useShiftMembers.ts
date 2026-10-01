"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

/** A row in the current bezetting — shift_members joined with the member's
 *  current name. No filter on role/archief here: a member whose role or
 *  archief-status changes after being added stays visible here, same as
 *  historical order data isn't rewritten retroactively (see
 *  docs/features/bezetting-beheren.md → Randgevallen). That filtering only
 *  applies to the *candidate pool* for adding someone new — useShiftCandidates(). */
export type ShiftMember = {
  id: string;
  name: string;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; members: ShiftMember[] };

export function useShiftMembers(
  shiftId: string | null
): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!shiftId) {
      setState({ status: "ready", members: [] });
      return;
    }

    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shift_members")
        .select("member_id, added_at, members(name)")
        .eq("shift_id", shiftId)
        .order("added_at", { ascending: true });

      if (error) throw error;

      // Same untyped-client caveat as useOpenShift: shift_members→members
      // is a to-one embed (one FK, one row) but the untyped client infers
      // it as an array shape — go through `unknown` since TS won't accept
      // the direct cast.
      const members: ShiftMember[] = (data ?? []).map((row) => {
        const member = row.members as unknown as { name: string } | null;
        return {
          id: row.member_id as string,
          name: member?.name ?? "onbekend",
        };
      });

      setState({ status: "ready", members });
    } catch (err) {
      // Never surface the raw error on a bar tablet mid-service — log it
      // for whoever's debugging, show a fixed Dutch message at the bar.
      reportClientError(createClient, "useShiftMembers", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan de bezetting niet laden.", err),
      });
    }
  }, [shiftId]);

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
