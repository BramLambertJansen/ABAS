"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadErrorMessage } from "@/lib/loadErrors";
import {
  lezingGeslaagd,
  lezingGestart,
  lezingMislukt,
  maakRondeGuard,
  verversInfo,
  type LezingState,
  type VerversInfo,
} from "@/lib/verversen";

/**
 * Een vaste leesfout met een eigen tekst (bv. "Log opnieuw in."): de
 * `load`-functie gooit hem, de tekst komt ongewijzigd op het scherm en gaat
 * niet naar `client_errors` (geen onverwachte fout).
 */
export class VasteLeesFout extends Error {}

export type StaleLezing<T> = {
  state: LezingState<T>;
  ververs: VerversInfo;
  /** Start een ronde; een lopende ronde wordt niet opnieuw gestart. */
  refetch: () => void;
};

/**
 * Interne machine van de portal-leeshooks (`usePortalBalance`,
 * `usePortalTransactions`, `usePortalAppSettings`) — docs/features/
 * leesfouten-herstel-actuele-data.md → Gedeelde onderdelen 3. Eén keer
 * geschreven, zodat de drie hooks identiek reageren:
 *
 * - de eerste ronde laadt; daarna blijft `ready` staan tijdens en na een
 *   mislukte verversing (oude data zichtbaar, `ververs.mislukt`);
 * - een mislukte eerste ronde of retry is `error` (de knop blijft gemount);
 * - laatste-request-wint: een antwoord van een oudere ronde, of na unmount,
 *   zet niets;
 * - nooit polling: een ronde start bij mount en bij `refetch`.
 *
 * Roept zelf geen Supabase aan; de hook geeft zijn `load` mee en meldt
 * onverwachte fouten via `report` (`reportClientError`, check:policy).
 */
export function useStaleLezing<T>(opts: {
  load: () => Promise<T>;
  /** Eerste zin van de foutmelding, bv. "Kan het saldo niet laden." */
  wat: string;
  report: (err: unknown) => void;
}): StaleLezing<T> {
  const [state, setState] = useState<LezingState<T>>({ status: "loading" });
  const guardRef = useRef(maakRondeGuard());
  const loopt = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback(async () => {
    const guard = guardRef.current;
    const ronde = guard.start();
    loopt.current = true;
    setState((vorige) => lezingGestart(vorige));
    try {
      const data = await optsRef.current.load();
      if (!guard.isActueel(ronde)) return;
      loopt.current = false;
      setState(lezingGeslaagd(data, Date.now()));
    } catch (err) {
      if (!guard.isActueel(ronde)) return;
      loopt.current = false;
      const message =
        err instanceof VasteLeesFout ? err.message : loadErrorMessage(optsRef.current.wat, err);
      if (!(err instanceof VasteLeesFout)) optsRef.current.report(err);
      setState((vorige) => lezingMislukt(vorige, message));
    }
  }, []);

  useEffect(() => {
    const guard = guardRef.current;
    void start();
    return () => {
      // Unmount (of strict-mode remount): een antwoord van deze ronde telt niet meer.
      guard.annuleer();
      loopt.current = false;
    };
  }, [start]);

  const refetch = useCallback(() => {
    if (loopt.current) return;
    void start();
  }, [start]);

  return { state, ververs: verversInfo(state), refetch };
}
