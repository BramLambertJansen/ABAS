"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";
import { logLocalError, reportClientError } from "@/lib/clientErrors";
import { bevestigSessieOfMeldAf } from "@/lib/sessieBevestigen";

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
 * `members`-rij rapporteert `denied`, met dezelfde neutrale melding als
 * voorheen. Let op (ADR 0012 → Beslissing 2, ADR 0019): een sessie van een
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
 */
export type PortalSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "denied"; message: string }
  | {
      status: "signed-in";
      email: string;
      name: string;
      role: PortalMemberRole;
      archived: boolean;
    };

export type PortalMemberRole = "lid" | "bardienst" | "beheerder";

const DENIED_MESSAGE = "Dit account is niet gekoppeld aan een lid.";

export function usePortalSession(): PortalSessionState & {
  signOut: () => Promise<void>;
  refetch: () => void;
} {
  const [state, setState] = useState<PortalSessionState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = createClient();

      async function resolve(userId: string, email: string) {
        try {
          const { data, error } = await supabase
            .from("members")
            .select("name, role, archived")
            .eq("auth_user_id", userId)
            .maybeSingle();
          if (cancelled) return;
          if (error) throw error;
          if (!data) {
            const bevestigd = await bevestigSessieOfMeldAf(supabase.auth, "usePortalSession");
            if (cancelled) return;
            setState(
              bevestigd
                ? { status: "denied", message: DENIED_MESSAGE }
                : { status: "signed-out" },
            );
            return;
          }
          setState({
            status: "signed-in",
            email,
            name: data.name as string,
            role: data.role as PortalMemberRole,
            archived: data.archived as boolean,
          });
        } catch (err) {
          reportClientError(supabase, "usePortalSession", err);
          if (!cancelled) {
            setState({ status: "denied", message: DENIED_MESSAGE });
          }
        }
      }

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          resolve(session.user.id, session.user.email ?? "");
        } else {
          setState({ status: "signed-out" });
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        if (session?.user) {
          resolve(session.user.id, session.user.email ?? "");
        } else {
          setState({ status: "signed-out" });
        }
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch (err) {
      logLocalError("usePortalSession", err);
      setState({ status: "signed-out" });
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
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      logLocalError("usePortalSession (signOut)", err);
    }
  }

  return { ...state, signOut, refetch: () => setTick((t) => t + 1) };
}
