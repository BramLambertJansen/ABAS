import type { createClient } from "@/lib/supabase/client";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/productImageRules";
import type { AssortimentProduct } from "./useAlleProducten";

/**
 * Gedeelde mapping van `products`-rijen (docs/features/productafbeeldingen.md
 * → Datalaag). De enige plek die van `products.image_path` een URL maakt:
 * de leeshooks (useProducts, useAlleProducten), de drie product-RPC-hooks en
 * useProductAfbeelding gaan allemaal hierlangs. Een tweede plek die de URL
 * bouwt, is een reviewfout.
 */

type BrowserClient = ReturnType<typeof createClient>;

/** Pad in de bucket → publieke URL. Alleen stringwerk, geen netwerk. Een
 *  ontbrekend veld (oude mock, rij van vóór 0038) is `null`. */
export function productImageUrl(supabase: BrowserClient, path: unknown): string | null {
  if (typeof path !== "string" || path === "") return null;
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Eén `products`-rij (een `select` of het antwoord van create_product,
 *  update_product_price of set_product_archived) → `AssortimentProduct`. */
export function toAssortimentProduct(
  supabase: BrowserClient,
  row: Record<string, unknown>
): AssortimentProduct {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    priceCents: row.price_cents as number,
    archived: row.archived as boolean,
    imageUrl: productImageUrl(supabase, row.image_path),
  };
}
