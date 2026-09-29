"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";

/** Error codes `top_up` (0001_init.sql; `no_bar_role` sinds
 *  0023_bar_rpcs_weigeren_lid.sql, lid-sessie geweigerd) actually raises, per
 *  docs/features/opwaarderen.md → RPC's / Randgevallen. Anything else
 *  (network failure, unexpected server error) falls through to "unknown".
 *  Same pattern as usePlaceOrder.ts → PlaceOrderErrorCode. */
export type TopUpErrorCode =
  | "no_bar_role"
  | "shift_not_open"
  | "served_by_not_on_shift"
  | "invalid_amount"
  | "amount_exceeds_max"
  | "member_not_found"
  | "unknown";

const KNOWN_CODES: TopUpErrorCode[] = [
  "no_bar_role",
  "shift_not_open",
  "served_by_not_on_shift",
  "invalid_amount",
  // 0016_top_up_maximumbedrag.sql — bedrag boven de harde €500-grens.
  // Apart van invalid_amount gehouden omdat de UI de grens moet kunnen
  // noemen, zie src/features/opwaarderen/messages.ts.
  "amount_exceeds_max",
  "member_not_found",
];

function toErrorCode(message: string | undefined): TopUpErrorCode {
  if (message && (KNOWN_CODES as string[]).includes(message)) {
    return message as TopUpErrorCode;
  }
  return "unknown";
}

/** MVP is uitsluitend contant (CLAUDE.md → Domein, #10's acceptatiecriteria)
 *  — geen methodekeuze-UI, dus geen parameter op `topUp()` hiervoor. Vaste
 *  technische waarde, consistent met de Engelse errcode-conventie; de
 *  NL-UI-tekst is "contant" (zie docs/features/opwaarderen.md → Besloten).
 *  Geen check-constraint op `top_ups.method` — deze hook is vandaag de
 *  enige plek die de waarde bepaalt. */
const METHOD = "cash";

export type TopUpResult =
  | { ok: true; amountCents: number }
  | { ok: false; code: TopUpErrorCode };

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: TopUpErrorCode };

/** `top_up`-mutatiehook. De client stuurt uitsluitend het gekozen lid, een
 *  bedrag in centen en `served_by` mee — nooit een berekend saldo (CLAUDE.md
 *  → Architectuurbeslissingen). */
export function useTopUp() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function topUp(
    shiftId: string,
    memberId: string,
    amountCents: number,
    servedBy: string
  ): Promise<TopUpResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("top_up", {
        p_shift_id: shiftId,
        p_member_id: memberId,
        p_amount_cents: amountCents,
        p_method: METHOD,
        p_served_by: servedBy,
      });
      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useTopUp", error);
        setState({ status: "error", code });
        return { ok: false, code };
      }
      setState({ status: "idle" });
      const topUpRow = data as { amount_cents: number };
      return { ok: true, amountCents: topUpRow.amount_cents };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useTopUp", err);
      setState({ status: "error", code });
      return { ok: false, code };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    topUp,
    reset: () => setState({ status: "idle" }),
  };
}
