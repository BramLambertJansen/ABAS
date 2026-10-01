"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import {
  HEARTBEAT_MIN_INTERVAL_MS,
  isSessionErrorCode,
  notifySessionCode,
  shouldSendHeartbeat,
} from "@/lib/barSessie";

/**
 * De hartslag van een bar- of beheersessie (`touch_bar_session`, 0028;
 * docs/features/dienst-per-sessie.md → Inactiviteit): elke tik of toets op
 * het scherm zet `last_activity_at`, hooguit één keer per minuut. Een scherm
 * dat alleen openstaat telt niet. De RPC weigert een beëindigde of inactieve
 * sessie; die uitkomst gaat als sessiecode naar de centrale afhandeling
 * (BarSessieProvider), die de toestand ververst en de melding toont.
 *
 * Alleen actief als `active` waar is: op het hervatscherm mag een tik nog
 * niet als activiteit tellen ("Pas na 'Verder' volgt de hartslag").
 */
export function useBarHartslag(active: boolean): void {
  const lastSentAt = useRef<number | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!active) {
      lastSentAt.current = null;
      return;
    }

    async function send() {
      if (inFlight.current) return;
      inFlight.current = true;
      lastSentAt.current = Date.now();
      try {
        const supabase = createClient();
        const { error } = await supabase.rpc("touch_bar_session");
        if (error) {
          if (isSessionErrorCode(error.message)) {
            notifySessionCode(error.message);
          } else {
            // Een mislukte hartslag is geen reden voor een melding: de
            // volgende tik probeert het opnieuw.
            reportClientError(supabase, "useBarHartslag", error);
            lastSentAt.current = null;
          }
        }
      } catch (err) {
        reportClientError(createClient, "useBarHartslag", err);
        lastSentAt.current = null;
      } finally {
        inFlight.current = false;
      }
    }

    function onActivity() {
      if (shouldSendHeartbeat(lastSentAt.current, Date.now(), HEARTBEAT_MIN_INTERVAL_MS)) {
        void send();
      }
    }

    // Capture: ook een tik die een component zelf tegenhoudt, is een tik.
    document.addEventListener("pointerdown", onActivity, true);
    document.addEventListener("keydown", onActivity, true);
    return () => {
      document.removeEventListener("pointerdown", onActivity, true);
      document.removeEventListener("keydown", onActivity, true);
    };
  }, [active]);
}
