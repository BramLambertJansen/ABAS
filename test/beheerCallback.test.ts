import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { fakeAuth, resetFakeAuth } from "./fakes/authCalls.ts";

/**
 * Tests voor src/app/(bar)/beheer/callback/route.ts — ADR 0008
 * (auth-maillinks via `token_hash`) en de `?code=`-route die moet blijven
 * werken. De route zelf draait ongewijzigd; alleen zijn Supabase-client en
 * de best-effort koppel-RPC worden via een resolve-hook vervangen door
 * nep-modules (test/fakes/), zie test/fakes/resolve-hooks.mjs. Zo is
 * zichtbaar wélke auth-call de route doet — iets wat van buitenaf niet te
 * zien is, want elke uitkomst eindigt in dezelfde redirect naar /beheer.
 *
 * `NextRequest`/`NextResponse` zijn de echte (next/server.js).
 */
register("./fakes/resolve-hooks.mjs", import.meta.url);

const { GET } = await import("../src/app/(bar)/beheer/callback/route.ts");
const { NextRequest } = await import("next/server.js");

const ORIGIN = "https://abas.example";

async function callback(query: string) {
  const response = await GET(new NextRequest(`${ORIGIN}/beheer/callback${query}`));
  return { status: response.status, location: response.headers.get("location") };
}

beforeEach(() => {
  resetFakeAuth();
});

for (const type of ["email", "magiclink", "invite"]) {
  test(`token_hash met type=${type} wordt via verifyOtp ingewisseld, daarna koppelen en naar /beheer`, async () => {
    const result = await callback(`?token_hash=abc123&type=${type}`);
    assert.deepEqual(fakeAuth().calls, [
      { method: "verifyOtp", args: { token_hash: "abc123", type } },
      { method: "linkInvitedMemberAccount" },
    ]);
    assert.equal(result.status, 307);
    assert.equal(result.location, `${ORIGIN}/beheer`);
  });
}

// Negatief: alleen de drie sessie-types uit de Magic Link-/Invite-mail.
// `recovery` hoort bij /beheer/wachtwoord-herstellen (token pas bij
// verzenden inwisselen); via deze GET-route zou een mailscanner het token
// al verbruiken. `signup`/`email_change` hebben (nog) geen template die
// hierheen linkt. Hoofdlettervariant: exact vergelijken, niet normaliseren.
for (const type of ["recovery", "signup", "email_change", "EMAIL", "", "onzin"]) {
  test(`token_hash met type=${JSON.stringify(type)} leidt niet tot verifyOtp`, async () => {
    const result = await callback(`?token_hash=abc123&type=${type}`);
    assert.deepEqual(fakeAuth().calls, []);
    assert.equal(result.location, `${ORIGIN}/beheer`);
  });
}

test("token_hash zonder type leidt niet tot verifyOtp", async () => {
  const result = await callback("?token_hash=abc123");
  assert.deepEqual(fakeAuth().calls, []);
  assert.equal(result.location, `${ORIGIN}/beheer`);
});

test("type zonder token_hash (of met lege token_hash) leidt niet tot verifyOtp", async () => {
  await callback("?type=email");
  await callback("?token_hash=&type=email");
  assert.deepEqual(fakeAuth().calls, []);
});

test("zonder parameters: geen auth-call, gewoon naar /beheer", async () => {
  const result = await callback("");
  assert.deepEqual(fakeAuth().calls, []);
  assert.equal(result.status, 307);
  assert.equal(result.location, `${ORIGIN}/beheer`);
});

test("?code= (PKCE) blijft werken: exchangeCodeForSession, daarna koppelen", async () => {
  const result = await callback("?code=pkce-code");
  assert.deepEqual(fakeAuth().calls, [
    { method: "exchangeCodeForSession", args: "pkce-code" },
    { method: "linkInvitedMemberAccount" },
  ]);
  assert.equal(result.location, `${ORIGIN}/beheer`);
});

test("?code= met een onbekend token_hash-type valt terug op de PKCE-exchange", async () => {
  await callback("?code=pkce-code&token_hash=abc123&type=recovery");
  assert.deepEqual(fakeAuth().calls, [
    { method: "exchangeCodeForSession", args: "pkce-code" },
    { method: "linkInvitedMemberAccount" },
  ]);
});

test("mislukte verifyOtp: niet koppelen, wel terug naar /beheer (inlogformulier)", async (t) => {
  t.mock.method(console, "error", () => {});
  fakeAuth().nextError = "Email link is invalid or has expired";
  const result = await callback("?token_hash=verlopen&type=email");
  assert.deepEqual(fakeAuth().calls, [
    { method: "verifyOtp", args: { token_hash: "verlopen", type: "email" } },
  ]);
  assert.equal(result.location, `${ORIGIN}/beheer`);
});

test("mislukte PKCE-exchange (link op ander apparaat geopend): niet koppelen", async (t) => {
  t.mock.method(console, "error", () => {});
  fakeAuth().nextError = "invalid flow state, no valid flow state found";
  await callback("?code=pkce-code");
  assert.deepEqual(fakeAuth().calls, [
    { method: "exchangeCodeForSession", args: "pkce-code" },
  ]);
});

test("redirect blijft op de eigen origin, ook met een next/redirect_to-parameter", async () => {
  const result = await callback(
    "?token_hash=abc123&type=email&next=https://evil.example&redirect_to=https://evil.example"
  );
  assert.equal(result.location, `${ORIGIN}/beheer`);
});
