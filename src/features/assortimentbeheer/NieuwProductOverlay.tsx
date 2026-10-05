"use client";

import { useId, useRef, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { useHerstelFocus } from "@/hooks/useHerstelFocus";
import { ONBEKENDE_UITKOMST_TEKST, OPSLAAN_BEZIG_TEKST, isNieuwOnopgeslagen } from "@/lib/opslaan";
import {
  useCreateProduct,
  type CreateProductErrorCode,
} from "@/hooks/queries/useCreateProduct";
import type { AssortimentProduct } from "@/hooks/queries/useAlleProducten";
import { parseEuroToCents } from "@/lib/money";
import { bedragFout, bedragFoutTekst } from "@/lib/veldFouten";
import { VeldFout } from "@/components/TekstVeld";
import { useVeldMoment } from "@/hooks/useVeldMoment";
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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const herstelFocus = useHerstelFocus();
  const pending = createProduct.status === "pending";
  const { closeBlocked, timedOut } = useOpslaanBlokkade(pending);
  const unsaved = isNieuwOnopgeslagen([name, category, priceInput]);

  // Een fout hoort bij de invoer die de gebruiker nu wijzigt: wissen zodra hij typt.
  function wijzig() {
    if (createProduct.errorCode) createProduct.reset();
  }

  const priceCents = parseEuroToCents(priceInput);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const priceMoment = useVeldMoment();
  const priceSoort = bedragFout(priceInput);
  const priceMelding =
    priceSoort !== null && (priceMoment.pogingGedaan || priceMoment.aangeraakt)
      ? bedragFoutTekst(priceSoort, "prijs")
      : null;
  // Een ongeldige prijs schakelt de knop niet uit: een tik toont de melding.
  const canSubmit = name.trim() !== "" && category !== null && !pending;

  async function submit() {
    if (!canSubmit || category === null) return;
    if (priceSoort !== null || priceCents === null) {
      priceMoment.bijPoging();
      priceInputRef.current?.focus();
      return;
    }
    const product = await createProduct.createProduct(name, category, priceCents);
    if (product) {
      onCreated(product);
      return;
    }
    herstelFocus(nameInputRef.current);
  }

  return (
    <Overlay
      title="Nieuw product"
      description="Naam, categorie en prijs — het product staat meteen op het verkoopscherm."
      onClose={onClose}
      closeBlocked={closeBlocked}
      onopgeslagen={unsaved}
    >
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {timedOut
          ? ONBEKENDE_UITKOMST_TEKST
          : createProduct.errorCode
            ? errorMessage(createProduct.errorCode)
            : ""}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-xs font-bold text-muted">
          Naam
        </label>
        <input
          ref={nameInputRef}
          id={nameId}
          type="text"
          value={name}
          readOnly={pending}
          onChange={(event) => {
            setName(event.target.value);
            wijzig();
          }}
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
              disabled={pending}
              onClick={() => {
                setCategory(option);
                wijzig();
              }}
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
            ref={priceInputRef}
            id={priceId}
            aria-invalid={priceMelding ? true : undefined}
            aria-describedby={priceMelding ? `${priceId}-fout` : undefined}
            onBlur={priceMoment.bijBlur}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={priceInput}
            readOnly={pending}
            onChange={(event) => {
              setPriceInput(event.target.value);
              priceMoment.bijWijzig();
              wijzig();
            }}
            className="h-12 flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink outline-none"
          />
        </div>
        <VeldFout id={`${priceId}-fout`} tekst={priceMelding} alert={priceMoment.pogingAlert} />
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={closeBlocked}
          onClick={onClose}
          className="flex h-11 flex-1 items-center justify-center rounded-control border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Annuleren
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="flex h-11 flex-1 items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
        >
          {pending ? OPSLAAN_BEZIG_TEKST : "Toevoegen"}
        </button>
      </div>
    </Overlay>
  );
}
