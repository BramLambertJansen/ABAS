import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { crc32, deflateSync } from "node:zlib";

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

// ── Negatieve aanvulling (Tester, PR #146) ───────────────────────────────
//
// Wat de server weigert, op de bytes. De browser-voorcontrole is alleen UX;
// deze gevallen komen langs de voorcontrole met een `type` dat de aanvaller
// zelf kiest.

/** Een PNG-chunk met geldige CRC, voor zelfgebouwde (kwaadaardige) PNG's. */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData) >>> 0);
  return Buffer.concat([length, typeAndData, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngIhdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // bitdiepte
  data[9] = 2; // RGB
  return pngChunk("IHDR", data);
}

test("een PNG-handtekening met rommel erachter is unsupported_type", async () => {
  const vals = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(2000, 0x5a)]);
  assert.deepEqual(await reencodeProductImage(vals), { ok: false, errorCode: "unsupported_type" });
});

test("een geldige PNG-kop (IHDR) met rommel erachter is unsupported_type", async () => {
  const vals = Buffer.concat([PNG_SIGNATURE, pngIhdr(64, 64), Buffer.alloc(2000, 0x5a)]);
  assert.deepEqual(await reencodeProductImage(vals), { ok: false, errorCode: "unsupported_type" });
});

test("een afgekapte PNG die metadata() wel leest, faalt bij het decoderen: unsupported_type", async () => {
  // Ruis, zodat de IDAT groot is en de helft echt midden in de pixels stopt.
  const ruis = Buffer.alloc(200 * 200 * 3);
  for (let i = 0; i < ruis.length; i++) ruis[i] = (i * 2654435761) >>> 24;
  const png = await sharp(ruis, { raw: { width: 200, height: 200, channels: 3 } }).png().toBuffer();
  const kapot = png.subarray(0, Math.floor(png.length / 2));
  // Voorwaarde: de kop is leesbaar, dus dit test de tweede vangst (bij het
  // coderen), niet de eerste (metadata).
  assert.equal((await meta(kapot)).format, "png");
  assert.deepEqual(await reencodeProductImage(kapot), { ok: false, errorCode: "unsupported_type" });
});

test("een decompressiebom (een geldige PNG van 16384 × 16384 px in 32 kB) is unsupported_type", async () => {
  // Eén pixel boven de standaard van `limitInputPixels` (16383²), 1-bit
  // grijs, alles nul: klein genoeg om de uploadgrens ruim te halen, en wél
  // decodeerbaar. Zonder de pixelgrens zou sharp hem echt uitpakken (lokaal
  // ~5 s en honderden MB's); met de grens weigert metadata() meteen.
  const width = 16_384;
  const height = 16_384;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1; // bitdiepte
  ihdr[9] = 0; // grijs
  const rijen = Buffer.alloc(height * (1 + width / 8));
  const bom = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rijen, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  assert.ok(bom.byteLength < PRODUCT_IMAGE_MAX_UPLOAD_BYTES, "voorwaarde: de uploadgrens houdt dit niet tegen");
  assert.deepEqual(await reencodeProductImage(bom), { ok: false, errorCode: "unsupported_type" });
});

test("een HEIC-bestand (ftyp heic) is unsupported_type", async () => {
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypheic", "ascii"),
    Buffer.alloc(4),
    Buffer.from("mif1heic", "ascii"),
  ]);
  assert.deepEqual(await reencodeProductImage(heic), { ok: false, errorCode: "unsupported_type" });
});

test("een AVIF (HEIF-container die sharp wél kan lezen) is unsupported_type: de allowlist weigert", async () => {
  const avif = await vlak(20, 20).avif().toBuffer();
  // Voorwaarde: sharp herkent het, dus alleen de allowlist houdt het tegen.
  // Een echte HEIC die libheif wel zou decoderen, krijgt dezelfde `heif`.
  assert.equal((await meta(avif)).format, "heif");
  assert.deepEqual(await reencodeProductImage(avif), { ok: false, errorCode: "unsupported_type" });
});

test("een TIFF (door sharp leesbaar) is unsupported_type: de allowlist weigert", async () => {
  const tiff = await vlak(20, 20).tiff().toBuffer();
  assert.equal((await meta(tiff)).format, "tiff");
  assert.deepEqual(await reencodeProductImage(tiff), { ok: false, errorCode: "unsupported_type" });
});

test("een PDF is unsupported_type", async () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  assert.deepEqual(await reencodeProductImage(pdf), { ok: false, errorCode: "unsupported_type" });
});

test("een SVG met een PNG-handtekening ervoor is unsupported_type", async () => {
  const svg = Buffer.concat([
    PNG_SIGNATURE,
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  ]);
  assert.deepEqual(await reencodeProductImage(svg), { ok: false, errorCode: "unsupported_type" });
});

test("een JPEG met een script erachter (polyglot): de uitvoer is een schone WebP zonder dat script", async () => {
  const jpeg = await vlak(20, 20).jpeg().toBuffer();
  const payload = "<script>alert(1)</script>";
  const polyglot = Buffer.concat([jpeg, Buffer.from(payload)]);
  const result = await reencodeProductImage(polyglot);
  assert.ok(result.ok);
  assert.equal((await meta(result.webp)).format, "webp");
  assert.equal(result.webp.includes(Buffer.from(payload)), false);
  assert.equal(result.webp.includes(Buffer.from("<script")), false);
});

test("een bewegende WebP wordt het eerste frame: één pagina in de uitvoer", async () => {
  const rood = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const blauw = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#0000ff" } }).png().toBuffer();
  const bewegend = await sharp([rood, blauw], { join: { animated: true } }).webp().toBuffer();
  assert.equal((await meta(bewegend)).pages, 2);
  const result = await reencodeProductImage(bewegend);
  assert.ok(result.ok);
  const m = await meta(result.webp);
  assert.ok(m.pages === undefined || m.pages === 1, `verwacht één frame, kreeg ${m.pages}`);
  const { data } = await sharp(result.webp).raw().toBuffer({ resolveWithObject: true });
  // Het eerste frame (rood), niet het tweede (blauw).
  assert.ok(data[0] > 200 && data[2] < 50, `eerste pixel is rood, kreeg ${data[0]},${data[1]},${data[2]}`);
});

test("GPS-gegevens in de EXIF gaan niet mee naar de uitvoer", async () => {
  const input = await vlak(40, 40)
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 3/1 0/1" } })
    .toBuffer();
  assert.ok((await meta(input)).exif, "voorwaarde: de invoer heeft EXIF");
  const result = await reencodeProductImage(input);
  assert.ok(result.ok);
  const m = await meta(result.webp);
  assert.equal(m.exif, undefined);
  assert.equal(result.webp.includes(Buffer.from("GPS")), false);
});
