"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LedenbeheerLid } from "./useAlleLeden";

/** Error codes `create_member` (0007_ledenbeheer.sql) actually raises.
 *  Anything else (network failure, unexpected server error) valt terug op
 *  "unknown". Zelfde patroon als useCreateProduct.ts. */
export type CreateMemberErrorCode =
  | "invalid_name"
  | "invalid_starting_balance"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: CreateMemberErrorCode };

function toErrorCode(message: string | undefined): CreateMemberErrorCode {
  if (
    message === "invalid_name" ||
    message === "invalid_starting_balance" ||
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
   *  docs/features/ledenbeheer.md → Schermflow stap 2). */
  async function createMember(
    name: string,
    startingBalanceCents: number | null
  ): Promise<LedenbeheerLid | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // create_member returns `members` (single row, not `setof members`) —
      // zie useCreateProduct.ts voor waarom geen .single()/.maybeSingle()
      // nodig is.
      const { data, error } = await supabase.rpc("create_member", {
        p_name: name,
        p_starting_balance_cents: startingBalanceCents,
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
    createMember,
    reset: () => setState({ status: "idle" }),
  };
}
