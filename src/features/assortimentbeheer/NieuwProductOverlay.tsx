"use client";

import { useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import {
  useCreateProduct,
  type CreateProductErrorCode,
} from "@/hooks/queries/useCreateProduct";
import type { AssortimentProduct } from "@/hooks/queries/useAlleProducten";
import { parseEuroToCents } from "@/lib/money";
import { PRODUCT_CATEGORIES } from "./categories";

function errorMessage(code: CreateProductErrorCode): string {
  switch (code) {
    case "invalid_name":
      return "vul een naam in";
    case "invalid_category":
      return "kies een categorie";
    case "invalid_price":
      return "vul een geldige prijs in, groter dan €0,00";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan het assortiment niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * "Nieuw product"-overlay — één stap (naam, categorie, prijs), geen
 * naamkeuze/PIN-pad meer (dat was ADR 0001's actor-verificatie, vervallen —
 * de aanroeper is al geïdentificeerd door de actieve `/beheer`-sessie).
 * Zie docs/features/assortimentbeheer.md → Schermflow stap 2.
 */
export function NieuwProductOverlay({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (product: AssortimentProduct) => void;
}) {
  const createProduct = useCreateProduct();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const nameId = useId();
  const priceId = useId();

  const priceCents = parseEuroToCents(priceInput);
  const canSubmit =
    name.trim() !== "" &&
    category !== null &&
    priceCents !== null &&
    priceCents > 0 &&
    createProduct.status !== "pending";

  async function submit() {
    if (!canSubmit || category === null || priceCents === null) return;
    const product = await createProduct.createProduct(name, category, priceCents);
    if (product) {
      onCreated(product);
    }
  }

  return (
    <Overlay
      title="Nieuw product"
      description="Naam, categorie en prijs — het product staat meteen op het verkoopscherm."
      onClose={onClose}
    >
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {createProduct.errorCode ? errorMessage(createProduct.errorCode) : ""}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-xs font-bold text-muted">
          Naam
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-12 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="float-left w-full text-xs font-bold text-muted">Categorie</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categorie">
          {PRODUCT_CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={category === option}
              onClick={() => setCategory(option)}
              className={`flex h-9 items-center justify-center rounded-full border px-3.5 text-xs font-bold transition-colors ${
                category === option
                  ? "border-accent bg-accent text-rail"
                  : "border-border bg-white text-ink hover:border-accent"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={priceId} className="text-xs font-bold text-muted">
          Prijs
        </label>
        <div className="flex items-center gap-2 rounded-control border border-border bg-white px-3.5 focus-within:border-accent">
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
            className="h-12 flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 flex-1 items-center justify-center rounded-control border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink"
        >
          Annuleren
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="flex h-11 flex-1 items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
        >
          Toevoegen
        </button>
      </div>
    </Overlay>
  );
}
