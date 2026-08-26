"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "./useProducts";

/** Error codes `create_product` (0004_assortimentbeheer.sql) actually
 *  raises. Anything else (network failure, unexpected server error) falls
 *  through to "unknown". Same pattern as useStartShift.ts →
 *  StartShiftErrorCode. */
export type CreateProductErrorCode =
  | "invalid_name"
  | "invalid_category"
  | "invalid_price"
  | "actor_not_found"
  | "no_admin_role"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: CreateProductErrorCode };

function toErrorCode(message: string | undefined): CreateProductErrorCode {
  if (
    message === "invalid_name" ||
    message === "invalid_category" ||
    message === "invalid_price" ||
    message === "actor_not_found" ||
    message === "no_admin_role"
  ) {
    return message;
  }
  return "unknown";
}

export function useCreateProduct() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function createProduct(
    name: string,
    category: string,
    priceCents: number
  ): Promise<Product | null> {
    setState({ status: "pending" });
    try {
      const supabase = createClient();
      // create_product returns `products` (a single row, not `setof
      // products`) — PostgREST returns that as a bare JSON object, not an
      // array, so no .single()/.maybeSingle() needed to unwrap it.
      const { data, error } = await supabase.rpc("create_product", {
        p_name: name,
        p_category: category,
        p_price_cents: priceCents,
      });

      if (error) {
        setState({ status: "error", code: toErrorCode(error.message) });
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
    createProduct,
    reset: () => setState({ status: "idle" }),
  };
}
