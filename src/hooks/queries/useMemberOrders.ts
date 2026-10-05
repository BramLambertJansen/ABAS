"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

/** Eén bestelling van een lid, voor "bestelling terugdraaien" in beheer
 *  (docs/features/bestelling-terugdraaien.md → Beheer). */
export type MemberOrder = {
  id: string;
  createdAt: string;
  totalCents: number;
  itemCount: number;
  reversed: boolean;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; orders: MemberOrder[] };

/** Zoveel recente bestellingen toont de beheerlijst. Terugdraaien is voor
 *  een recente vergissing; wie verder terug moet, is een database-klus. */
export const MEMBER_ORDERS_LIMIT = 50;

/** De laatste bestellingen van één lid, nieuwste eerst, uit alle diensten
 *  (ook afgesloten — een beheerder mag die terugdraaien). Platte `select`:
 *  een beheerder-sessie leest `orders` al volledig (0015). */
export function useMemberOrders(
  memberId: string
): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);
  // Laatste-request-wint: een late respons voor een oude dienst of een ander
  // lid vervangt de data van de huidige niet (docs/features/
  // leesfouten-herstel-actuele-data.md → Verouderde antwoorden).
  const request = useRef(0);

  const load = useCallback(async () => {
    const huidigeRequest = ++request.current;
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, total_cents, order_lines(qty), order_reversals(order_id)")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(MEMBER_ORDERS_LIMIT);

      if (error) throw error;

      const orders: MemberOrder[] = (data ?? []).map((row) => {
        const lines = (row.order_lines ?? []) as unknown as { qty: number }[];
        // Eén-op-één-embed: object of null, al typeert de untyped client
        // het als array (zie useShiftLedger.ts → firstOrNull).
        const reversal = row.order_reversals as unknown;
        return {
          id: row.id as string,
          createdAt: row.created_at as string,
          totalCents: row.total_cents as number,
          itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
          reversed: Array.isArray(reversal) ? reversal.length > 0 : reversal != null,
        };
      });

      if (huidigeRequest !== request.current) return;
      setState({ status: "ready", orders });
    } catch (err) {
      if (huidigeRequest !== request.current) return;
      reportClientError(createClient, "useMemberOrders", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan de bestellingen van dit lid niet laden.", err),
      });
    }
  }, [memberId]);

  useEffect(() => {
    let cancelled = false;
    const requests = request;
    load().catch(() => {
      if (!cancelled) setState({ status: "error", message: "Onbekende fout." });
    });
    return () => {
      cancelled = true;
      requests.current++;
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
