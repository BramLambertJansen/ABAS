"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logLocalError } from "@/lib/clientErrors";

/**
 * Heeft deze browser een Supabase-sessie? Dat is iets anders dan een
 * geregistreerde bar-sessie (`useMijnDienst`): een e-maillogin op `/beheer`
 * geeft eerst een Supabase-sessie, en pas na de modus-keuze een bar-sessie.
 *
 * De login vanaf de namenlijst gebeurt server-side (src/lib/barLogin.ts);
 * de cookies gaan mee met de response, maar de browser-client krijgt daar
 * geen `onAuthStateChange` van. Na zo'n login roept de aanroeper daarom
 * `refresh()` aan, dat de cookies opnieuw leest.
 */
export type BarAuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string };

export function useBarAuth(): BarAuthState & {
  /** Leest de cookies opnieuw (na een server-side login). */
  refresh: () => Promise<void>;
  /** Sluit alleen deze sessie lokaal en server-side (`scope: "local"`), nooit
   *  de andere apparaten van dit lid. */
  signOutLocal: () => Promise<void>;
} {
  const [state, setState] = useState<BarAuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setState(session?.user ? { status: "signed-in", userId: session.user.id } : { status: "signed-out" });
    } catch (err) {
      // createClient() gooit als Supabase niet geconfigureerd is; zonder
      // client is er geen sessie om te tonen.
      logLocalError("useBarAuth", err);
      setState({ status: "signed-out" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    try {
      const supabase = createClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        setState(session?.user ? { status: "signed-in", userId: session.user.id } : { status: "signed-out" });
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch (err) {
      logLocalError("useBarAuth", err);
      setState({ status: "signed-out" });
    }
    refresh().catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refresh]);

  const signOutLocal = useCallback(async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) logLocalError("useBarAuth (signOut)", error.message);
    } catch (err) {
      logLocalError("useBarAuth (signOut)", err);
    }
    setState({ status: "signed-out" });
  }, []);

  return { ...state, refresh, signOutLocal };
}
