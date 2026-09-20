"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LedenbeheerLid } from "./useAlleLeden";

/** Error codes `update_member_name` (0007_ledenbeheer.sql) actually raises.
 *  Anything else valt terug op "unknown". Geen eis dat het lid niet
 *  gearchiveerd is — zie docs/features/ledenbeheer.md → Randgevallen
 *  "Gearchiveerd lid, naam wijzigen". */
export type UpdateMemberNameErrorCode =
  | "member_not_found"
  | "invalid_name"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: UpdateMemberNameErrorCode };

function toErrorCode(message: string | undefined): UpdateMemberNameErrorCode {
  if (
    message === "member_not_found" ||
    message === "invalid_name" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useUpdateMemberName() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function updateMemberName(
    memberId: string,
    name: string
  ): Promise<LedenbeheerLid | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // update_member_name returns `members` (single row, not `setof
      // members`) — zie useCreateProduct.ts voor waarom geen
      // .single()/.maybeSingle() nodig is.
      const { data, error } = await supabase.rpc("update_member_name", {
        p_member_id: memberId,
        p_name: name,
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
        // update_member_name raakt auth_user_id/pin_hash/email nooit —
        // meegeven zodat LidBeherenOverlay's alleen-lezen
        // "Inloggegevens"-sectie (docs/features/auth-methode-per-lid.md)
        // niet stilletjes leeg valt na een naamwijziging (spec:
        // hasAccount/hasPin/email zijn weergavevelden op elke
        // LedenbeheerLid, niet alleen op de initiële lijst-load). `has_pin`
        // (generated column) i.p.v. `pin_hash`
        // (0010_pin_hash_kolombeveiliging.sql scrubt pin_hash in de
        // RPC-return naar null).
        hasAccount: data.auth_user_id !== null,
        hasPin: data.has_pin as boolean,
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
    updateMemberName,
    reset: () => setState({ status: "idle" }),
  };
}
