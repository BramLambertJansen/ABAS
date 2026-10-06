"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { runMoneyRequest, isMoneyRequestError, type MoneyRequestErrorCode } from "@/lib/moneyRequest";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";
import { reportClientError } from "@/lib/clientErrors";
import type { LedenbeheerLid } from "./useAlleLeden";

/** Error codes `create_member` (0007_ledenbeheer.sql, uitgebreid in
 *  0008_ledenbeheer_email.sql) actually raises. Anything else (network
 *  failure, unexpected server error) valt terug op "unknown". Zelfde
 *  patroon als useCreateProduct.ts. `invalid_email` — nieuw, zie
 *  docs/features/ledenbeheer-email.md → RPC's. */
export type CreateMemberErrorCode =
  | SessionErrorCode
  | MoneyRequestErrorCode
  | "invalid_name"
  | "invalid_starting_balance"
  | "invalid_email"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: CreateMemberErrorCode };

function toErrorCode(message: string | undefined): CreateMemberErrorCode {
  if (isSessionErrorCode(message)) { notifySessionCode(message); return message; }
  if (isMoneyRequestError(message)) return message;
  if (
    message === "invalid_name" ||
    message === "invalid_starting_balance" ||
    message === "invalid_email" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useCreateMember() {
  const [state, setState] = useState<State>({ status: "idle" });

  /** `startingBalanceCents` null -> stuurt `p_starting_balance_cents = null`
   *  ("geen startsaldo", de RPC behandelt dat gelijk aan 0 — zie
   *  docs/features/ledenbeheer.md → Schermflow stap 2). `email` null ->
   *  stuurt `p_email = null` ("geen e-mailadres", zelfde
   *  leeg-veld-stuurt-null-patroon, zie
   *  docs/features/ledenbeheer-email.md → Schermflow stap 1). */
  async function createMember(
    name: string,
    startingBalanceCents: number | null,
    email: string | null
  ): Promise<LedenbeheerLid | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // create_member returns `members` (single row, not `setof members`) —
      // zie useCreateProduct.ts voor waarom geen .single()/.maybeSingle()
      // nodig is.
      const { data, error } = await runMoneyRequest(supabase, "create_member", {
        p_name: name,
        p_starting_balance_cents: startingBalanceCents,
        p_email: email,
      });

      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useCreateMember", error);
        setState({ status: "error", code });
        return null;
      }
      setState({ status: "idle" });
      return memberFromRpc(data as Record<string, unknown>);
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useCreateMember", err);
      setState({ status: "error", code });
      return null;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    createMember,
    reset: () => setState({ status: "idle" }),
  };
}

/** Shared mapping for normal creation and a confirmed recovery receipt. */
export function memberFromRpc(member: Record<string, unknown>): LedenbeheerLid {
      return {
        id: member.id as string,
        name: member.name as string,
        role: member.role as LedenbeheerLid["role"],
        balanceCents: member.balance_cents as number,
        archived: member.archived as boolean,
        // create_member zet role altijd op 'lid' met pin_hash/auth_user_id
        // op null (0007_ledenbeheer.sql) — meegeven vanuit de teruggegeven
        // rij zelf (niet hardcoded false) zodat dit niet stilletjes
        // losraakt van wat de RPC daadwerkelijk doet. `has_pin` (generated
        // column) i.p.v. `pin_hash` (0010_pin_hash_kolombeveiliging.sql
        // scrubt pin_hash in de RPC-return naar null).
        hasAccount: member.auth_user_id !== null,
        hasPin: member.has_pin as boolean,
        email: member.email as string | null,
        // create_member zet invited_at nooit (0012_lid_account_uitnodigen.sql
        // — een net aangemaakt lid heeft role 'lid', dus nooit eligible voor
        // een invite, zie docs/features/lid-account-invite.md → Betrokken
        // shell(s)). Meegeven vanuit de rij zelf, niet hardcoded null,
        // zelfde reden als hasAccount/hasPin hierboven.
        invitedAt: member.invited_at as string | null,
      };
}
