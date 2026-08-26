"use client";

import { useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import {
  useUpdateProductPrice,
  type UpdateProductPriceErrorCode,
} from "@/hooks/queries/useUpdateProductPrice";
import {
  useSetProductArchived,
  type SetProductArchivedErrorCode,
} from "@/hooks/queries/useSetProductArchived";
import type { Product } from "@/hooks/queries/useProducts";
import { formatCents, parseEuroToCents } from "@/lib/money";

function priceErrorMessage(code: UpdateProductPriceErrorCode): string {
  switch (code) {
    case "invalid_price":
      return "vul een geldige prijs in, groter dan €0,00";
    case "product_not_found":
      return "dit product bestaat niet meer — de lijst is bijgewerkt";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan het assortiment niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

function archiveErrorMessage(code: SetProductArchivedErrorCode): string {
  switch (code) {
    case "product_not_found":
      return "dit product bestaat niet meer — de lijst is bijgewerkt";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan het assortiment niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * "Product beheren"-overlay: prijs wijzigen en uit/terug-in-assortiment,
 * twee onafhankelijke schrijfacties in dezelfde overlay-instantie (geen
 * gecombineerde aanroep). Zie docs/features/assortimentbeheer.md →
 * Schermflow stap 3.
 */
export function ProductBeherenOverlay({
  product: initialProduct,
  onClose,
  onChanged,
}: {
  product: Product;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [product, setProduct] = useState(initialProduct);
  const [priceInput, setPriceInput] = useState("");
  const [lastAction, setLastAction] = useState<"price" | "archive" | null>(null);
  const priceMutation = useUpdateProductPrice();
  const archiveMutation = useSetProductArchived();
  const priceId = useId();

  const parsedPriceCents = parseEuroToCents(priceInput);
  const canSavePrice =
    priceInput.trim() !== "" &&
    parsedPriceCents !== null &&
    parsedPriceCents > 0 &&
    parsedPriceCents !== product.priceCents &&
    priceMutation.status !== "pending";

  async function savePrice() {
    if (!canSavePrice || parsedPriceCents === null) return;
    setLastAction("price");
    const updated = await priceMutation.updateProductPrice(
      product.id,
      parsedPriceCents
    );
    if (updated) {
      setProduct(updated);
      setPriceInput("");
      onChanged();
    }
  }

  async function toggleArchived() {
    setLastAction("archive");
    const updated = await archiveMutation.setProductArchived(
      product.id,
      !product.archived
    );
    if (updated) {
      setProduct(updated);
      onChanged();
    }
  }

  const errorMessage =
    lastAction === "price" && priceMutation.errorCode
      ? priceErrorMessage(priceMutation.errorCode)
      : lastAction === "archive" && archiveMutation.errorCode
        ? archiveErrorMessage(archiveMutation.errorCode)
        : null;

  return (
    <Overlay
      title="Product beheren"
      description={`Wijzigingen aan ${product.name}.`}
      onClose={onClose}
    >
      <p className="min-h-[1.25rem] text-sm font-bold text-rail-error" role="alert">
        {errorMessage ?? ""}
      </p>

      <div className="flex items-center justify-between rounded-control bg-rail px-3.5 py-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-rail-muted">
          Huidige prijs
        </span>
        <span className="text-sm font-extrabold text-white">
          {formatCents(product.priceCents)}
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-rail-border p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-white">Prijs wijzigen</span>
          <span className="text-xs font-medium text-rail-muted">
            geldt vanaf de volgende tik — eerdere bestellingen blijven ongewijzigd
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={priceId} className="sr-only">
            Nieuwe prijs
          </label>
          <div className="flex flex-1 items-center gap-2 rounded-control border border-rail-border bg-rail px-3.5 focus-within:border-accent">
            <span aria-hidden="true" className="text-sm font-bold text-rail-muted">
              €
            </span>
            <input
              id={priceId}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
              className="h-11 flex-1 min-w-0 bg-transparent text-sm font-semibold text-white outline-none"
            />
          </div>
          <button
            type="button"
            disabled={!canSavePrice}
            onClick={savePrice}
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Opslaan
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={archiveMutation.status === "pending"}
        onClick={toggleArchived}
        className="flex items-center justify-between gap-3 rounded-control border border-rail-border p-3.5 text-left transition-colors hover:border-rail-error disabled:opacity-50"
      >
        <span className="flex flex-col gap-0.5">
          {/* text-rail-error, niet de light-theme `danger`-kleur — dit is
              een donkere overlay-kaart (Overlay.tsx is altijd rail-*
              gestyled), #c2410c faalt daar op contrast (zie
              tailwind.config.ts, rail.error is al gekozen voor precies
              dit gebruik, zie PinPad.tsx/BezettingOverlay.tsx). */}
          <span className="text-sm font-bold text-rail-error">
            {product.archived ? "Terug in assortiment" : "Uit assortiment halen"}
          </span>
          <span className="text-xs font-medium text-rail-muted">
            {product.archived
              ? "product verschijnt weer op het verkoopscherm"
              : "product verdwijnt van het verkoopscherm, historie blijft"}
          </span>
        </span>
        <span aria-hidden="true" className="text-base font-bold text-rail-muted">
          ›
        </span>
      </button>

      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-full items-center justify-center rounded-control border border-rail-border bg-rail text-sm font-bold text-white transition-colors hover:border-accent"
      >
        Sluiten
      </button>
    </Overlay>
  );
}
