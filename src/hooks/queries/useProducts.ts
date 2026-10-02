"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";
import { productImageUrl } from "./productRows";

export type Product = {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  /** Publieke URL van de productafbeelding, `null` zonder afbeelding
   *  (docs/features/productafbeeldingen.md). Gemaakt in productRows.ts. */
  imageUrl: string | null;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; products: Product[] };

/** Niet-gearchiveerde `products`, alfabetisch op naam — het assortiment
 *  voor het verkoopscherm (docs/features/verkoop.md → §1). `refetch()`
 *  bestaat zodat het assortiment opnieuw opgehaald kan worden nadat
 *  `place_order` `product_not_available` teruggeeft (Randgevallen): een
 *  inmiddels gearchiveerd product moet daarna niet meer aantikbaar zijn.
 *  Zelfde loading/error/ready + tick-refetch-vorm als useShiftMembers. */
export function useProducts(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, price_cents, image_path")
        .eq("archived", false)
        .order("name", { ascending: true });

      if (error) throw error;

      const products: Product[] = (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        category: row.category as string,
        priceCents: row.price_cents as number,
        imageUrl: productImageUrl(supabase, row.image_path),
      }));

      setState({ status: "ready", products });
    } catch (err) {
      // Never surface the raw error on a bar tablet mid-service — log it
      // for whoever's debugging, show a fixed Dutch message at the bar.
      reportClientError(createClient, "useProducts", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan het assortiment niet laden.", err),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) {
        setState({ status: "error", message: "Onbekende fout." });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
