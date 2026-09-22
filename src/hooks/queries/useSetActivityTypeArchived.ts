"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AlleActiviteitType } from "./useAlleActiviteitTypes";

/** Foutcodes die `set_activity_type_archived` (0019_activiteittypes.sql)
 *  daadwerkelijk raiset. */
export type SetActivityTypeArchivedErrorCode =
  | "activity_type_not_found"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: SetActivityTypeArchivedErrorCode };

function toErrorCode(
  message: string | undefined
): SetActivityTypeArchivedErrorCode {
  if (
    message === "activity_type_not_found" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useSetActivityTypeArchived() {
  const [state, setState] = useState<State>({ status: "idle" });

  /** Client stuurt de expliciete gewenste eindstaat, geen "toggle" — zelfde
   *  stijl als useSetProductArchived.ts. */
  async function setActivityTypeArchived(
    activityTypeId: string,
    archived: boolean
  ): Promise<AlleActiviteitType | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // set_activity_type_archived geeft `activity_types` terug (één rij,
      // geen `setof`) — zie useCreateActivityType.ts.
      const { data, error } = await supabase.rpc("set_activity_type_archived", {
        p_activity_type_id: activityTypeId,
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
    setActivityTypeArchived,
    reset: () => setState({ status: "idle" }),
  };
}
