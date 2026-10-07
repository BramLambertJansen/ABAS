"use client";

import { ZoekIcoon } from "@/components/ZoekIcoon";

import { useMemo } from "react";
import { formatCents } from "@/lib/money";
import { ProductAfbeelding } from "@/components/ProductAfbeelding";
import type { Product } from "@/hooks/queries/useProducts";
import type { CartLine } from "./cart";
import type { AssortimentView } from "./useVerkoopDraft";
import { filterProducten } from "./productFilter";
import { zoekResultaatTekst } from "./messages";

const ALL_CATEGORIES = null;

// Smalste kaart waarop "Rode wijn" of "Spa rood" nog leesbaar blijft; het
// grid vult zich op de werkelijke inhoudsbreedte (tablet-bruikbaarheid.md).
const MIN_KAART_PX = 150;

/**
 * Linkerkant/hoofdgebied van het verkoopscherm: zoeken, categoriechips,
 * productgrid. Zie docs/features/verkoop.md → Schermflow §1.
 *
 * - Zoekopdracht (case-insensitive substring op naam) overschrijft de
 *   categoriefilter zolang hij actief is (`filterProducten`). Een klik op
 *   een categorie (ook "Alle") wist de zoekterm (D3), en "Wis zoekterm" (of
 *   het zoekveld leegmaken) zet de categorie terug op "Alle": er blijft geen
 *   verborgen eerdere keuze over. Terwijl er een zoekterm is, staat geen chip
 *   aan en staat er een resultaatregel (`role="status"`).
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
  display,
}: {
  display: AssortimentView;
  products: Product[];
  cart: CartLine[];
  onAdd: (productId: string) => void;
}) {
  const { query, setQuery, category, setCategory, view, setView } = display;

  // Trimt en sluit lege categorieën uit — het schema staat `category` als
  // vrije, niet-lege-maar-wel-blanco-toegestane tekst toe; zonder deze
  // filter kon een leeg/whitespace-only-categorie een chip zonder
  // betekenisvolle naam/accessible name opleveren (Reviewbot op PR #41).
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((p) => p.category.trim())
            .filter((c) => c.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b, "nl")),
    [products]
  );

  const trimmedQuery = query.trim();
  const visible = useMemo(
    () => filterProducten(products, query, category),
    [products, query, category]
  );

  function chooseCategory(next: string | null) {
    setQuery("");
    setCategory(next);
  }

  function clearQuery() {
    setQuery("");
    setCategory(ALL_CATEGORIES);
  }

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) map.set(line.productId, line.qty);
    return map;
  }, [cart]);

  const chipClass = (active: boolean) =>
    `flex h-control items-center whitespace-nowrap rounded-full border px-[18px] text-detail font-bold transition-colors ${
      active
        ? "border-accent-active bg-accent-active text-white shadow-accent-chip"
        : "border-border bg-white text-muted-strong hover:border-ink"
    }`;
  const segClass = (active: boolean) =>
    `flex h-control items-center justify-center whitespace-nowrap rounded-[11px] px-[15px] text-metadata font-bold transition-[background-color,color,box-shadow] ${
      active
        ? "bg-white text-ink shadow-segment"
        : "text-muted-strong hover:text-ink"
    }`;

  // Layout naar designs/Bar App.dc.html → `isSales`: zoekveld (52px, met
  // icoon) + galerij/lijst-schakelaar, categorie-chips, dan kaarten of
  // rijen met een ronde "+"-knop. Elke kaart en rij toont de
  // productafbeelding, of de lege staat met initialen
  // (docs/features/productafbeeldingen.md, Besluit 1–3); decoratief, de naam
  // zit al in de `aria-label`.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex flex-none flex-wrap items-center gap-3">
        <div className="relative flex min-w-0 basis-[260px] flex-1 items-center">
          <ZoekIcoon className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2" />
          <label htmlFor="verkoop-product-search" className="sr-only">
            Zoek product
          </label>
          <input
            id="verkoop-product-search"
            type="search"
            placeholder="Zoek product"
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              // Het zoekveld leegmaken (kruisje, Escape, wissen) is "Wis
              // zoekterm": de categorie gaat terug naar "Alle".
              if (trimmedQuery && next.trim() === "") clearQuery();
              else setQuery(next);
            }}
            className="h-control-lg w-full rounded-[14px] border border-border bg-white pl-[46px] pr-[18px] text-[14.5px] font-medium text-ink focus-visible:outline-hidden placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
          />
        </div>
        <div
          role="group"
          aria-label="Weergave"
          className="flex h-control-lg flex-none items-center gap-0.5 rounded-[13px] bg-track p-0.5"
        >
          <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={segClass(view === "grid")}>
            galerij
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className={segClass(view === "list")}>
            lijst
          </button>
        </div>
      </div>

      <div className="flex flex-none flex-wrap gap-2" role="group" aria-label="Categorie">
        <button
          type="button"
          aria-pressed={!trimmedQuery && category === ALL_CATEGORIES}
          onClick={() => chooseCategory(ALL_CATEGORIES)}
          className={chipClass(!trimmedQuery && category === ALL_CATEGORIES)}
        >
          Alle
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={!trimmedQuery && category === cat}
            onClick={() => chooseCategory(cat)}
            className={chipClass(!trimmedQuery && category === cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Resultaatregel: een vaste live-regio, zodat een wijziging van het
          aantal wordt voorgelezen; zichtbaar alleen bij een zoekterm. */}
      <div
        className={
          trimmedQuery
            ? "flex flex-none flex-wrap items-center gap-x-3 gap-y-1"
            : "sr-only"
        }
      >
        <p role="status" className="text-[13px] font-semibold text-muted-strong">
          {trimmedQuery ? zoekResultaatTekst(visible.length, trimmedQuery) : ""}
        </p>
        {trimmedQuery && (
          <button
            type="button"
            onClick={() => {
              clearQuery();
              // De knop verdwijnt met de term: focus naar het zoekveld, niet body.
              document.getElementById("verkoop-product-search")?.focus();
            }}
            className="flex h-control items-center rounded-full border border-border bg-white px-4 text-[13px] font-bold text-ink transition-colors hover:border-ink"
          >
            Wis zoekterm
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        trimmedQuery ? null : <p className="flex flex-1 items-center justify-center text-sm font-semibold text-muted">
          Geen producten gevonden.
        </p>
      ) : view === "grid" ? (
        <ul
          className="grid flex-1 auto-rows-min content-start gap-3 overflow-auto p-0.5 pb-2"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${MIN_KAART_PX}px), 1fr))` }}
        >
          {visible.map((product) => {
            const qty = qtyByProduct.get(product.id) ?? 0;
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onAdd(product.id)}
                  aria-label={addLabel(product.name, product.priceCents, qty)}
                  className="group flex w-full flex-col gap-2.5 rounded-card border border-border bg-white p-[11px] text-left shadow-surface transition-[border-color,box-shadow] hover:border-accent hover:shadow-surface-hover"
                >
                  <ProductAfbeelding imageUrl={product.imageUrl} name={product.name} size="tile" decorative />
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="line-clamp-2 wrap-break-word text-detail font-bold leading-tight text-ink">
                        {product.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-muted">
                        {formatCents(product.priceCents)}
                        {qty > 0 && <QtyPill qty={qty} />}
                      </span>
                    </span>
                    <AddCircle />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-1 flex-col overflow-auto rounded-card border border-border bg-white px-1.5 py-1">
          {visible.map((product) => {
            const qty = qtyByProduct.get(product.id) ?? 0;
            return (
              <li key={product.id} className="border-b border-border-subtle last:border-b-0">
                <button
                  type="button"
                  onClick={() => onAdd(product.id)}
                  aria-label={addLabel(product.name, product.priceCents, qty)}
                  className="group flex w-full items-center gap-3.5 rounded-control px-2 py-[9px] text-left transition-colors hover:bg-canvas"
                >
                  <ProductAfbeelding imageUrl={product.imageUrl} name={product.name} size="row" decorative />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                    {product.name}
                  </span>
                  {qty > 0 && <QtyPill qty={qty} />}
                  <span className="min-w-[58px] text-right text-detail font-semibold text-muted">
                    {formatCents(product.priceCents)}
                  </span>
                  <AddCircle />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function addLabel(name: string, priceCents: number, qty: number): string {
  return `${name}, ${formatCents(priceCents)}${
    qty > 0 ? `, ${qty} in het mandje` : ""
  } — tik om toe te voegen`;
}

/** Aantal al in het mandje — binnen de kaart/rij, niet eroverheen. */
function QtyPill({ qty }: { qty: number }) {
  return (
    <span
      aria-hidden="true"
      className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11.5px] font-extrabold text-danger"
    >
      {qty}×
    </span>
  );
}

function AddCircle() {
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent-soft text-[15px] font-extrabold leading-none text-danger transition-colors group-hover:bg-accent-active group-hover:text-white"
    >
      +
    </span>
  );
}
