"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";

/** Error codes `update_negative_limit` (0006_negatieve_saldolimiet.sql)
 *  actually raises. Anything else falls through to "unknown". */
export type UpdateNegativeLimitErrorCode =
  | "invalid_negative_limit"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: UpdateNegativeLimitErrorCode };

function toErrorCode(message: string | undefined): UpdateNegativeLimitErrorCode {
  if (
    message === "invalid_negative_limit" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

/** Exact dezelfde vorm/status-machine als useUpdateProductPrice()/
 *  useSetProductArchived() — zie docs/features/negatieve-saldolimiet.md →
 *  Leeshook-aanpassing. */
export function useUpdateNegativeLimit() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function updateNegativeLimit(
    negativeLimitCents: number
  ): Promise<number | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // update_negative_limit returns `app_settings` (single row, not
      // `setof app_settings`) — see useCreateProduct.ts for why no
      // .single()/.maybeSingle() is needed here.
      const { data, error } = await supabase.rpc("update_negative_limit", {
        p_negative_limit_cents: negativeLimitCents,
      });

      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useUpdateNegativeLimit", error);
        setState({ status: "error", code });
        return null;
      }
      setState({ status: "idle" });
      return data.negative_limit_cents as number;
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useUpdateNegativeLimit", err);
      setState({ status: "error", code });
      return null;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    updateNegativeLimit,
    reset: () => setState({ status: "idle" }),
  };
}
