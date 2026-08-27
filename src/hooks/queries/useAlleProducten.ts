"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** A row from `products` — the assortiment, read (not written) by
 *  Assortimentbeheer's productenlijst. Writes go through create_product/
 *  update_product_price/set_product_archived (see useCreateProduct.ts etc.),
 *  never a direct insert/update — products is REVOKEd from `authenticated`
 *  for exactly that reason (0005_assortimentbeheer.sql). Not named `Product`
 *  — see docs/features/assortimentbeheer.md → "Contract met #8's
 *  useProducts()": this is a distinct projection for one read need, not a
 *  central domain type (same reason useMembers() calls its row MemberOption
 *  instead of Member). */
export type AssortimentProduct = {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  archived: boolean;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; products: AssortimentProduct[] };

/** Every product, archived or not — a gearchiveerd product stays in the
 *  list, visually muted, not filtered out (see
 *  docs/features/assortimentbeheer.md → Schermflow stap 1, otherwise
 *  there'd be no way to find it again to un-archive). Sorted server-side,
 *  category then name, same `.order()` style as useBarStaff(). */
export function useAlleProducten(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, price_cents, archived")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      const products: AssortimentProduct[] = (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        category: row.category as string,
        priceCents: row.price_cents as number,
        archived: row.archived as boolean,
      }));

      setState({ status: "ready", products });
    } catch (err) {
      // Never surface the raw error on a bar tablet — log it for whoever's
      // debugging, show a fixed Dutch message, same rule as useOpenShift.
      console.error("useAlleProducten:", err);
      setState({
        status: "error",
        message: "Kan het assortiment niet laden. Controleer de verbinding.",
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
