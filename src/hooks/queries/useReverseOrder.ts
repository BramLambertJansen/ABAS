"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Foutcodes van reverse_order_at_bar / reverse_order_as_admin
 *  (0020_bestelling_terugdraaien.sql, docs/features/
 *  bestelling-terugdraaien.md → Foutcodes). Alles daarbuiten (netwerk,
 *  onverwachte serverfout) valt onder "unknown". Zelfde patroon als
 *  useTopUp.ts → TopUpErrorCode. */
export type ReverseOrderErrorCode =
  // alleen bar
  | "shift_not_open"
  | "order_not_in_shift"
  | "reversed_by_not_on_shift"
  // alleen beheer
  | "actor_not_found"
  | "no_admin_role"
  // beide
  | "order_not_found"
  | "reason_required"
  | "reason_too_long"
  | "already_reversed"
  | "unknown";

const KNOWN_CODES: ReverseOrderErrorCode[] = [
  "shift_not_open",
  "order_not_in_shift",
  "reversed_by_not_on_shift",
  "actor_not_found",
  "no_admin_role",
  "order_not_found",
  "reason_required",
  "reason_too_long",
  "already_reversed",
];

function toErrorCode(message: string | undefined): ReverseOrderErrorCode {
  if (message && (KNOWN_CODES as string[]).includes(message)) {
    return message as ReverseOrderErrorCode;
  }
  return "unknown";
}

export type ReverseOrderResult =
  | { ok: true; refundedCents: number }
  | { ok: false; code: ReverseOrderErrorCode };

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: ReverseOrderErrorCode };

/** Gedeelde status-/aanroepafhandeling van beide RPC's. De client stuurt
 *  nooit een bedrag mee: wat er teruggeboekt wordt, bepaalt de RPC uit
 *  orders.total_cents en geeft het terug als `refunded_cents`. */
function useReverseRpc() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function call(
    fn: "reverse_order_at_bar" | "reverse_order_as_admin",
    args: Record<string, unknown>
  ): Promise<ReverseOrderResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        const code = toErrorCode(error.message);
        setState({ status: "error", code });
        return { ok: false, code };
      }
      setState({ status: "idle" });
      return {
        ok: true,
        refundedCents: (data as { refunded_cents: number }).refunded_cents,
      };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      setState({ status: "error", code });
      return { ok: false, code };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    call,
    reset: () => setState({ status: "idle" }),
  };
}

/** Bar: tijdens een open dienst, alleen een bestelling van die dienst.
 *  `reversedBy` komt uit de actieve bezetting — de RPC weigert iedereen die
 *  daar niet in staat (zelfde regel als served_by). */
export function useReverseOrderAtBar() {
  const { call, ...rest } = useReverseRpc();
  return {
    ...rest,
    reverse: (
      orderId: string,
      shiftId: string,
      reason: string,
      reversedBy: string
    ) =>
      call("reverse_order_at_bar", {
        p_order_id: orderId,
        p_shift_id: shiftId,
        p_reason: reason,
        p_reversed_by: reversedBy,
      }),
  };
}

/** Beheer: een beheerder in de eigen e-mailsessie (ADR 0002), elke
 *  bestelling. Wie het deed volgt uit auth.uid() in de RPC. */
export function useReverseOrderAsAdmin() {
  const { call, ...rest } = useReverseRpc();
  return {
    ...rest,
    reverse: (orderId: string, reason: string) =>
      call("reverse_order_as_admin", {
        p_order_id: orderId,
        p_reason: reason,
      }),
  };
}
