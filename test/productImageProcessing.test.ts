import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { reencodeProductImage } from "../src/lib/productImageProcessing.ts";
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_MAX_UPLOAD_BYTES,
  precheckProductImage,
} from "../src/lib/productImageRules.ts";

/**
 * Beeldverwerking en voorcontrole voor productafbeeldingen
 * (docs/features/productafbeeldingen.md → Server-actie stap 3, Besluit 4, 6
 * en 7). De fixtures worden hier met `sharp` gemaakt, zodat er geen
 * binaire bestanden in de repo staan.
 */

function vlak(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } } });
}

async function meta(buffer: Buffer) {
  return sharp(buffer).metadata();
}

// ── Voorcontrole in de browser ───────────────────────────────────────────

test("voorcontrole: JPEG, PNG en WebP tot en met 4 MB mogen", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(precheckProductImage({ type, size: PRODUCT_IMAGE_MAX_UPLOAD_BYTES }), null);
  }
  assert.equal(PRODUCT_IMAGE_ACCEPT, "image/jpeg,image/png,image/webp");
  assert.equal(PRODUCT_IMAGE_MAX_UPLOAD_BYTES, 4 * 1024 * 1024);
});

test("voorcontrole: boven 4 MB is file_too_large", () => {
  assert.equal(
    precheckProductImage({ type: "image/jpeg", size: PRODUCT_IMAGE_MAX_UPLOAD_BYTES + 1 }),
    "file_too_large"
  );
});

test("voorcontrole: HEIC, GIF, SVG, PDF of geen type is unsupported_type", () => {
  for (const type of ["image/heic", "image/gif", "image/svg+xml", "application/pdf", ""]) {
    assert.equal(precheckProductImage({ type, size: 1000 }), "unsupported_type");
  }
});

// ── Opnieuw coderen ──────────────────────────────────────────────────────

test("een PNG van 3000px wordt een WebP van maximaal 512px, met behoud van verhouding", async () => {
  const input = await vlak(3000, 2000).png().toBuffer();
  const result = await reencodeProductImage(input);
  assert.ok(result.ok);
  const m = await meta(result.webp);
  assert.equal(m.format, "webp");
  assert.equal(m.width, 512);
  assert.equal(m.height, 341);
});

test("een JPEG met EXIF-rotatie komt rechtop terug, zonder EXIF", async () => {
  // 200 × 100 opgeslagen, oriëntatie 6: rechtop is dat 100 × 200.
  const input = await vlak(200, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.equal((await meta(input)).orientation, 6);
  const result = await reencodeProductImage(input);
  assert.ok(result.ok);
  const m = await meta(result.webp);
  assert.equal(m.width, 100);
  assert.equal(m.height, 200);
  assert.equal(m.exif, undefined);
  assert.equal(m.orientation, undefined);
});

test("een kleine afbeelding wordt niet vergroot", async () => {
  const result = await reencodeProductImage(await vlak(40, 40).webp().toBuffer());
  assert.ok(result.ok);
  const m = await meta(result.webp);
  assert.equal(m.width, 40);
  assert.equal(m.height, 40);
});

test("een transparante PNG houdt zijn transparantie", async () => {
  const input = await sharp({
    create: { width: 30, height: 30, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const result = await reencodeProductImage(input);
  assert.ok(result.ok);
  assert.equal((await meta(result.webp)).hasAlpha, true);
});

test("een SVG is unsupported_type", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>'
  );
  assert.deepEqual(await reencodeProductImage(svg), { ok: false, errorCode: "unsupported_type" });
});

test("een GIF is unsupported_type", async () => {
  const gif = await vlak(10, 10).gif().toBuffer();
  assert.deepEqual(await reencodeProductImage(gif), { ok: false, errorCode: "unsupported_type" });
});

test("een als .png vermomd tekstbestand is unsupported_type", async () => {
  const tekst = Buffer.from("<!doctype html><p>geen plaatje</p>");
  assert.deepEqual(await reencodeProductImage(tekst), { ok: false, errorCode: "unsupported_type" });
});

test("een afgekapte JPEG is unsupported_type", async () => {
  const jpeg = await vlak(400, 400).jpeg().toBuffer();
  const kapot = jpeg.subarray(0, 40);
  assert.deepEqual(await reencodeProductImage(kapot), { ok: false, errorCode: "unsupported_type" });
});
