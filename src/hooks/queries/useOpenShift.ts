"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * There is at most one open shift at a time on the shared bar-tablet
 * session (docs/ARCHITECTURE.md → "Shared bar-tablet session mechanism").
 * The database doesn't enforce that yet server-side — see issue #29 — this
 * hook just reads whatever's actually open.
 */
export type OpenShift = {
  id: string;
  startedByName: string;
  startedAt: string;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; shift: OpenShift | null };

export function useOpenShift(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      // `members!started_by(...)` disambiguates the embed: PostgREST sees
      // two paths from `shifts` to `members` (the direct `started_by` FK,
      // and an indirect one via `shift_members`) and refuses an unqualified
      // `members(...)` embed (PGRST201) — first surfaced by a real CI run
      // (docs/ARCHITECTURE.md → "Local/CI device account"), never caught
      // before because RLS/auth failures always masked it earlier.
      const { data, error } = await supabase
        .from("shifts")
        .select("id, started_at, members!started_by(name)")
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // No generated Database type here (see src/lib/supabase/client.ts) —
      // the untyped client can't know shifts→members is a to-one embed, so
      // it infers `members` as an array shape. It's actually a single
      // object at runtime (one FK, one row); go through `unknown` since TS
      // won't accept the direct cast.
      const startedByMember = data?.members as unknown as
        | { name: string }
        | null
        | undefined;

      setState({
        status: "ready",
        shift: data
          ? {
              id: data.id as string,
              startedAt: data.started_at as string,
              startedByName: startedByMember?.name ?? "onbekend",
            }
          : null,
      });
    } catch (err) {
      // Never surface the raw error (package name, URLs, stack) on a bar
      // tablet mid-service — log it for whoever's debugging, show a fixed
      // Dutch message to whoever's standing at the bar.
      console.error("useOpenShift:", err);
      setState({
        status: "error",
        message: "Kan niet controleren of er al een dienst open is. Controleer de verbinding.",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      // load() already sets an error state itself; this only guards
      // against an unhandled rejection if something throws outside its
      // own try/catch (shouldn't happen, belt and braces).
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
