"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import type { AssortimentProduct } from "./useAlleProducten";

/** Error codes `set_product_archived` (0005_assortimentbeheer.sql) actually
 *  raises. Anything else falls through to "unknown". */
export type SetProductArchivedErrorCode =
  | "product_not_found"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: SetProductArchivedErrorCode };

function toErrorCode(message: string | undefined): SetProductArchivedErrorCode {
  if (
    message === "product_not_found" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useSetProductArchived() {
  const [state, setState] = useState<State>({ status: "idle" });

  /** Client sends the explicit desired end state — never a "toggle" —
   *  same style as place_order's explicit p_lines. See
   *  docs/features/assortimentbeheer.md → RPC's. */
  async function setProductArchived(
    productId: string,
    archived: boolean
  ): Promise<AssortimentProduct | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // set_product_archived returns `products` (single row, not
      // `setof products`) — see useCreateProduct.ts for why no
      // .single()/.maybeSingle() is needed here.
      const { data, error } = await supabase.rpc("set_product_archived", {
        p_product_id: productId,
        p_archived: archived,
      });

      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useSetProductArchived", error);
        setState({ status: "error", code });
        return null;
      }
      setState({ status: "idle" });
      return {
        id: data.id as string,
        name: data.name as string,
        category: data.category as string,
        priceCents: data.price_cents as number,
        archived: data.archived as boolean,
      };
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useSetProductArchived", err);
      setState({ status: "error", code });
      return null;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    setProductArchived,
    reset: () => setState({ status: "idle" }),
  };
}
