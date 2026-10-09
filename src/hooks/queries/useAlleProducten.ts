"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { maakRondeGuard } from "@/lib/verversen";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";
import { toAssortimentProduct } from "./productRows";

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
  /** Publieke URL van de productafbeelding, `null` zonder afbeelding
   *  (docs/features/productafbeeldingen.md). Gemaakt in productRows.ts. */
  imageUrl: string | null;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; products: AssortimentProduct[] };

/** Every product, archived or not — a gearchiveerd product stays in the
 *  list, visually muted, not filtered out (see
 *  docs/features/assortimentbeheer.md → Schermflow stap 1, otherwise
 *  there'd be no way to find it again to un-archive). Sorted server-side,
 *  category then name, same `.order()` style as useShiftCandidates(). */
export function useAlleProducten(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const request = useRef(maakRondeGuard());

  const load = useCallback(async () => {
    const ronde = request.current.start();
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, price_cents, archived, image_path")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (!request.current.isActueel(ronde)) return;
      if (error) throw error;

      const products: AssortimentProduct[] = (data ?? []).map((row) =>
        toAssortimentProduct(supabase, row)
      );

      setState({ status: "ready", products });
    } catch (err) {
      if (!request.current.isActueel(ronde)) return;
      // Never surface the raw error on a bar tablet — log it for whoever's
      // debugging, show a fixed Dutch message, same rule as useOpenShift.
      reportClientError(createClient, "useAlleProducten", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan het assortiment niet laden.", err),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const guard = request.current;
    load().catch(() => {
      if (!cancelled) {
        setState({ status: "error", message: "Onbekende fout." });
      }
    });
    return () => {
      cancelled = true;
      guard.annuleer();
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
