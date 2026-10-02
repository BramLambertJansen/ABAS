"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import type { AssortimentProduct } from "./useAlleProducten";
import { toAssortimentProduct } from "./productRows";

/** Error codes `update_product_price` (0005_assortimentbeheer.sql) actually
 *  raises. Anything else falls through to "unknown". No requirement that
 *  the product isn't archived — see docs/features/assortimentbeheer.md →
 *  Randgevallen "Gearchiveerd product, prijs wijzigen". */
export type UpdateProductPriceErrorCode =
  | "product_not_found"
  | "invalid_price"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: UpdateProductPriceErrorCode };

function toErrorCode(message: string | undefined): UpdateProductPriceErrorCode {
  if (
    message === "product_not_found" ||
    message === "invalid_price" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useUpdateProductPrice() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function updateProductPrice(
    productId: string,
    priceCents: number
  ): Promise<AssortimentProduct | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // update_product_price returns `products` (single row, not
      // `setof products`) — see useCreateProduct.ts for why no
      // .single()/.maybeSingle() is needed here.
      const { data, error } = await supabase.rpc("update_product_price", {
        p_product_id: productId,
        p_price_cents: priceCents,
      });

      if (error) {
        const code = toErrorCode(error.message);
        if (code === "unknown") reportClientError(supabase, "useUpdateProductPrice", error);
        setState({ status: "error", code });
        return null;
      }
      setState({ status: "idle" });
      return toAssortimentProduct(supabase, data);
    } catch (err) {
      const code = toErrorCode(err instanceof Error ? err.message : undefined);
      if (code === "unknown") reportClientError(createClient, "useUpdateProductPrice", err);
      setState({ status: "error", code });
      return null;
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    updateProductPrice,
    reset: () => setState({ status: "idle" }),
  };
}
