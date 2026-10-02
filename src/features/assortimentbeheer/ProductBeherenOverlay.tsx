"use client";

import { useId, useRef, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { OpslaanSectie } from "@/components/OpslaanSectie";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { useHerstelFocus } from "@/hooks/useHerstelFocus";
import {
  ONBEKENDE_UITKOMST_TEKST,
  OPSLAAN_BEZIG_TEKST,
  isBezig,
  isPrijsOnopgeslagen,
} from "@/lib/opslaan";
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
  const priceMutation = useUpdateProductPrice();
  const archiveMutation = useSetProductArchived();
  const priceId = useId();
  const priceInputRef = useRef<HTMLInputElement>(null);
  const archiveButtonRef = useRef<HTMLButtonElement>(null);
  const herstelFocus = useHerstelFocus();

  // Serialisatie per product (docs/features/opslaan-sluiten-pending.md): één
  // schrijfactie tegelijk, dus een late response kan een nieuwere niet meer
  // overschrijven en elke sectie houdt zijn eigen fout (F11).
  const priceBusy = priceMutation.status === "pending";
  const archiveBusy = archiveMutation.status === "pending";
  const busy = isBezig(priceBusy, archiveBusy);
  const { closeBlocked, timedOut } = useOpslaanBlokkade(busy);
  const unsaved = isPrijsOnopgeslagen(priceInput, product.priceCents);

  const parsedPriceCents = parseEuroToCents(priceInput);
  const canSavePrice =
    priceInput.trim() !== "" &&
    parsedPriceCents !== null &&
    parsedPriceCents > 0 &&
    parsedPriceCents !== product.priceCents &&
    !busy;

  async function savePrice() {
    if (!canSavePrice || parsedPriceCents === null) return;
    const updated = await priceMutation.updateProductPrice(
      product.id,
      parsedPriceCents
    );
    if (updated) {
      // Alleen wat deze actie wijzigde; de rest van het lokale product blijft.
      setProduct((current) => ({ ...current, priceCents: updated.priceCents }));
      setPriceInput("");
      onChanged();
    }
    herstelFocus(priceInputRef.current);
  }

  async function toggleArchived() {
    if (busy) return;
    const updated = await archiveMutation.setProductArchived(
      product.id,
      !product.archived
    );
    if (updated) {
      setProduct((current) => ({ ...current, archived: updated.archived }));
      onChanged();
    }
    herstelFocus(archiveButtonRef.current);
  }

  return (
    <Overlay
      title="Product beheren"
      description={`Wijzigingen aan ${product.name}.`}
      onClose={onClose}
      closeBlocked={closeBlocked}
      onopgeslagen={unsaved}
    >
      {timedOut && (
        <p className="text-sm font-bold text-danger" role="alert">
          {ONBEKENDE_UITKOMST_TEKST}
        </p>
      )}

      <div className="flex items-center justify-between rounded-control bg-canvas px-3.5 py-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
          Huidige prijs
        </span>
        <span className="text-sm font-extrabold text-ink">
          {formatCents(product.priceCents)}
        </span>
      </div>

      <OpslaanSectie
        pending={priceBusy}
        wachtOpAnder={archiveBusy}
        fout={priceMutation.errorCode ? priceErrorMessage(priceMutation.errorCode) : null}
      >
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
          <div className="flex flex-1 items-center gap-2 rounded-control border border-border bg-white px-3.5 focus-within:border-accent">
            <span aria-hidden="true" className="text-sm font-bold text-muted">
              €
            </span>
            <input
              ref={priceInputRef}
              id={priceId}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={priceInput}
              readOnly={priceBusy}
              onChange={(event) => {
                setPriceInput(event.target.value);
                if (priceMutation.errorCode) priceMutation.reset();
              }}
              className="h-11 flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink outline-none"
            />
          </div>
          <button
            type="button"
            disabled={!canSavePrice}
            onClick={savePrice}
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
          >
            {priceBusy ? OPSLAAN_BEZIG_TEKST : "Opslaan"}
          </button>
        </div>
      </OpslaanSectie>

      <OpslaanSectie
        chrome={false}
        pending={archiveBusy}
        wachtOpAnder={priceBusy}
        fout={archiveMutation.errorCode ? archiveErrorMessage(archiveMutation.errorCode) : null}
      >
      <button
        ref={archiveButtonRef}
        type="button"
        disabled={busy}
        onClick={toggleArchived}
        className="flex items-center justify-between gap-3 rounded-control border border-border p-3.5 text-left transition-colors hover:border-danger disabled:opacity-50"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-danger">
            {archiveBusy
              ? OPSLAAN_BEZIG_TEKST
              : product.archived
                ? "Terug in assortiment"
                : "Uit assortiment halen"}
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
      </OpslaanSectie>

      <button
        type="button"
        disabled={closeBlocked}
        onClick={onClose}
        className="flex h-11 w-full items-center justify-center rounded-control border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        Sluiten
      </button>
    </Overlay>
  );
}
