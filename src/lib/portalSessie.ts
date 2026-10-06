import { loadErrorMessage } from "./loadErrors.ts";

/**
 * Pure beslislogica van `usePortalSession` (docs/features/
 * portal-sessielookup-laadfout.md, #115): geen React, geen Supabase. De hook
 * levert de uitkomst van een `members`-lookup; dit bepaalt de volgende staat.
 *
 * Kern: een laadfout is geen "niet gekoppeld". `denied` betekent uitsluitend
 * "lookup geslaagd, geen `members`-rij"; een mislukte lookup is `error`, en
 * een mislukte *achtergrond*lookup (de sessie was al bevestigd) verandert
 * niets.
 */

export type PortalMemberRole = "lid" | "bardienst" | "beheerder";

export type PortalSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "denied"; message: string }
  | { status: "error"; message: string; bezig: boolean }
  | {
      status: "signed-in";
      userId: string;
      email: string;
      name: string;
      role: PortalMemberRole;
      archived: boolean;
    };

export const DENIED_MESSAGE = "Dit account is niet gekoppeld aan een lid.";
export const LOAD_ERROR_WHAT = "Kan je account niet laden.";

export type LookupUitkomst =
  | {
      soort: "rij";
      userId: string;
      email: string;
      rij: { name: string; role: PortalMemberRole; archived: boolean };
    }
  | {
      soort: "geen-rij";
      userId: string;
      /**
       * Uitkomst van `bevestigSessieOfMeldAf` (ADR 0022,
       * docs/features/sessie-na-afmelden.md → keuze 9): `false` betekent een
       * elders beëindigde sessie, die de hook al lokaal heeft afgemeld.
       */
      sessieBevestigd: boolean;
    }
  | { soort: "fout"; userId: string; err: unknown };

/** Achtergrond: de huidige staat is `signed-in` met dezelfde `userId`. */
export function isAchtergrondlookup(huidig: PortalSessionState, userId: string): boolean {
  return huidig.status === "signed-in" && huidig.userId === userId;
}

/** Beslistabel uit "Gedrag 4" van de spec. */
export function volgendeSessieStaat(
  huidig: PortalSessionState,
  uitkomst: LookupUitkomst,
): PortalSessionState {
  const achtergrond = isAchtergrondlookup(huidig, uitkomst.userId);
  switch (uitkomst.soort) {
    case "rij":
      return {
        status: "signed-in",
        userId: uitkomst.userId,
        email: uitkomst.email,
        name: uitkomst.rij.name,
        role: uitkomst.rij.role,
        archived: uitkomst.rij.archived,
      };
    case "geen-rij":
      // Lege eigen rij met een sessie die GoTrue niet meer kent: geen
      // "niet gekoppeld" maar uitgelogd (ADR 0022, keuze 9).
      if (!uitkomst.sessieBevestigd) return { status: "signed-out" };
      return { status: "denied", message: DENIED_MESSAGE };
    case "fout":
      if (achtergrond) return huidig;
      return foutStaat(uitkomst.err);
  }
}

export function foutStaat(err: unknown): PortalSessionState {
  return { status: "error", message: loadErrorMessage(LOAD_ERROR_WHAT, err), bezig: false };
}

/**
 * Een mislukte `getSession()` (netwerk/5xx): met een bevestigde sessie
 * (`signed-in`) blijft het dashboard staan (spec Gedrag 4), anders `error`.
 */
export function sessieOphaalFoutStaat(huidig: PortalSessionState, err: unknown): PortalSessionState {
  return huidig.status === "signed-in" ? huidig : foutStaat(err);
}

/** Een retry vanuit de foutstaat: de status blijft `error` (focus blijft op de knop). */
export function metRetryBezig(huidig: PortalSessionState): PortalSessionState {
  return huidig.status === "error" ? { ...huidig, bezig: true } : huidig;
}

/** Een resultaat van een oudere lookup-ronde wordt genegeerd. */
export function isActueleRonde(ronde: number, huidigeRonde: number): boolean {
  return ronde === huidigeRonde;
}
