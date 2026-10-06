"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { runMoneyRequest, isMoneyRequestError, type MoneyRequestErrorCode } from "@/lib/moneyRequest";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";

/** Error codes `top_up` (0001_init.sql, 0016, 0029) actually raises, per
 *  docs/features/opwaarderen.md → RPC's / Randgevallen. Anything else
 *  (network failure, unexpected server error) falls through to "unknown".
 *  Same pattern as usePlaceOrder.ts → PlaceOrderErrorCode.
 *
 *  `self_top_up_forbidden` (A4, 0029): een opwaardering naar het lid van de
 *  ingelogde sessie, in alle standen.
 *
 *  Sinds dienst-per-sessie (0028/0029) is `no_bar_role` niet meer "dit is een
 *  lid-sessie" (dat is nu `no_bar_session`) maar "het lid van deze bar-sessie
 *  is gearchiveerd of heeft geen bar-rol meer". De zes sessiecodes van de
 *  guard (`SessionErrorCode`: no_bar_session, session_ended,
 *  session_inactive, wrong_mode, no_bar_role, session_not_on_shift) blijven
 *  bekende domeinuitkomsten, niet gemeld aan `client_errors`, en gaan naar
 *  de centrale afhandeling (`notifySessionCode`, src/lib/barSessie.ts): één
 *  melding voor de hele bar in plaats van een inline foutregel per scherm. */
export type TopUpErrorCode =
  | MoneyRequestErrorCode
  | SessionErrorCode
  | "self_top_up_forbidden"
  | "shift_not_open"
  | "served_by_not_on_shift"
  | "invalid_amount"
  | "amount_exceeds_max"
  | "member_not_found"
  | "unknown";

const KNOWN_CODES: TopUpErrorCode[] = [
  "self_top_up_forbidden",
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
  if (isMoneyRequestError(message)) return message;
  if (isSessionErrorCode(message)) {
    notifySessionCode(message);
    return message;
  }
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
      const { data, error } = await runMoneyRequest(supabase, "top_up", {
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
