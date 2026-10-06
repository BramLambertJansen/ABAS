"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { maakSleutelGeheugen } from "@/lib/requestId";
import type { LedenbeheerLid } from "./useAlleLeden";

/** Error codes `create_member` (0007_ledenbeheer.sql, uitgebreid in
 *  0008_ledenbeheer_email.sql) actually raises. Anything else (network
 *  failure, unexpected server error) valt terug op "unknown". Zelfde
 *  patroon als useCreateProduct.ts. `invalid_email` — nieuw, zie
 *  docs/features/ledenbeheer-email.md → RPC's. */
export type CreateMemberErrorCode =
  | "invalid_name"
  | "invalid_starting_balance"
  | "invalid_email"
  | "actor_not_found"
  | "no_admin_role"
  | "request_id_conflict"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: CreateMemberErrorCode };

function toErrorCode(message: string | undefined): CreateMemberErrorCode {
  if (
    message === "invalid_name" ||
    message === "invalid_starting_balance" ||
    message === "invalid_email" ||
    message === "actor_not_found" ||
    message === "no_admin_role" ||
    // 0042 (ADR 0023): dezelfde sleutel met een andere opdracht of lid.
    message === "request_id_conflict"
  ) {
    return message;
  }
  return "unknown";
}

export function useCreateMember() {
  const [state, setState] = useState<State>({ status: "idle" });
  // Eén sleutel per intentie (src/lib/requestId.ts, ADR 0023).
  const [sleutels] = useState(() => maakSleutelGeheugen());

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
    const requestId = sleutels.voorOpdracht([name, startingBalanceCents, email]);
    try {
      const supabase = createClient();
      // create_member returns `members` (single row, not `setof members`) —
      // zie useCreateProduct.ts voor waarom geen .single()/.maybeSingle()
      // nodig is.
      const { data, error } = await supabase.rpc("create_member", {
        p_name: name,
        p_starting_balance_cents: startingBalanceCents,
        p_email: email,
        p_request_id: requestId,
      });

      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useCreateMember", error);
        sleutels.afgerond(code === "unknown" ? "onbekend" : "definitief");
        setState({ status: "error", code });
        return null;
      }
      sleutels.afgerond("definitief");
      setState({ status: "idle" });
      return {
        id: data.id as string,
        name: data.name as string,
        role: data.role as LedenbeheerLid["role"],
        balanceCents: data.balance_cents as number,
        archived: data.archived as boolean,
        // create_member zet role altijd op 'lid' met pin_hash/auth_user_id
        // op null (0007_ledenbeheer.sql) — meegeven vanuit de teruggegeven
        // rij zelf (niet hardcoded false) zodat dit niet stilletjes
        // losraakt van wat de RPC daadwerkelijk doet. `has_pin` (generated
        // column) i.p.v. `pin_hash` (0010_pin_hash_kolombeveiliging.sql
        // scrubt pin_hash in de RPC-return naar null).
        hasAccount: data.auth_user_id !== null,
        hasPin: data.has_pin as boolean,
        email: data.email as string | null,
        // create_member zet invited_at nooit (0012_lid_account_uitnodigen.sql
        // — een net aangemaakt lid heeft role 'lid', dus nooit eligible voor
        // een invite, zie docs/features/lid-account-invite.md → Betrokken
        // shell(s)). Meegeven vanuit de rij zelf, niet hardcoded null,
        // zelfde reden als hasAccount/hasPin hierboven.
        invitedAt: data.invited_at as string | null,
      };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useCreateMember", err);
      sleutels.afgerond(code === "unknown" ? "onbekend" : "definitief");
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
