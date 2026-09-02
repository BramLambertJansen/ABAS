"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LedenbeheerLid } from "./useAlleLeden";

/** Error codes `set_member_archived` (0007_ledenbeheer.sql) actually
 *  raises. Anything else valt terug op "unknown". `self_archive_forbidden`
 *  — zie docs/features/ledenbeheer.md → Randgevallen — is nieuw t.o.v. het
 *  assortimentbeheer-precedent (geen zelfreferentie-risico daar). */
export type SetMemberArchivedErrorCode =
  | "member_not_found"
  | "self_archive_forbidden"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: SetMemberArchivedErrorCode };

function toErrorCode(message: string | undefined): SetMemberArchivedErrorCode {
  if (
    message === "member_not_found" ||
    message === "self_archive_forbidden" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useSetMemberArchived() {
  const [state, setState] = useState<State>({ status: "idle" });

  /** Client stuurt de expliciete gewenste eindstaat — nooit een "toggle",
   *  zelfde stijl als useSetProductArchived. */
  async function setMemberArchived(
    memberId: string,
    archived: boolean
  ): Promise<LedenbeheerLid | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // set_member_archived returns `members` (single row, not `setof
      // members`) — zie useCreateProduct.ts voor waarom geen
      // .single()/.maybeSingle() nodig is.
      const { data, error } = await supabase.rpc("set_member_archived", {
        p_member_id: memberId,
        p_archived: archived,
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
    setMemberArchived,
    reset: () => setState({ status: "idle" }),
  };
}
