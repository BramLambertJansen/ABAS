"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

/** Omzet + opwaarderingen voor het "Dienst afsluiten"-overzicht. Eén cijfer
 *  voor omzet, één voor opwaarderingen — geen op-rekening/pin-splitsing,
 *  zie docs/features/dienst-afsluiten.md → "Nieuwe leeshook: useShiftSummary"
 *  voor de begripsafbakening (er is vandaag maar één betaalwijze per
 *  concept). */
export type ShiftSummary = {
  /** Alleen bestellingen die niet zijn teruggedraaid
   *  (docs/features/bestelling-terugdraaien.md → Omzet). */
  salesTotalCents: number;
  orderCount: number;
  topUpsTotalCents: number;
  /** Aantal teruggedraaide bestellingen van deze dienst ("N correcties
   *  deze dienst"). */
  reversalCount: number;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: ShiftSummary };

/** Twee platte `select`s (`orders`, `top_ups`), client-side opgeteld — geen
 *  Postgres-aggregatie, geen nieuwe RPC (dit raakt geen geld-schrijfpad,
 *  zie CLAUDE.md → Architectuurbeslissingen: die gaat over schrijven, niet
 *  lezen). Zelfde "gewoon alles ophalen, geen paginering"-afweging als
 *  useMembers()/useProducts() gezien de single-club-schaal. */
export function useShiftSummary(
  shiftId: string | null
): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);
  // Laatste-request-wint: een late respons voor een oude dienst of een ander
  // lid vervangt de data van de huidige niet (docs/features/
  // leesfouten-herstel-actuele-data.md → Verouderde antwoorden).
  const request = useRef(0);

  const load = useCallback(async () => {
    const huidigeRequest = ++request.current;
    if (!shiftId) {
      setState({
        status: "ready",
        summary: {
          salesTotalCents: 0,
          orderCount: 0,
          topUpsTotalCents: 0,
          reversalCount: 0,
        },
      });
      return;
    }

    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const [ordersResult, topUpsResult] = await Promise.all([
        supabase
          .from("orders")
          .select("total_cents, order_reversals(order_id)")
          .eq("shift_id", shiftId),
        supabase
          .from("top_ups")
          .select("amount_cents")
          .eq("shift_id", shiftId),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (topUpsResult.error) throw topUpsResult.error;

      // order_reversals is een één-op-één-embed (primary key order_id):
      // object of null, al typeert de untyped client het als array.
      const isReversed = (row: { order_reversals: unknown }) =>
        Array.isArray(row.order_reversals)
          ? row.order_reversals.length > 0
          : row.order_reversals != null;
      const allOrderRows = ordersResult.data ?? [];
      const orderRows = allOrderRows.filter((row) => !isReversed(row));
      const topUpRows = topUpsResult.data ?? [];

      const salesTotalCents = orderRows.reduce(
        (sum, row) => sum + (row.total_cents as number),
        0
      );
      const topUpsTotalCents = topUpRows.reduce(
        (sum, row) => sum + (row.amount_cents as number),
        0
      );

      if (huidigeRequest !== request.current) return;
      setState({
        status: "ready",
        summary: {
          salesTotalCents,
          orderCount: orderRows.length,
          topUpsTotalCents,
          reversalCount: allOrderRows.length - orderRows.length,
        },
      });
    } catch (err) {
      if (huidigeRequest !== request.current) return;
      // Never surface the raw error on a bar tablet mid-service — log it
      // for whoever's debugging, show a fixed Dutch message at the bar.
      reportClientError(createClient, "useShiftSummary", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan het overzicht niet laden.", err),
      });
    }
  }, [shiftId]);

  useEffect(() => {
    let cancelled = false;
    const requests = request;
    load().catch(() => {
      if (!cancelled) {
        setState({ status: "error", message: "Onbekende fout." });
      }
    });
    return () => {
      cancelled = true;
      requests.current++;
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
