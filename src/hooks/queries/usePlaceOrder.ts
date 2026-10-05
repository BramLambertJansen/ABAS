"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { runMoneyRequest, isMoneyRequestError, type MoneyRequestErrorCode } from "@/lib/moneyRequest";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Error codes `place_order` (0001_init.sql, 0029) actually raises, per
 *  docs/features/verkoop.md → RPC's / Randgevallen. Anything else (network
 *  failure, unexpected server error) falls through to "unknown". Same
 *  pattern as useStartShift.ts → StartShiftErrorCode. *
 *  Sinds dienst-per-sessie (0028/0029) is `no_bar_role` niet meer "dit is een
 *  lid-sessie" (dat is nu `no_bar_session`) maar "het lid van deze bar-sessie
 *  is gearchiveerd of heeft geen bar-rol meer". De zes sessiecodes van de
 *  guard (`SessionErrorCode`: no_bar_session, session_ended,
 *  session_inactive, wrong_mode, no_bar_role, session_not_on_shift) blijven
 *  bekende domeinuitkomsten, niet gemeld aan `client_errors`, en gaan naar
 *  de centrale afhandeling (`notifySessionCode`, src/lib/barSessie.ts): één
 *  melding voor de hele bar in plaats van een inline foutregel per scherm. */
export type PlaceOrderErrorCode =
  | MoneyRequestErrorCode
  | SessionErrorCode
  | "shift_not_open"
  | "served_by_not_on_shift"
  | "empty_order"
  | "invalid_qty"
  | "product_not_available"
  | "member_not_found"
  | "insufficient_balance"
  | "unknown";

const KNOWN_CODES: PlaceOrderErrorCode[] = [
  "shift_not_open",
  "served_by_not_on_shift",
  "empty_order",
  "invalid_qty",
  "product_not_available",
  "member_not_found",
  "insufficient_balance",
];

function toErrorCode(message: string | undefined): PlaceOrderErrorCode {
  if (isMoneyRequestError(message)) return message;
  if (isSessionErrorCode(message)) {
    notifySessionCode(message);
    return message;
  }
  if (message && (KNOWN_CODES as string[]).includes(message)) {
    return message as PlaceOrderErrorCode;
  }
  return "unknown";
}

export type PlaceOrderLine = { productId: string; qty: number };

/** Discriminated result instead of a plain boolean (unlike
 *  useAddShiftMember/useStartShift): the caller needs the server-computed
 *  `total_cents` for the afrekenbevestiging on success, and the exact
 *  error code right away (not a render cycle later) on failure, to decide
 *  which follow-up refetch(es) to trigger — see
 *  docs/features/verkoop.md → Randgevallen. */
export type PlaceOrderResult =
  | { ok: true; totalCents: number }
  | { ok: false; code: PlaceOrderErrorCode };

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: PlaceOrderErrorCode };

/** `place_order`-mutatiehook. De client stuurt uitsluitend product-ids,
 *  aantallen, het gekozen lid en `served_by` mee — nooit een berekend
 *  totaal (CLAUDE.md → Architectuurbeslissingen); het bedrag in het
 *  resultaat komt van de RPC-response. */
export function usePlaceOrder() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function placeOrder(
    shiftId: string,
    memberId: string,
    lines: PlaceOrderLine[],
    servedBy: string
  ): Promise<PlaceOrderResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { data, error } = await runMoneyRequest(supabase, "place_order", {
        p_shift_id: shiftId,
        p_member_id: memberId,
        p_lines: lines.map((line) => ({
          product_id: line.productId,
          qty: line.qty,
        })),
        p_served_by: servedBy,
      });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "usePlaceOrder", error);
        setState({ status: "error", code });
        return { ok: false, code };
      }
      setState({ status: "idle" });
      const order = data as { total_cents: number };
      return { ok: true, totalCents: order.total_cents };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "usePlaceOrder", err);
      setState({ status: "error", code });
      return { ok: false, code };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    placeOrder,
    reset: () => setState({ status: "idle" }),
  };
}
