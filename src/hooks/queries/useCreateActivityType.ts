"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AlleActiviteitType } from "./useAlleActiviteitTypes";

/** Foutcodes die `create_activity_type` (0019_activiteittypes.sql)
 *  daadwerkelijk raiset. Al het andere valt terug op "unknown", zelfde
 *  patroon als useCreateProduct.ts → CreateProductErrorCode. */
export type CreateActivityTypeErrorCode =
  | "invalid_name"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: CreateActivityTypeErrorCode };

function toErrorCode(message: string | undefined): CreateActivityTypeErrorCode {
  if (
    message === "invalid_name" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useCreateActivityType() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function createActivityType(
    name: string
  ): Promise<AlleActiviteitType | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // create_activity_type geeft `activity_types` terug (één rij, geen
      // `setof`) — PostgREST levert dat als kaal JSON-object, geen
      // .single()/.maybeSingle() nodig om het uit te pakken.
      const { data, error } = await supabase.rpc("create_activity_type", {
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
    createActivityType,
    reset: () => setState({ status: "idle" }),
  };
}
