"use client";

import { useMemo, useState } from "react";
import { useShell } from "@/lib/shell/ShellProvider";
import { formatCents } from "@/lib/money";
import type { Product } from "@/hooks/queries/useProducts";
import type { CartLine } from "./cart";

const ALL_CATEGORIES = null;

/**
 * Linkerkant/hoofdgebied van het verkoopscherm: zoeken, categoriechips,
 * productgrid. Zie docs/features/verkoop.md → Schermflow §1.
 *
 * - Zoekopdracht (case-insensitive substring op naam) overschrijft de
 *   categoriefilter zolang hij actief is; leeg zoekveld → categoriefilter
 *   geldt weer.
 * - Categorieën zijn dynamisch afgeleid van de distincte, niet-lege
 *   `category`-waarden onder de meegegeven producten (alfabetisch), plus
 *   een vaste "Alle"-chip — geen hardcoded lijst, geen "Favorieten".
 * - Elke tik op een product verhoogt de mandje-hoeveelheid met 1
 *   (`onAdd`); producten al in het mandje tonen hun huidige aantal.
 */
export function Assortiment({
  products,
  cart,
  onAdd,
}: {
  products: Product[];
  cart: CartLine[];
  onAdd: (productId: string) => void;
}) {
  const shell = useShell();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(ALL_CATEGORIES);

  const categories = useMemo(
    () =>
      Array.from(new Set(products.map((p) => p.category))).sort((a, b) =>
        a.localeCompare(b, "nl")
      ),
    [products]
  );

  const trimmedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (trimmedQuery) {
      return products.filter((p) => p.name.toLowerCase().includes(trimmedQuery));
    }
    return products.filter(
      (p) => category === ALL_CATEGORIES || p.category === category
    );
  }, [products, trimmedQuery, category]);

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) map.set(line.productId, line.qty);
    return map;
  }, [cart]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
      <div className="flex-none">
        <label htmlFor="verkoop-product-search" className="sr-only">
          Zoek product
        </label>
        <input
          id="verkoop-product-search"
          type="search"
          placeholder="Zoek product"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm font-medium text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div className="flex flex-none flex-wrap gap-2" role="group" aria-label="Categorie">
        <button
          type="button"
          aria-pressed={category === ALL_CATEGORIES}
          onClick={() => setCategory(ALL_CATEGORIES)}
          className={`min-h-[36px] rounded-full border px-3 text-xs font-bold transition-colors ${
            category === ALL_CATEGORIES
              ? "border-accent bg-accent-active text-white"
              : "border-border bg-white text-muted hover:border-accent hover:text-accent"
          }`}
        >
          Alle
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={category === cat}
            onClick={() => setCategory(cat)}
            className={`min-h-[36px] rounded-full border px-3 text-xs font-bold transition-colors ${
              category === cat
                ? "border-accent bg-accent-active text-white"
                : "border-border bg-white text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm font-semibold text-muted">
          Geen producten gevonden.
        </p>
      ) : (
        <ul
          className="grid flex-1 auto-rows-min gap-3 overflow-auto pb-2"
          style={{ gridTemplateColumns: `repeat(${shell.columns}, 1fr)` }}
        >
          {visible.map((product) => {
            const qty = qtyByProduct.get(product.id) ?? 0;
            return (
              <li key={product.id} className="relative">
                <button
                  type="button"
                  onClick={() => onAdd(product.id)}
                  aria-label={`${product.name}, ${formatCents(product.priceCents)}${
                    qty > 0 ? `, ${qty} in het mandje` : ""
                  } — tik om toe te voegen`}
                  className="flex min-h-[44px] w-full flex-col items-start gap-1 rounded-2xl border border-border bg-white p-3 text-left shadow-sm transition-colors hover:border-accent"
                >
                  <span className="w-full truncate text-sm font-bold text-ink">
                    {product.name}
                  </span>
                  <span className="text-xs font-semibold text-muted">
                    {formatCents(product.priceCents)}
                  </span>
                </button>
                {qty > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-2 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-accent-active px-1.5 text-xs font-extrabold text-white shadow"
                  >
                    {qty}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
