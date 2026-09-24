"use client";

import { useEffect, useState } from "react";
import {
  useAlleProducten,
  type AssortimentProduct,
} from "@/hooks/queries/useAlleProducten";
import { formatCents } from "@/lib/money";
import { NieuwProductOverlay } from "./NieuwProductOverlay";
import { ProductBeherenOverlay } from "./ProductBeherenOverlay";

const TOAST_DURATION_MS = 3500;

/**
 * Productenlijst — de Assortiment-tab in `BeheerTabs.tsx`, zodra er een
 * actieve beheerder-sessie is (zie Assortimentbeheer.tsx). Zie
 * docs/features/assortimentbeheer.md → Schermflow stap 1 t/m 5. Geen eigen
 * `<main>`/sessie-header meer sinds #11
 * (docs/features/negatieve-saldolimiet.md) — de "Ingelogd als…"-indicator
 * en de "← terug naar bardienst"-link staan nu in `BeheerTabs.tsx`, boven
 * de tabbalk (ze horen bij de sessie, niet bij dit ene tabblad).
 */
export function ProductenLijst() {
  const products = useAlleProducten();
  const [overlay, setOverlay] = useState<
    { kind: "new" } | { kind: "manage"; product: AssortimentProduct } | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function showToast(message: string) {
    setToast(message);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[19px] font-extrabold tracking-[-0.02em]">Assortiment</h1>
        <button
          type="button"
          onClick={() => setOverlay({ kind: "new" })}
          className="flex h-[42px] items-center gap-1.5 rounded-control bg-accent px-[18px] text-[13px] font-extrabold text-rail transition-colors hover:bg-accent-hover"
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
          nieuw product
        </button>
      </div>

      <div aria-live="polite" role="status" className="empty:-mt-5">
        {toast && (
          <p className="w-fit rounded-control border border-border bg-white px-3.5 py-2 text-sm font-bold text-ink">
            {toast}
          </p>
        )}
      </div>

      {products.status === "loading" && (
        <p className="text-sm font-semibold text-muted" role="status">
          Assortiment laden…
        </p>
      )}

      {products.status === "error" && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {products.message}
        </p>
      )}

      {products.status === "ready" && products.products.length === 0 && (
        <p className="text-sm font-semibold text-muted">
          Nog geen producten — voeg het eerste toe.
        </p>
      )}

      {products.status === "ready" && products.products.length > 0 && (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-white">
          <p className="flex-none border-b border-border-subtle px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
            {products.products.length === 1 ? "1 product" : `${products.products.length} producten`}
          </p>
        <ul className="flex flex-col overflow-auto px-1.5 py-1">
          {products.products.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => setOverlay({ kind: "manage", product })}
                className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-control px-2.5 py-[11px] text-left transition-colors hover:bg-canvas"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  {/* Gearchiveerd: gedempt via de bestaande `muted`-kleur
                      (al gevalideerd op WCAG-AA, zie tailwind.config.ts),
                      niet via opacity — opacity zou dezelfde kleur
                      verzwakken tot ónder het contrast dat 'm juist AA-
                      compliant maakte. */}
                  <span
                    className={`truncate text-sm font-bold ${
                      product.archived ? "text-muted" : "text-ink"
                    }`}
                  >
                    {product.name}
                  </span>
                  <span className="text-[11px] font-semibold text-muted">
                    {product.category} · {formatCents(product.priceCents)}
                  </span>
                </span>
                {product.archived && (
                  <span className="flex-none rounded-full bg-track px-[9px] py-1 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-muted-strong">
                    Uit assortiment
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        </div>
      )}

      {overlay?.kind === "new" && (
        <NieuwProductOverlay
          onClose={() => setOverlay(null)}
          onCreated={(product) => {
            products.refetch();
            setOverlay(null);
            showToast(`${product.name} toegevoegd`);
          }}
        />
      )}

      {overlay?.kind === "manage" && (
        <ProductBeherenOverlay
          product={overlay.product}
          onClose={() => setOverlay(null)}
          onChanged={() => {
            products.refetch();
          }}
        />
      )}
    </>
  );
}
