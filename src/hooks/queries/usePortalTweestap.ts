"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";
import { logLocalError } from "@/lib/clientErrors";
import { geverifieerdeTotp, onafgemaakteTotp, toCodeFout, type CodeFout } from "@/lib/mfa";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; aan: boolean };

export type TweestapStart =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false };

/**
 * Tweestapsverificatie in de portal, tabblad Account (docs/features/
 * beheer-tweede-factor.md → Schermflow, ADR 0017). Alleen voor een
 * beheerder (besloten, 5): de aanroeper geeft `enabled` alleen dan.
 *
 * - `aan`: het account heeft een geverifieerde TOTP-factor.
 * - `start()`: een niet-afgemaakte factor eerst weg (zodat instellen altijd
 *   opnieuw kan), dan `mfa.enroll({ factorType: 'totp' })`: QR-code en
 *   geheime sleutel.
 * - `bevestig(factorId, code)`: `challenge` + `verify`. Daarna is de factor
 *   geverifieerd en de portal-sessie aal2.
 *
 * Geen knop om de factor uit te zetten: een verloren factor zet Bram terug
 * via het Supabase-dashboard (besloten, 4). Met `portalClient` (ADR 0009).
 */
export function usePortalTweestap(enabled: boolean) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const { data, error } = await createClient().auth.mfa.listFactors();
        if (cancelled) return;
        if (error || !data) {
          logLocalError("usePortalTweestap", error?.message ?? "geen factoren");
          setState({ status: "error" });
          return;
        }
        setState({ status: "ready", aan: geverifieerdeTotp(data.all) !== null });
      } catch (err) {
        logLocalError("usePortalTweestap", err);
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  const start = useCallback(async (): Promise<TweestapStart> => {
    try {
      const mfa = createClient().auth.mfa;
      const { data: lijst, error: lijstFout } = await mfa.listFactors();
      if (lijstFout || !lijst) throw lijstFout ?? new Error("geen factoren");
      for (const factorId of onafgemaakteTotp(lijst.all)) {
        const { error } = await mfa.unenroll({ factorId });
        if (error) throw error;
      }
      const { data, error } = await mfa.enroll({ factorType: "totp" });
      if (error || !data) throw error ?? new Error("enroll gaf niets terug");
      return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
    } catch (err) {
      logLocalError("usePortalTweestap (enroll)", err);
      return { ok: false };
    }
  }, []);

  const bevestig = useCallback(async (factorId: string, code: string): Promise<CodeFout | null> => {
    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) {
        const fout = toCodeFout(error);
        if (fout === "unknown") logLocalError("usePortalTweestap (verify)", error.message);
        return fout;
      }
      return null;
    } catch (err) {
      logLocalError("usePortalTweestap (verify)", err);
      return "unknown";
    }
  }, []);

  return {
    ...state,
    start,
    bevestig,
    refetch: () => setTick((t) => t + 1),
  };
}
