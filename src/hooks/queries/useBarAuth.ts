"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logLocalError } from "@/lib/clientErrors";
import { sessionIdUitAccessToken } from "@/lib/apparaat";

/**
 * Heeft deze browser een Supabase-sessie? Dat is iets anders dan een
 * geregistreerde bar-sessie (`useMijnDienst`): een e-maillogin op `/beheer`
 * geeft eerst een Supabase-sessie, en pas na de modus-keuze een bar-sessie.
 *
 * De login vanaf de namenlijst gebeurt server-side (src/lib/barLogin.ts);
 * de cookies gaan mee met de response, maar de browser-client krijgt daar
 * geen `onAuthStateChange` van. Na zo'n login roept de aanroeper daarom
 * `refresh()` aan, dat de cookies opnieuw leest.
 *
 * `sessionId` is het claim `session_id` uit het access token: de sleutel van
 * de bar-sessie en de waarde van het hervat-cookie (ADR 0017). Na een
 * tweede factor blijft het gelijk; alleen de aal stijgt.
 */
export type BarAuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string; sessionId: string | null };

type SessieLike = { user?: { id: string } | null; access_token?: string } | null;

function naarState(session: SessieLike): BarAuthState {
  return session?.user
    ? { status: "signed-in", userId: session.user.id, sessionId: sessionIdUitAccessToken(session.access_token) }
    : { status: "signed-out" };
}

export function useBarAuth(): BarAuthState & {
  /** Leest de cookies opnieuw (na een server-side login). Geeft het
   *  `session_id` van de sessie terug, of `null`. */
  refresh: () => Promise<string | null>;
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
      const volgende = naarState(session);
      setState(volgende);
      return volgende.status === "signed-in" ? volgende.sessionId : null;
    } catch (err) {
      // createClient() gooit als Supabase niet geconfigureerd is; zonder
      // client is er geen sessie om te tonen.
      logLocalError("useBarAuth", err);
      setState({ status: "signed-out" });
      return null;
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
        setState(naarState(session));
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
