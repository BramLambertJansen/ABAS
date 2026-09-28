"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import type { LedenbeheerLid } from "./useAlleLeden";

/** Error codes `set_member_role` (0007_ledenbeheer.sql) actually raises.
 *  Anything else valt terug op "unknown". `self_demote_forbidden` — zie
 *  docs/features/ledenbeheer.md → Randgevallen — is nieuw t.o.v. het
 *  assortimentbeheer-precedent (geen zelfreferentie-risico daar).
 *  `invalid_role` is een server-fallback (de UI-select biedt zelf al
 *  alleen de drie geldige waarden aan). */
export type SetMemberRoleErrorCode =
  | "member_not_found"
  | "invalid_role"
  | "self_demote_forbidden"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: SetMemberRoleErrorCode };

function toErrorCode(message: string | undefined): SetMemberRoleErrorCode {
  if (
    message === "member_not_found" ||
    message === "invalid_role" ||
    message === "self_demote_forbidden" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useSetMemberRole() {
  const [state, setState] = useState<State>({ status: "idle" });

  /** Client stuurt de expliciete gewenste rol als tekst — zelfde stijl als
   *  useSetMemberArchived's expliciete eindstaat. */
  async function setMemberRole(
    memberId: string,
    role: LedenbeheerLid["role"]
  ): Promise<LedenbeheerLid | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // set_member_role returns `members` (single row, not `setof
      // members`) — zie useCreateProduct.ts voor waarom geen
      // .single()/.maybeSingle() nodig is.
      const { data, error } = await supabase.rpc("set_member_role", {
        p_member_id: memberId,
        p_role: role,
      });

      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useSetMemberRole", error);
        setState({ status: "error", code });
        return null;
      }
      setState({ status: "idle" });
      return {
        id: data.id as string,
        name: data.name as string,
        role: data.role as LedenbeheerLid["role"],
        balanceCents: data.balance_cents as number,
        archived: data.archived as boolean,
        // set_member_role raakt auth_user_id/pin_hash/email nooit — zelfde
        // reden als useUpdateMemberName.ts om deze mee te geven. Ook
        // relevant hier: een rolwijziging naar/van 'lid' bepaalt of
        // LidBeherenOverlay's "Inloggegevens"-sectie zichtbaar is
        // (docs/features/auth-methode-per-lid.md → Schermflow stap 7), de
        // onderliggende hasAccount/hasPin-waarden zelf wijzigen niet door
        // deze RPC. `has_pin` (generated column) i.p.v. `pin_hash`
        // (0010_pin_hash_kolombeveiliging.sql scrubt pin_hash in de
        // RPC-return naar null).
        hasAccount: data.auth_user_id !== null,
        hasPin: data.has_pin as boolean,
        email: data.email as string | null,
        // set_member_role raakt invited_at nooit — meegeven vanuit de
        // teruggegeven rij, zelfde reden als hasAccount/hasPin hierboven
        // (0012_lid_account_uitnodigen.sql).
        invitedAt: data.invited_at as string | null,
      };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useSetMemberRole", err);
      setState({ status: "error", code });
      return null;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    setMemberRole,
    reset: () => setState({ status: "idle" }),
  };
}
