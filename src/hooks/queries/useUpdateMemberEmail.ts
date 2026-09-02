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
   *  wissen", zie docs/features/ledenbeheer-email.md → Randgevallen). */
  async function updateMemberEmail(
    memberId: string,
    email: string | null
  ): Promise<LedenbeheerLid | null> {
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
        setState({ status: "error", code: toErrorCode(error.message) });
        return null;
      }
      setState({ status: "idle" });
      return {
        id: data.id as string,
        name: data.name as string,
        role: data.role as LedenbeheerLid["role"],
        balanceCents: data.balance_cents as number,
        archived: data.archived as boolean,
        email: data.email as string | null,
      };
    } catch (err) {
      setState({
        status: "error",
        code: toErrorCode(err instanceof Error ? err.message : undefined),
      });
      return null;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    updateMemberEmail,
    reset: () => setState({ status: "idle" }),
  };
}
