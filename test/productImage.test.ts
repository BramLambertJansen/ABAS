import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import sharp from "sharp";

import { fakeProductImage, resetFakeProductImage } from "./fakes/productImageState.ts";

/**
 * De volgorde in de server-actie voor productafbeeldingen
 * (src/lib/productImage.ts, docs/features/productafbeeldingen.md →
 * Server-actie, ADR 0018): eerst de verificatie, dan pas lezen, decoderen en
 * uploaden; compenseren als de RPC faalt; het vorige object opruimen, maar
 * niet als het gelijk is aan het nieuwe; een mislukte opruimstap is toch
 * succes. De Supabase-clients zijn nep-modules
 * (test/fakes/product-image-resolve.mjs); de beeldverwerking is echt. De
 * databasekant (set_product_image) is bewezen in
 * supabase/tests/productafbeeldingen.test.sql.
 */
register("./fakes/product-image-resolve.mjs", import.meta.url);

const { uploadProductImage, removeProductImage } = await import("../src/lib/productImage.ts");
const { PRODUCT_IMAGE_MAX_UPLOAD_BYTES } = await import("../src/lib/productImageRules.ts");

const PRODUCT = "00000000-0000-4000-8000-0000000000a1";
const OUD_PAD = `products/${PRODUCT}/11111111-1111-4111-8111-111111111111.webp`;
const NIEUW_PAD_RE = new RegExp(
  `^products/${PRODUCT}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp$`
);

const PNG = await sharp({
  create: { width: 20, height: 10, channels: 3, background: { r: 200, g: 50, b: 50 } },
})
  .png()
  .toBuffer();

/** Een nep-`File`: telt of de bytes gelezen werden. */
function bestand(bytes: Uint8Array, size = bytes.byteLength) {
  const file = {
    size,
    gelezen: false,
    async arrayBuffer() {
      file.gelezen = true;
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    },
  };
  return file;
}

function invoer(file: unknown, opties: { productId?: unknown; contentLength?: number | null } = {}) {
  const state = { formGelezen: false };
  return {
    state,
    input: {
      contentLength: opties.contentLength ?? null,
      readForm: async () => {
        state.formGelezen = true;
        return { productId: opties.productId ?? PRODUCT, file };
      },
    },
  };
}

function stilleConsole<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = original;
  });
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

// ── Verificatie vóór alles ─────────────────────────────────────────────────

for (const code of [
  "no_bar_session",
  "session_ended",
  "session_inactive",
  "wrong_mode",
  "no_bar_role",
  "aal2_required",
]) {
  test(`een sessiecode (${code}) gaat ongewijzigd terug: niets gelezen, gedecodeerd of geüpload`, async () => {
    fakeProductImage().rpc.check_beheer_session = { error: { message: code } };
    const file = bestand(PNG);
    const { input, state } = invoer(file);
    const result = await uploadProductImage(input);
    assert.deepEqual(result, { ok: false, errorCode: code });
    assert.equal(state.formGelezen, false);
    assert.equal(file.gelezen, false);
    assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
  });
}

test("een bardienst (no_admin_role) komt niet eens bij de sessiecontrole", async () => {
  fakeProductImage().actor = { id: "m-bar", role: "bardienst" };
  const file = bestand(PNG);
  const { input, state } = invoer(file);
  const result = await uploadProductImage(input);
  assert.deepEqual(result, { ok: false, errorCode: "no_admin_role" });
  assert.equal(state.formGelezen, false);
  assert.equal(file.gelezen, false);
  assert.deepEqual(fakeProductImage().calls, []);
});

test("zonder gebruiker: actor_not_found, niets verder", async () => {
  fakeProductImage().user = null;
  const { input, state } = invoer(bestand(PNG));
  assert.deepEqual(await uploadProductImage(input), { ok: false, errorCode: "actor_not_found" });
  assert.equal(state.formGelezen, false);
  assert.deepEqual(fakeProductImage().calls, []);
});

test("verwijderen: een sessiecode betekent geen RPC en geen opruimen", async () => {
  fakeProductImage().rpc.check_beheer_session = { error: { message: "wrong_mode" } };
  assert.deepEqual(await removeProductImage(PRODUCT), { ok: false, errorCode: "wrong_mode" });
  assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
});

// ── Invoer ───────────────────────────────────────────────────────────────

test("Content-Length ruim boven de grens: file_too_large zonder de body te lezen", async () => {
  const { input, state } = invoer(bestand(PNG), { contentLength: PRODUCT_IMAGE_MAX_UPLOAD_BYTES + 100_000 });
  assert.deepEqual(await uploadProductImage(input), { ok: false, errorCode: "file_too_large" });
  assert.equal(state.formGelezen, false);
  assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
});

test("een bestand boven de grens: file_too_large zonder te decoderen", async () => {
  const file = bestand(PNG, PRODUCT_IMAGE_MAX_UPLOAD_BYTES + 1);
  const { input } = invoer(file);
  assert.deepEqual(await uploadProductImage(input), { ok: false, errorCode: "file_too_large" });
  assert.equal(file.gelezen, false);
  assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
});

test("geen bestand: file_missing", async () => {
  const { input } = invoer(null);
  assert.deepEqual(await uploadProductImage(input), { ok: false, errorCode: "file_missing" });
  assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
});

test("een vals bestand (tekst als .png): unsupported_type, niets geüpload", async () => {
  const { input } = invoer(bestand(new TextEncoder().encode("<html>niet een plaatje</html>")));
  assert.deepEqual(await uploadProductImage(input), { ok: false, errorCode: "unsupported_type" });
  assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session"]);
});

// ── De gewone gevallen ───────────────────────────────────────────────────

test("eerste upload: verificatie, upload als WebP, dan de RPC; niets op te ruimen", async () => {
  const result = await uploadProductImage(invoer(bestand(PNG)).input);
  const pad = geuploadPad();
  assert.match(pad, NIEUW_PAD_RE);
  assert.deepEqual(result, { ok: true, imagePath: pad });
  assert.deepEqual(fakeProductImage().calls, [
    "rpc:check_beheer_session",
    `upload:${pad}`,
    "rpc:set_product_image",
  ]);
  const upload = fakeProductImage().uploads[pad];
  assert.deepEqual(upload.options, {
    contentType: "image/webp",
    upsert: false,
    cacheControl: String(365 * 24 * 60 * 60),
  });
  assert.equal((await sharp(upload.body).metadata()).format, "webp");
});

test("vervangen: het vorige pad wordt na de RPC opgeruimd", async () => {
  fakeProductImage().rpc.set_product_image = { data: OUD_PAD };
  const result = await uploadProductImage(invoer(bestand(PNG)).input);
  const pad = geuploadPad();
  assert.deepEqual(result, { ok: true, imagePath: pad });
  assert.deepEqual(fakeProductImage().calls, [
    "rpc:check_beheer_session",
    `upload:${pad}`,
    "rpc:set_product_image",
    `remove:${OUD_PAD}`,
  ]);
});

test("geeft de RPC het nieuwe pad zelf terug, dan wordt er niets verwijderd", async () => {
  // De RPC geeft het pad terug dat hij onder `for update` las; als dat al het
  // nieuwe pad is, mag de route het niet weggooien.
  const state = fakeProductImage();
  // Het pad bestaat pas na de upload; de nep-RPC leest het op het moment
  // van de aanroep.
  Object.defineProperty(state.rpc, "set_product_image", {
    get: () => ({ data: geuploadPad() }),
  });
  const result = await uploadProductImage(invoer(bestand(PNG)).input);
  assert.equal(result.ok, true);
  assert.ok(!state.calls.some((c) => c.startsWith("remove:")), "geen remove");
});

test("faalt de RPC, dan wordt het nieuwe object verwijderd en komt de code terug", async () => {
  fakeProductImage().rpc.set_product_image = { error: { message: "product_not_found" } };
  const result = await uploadProductImage(invoer(bestand(PNG)).input);
  const pad = geuploadPad();
  assert.deepEqual(result, { ok: false, errorCode: "product_not_found" });
  assert.deepEqual(fakeProductImage().calls, [
    "rpc:check_beheer_session",
    `upload:${pad}`,
    "rpc:set_product_image",
    `remove:${pad}`,
  ]);
});

test("een sessiecode uit de RPC: ongewijzigd terug, en het nieuwe object weer weg", async () => {
  fakeProductImage().rpc.set_product_image = { error: { message: "session_inactive" } };
  const result = await uploadProductImage(invoer(bestand(PNG)).input);
  assert.deepEqual(result, { ok: false, errorCode: "session_inactive" });
  assert.ok(fakeProductImage().calls.includes(`remove:${geuploadPad()}`));
});

test("invalid_image_path of image_not_found uit de RPC wordt unknown", async () => {
  for (const message of ["invalid_image_path", "image_not_found"]) {
    resetFakeProductImage();
    fakeProductImage().rpc.set_product_image = { error: { message } };
    const result = await stilleConsole(() => uploadProductImage(invoer(bestand(PNG)).input));
    assert.deepEqual(result, { ok: false, errorCode: "unknown" });
  }
});

test("een mislukte upload: upload_failed, geen RPC", async () => {
  fakeProductImage().uploadError = { message: "storage down" };
  const result = await stilleConsole(() => uploadProductImage(invoer(bestand(PNG)).input));
  assert.deepEqual(result, { ok: false, errorCode: "upload_failed" });
  assert.ok(!fakeProductImage().calls.includes("rpc:set_product_image"));
});

test("een mislukte opruimstap geeft toch ok (weesbestand, gelogd)", async () => {
  fakeProductImage().rpc.set_product_image = { data: OUD_PAD };
  fakeProductImage().removeError[OUD_PAD] = { message: "storage down" };
  const result = await stilleConsole(() => uploadProductImage(invoer(bestand(PNG)).input));
  assert.deepEqual(result, { ok: true, imagePath: geuploadPad() });
});

test("verwijderen: RPC met null, dan het vorige object opruimen", async () => {
  fakeProductImage().rpc.set_product_image = { data: OUD_PAD };
  assert.deepEqual(await removeProductImage(PRODUCT), { ok: true, imagePath: null });
  assert.deepEqual(fakeProductImage().calls, [
    "rpc:check_beheer_session",
    "rpc:set_product_image",
    `remove:${OUD_PAD}`,
  ]);
});

test("verwijderen zonder afbeelding: ok, niets op te ruimen (idempotent)", async () => {
  assert.deepEqual(await removeProductImage(PRODUCT), { ok: true, imagePath: null });
  assert.deepEqual(fakeProductImage().calls, ["rpc:check_beheer_session", "rpc:set_product_image"]);
});
