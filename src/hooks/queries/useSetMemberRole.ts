"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
    setMemberRole,
    reset: () => setState({ status: "idle" }),
  };
}
