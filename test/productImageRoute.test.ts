import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import sharp from "sharp";

import { fakeProductImage, resetFakeProductImage } from "./fakes/productImageState.ts";

/**
 * De Route Handler voor productafbeeldingen (src/app/(bar)/beheer/
 * productafbeelding/route.ts) met de échte server-actie erachter
 * (src/lib/productImage.ts) en de échte beeldverwerking: een multipart- of
 * JSON-request erin, en kijken wat er gelezen, geüpload, aangeroepen en
 * opgeruimd wordt. Alleen de twee Supabase-clients zijn nep
 * (test/fakes/product-image-route-resolve.mjs). Negatieve aanvulling van de
 * Tester op test/productImage.test.ts, die de server-actie los aanroept.
 *
 * Wat dit níét toetst: de Storage-API zelf (bucketlimieten, `remove`), en de
 * 4,5 MB-grens van Vercel (die weigert vóór de route draait). Zie spec →
 * Tests, "Handmatig of e2e".
 */
register("./fakes/product-image-route-resolve.mjs", import.meta.url);

const { POST, DELETE } = await import("../src/app/(bar)/beheer/productafbeelding/route.ts");
const { NextRequest } = await import("next/server.js");
const { PRODUCT_IMAGE_MAX_UPLOAD_BYTES } = await import("../src/lib/productImageRules.ts");

const URL_ROUTE = "https://abas.example/beheer/productafbeelding";
const PRODUCT = "00000000-0000-4000-8000-0000000000a1";
const OUD_PAD = `products/${PRODUCT}/11111111-1111-4111-8111-111111111111.webp`;

const PNG = await sharp({
  create: { width: 20, height: 10, channels: 3, background: { r: 200, g: 50, b: 50 } },
})
  .png()
  .toBuffer();

type Bestand = { bytes: Uint8Array; type: string; name: string };

function bestand(bytes: Uint8Array, type = "image/png", name = "pils.png"): Bestand {
  return { bytes, type, name };
}

function upload(
  file: Bestand | string | null,
  opties: { productId?: string | null; headers?: Record<string, string> } = {}
) {
  const form = new FormData();
  const productId = opties.productId === undefined ? PRODUCT : opties.productId;
  if (productId !== null) form.append("productId", productId);
  if (typeof file === "string") form.append("file", file);
  else if (file) form.append("file", new Blob([Uint8Array.from(file.bytes)], { type: file.type }), file.name);
  return new NextRequest(URL_ROUTE, { method: "POST", body: form, headers: opties.headers });
}

function verwijder(body: string) {
  return new NextRequest(URL_ROUTE, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

async function antwoord(response: Response) {
  return { status: response.status, body: await response.json() };
}

function stil<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = original;
  });
}

function heeftGeupload(): boolean {
  return fakeProductImage().calls.some((c) => c.startsWith("upload:"));
}

function geuploadPad(): string {
  const call = fakeProductImage().calls.find((c) => c.startsWith("upload:"));
  assert.ok(call, "er is geüpload");
  return call.slice("upload:".length);
}

beforeEach(() => {
  resetFakeProductImage();
  fakeProductImage().rpc.set_product_image = { data: null };
});

// ── POST: wie mag ────────────────────────────────────────────────────────

test("POST zonder sessie: actor_not_found, body ongelezen, niets geüpload", async () => {
  fakeProductImage().user = null;
  const request = upload(bestand(PNG));
  const result = await antwoord(await POST(request));
  assert.deepEqual(result.body, { ok: false, errorCode: "actor_not_found" });
  assert.equal(request.bodyUsed, false, "de multipart-body is niet gelezen");
  assert.deepEqual(fakeProductImage().calls, []);
});

for (const code of ["no_bar_session", "wrong_mode", "aal2_required", "session_ended", "session_inactive", "no_bar_role"]) {
  test(`POST met sessiecode ${code} (bv. een beheerder in bar-modus): ongewijzigd terug, niets gelezen of geüpload`, async () => {
    fakeProductImage().rpc.check_beheer_session = { error: { message: code } };
    const request = upload(bestand(PNG));
    const result = await antwoord(await POST(request));
    assert.deepEqual(result.body, { ok: false, errorCode: code });
    assert.equal(request.bodyUsed, false);
    assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
  });
}

for (const role of ["lid", "bardienst"]) {
  test(`POST als ${role}: no_admin_role, zonder sessiecontrole, lezen of uploaden`, async () => {
    fakeProductImage().actor = { id: `m-${role}`, role };
    const request = upload(bestand(PNG));
    const result = await antwoord(await POST(request));
    assert.deepEqual(result.body, { ok: false, errorCode: "no_admin_role" });
    assert.equal(request.bodyUsed, false);
    assert.deepEqual(fakeProductImage().calls, []);
  });
}

test("POST als een niet-gekoppeld of gearchiveerd account (geen actor-rij): actor_not_found", async () => {
  fakeProductImage().actor = null;
  const result = await antwoord(await POST(upload(bestand(PNG))));
  assert.deepEqual(result.body, { ok: false, errorCode: "actor_not_found" });
  assert.deepEqual(fakeProductImage().calls, []);
});

test("POST als de actor-query faalt: unknown, niets gelezen of geüpload", async () => {
  fakeProductImage().actorError = { message: "db down" };
  const request = upload(bestand(PNG));
  const result = await stil(async () => antwoord(await POST(request)));
  assert.deepEqual(result.body, { ok: false, errorCode: "unknown" });
  assert.equal(request.bodyUsed, false);
  assert.deepEqual(fakeProductImage().calls, []);
});

test("POST waarbij de server-actie gooit: 500 met unknown, niets geüpload", async () => {
  Object.defineProperty(fakeProductImage(), "user", {
    get() {
      throw new Error("auth down");
    },
  });
  const result = await stil(async () => antwoord(await POST(upload(bestand(PNG)))));
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { ok: false, errorCode: "unknown" });
  assert.equal(heeftGeupload(), false);
});

// ── POST: grootte ────────────────────────────────────────────────────────

test("POST met een Content-Length ruim boven de grens: file_too_large, body ongelezen", async () => {
  const request = upload(bestand(PNG), {
    headers: { "content-length": String(PRODUCT_IMAGE_MAX_UPLOAD_BYTES + 1024 * 1024) },
  });
  const result = await antwoord(await POST(request));
  assert.deepEqual(result.body, { ok: false, errorCode: "file_too_large" });
  assert.equal(request.bodyUsed, false);
  assert.equal(heeftGeupload(), false);
});

test("POST met een bestand van 4 MB + 1 byte (zonder Content-Length): file_too_large, niets geüpload", async () => {
  const groot = new Uint8Array(PRODUCT_IMAGE_MAX_UPLOAD_BYTES + 1);
  groot.set(PNG);
  const result = await antwoord(await POST(upload(bestand(groot))));
  assert.deepEqual(result.body, { ok: false, errorCode: "file_too_large" });
  assert.equal(heeftGeupload(), false);
});

test("POST met een PNG van precies 4 MB (opgevuld): de grens zelf mag", async () => {
  const precies = new Uint8Array(PRODUCT_IMAGE_MAX_UPLOAD_BYTES);
  precies.set(PNG);
  const result = await antwoord(await POST(upload(bestand(precies))));
  assert.equal(result.body.ok, true);
  assert.equal(heeftGeupload(), true);
});

test("POST met een leeg bestand: file_missing", async () => {
  const result = await antwoord(await POST(upload(bestand(new Uint8Array(0)))));
  assert.deepEqual(result.body, { ok: false, errorCode: "file_missing" });
  assert.equal(heeftGeupload(), false);
});

test("POST met `file` als tekstveld in plaats van een bestand: file_missing", async () => {
  const result = await antwoord(await POST(upload("iVBORw0KGgo=")));
  assert.deepEqual(result.body, { ok: false, errorCode: "file_missing" });
  assert.equal(heeftGeupload(), false);
});

test("POST zonder `file`: file_missing", async () => {
  const result = await antwoord(await POST(upload(null)));
  assert.deepEqual(result.body, { ok: false, errorCode: "file_missing" });
  assert.equal(heeftGeupload(), false);
});

// ── POST: vals of verboden type ──────────────────────────────────────────
// De browser stuurt hier steeds `image/png`: de server kijkt naar de bytes.

const PNG_HANDTEKENING = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const valseBestanden: [string, () => Promise<Uint8Array>][] = [
  ["een PNG-handtekening met rommel erachter", async () => {
    const b = new Uint8Array(2048).fill(0x5a);
    b.set(PNG_HANDTEKENING);
    return b;
  }],
  ["een SVG met een script", async () =>
    new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'
    )],
  ["een GIF", async () =>
    sharp({ create: { width: 10, height: 10, channels: 3, background: "#123456" } }).gif().toBuffer()],
  ["een HEIC (ftyp heic)", async () =>
    Uint8Array.from([
      0, 0, 0, 24,
      ...new TextEncoder().encode("ftypheic"),
      0, 0, 0, 0,
      ...new TextEncoder().encode("mif1heic"),
    ])],
  ["een AVIF/HEIF die sharp kan lezen", async () =>
    sharp({ create: { width: 10, height: 10, channels: 3, background: "#123456" } }).avif().toBuffer()],
  ["een HTML-bestand", async () => new TextEncoder().encode("<!doctype html><p>hallo</p>")],
];

for (const [naam, maak] of valseBestanden) {
  test(`POST met ${naam} (als image/png gestuurd): unsupported_type, niets geüpload, geen RPC`, async () => {
    const result = await antwoord(await POST(upload(bestand(await maak()))));
    assert.deepEqual(result.body, { ok: false, errorCode: "unsupported_type" });
    assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
  });
}

// ── POST: product-id ─────────────────────────────────────────────────────

for (const [naam, productId] of [
  ["geen productId", null],
  ["een productId dat geen uuid is", "pils"],
  ["een productId met een pad erin", `${PRODUCT}/../00000000-0000-4000-8000-0000000000a2`],
] as const) {
  test(`POST met ${naam}: product_not_found, niets geüpload`, async () => {
    const result = await antwoord(await POST(upload(bestand(PNG), { productId })));
    assert.deepEqual(result.body, { ok: false, errorCode: "product_not_found" });
    assert.equal(heeftGeupload(), false);
    assert.ok(!fakeProductImage().calls.includes("rpc:set_product_image"));
  });
}

test("POST met een productId in hoofdletters: pad en RPC-argument in kleine letters", async () => {
  const result = await antwoord(await POST(upload(bestand(PNG), { productId: PRODUCT.toUpperCase() })));
  assert.equal(result.body.ok, true);
  const pad = geuploadPad();
  assert.ok(pad.startsWith(`products/${PRODUCT}/`), pad);
  const rpc = fakeProductImage().rpcArgs.find((c) => c.fn === "set_product_image");
  assert.deepEqual(rpc?.args, { p_product_id: PRODUCT, p_image_path: pad });
});

test("POST zonder multipart-body (JSON): unknown, niets geüpload", async () => {
  const request = new NextRequest(URL_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: PRODUCT }),
  });
  const result = await stil(async () => antwoord(await POST(request)));
  assert.deepEqual(result.body, { ok: false, errorCode: "unknown" });
  assert.equal(heeftGeupload(), false);
});

// ── POST: opruimvolgorde ─────────────────────────────────────────────────

test("POST: de RPC krijgt precies het geüploade pad, en het vorige object gaat pas ná de RPC weg", async () => {
  fakeProductImage().rpc.set_product_image = { data: OUD_PAD };
  const result = await antwoord(await POST(upload(bestand(PNG))));
  const pad = geuploadPad();
  assert.deepEqual(result.body, { ok: true, imagePath: pad });
  assert.deepEqual(fakeProductImage().calls, [
    "rpc:check_beheer_session",
    `upload:${pad}`,
    "rpc:set_product_image",
    `remove:${OUD_PAD}`,
  ]);
  assert.deepEqual(fakeProductImage().rpcArgs.at(-1), {
    fn: "set_product_image",
    args: { p_product_id: PRODUCT, p_image_path: pad },
  });
});

test("POST: faalt de RPC, dan gaat alleen het nieuwe object weg, nooit het oude", async () => {
  fakeProductImage().rpc.set_product_image = { error: { message: "no_admin_role" } };
  const result = await antwoord(await POST(upload(bestand(PNG))));
  const pad = geuploadPad();
  assert.deepEqual(result.body, { ok: false, errorCode: "no_admin_role" });
  const removes = fakeProductImage().calls.filter((c) => c.startsWith("remove:"));
  assert.deepEqual(removes, [`remove:${pad}`]);
});

test("POST: faalt de RPC én het compenseren, dan nog steeds de RPC-fout (geen ok)", async () => {
  fakeProductImage().rpc.set_product_image = { error: { message: "product_not_found" } };
  // Het pad is willekeurig; elke remove faalt.
  fakeProductImage().removeError = new Proxy({}, { get: () => ({ message: "storage down" }) });
  const result = await stil(async () => antwoord(await POST(upload(bestand(PNG)))));
  assert.deepEqual(result.body, { ok: false, errorCode: "product_not_found" });
});

test("POST: een onbekende RPC-fout wordt unknown, en het nieuwe object gaat weg", async () => {
  fakeProductImage().rpc.set_product_image = { error: { message: "deadlock detected" } };
  const result = await stil(async () => antwoord(await POST(upload(bestand(PNG)))));
  assert.deepEqual(result.body, { ok: false, errorCode: "unknown" });
  assert.ok(fakeProductImage().calls.includes(`remove:${geuploadPad()}`));
});

test("POST: een mislukte upload betekent geen RPC en geen enkele remove", async () => {
  fakeProductImage().uploadError = { message: "storage down" };
  const result = await stil(async () => antwoord(await POST(upload(bestand(PNG)))));
  assert.deepEqual(result.body, { ok: false, errorCode: "upload_failed" });
  assert.ok(!fakeProductImage().calls.includes("rpc:set_product_image"));
  assert.ok(!fakeProductImage().calls.some((c) => c.startsWith("remove:")));
});

// ── DELETE ───────────────────────────────────────────────────────────────

test("DELETE met een body die geen JSON is: 400 unknown, niets aangeroepen", async () => {
  const result = await antwoord(await DELETE(verwijder("{niet-json")));
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { ok: false, errorCode: "unknown" });
  assert.deepEqual(fakeProductImage().calls, []);
});

test("DELETE zonder sessie: actor_not_found, geen RPC en geen remove", async () => {
  fakeProductImage().user = null;
  const result = await antwoord(await DELETE(verwijder(JSON.stringify({ productId: PRODUCT }))));
  assert.deepEqual(result.body, { ok: false, errorCode: "actor_not_found" });
  assert.deepEqual(fakeProductImage().calls, []);
});

test("DELETE in bar-modus (wrong_mode): ongewijzigd terug, geen set_product_image en geen remove", async () => {
  fakeProductImage().rpc.check_beheer_session = { error: { message: "wrong_mode" } };
  const result = await antwoord(await DELETE(verwijder(JSON.stringify({ productId: PRODUCT }))));
  assert.deepEqual(result.body, { ok: false, errorCode: "wrong_mode" });
  assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
});

test("DELETE als lid: no_admin_role, niets aangeroepen", async () => {
  fakeProductImage().actor = { id: "m-lid", role: "lid" };
  const result = await antwoord(await DELETE(verwijder(JSON.stringify({ productId: PRODUCT }))));
  assert.deepEqual(result.body, { ok: false, errorCode: "no_admin_role" });
  assert.deepEqual(fakeProductImage().calls, []);
});

for (const [naam, body] of [
  ["null als body", "null"],
  ["geen productId", "{}"],
  ["een productId dat geen uuid is", JSON.stringify({ productId: "pils" })],
  ["een productId dat een getal is", JSON.stringify({ productId: 42 })],
] as const) {
  test(`DELETE met ${naam}: product_not_found, geen set_product_image`, async () => {
    const result = await antwoord(await DELETE(verwijder(body)));
    assert.deepEqual(result.body, { ok: false, errorCode: "product_not_found" });
    assert.ok(!fakeProductImage().calls.includes("rpc:set_product_image"));
  });
}

test("DELETE: faalt de RPC, dan wordt er niets verwijderd", async () => {
  fakeProductImage().rpc.set_product_image = { error: { message: "product_not_found" } };
  const result = await antwoord(await DELETE(verwijder(JSON.stringify({ productId: PRODUCT }))));
  assert.deepEqual(result.body, { ok: false, errorCode: "product_not_found" });
  assert.ok(!fakeProductImage().calls.some((c) => c.startsWith("remove:")));
});

test("DELETE: de RPC krijgt p_image_path null, het vorige object gaat daarna weg", async () => {
  fakeProductImage().rpc.set_product_image = { data: OUD_PAD };
  const result = await antwoord(await DELETE(verwijder(JSON.stringify({ productId: PRODUCT.toUpperCase() }))));
  assert.deepEqual(result.body, { ok: true, imagePath: null });
  assert.deepEqual(fakeProductImage().rpcArgs.at(-1), {
    fn: "set_product_image",
    args: { p_product_id: PRODUCT, p_image_path: null },
  });
  assert.deepEqual(fakeProductImage().calls, [
    "rpc:check_beheer_session",
    "rpc:set_product_image",
    `remove:${OUD_PAD}`,
  ]);
});
