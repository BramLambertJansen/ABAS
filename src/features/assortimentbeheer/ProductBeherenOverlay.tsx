"use client";

import { useId, useRef, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { OpslaanSectie } from "@/components/OpslaanSectie";
import { ProductAfbeelding } from "@/components/ProductAfbeelding";
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
import {
  useProductAfbeelding,
  type ProductAfbeeldingErrorCode,
} from "@/hooks/queries/useProductAfbeelding";
import type { AssortimentProduct } from "@/hooks/queries/useAlleProducten";
import { formatCents, parseEuroToCents } from "@/lib/money";
import { bedragFout, bedragFoutTekst } from "@/lib/veldFouten";
import { VeldFout } from "@/components/TekstVeld";
import { useVeldMoment } from "@/hooks/useVeldMoment";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import {
  PRODUCT_IMAGE_ACCEPT,
  precheckProductImage,
  type ProductImageCheckCode,
} from "@/lib/productImageRules";

/** Bezig-tekst in de ingedrukte knop tijdens het uploaden (spec → Schermflow,
 *  Besluit 15). Weghalen toont `OPSLAAN_BEZIG_TEKST`, zoals de archiefknop. */
const UPLOAD_BEZIG_TEKST = "Bezig met uploaden…";

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

function imageErrorMessage(code: ProductAfbeeldingErrorCode | ProductImageCheckCode): string {
  // De melding bij een sessiecode komt van BarSessieProvider; hier niets.
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  switch (code) {
    case "file_missing":
      return "kies eerst een bestand";
    case "file_too_large":
      return "dit bestand is te groot — maximaal 4 MB";
    case "unsupported_type":
      return "dit bestandstype kan niet — kies een JPG, PNG of WebP";
    case "upload_failed":
      return "de afbeelding kon niet worden opgeslagen, probeer het opnieuw";
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
 * "Product beheren"-overlay: afbeelding, prijs wijzigen en
 * uit/terug-in-assortiment, drie onafhankelijke schrijfacties in dezelfde
 * overlay-instantie (geen gecombineerde aanroep). Zie
 * docs/features/assortimentbeheer.md → Schermflow stap 3 en
 * docs/features/productafbeeldingen.md → Schermflow. Het afbeeldingsblok
 * staat bovenaan, direct onder de kop (Besluit 14).
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
  const imageMutation = useProductAfbeelding();
  const [imagePrecheck, setImagePrecheck] = useState<ProductImageCheckCode | null>(null);
  const priceId = useId();
  const imageTitleId = useId();
  const imageHintId = useId();
  const priceInputRef = useRef<HTMLInputElement>(null);
  const archiveButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // "Afbeelding kiezen" en "Vervangen" zijn dezelfde knop met een ander
  // label, zodat de focus na afloop altijd een bestaand element vindt.
  const chooseButtonRef = useRef<HTMLButtonElement>(null);
  const herstelFocus = useHerstelFocus();

  // Serialisatie per product (docs/features/opslaan-sluiten-pending.md): één
  // schrijfactie tegelijk, dus een late response kan een nieuwere niet meer
  // overschrijven en elke sectie houdt zijn eigen fout (F11).
  const priceBusy = priceMutation.status === "pending";
  const archiveBusy = archiveMutation.status === "pending";
  const imageBusy = imageMutation.status === "pending";
  const busy = isBezig(priceBusy, archiveBusy, imageBusy);
  const { closeBlocked, timedOut } = useOpslaanBlokkade(busy);
  const unsaved = isPrijsOnopgeslagen(priceInput, product.priceCents);

  const parsedPriceCents = parseEuroToCents(priceInput);
  const priceMoment = useVeldMoment();
  const priceSoort = bedragFout(priceInput);
  const priceMelding =
    priceSoort !== null && (priceMoment.pogingGedaan || priceMoment.aangeraakt)
      ? bedragFoutTekst(priceSoort, "prijs")
      : null;
  // Een ongeldige of lege prijs schakelt de knop niet uit: een tik toont de
  // melding. Uit blijft: bezig, of een geldige prijs die niets wijzigt.
  const canSavePrice = parsedPriceCents !== product.priceCents && !busy;

  async function savePrice() {
    if (!canSavePrice) return;
    if (priceSoort !== null || parsedPriceCents === null) {
      priceMoment.bijPoging();
      priceInputRef.current?.focus();
      return;
    }
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

  function chooseImage() {
    if (busy) return;
    fileInputRef.current?.click();
  }

  async function onImageChosen(file: File | undefined) {
    // Een nieuwe keuze wist de vorige melding (voorcontrole of server).
    setImagePrecheck(null);
    imageMutation.reset();
    if (!file || busy) return;
    // Alleen voor de UX: de server controleert opnieuw, op de echte bytes.
    const check = precheckProductImage(file);
    if (check) {
      setImagePrecheck(check);
      return;
    }
    const result = await imageMutation.upload(product.id, file);
    if (result) {
      setProduct((current) => ({ ...current, imageUrl: result.imageUrl }));
      onChanged();
    }
    herstelFocus(chooseButtonRef.current);
  }

  async function removeImage() {
    if (busy) return;
    setImagePrecheck(null);
    const result = await imageMutation.remove(product.id);
    if (result) {
      setProduct((current) => ({ ...current, imageUrl: result.imageUrl }));
      onChanged();
    }
    // De knop "Verwijderen" is na succes weg; "Afbeelding kiezen" bestaat
    // in beide staten.
    herstelFocus(chooseButtonRef.current);
  }

  const imageErrorCode = imagePrecheck ?? imageMutation.errorCode;

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

      <div className="flex items-center gap-[13px]">
        <ProductAfbeelding imageUrl={product.imageUrl} name={product.name} size="detail" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[17px] font-extrabold tracking-[-0.015em] text-ink">
            {product.name}
          </span>
          <span className="text-[11.5px] font-semibold text-muted">{product.category}</span>
        </div>
      </div>

      <OpslaanSectie
        pending={imageBusy}
        wachtOpAnder={priceBusy || archiveBusy}
        fout={imageErrorCode ? imageErrorMessage(imageErrorCode) || null : null}
      >
        <div className="flex flex-col gap-0.5">
          <span id={imageTitleId} className="text-sm font-bold text-ink">
            Afbeelding
          </span>
          <span id={imageHintId} className="text-xs font-medium text-muted">
            JPG, PNG of WebP, maximaal 4 MB
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={PRODUCT_IMAGE_ACCEPT}
          tabIndex={-1}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Leegmaken, zodat hetzelfde bestand opnieuw kiezen weer een
            // keuze is.
            event.target.value = "";
            void onImageChosen(file);
          }}
        />
        {/* De groep geeft "Vervangen" en "Verwijderen" hun context voor een
            schermlezer ("Afbeelding"), zonder de zichtbare teksten te
            veranderen; het verborgen bestandsinput zit niet in de
            toegankelijkheidsboom en kan die koppeling niet dragen. */}
        <div
          role="group"
          aria-labelledby={imageTitleId}
          aria-describedby={imageHintId}
          className="flex flex-wrap items-center gap-2"
        >
          <button
            ref={chooseButtonRef}
            type="button"
            disabled={busy}
            onClick={chooseImage}
            className="flex h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {imageMutation.pendingAction === "upload"
              ? UPLOAD_BEZIG_TEKST
              : product.imageUrl
                ? "Vervangen"
                : "Afbeelding kiezen"}
          </button>
          {product.imageUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={removeImage}
              className="flex h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-bold text-danger transition-colors hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              {imageMutation.pendingAction === "remove" ? OPSLAAN_BEZIG_TEKST : "Verwijderen"}
            </button>
          )}
        </div>
      </OpslaanSectie>

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
        wachtOpAnder={archiveBusy || imageBusy}
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
              aria-invalid={priceMelding ? true : undefined}
              aria-describedby={priceMelding ? `${priceId}-fout` : undefined}
              onBlur={priceMoment.bijBlur}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={priceInput}
              readOnly={priceBusy}
              onChange={(event) => {
                setPriceInput(event.target.value);
                priceMoment.bijWijzig();
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
        <VeldFout id={`${priceId}-fout`} tekst={priceMelding} alert={priceMoment.pogingAlert} />
      </OpslaanSectie>

      <OpslaanSectie
        chrome={false}
        pending={archiveBusy}
        wachtOpAnder={priceBusy || imageBusy}
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
              : "Het product verdwijnt van het verkoopscherm. Verkoophistorie blijft bestaan. Terugzetten kan onder ‘Uit assortiment’."}
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
