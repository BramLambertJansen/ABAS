/**
 * Regels voor productafbeeldingen (docs/features/productafbeeldingen.md,
 * ADR 0018) die client en server delen. Puur: geen React, geen Supabase,
 * geen `sharp`, zodat Product beheren (de voorcontrole) en de server-actie
 * (src/lib/productImage.ts) dezelfde grens gebruiken, en `node --test` dit
 * zonder nep-modules draait.
 *
 * De voorcontrole in de browser is alleen UX: de server controleert alles
 * opnieuw, op de echte bytes.
 */

/** De Storage-bucket (0038_productafbeeldingen.sql). */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Uploadgrens: 4 MB per bestand (Besluit 7). Onder de 4,5 MB van Vercel,
 *  zodat de eigen melding altijd zichtbaar blijft. */
export const PRODUCT_IMAGE_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** De server schaalt naar maximaal dit aantal pixels breed en hoog, zonder
 *  bijsnijden (Besluit 4). */
export const PRODUCT_IMAGE_MAX_PX = 512;

/** Toegestane types (Besluit 7): JPEG, PNG en WebP. Geen HEIC, GIF of SVG. */
export const PRODUCT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Voor `<input type="file" accept>`. */
export const PRODUCT_IMAGE_ACCEPT = PRODUCT_IMAGE_MIME_TYPES.join(",");

export type ProductImageCheckCode = "file_too_large" | "unsupported_type";

/** Mag een bestand van deze grootte geüpload worden? */
export function isProductImageSizeAllowed(sizeBytes: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes >= 0 && sizeBytes <= PRODUCT_IMAGE_MAX_UPLOAD_BYTES;
}

/**
 * Voorcontrole in de browser op wat de bestandskiezer gaf: type (zoals de
 * browser het meldt) en grootte. `null` betekent: uploaden. Te groot gaat
 * vóór het type, zodat een groot HEIC-bestand de grens noemt die het eerst
 * raakt.
 */
export function precheckProductImage(file: { size: number; type: string }): ProductImageCheckCode | null {
  if (!isProductImageSizeAllowed(file.size)) return "file_too_large";
  if (!(PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return "unsupported_type";
  return null;
}
