"use client";

import { useEffect, useRef, useState } from "react";
import { isAuthRetryableFetchError } from "@/lib/supabase/authErrors";
import { createClient, wisPortalSessieLokaal } from "@/lib/supabase/portalClient";
import { logLocalError, reportClientError } from "@/lib/clientErrors";
import { bevestigSessieOfMeldAf } from "@/lib/sessieBevestigen";
import {
  sessieOphaalFoutStaat,
  metRetryBezig,
  volgendeSessieStaat,
  type PortalMemberRole,
  type PortalSessionState,
} from "@/lib/portalSessie";

export type { PortalMemberRole, PortalSessionState };

/**
 * Tracks whether `/portal` has a session that resolves to a `members`-row —
 * analoog aan `useBeheerSession.ts`, eigen bestand (portalClient.ts, ADR
 * 0009, zie docs/features/portal-login.md → "Herbruik").
 *
 * Sinds ADR 0012 (docs/features/portal-profiel.md, #17, besluit 1) is de
 * portal het lid-deel voor **elke** rol: een sessie die naar een
 * `members`-rij herleidt is `signed-in`, ongeacht `role`. `role` en
 * `archived` gaan mee in de state, zodat het Account-tabblad de PIN-rij
 * alleen voor bar-rollen toont. Alleen een sessie zónder gekoppelde
 * `members`-rij (lookup geslaagd) rapporteert `denied`, met dezelfde
 * neutrale melding als voorheen. Let op (ADR 0012 → Beslissing 2, ADR 0019): een sessie van een
 * **actieve** bardienst/beheerder (gekoppeld, niet gearchiveerd) leest via
 * RLS álle `members`-rijen, ook op de portal, dus deze lookup filtert
 * expliciet op de eigen `auth_user_id` — nooit op RLS leunen.
 *
 * Geen `archived`-filter op de members-lookup, in tegenstelling tot
 * `useBeheerSession.ts`: sinds `0039_leespolicies_allowlist.sql` (ADR 0019)
 * geldt de eigen-rij-tak van de leespolicies voor iedereen, ook gearchiveerd
 * ("een gearchiveerd lid dat nog een sessie heeft moet zijn eigen historie
 * kunnen inzien") — dezelfde grens geldt hier voor de sessie-gate zelf.
 *
 * Een lege eigen rij is sinds ADR 0022 niet altijd "niet gekoppeld": een
 * token van een elders beëindigde Auth-sessie (uitgelogd, wachtwoord
 * hersteld of gewijzigd op een ander apparaat) leest niets meer. Daarom eerst
 * de sessie bij GoTrue nagaan (`bevestigSessieOfMeldAf`); is die weg, dan
 * lokaal afmelden en `signed-out` in plaats van `denied`
 * (docs/features/sessie-na-afmelden.md → keuze 9).
 *
 * Uitloggen geldt alleen voor dit apparaat (`scope: "local"`, keuze 8),
 * zoals op `/beheer` en de bar: een globale uitlog zou ook een lopende
 * bar-sessie van hetzelfde lid op de tablet beëindigen.
 *
 * Cookie-isolatie (ADR 0009) maakt dit hook onbereikbaar voor de gedeelde
 * bar-tablet-device-sessie: `sb-portal-auth-token` bestaat pas na een
 * daadwerkelijke portal-login, dus een bar-sessie levert hier altijd
 * `signed-out` op, ongeacht wat de bar-sessie zelf is (spec →
 * Cookie-isolatie, acceptatiecriterium 4).
 *
 * Laadfout (docs/features/portal-sessielookup-laadfout.md, #115): `denied`
 * betekent uitsluitend "lookup geslaagd, geen rij". Een mislukte lookup is
 * `error` (met retry via `refetch`); een mislukte lookup op de achtergrond
 * (sessie al bevestigd, zelfde `userId`) laat het dashboard staan. De
 * beslistabel staat in `src/lib/portalSessie.ts`.
 */
export function usePortalSession(): PortalSessionState & {
  signOut: () => Promise<void>;
  refetch: () => void;
} {
  const [state, setState] = useState<PortalSessionState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  // Laatste staat, voor de voorgrond/achtergrond-beslissing in async code.
  const stateRef = useRef<PortalSessionState>(state);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    // Volgordeguard (zoals useBeheerSession): alleen de nieuwste ronde mag zetten.
    let request = 0;
    // Userid waarvoor al een lookup loopt (geen tweede request, bv. bij
    // INITIAL_SESSION naast getSession()).
    let inflight: string | null = null;

    function commit(next: PortalSessionState) {
      stateRef.current = next;
      setState(next);
    }

    // Een retry vanuit de foutstaat blijft `error` (bezig), geen `loading`.
    commit(metRetryBezig(stateRef.current));

    try {
      const supabase = createClient();

      async function resolve(userId: string, email: string) {
        if (inflight === userId) return;
        const current = stateRef.current;
        if (current.status === "signed-in" && current.userId !== userId) {
          // Andere identiteit: de oude blijft niet zichtbaar.
          commit({ status: "loading" });
        }
        inflight = userId;
        const ronde = ++request;
        try {
          const { data, error } = await supabase
            .from("members")
            .select("name, role, archived")
            .eq("auth_user_id", userId)
            .maybeSingle();
          if (error) throw error;
          if (cancelled || ronde !== request) return;
          // Lege eigen rij: eerst de sessie bij GoTrue nagaan (ADR 0022,
          // keuze 9); is die weg, dan is dit apparaat al lokaal afgemeld.
          const sessieBevestigd = data
            ? true
            : await bevestigSessieOfMeldAf(supabase.auth, "usePortalSession");
          if (cancelled || ronde !== request) return;
          commit(
            volgendeSessieStaat(
              stateRef.current,
              data
                ? {
                    soort: "rij",
                    userId,
                    email,
                    rij: {
                      name: data.name as string,
                      role: data.role as PortalMemberRole,
                      archived: data.archived as boolean,
                    },
                  }
                : { soort: "geen-rij", userId, sessieBevestigd },
            ),
          );
        } catch (err) {
          reportClientError(supabase, "usePortalSession", err);
          if (cancelled || ronde !== request) return;
          commit(volgendeSessieStaat(stateRef.current, { soort: "fout", userId, err }));
        } finally {
          if (ronde === request) inflight = null;
        }
      }

      function signedOut() {
        request++;
        inflight = null;
        commit({ status: "signed-out" });
      }

      const rondeBijStart = request;
      supabase.auth
        .getSession()
        .then(({ data: { session }, error }) => {
          if (cancelled || rondeBijStart !== request) return;
          if (session?.user) {
            resolve(session.user.id, session.user.email ?? "");
          } else if (error && isAuthRetryableFetchError(error)) {
            // Netwerk of 5xx bij de token-refresh: een laadfout, geen uitlog.
            if (stateRef.current.status === "signed-in") {
              // Achtergrond: dashboard blijft staan, fout wel rapporteren.
              reportClientError(supabase, "usePortalSession (getSession)", error);
              return;
            }
            logLocalError("usePortalSession (getSession)", error);
            request++;
            commit(sessieOphaalFoutStaat(stateRef.current, error));
          } else {
            signedOut();
          }
        })
        .catch((err) => {
          if (cancelled || rondeBijStart !== request) return;
          if (stateRef.current.status === "signed-in") {
            reportClientError(supabase, "usePortalSession (getSession)", err);
            return;
          }
          logLocalError("usePortalSession (getSession)", err);
          request++;
          commit(sessieOphaalFoutStaat(stateRef.current, err));
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (session?.user) {
          resolve(session.user.id, session.user.email ?? "");
        } else if (event !== "INITIAL_SESSION") {
          signedOut();
        }
        // INITIAL_SESSION zonder sessie: getSession() beslist (signed-out of,
        // bij een retryable fetch-fout, error).
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch (err) {
      logLocalError("usePortalSession", err);
      commit({ status: "signed-out" });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [tick]);

  async function signOut() {
    try {
      const supabase = createClient();
      // Alleen dit apparaat (ADR 0022, keuze 8); wachtwoordherstel blijft
      // bewust globaal.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        // auth-js `_signOut` geeft bij een sessionError `{error}` terug vóór
        // `_removeSession()`: de cookie blijft, er komt geen SIGNED_OUT. Lokaal
        // opruimen en de sessie opnieuw lezen (leeg → signed-out, geen netwerk).
        logLocalError("usePortalSession (signOut)", error);
        wisPortalSessieLokaal();
        setTick((t) => t + 1);
      }
    } catch (err) {
      logLocalError("usePortalSession (signOut)", err);
    }
  }

  return { ...state, signOut, refetch: () => setTick((t) => t + 1) };
}
