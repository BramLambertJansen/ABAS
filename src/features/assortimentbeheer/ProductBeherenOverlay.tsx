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
import type { AssortimentProduct } from "@/hooks/queries/useAlleProducten";
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
  product: AssortimentProduct;
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
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {errorMessage ?? ""}
      </p>

      <div className="flex items-center justify-between rounded-control bg-canvas px-3.5 py-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
          Huidige prijs
        </span>
        <span className="text-sm font-extrabold text-ink">
          {formatCents(product.priceCents)}
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-border p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">Prijs wijzigen</span>
          <span className="text-xs font-medium text-muted">
            geldt vanaf de volgende tik — eerdere bestellingen blijven ongewijzigd
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={priceId} className="sr-only">
            Nieuwe prijs
          </label>
          <div className="flex flex-1 items-center gap-2 rounded-control border border-border bg-white px-3.5 ui-field-group-focus">
            <span aria-hidden="true" className="text-sm font-bold text-muted">
              €
            </span>
            <input
              id={priceId}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
              className="h-11 flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink outline-none"
            />
          </div>
          <button
            type="button"
            disabled={!canSavePrice}
            onClick={savePrice}
            className="ui-button-primary flex h-11 items-center justify-center rounded-control px-4 text-sm font-bold transition-colors"
          >
            Opslaan
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={archiveMutation.status === "pending"}
        onClick={toggleArchived}
        className="flex items-center justify-between gap-3 rounded-control border border-border p-3.5 text-left transition-colors hover:border-danger disabled:opacity-50"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-danger">
            {product.archived ? "Terug in assortiment" : "Uit assortiment halen"}
          </span>
          <span className="text-xs font-medium text-muted">
            {product.archived
              ? "product verschijnt weer op het verkoopscherm"
              : "product verdwijnt van het verkoopscherm, historie blijft"}
          </span>
        </span>
        <span aria-hidden="true" className="text-base font-bold text-muted">
          ›
        </span>
      </button>

      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-full items-center justify-center rounded-control border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink"
      >
        Sluiten
      </button>
    </Overlay>
  );
}
