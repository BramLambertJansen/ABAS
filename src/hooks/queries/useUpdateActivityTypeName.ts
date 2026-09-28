"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import type { AlleActiviteitType } from "./useAlleActiviteitTypes";

/** Foutcodes die `update_activity_type_name` (0019_activiteittypes.sql)
 *  daadwerkelijk raiset. Geen eis dat het type niet gearchiveerd is — zie
 *  de migratie zelf. */
export type UpdateActivityTypeNameErrorCode =
  | "activity_type_not_found"
  | "invalid_name"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: UpdateActivityTypeNameErrorCode };

function toErrorCode(
  message: string | undefined
): UpdateActivityTypeNameErrorCode {
  if (
    message === "activity_type_not_found" ||
    message === "invalid_name" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useUpdateActivityTypeName() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function updateActivityTypeName(
    activityTypeId: string,
    name: string
  ): Promise<AlleActiviteitType | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // update_activity_type_name geeft `activity_types` terug (één rij,
      // geen `setof`) — zie useCreateActivityType.ts voor waarom geen
      // .single()/.maybeSingle() nodig is.
      const { data, error } = await supabase.rpc("update_activity_type_name", {
        p_activity_type_id: activityTypeId,
        p_name: name,
      });

      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useUpdateActivityTypeName", error);
        setState({ status: "error", code });
        return null;
      }
      setState({ status: "idle" });
      return {
        id: data.id as string,
        name: data.name as string,
        archived: data.archived as boolean,
      };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useUpdateActivityTypeName", err);
      setState({ status: "error", code });
      return null;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    updateActivityTypeName,
    reset: () => setState({ status: "idle" }),
  };
}
