import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPARAAT_COOKIE_NAAM,
  APPARAAT_MAX_AGE_SECONDEN,
  apparaatCookieOpties,
  hashApparaatToken,
  isGeldigApparaatToken,
  nieuwApparaatToken,
  sessionIdUitAccessToken,
} from "../src/lib/apparaat.ts";

/**
 * Het apparaatcookie `abas_apparaat` en het JWT-claim `session_id`
 * (docs/features/dienst-per-sessie.md → Begrippen; ADR 0016 → Beslissing 7).
 * Het cookie bestaat alleen om de PIN-login aan een apparaat te binden; het
 * token zelf staat nergens, alleen zijn SHA-256.
 */

test("een apparaattoken is 256 bit, base64url, 43 tekens", () => {
  const token = nieuwApparaatToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(isGeldigApparaatToken(token), true);
});

test("twee tokens zijn nooit gelijk", () => {
  const tokens = new Set(Array.from({ length: 50 }, () => nieuwApparaatToken()));
  assert.equal(tokens.size, 50);
});

test("alleen een token van ons formaat is geldig", () => {
  for (const waarde of [undefined, null, "", "kort", "x".repeat(42), "x".repeat(44), "a".repeat(42) + "!", " " + "a".repeat(42)]) {
    assert.equal(isGeldigApparaatToken(waarde), false, String(waarde));
  }
  assert.equal(isGeldigApparaatToken("a".repeat(43)), true);
});

test("de hash is SHA-256 in hexadecimaal, deterministisch, en niet het token zelf", async () => {
  const token = "a".repeat(43);
  const hash = await hashApparaatToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(await hashApparaatToken(token), hash);
  assert.notEqual(hash, token);
  assert.notEqual(await hashApparaatToken("b".repeat(43)), hash);
});

test("de hash klopt met een bekende SHA-256", async () => {
  // SHA-256("abc")
  assert.equal(
    await hashApparaatToken("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("het cookie: HttpOnly, SameSite=Strict, overal geldig, een maand", () => {
  assert.equal(APPARAAT_COOKIE_NAAM, "abas_apparaat");
  assert.equal(APPARAAT_MAX_AGE_SECONDEN, 30 * 24 * 60 * 60);
  const opties = apparaatCookieOpties(true);
  assert.equal(opties.httpOnly, true);
  assert.equal(opties.sameSite, "strict");
  assert.equal(opties.path, "/");
  assert.equal(opties.maxAge, 30 * 24 * 60 * 60);
  assert.equal(opties.secure, true);
});

test("Secure alleen als gevraagd (lokaal en in CI draait de app op http)", () => {
  assert.equal(apparaatCookieOpties(false).secure, false);
});

// ── session_id uit een access token ──────────────────────────────────────

function jwt(payload: unknown): string {
  const b64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.handtekening`;
}

test("het session_id-claim wordt uit een access token gelezen", () => {
  const id = "0b1c5d2e-3f4a-4b6c-8d7e-9f0a1b2c3d4e";
  assert.equal(sessionIdUitAccessToken(jwt({ sub: "u", session_id: id })), id);
});

test("geen (geldig) claim, geen JWT: null", () => {
  assert.equal(sessionIdUitAccessToken(jwt({ sub: "u" })), null);
  assert.equal(sessionIdUitAccessToken(jwt({ session_id: 5 })), null);
  assert.equal(sessionIdUitAccessToken(jwt({ session_id: "geen-uuid" })), null);
  assert.equal(sessionIdUitAccessToken("geen.jwt"), null);
  assert.equal(sessionIdUitAccessToken("a.b.c"), null);
  assert.equal(sessionIdUitAccessToken(""), null);
  assert.equal(sessionIdUitAccessToken(null), null);
  assert.equal(sessionIdUitAccessToken(undefined), null);
});
