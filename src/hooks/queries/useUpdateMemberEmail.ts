"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LedenbeheerLid } from "./useAlleLeden";

/** Error codes `update_member_email` (0008_ledenbeheer_email.sql) actually
 *  raises. Anything else valt terug op "unknown". Geen eis dat het lid niet
 *  gearchiveerd is — zie docs/features/ledenbeheer-email.md → Randgevallen
 *  "Gearchiveerd lid, e-mailadres wijzigen". */
export type UpdateMemberEmailErrorCode =
  | "member_not_found"
  | "invalid_email"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: UpdateMemberEmailErrorCode };

function toErrorCode(message: string | undefined): UpdateMemberEmailErrorCode {
  if (
    message === "member_not_found" ||
    message === "invalid_email" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useUpdateMemberEmail() {
  const [state, setState] = useState<State>({ status: "idle" });

  /** `email` null/leeg -> stuurt `p_email = null` (of een leeg string, de
   *  RPC behandelt leeg/whitespace-only hetzelfde als null — "e-mailadres
   *  wissen", zie docs/features/ledenbeheer-email.md → Randgevallen).
   *
   *  Retourneert de errorCode direct in het resultaat i.p.v. de aanroeper
   *  `errorCode` uit deze hook's state te laten lezen na de `await` — dat
   *  zou een stale closure zijn: `setState` plant alleen een volgende
   *  render, de `emailMutation`-referentie in de aanroepende component is
   *  nog die van de render vóór deze aanroep (Codex-reviewbevinding op
   *  PR #59, `LidBeherenOverlay.tsx`'s `member_not_found`-race-afhandeling
   *  las hierdoor altijd de oude errorCode). */
  async function updateMemberEmail(
    memberId: string,
    email: string | null
  ): Promise<
    { member: LedenbeheerLid; errorCode: null } | { member: null; errorCode: UpdateMemberEmailErrorCode }
  > {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // update_member_email returns `members` (single row, not `setof
      // members`) — zie useCreateProduct.ts voor waarom geen
      // .single()/.maybeSingle() nodig is.
      const { data, error } = await supabase.rpc("update_member_email", {
        p_member_id: memberId,
        p_email: email,
      });

      if (error) {
        const code = toErrorCode(error.message);
        setState({ status: "error", code });
        return { member: null, errorCode: code };
      }
      setState({ status: "idle" });
      return {
        member: {
          id: data.id as string,
          name: data.name as string,
          role: data.role as LedenbeheerLid["role"],
          balanceCents: data.balance_cents as number,
          archived: data.archived as boolean,
          // update_member_email raakt auth_user_id/pin_hash nooit — zelfde
          // reden als de overige ledenbeheer-RPC-hooks om deze mee te
          // geven. `has_pin` (generated column) i.p.v. `pin_hash`
          // (0010_pin_hash_kolombeveiliging.sql scrubt pin_hash in de
          // RPC-return naar null, ook voor deze RPC).
          hasAccount: data.auth_user_id !== null,
          hasPin: data.has_pin as boolean,
          email: data.email as string | null,
          // update_member_email raakt invited_at nooit — meegeven vanuit de
          // teruggegeven rij, zelfde reden als hasAccount/hasPin hierboven
          // (0012_lid_account_uitnodigen.sql).
          invitedAt: data.invited_at as string | null,
        },
        errorCode: null,
      };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      setState({ status: "error", code });
      return { member: null, errorCode: code };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    updateMemberEmail,
    reset: () => setState({ status: "idle" }),
  };
}
