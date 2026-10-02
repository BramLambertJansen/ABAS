import sharp from "sharp";
import { PRODUCT_IMAGE_MAX_PX } from "./productImageRules.ts";

/**
 * Beeldverwerking voor productafbeeldingen (docs/features/
 * productafbeeldingen.md → Server-actie stap 3, Besluit 4, 6 en 7). Alleen
 * server-side: `sharp` is een native module en hoort nooit in een
 * `"use client"`-bestand. Los van src/lib/productImage.ts zodat `node --test`
 * dit op echte bytes kan draaien zonder nep-clients.
 *
 * - Het formaat komt uit de bytes (`metadata()`), niet uit de extensie of de
 *   `Content-Type` van de browser. Alleen JPEG, PNG en WebP.
 * - `rotate()` past de EXIF-oriëntatie toe; daarna maximaal 512 × 512 met
 *   behoud van verhouding, zonder vergroten.
 * - Uitvoer is altijd WebP. EXIF/GPS gaan niet mee (`sharp` neemt metadata
 *   alleen over met `withMetadata()`), een bewegende afbeelding wordt het
 *   eerste frame (standaard leest `sharp` één pagina), transparantie blijft.
 * - `limitInputPixels` staat op de standaard van `sharp` tegen
 *   decompressiebommen.
 */

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type ReencodeResult =
  | { ok: true; webp: Buffer }
  | { ok: false; errorCode: "unsupported_type" };

export async function reencodeProductImage(input: Uint8Array): Promise<ReencodeResult> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    return { ok: false, errorCode: "unsupported_type" };
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    return { ok: false, errorCode: "unsupported_type" };
  }

  try {
    const webp = await sharp(input)
      .rotate()
      .resize(PRODUCT_IMAGE_MAX_PX, PRODUCT_IMAGE_MAX_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp()
      .toBuffer();
    return { ok: true, webp };
  } catch {
    // Kapotte of afgekapte bytes van een herkend formaat: zelfde uitkomst als
    // een onbekend formaat (spec → Server-actie stap 3).
    return { ok: false, errorCode: "unsupported_type" };
  }
}
