"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/portalClient";
import { reportClientError } from "@/lib/clientErrors";

/** Foutcodes die `update_own_name` (0026_eigen_naam_wijzigen.sql)
 *  werkelijk geeft. Al het andere valt terug op "unknown". */
export type UpdateOwnNameErrorCode = "actor_not_found" | "invalid_name" | "unknown";

export type UpdateOwnNameResult = { ok: true } | { ok: false; code: UpdateOwnNameErrorCode };

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: UpdateOwnNameErrorCode };

function toErrorCode(message: string | undefined): UpdateOwnNameErrorCode {
  if (message === "actor_not_found" || message === "invalid_name") return message;
  return "unknown";
}

/**
 * Eigen naam wijzigen vanuit de portal — docs/features/portal-profiel.md →
 * RPC's. `update_own_name` herleidt de aanroeper via `auth.uid()` en heeft
 * geen doel-id: deze hook kan alleen de eigen rij schrijven (ADR 0012 →
 * zelf-scopende RPC). Via `portalClient.ts` (ADR 0009).
 */
export function usePortalUpdateOwnName() {
  const [state, setState] = useState<State>({ status: "idle" });

  /** Geeft de uitkomst ook direct terug (niet alleen via `errorCode`), zodat
   *  de sheet op `actor_not_found` kan reageren zonder effect. */
  async function updateOwnName(name: string): Promise<UpdateOwnNameResult> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("update_own_name", { p_name: name });

      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "usePortalUpdateOwnName", error);
        setState({ status: "error", code });
        return { ok: false, code };
      }
      setState({ status: "idle" });
      return { ok: true };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "usePortalUpdateOwnName", err);
      setState({ status: "error", code });
      return { ok: false, code };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    updateOwnName,
    reset: () => setState({ status: "idle" }),
  };
}
