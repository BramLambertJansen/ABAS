import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CODE_LENGTH,
  FOUT_OVERIG,
  TWEESTAP_TEKSTEN,
  codeFoutTekst,
  codeNodig,
  geverifieerdeTotp,
  isGeldigeCode,
  leesMfaStatus,
  onafgemaakteTotp,
  sessieNodigCode,
  toCodeFout,
  verifieerCode,
  type MfaApi,
} from "../src/lib/mfa.ts";

/**
 * De tweede factor voor beheerders (docs/features/beheer-tweede-factor.md,
 * ADR 0017), de pure en client-onafhankelijke kant: foutvertaling, teksten,
 * welke factor telt, wanneer de code nodig is. De afdwinging zelf (aal2 voor
 * beheer) staat in de database (supabase/tests/beheer_tweede_factor.test.sql)
 * en in Supabase Auth.
 */

test("de code heeft zes cijfers", () => {
  assert.equal(CODE_LENGTH, 6);
  assert.equal(isGeldigeCode("123456"), true);
  for (const fout of ["", "12345", "1234567", "12345a", " 123456"]) assert.equal(isGeldigeCode(fout), false, fout);
});

test("foutvertaling: foute code, te veel pogingen, al het andere", () => {
  assert.equal(toCodeFout({ status: 422, code: "mfa_verification_failed" }), "invalid_code");
  assert.equal(toCodeFout({ status: 422, message: "Invalid TOTP code entered" }), "invalid_code");
  assert.equal(toCodeFout({ status: 429 }), "rate_limited");
  assert.equal(toCodeFout({ code: "over_request_rate_limit" }), "rate_limited");
  assert.equal(toCodeFout({ status: 400, code: "mfa_challenge_expired" }), "unknown");
  assert.equal(toCodeFout({ status: 500 }), "unknown");
  assert.equal(toCodeFout(null), "unknown");
});

test("de teksten zijn letterlijk die uit de spec", () => {
  assert.equal(codeFoutTekst("invalid_code"), "onjuiste code — probeer het opnieuw");
  assert.equal(codeFoutTekst("rate_limited"), "te veel pogingen — probeer het over een paar minuten opnieuw");
  assert.equal(codeFoutTekst("unknown"), FOUT_OVERIG);
  assert.equal(TWEESTAP_TEKSTEN.toast, "Tweestapsverificatie ingesteld");
  assert.equal(TWEESTAP_TEKSTEN.modusKeuzeTitel, "Code uit je authenticator-app");
  assert.equal(TWEESTAP_TEKSTEN.beheerZonderFactor, "Stel eerst tweestapsverificatie in via de portal (Account).");
});

test("alleen een geverifieerde TOTP-factor telt", () => {
  assert.equal(geverifieerdeTotp([]), null);
  assert.equal(geverifieerdeTotp(null), null);
  assert.equal(geverifieerdeTotp([{ id: "a", factor_type: "totp", status: "unverified" }]), null);
  assert.equal(geverifieerdeTotp([{ id: "p", factor_type: "phone", status: "verified" }]), null);
  assert.equal(
    geverifieerdeTotp([
      { id: "a", factor_type: "totp", status: "unverified" },
      { id: "b", factor_type: "totp", status: "verified" },
    ]),
    "b"
  );
  assert.deepEqual(
    onafgemaakteTotp([
      { id: "a", factor_type: "totp", status: "unverified" },
      { id: "b", factor_type: "totp", status: "verified" },
      { id: "c", factor_type: "phone", status: "unverified" },
    ]),
    ["a"]
  );
});

test("de code is nodig bij een factor en een aal1-sessie, niet anders", () => {
  assert.equal(codeNodig({ currentLevel: "aal1", nextLevel: "aal2" }), true);
  assert.equal(codeNodig({ currentLevel: "aal2", nextLevel: "aal2" }), false);
  assert.equal(codeNodig({ currentLevel: "aal1", nextLevel: "aal1" }), false);
  assert.equal(codeNodig(null), false);
});

function nepMfa(opties: {
  factors?: { id: string; factor_type: string; status: string }[];
  aal?: { currentLevel: string | null; nextLevel: string | null };
  verify?: { status?: number; code?: string } | null;
  listError?: boolean;
}) {
  const verifies: { factorId: string; code: string }[] = [];
  const api: MfaApi = {
    listFactors: async () =>
      opties.listError
        ? { data: null, error: { status: 500 } }
        : { data: { all: opties.factors ?? [] }, error: null },
    getAuthenticatorAssuranceLevel: async () => ({
      data: opties.aal ?? { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    }),
    challengeAndVerify: async (params) => {
      verifies.push(params);
      return { data: opties.verify ? null : {}, error: opties.verify ?? null };
    },
  };
  return { api, verifies };
}

const VERIFIED = { id: "f1", factor_type: "totp", status: "verified" };

test("leesMfaStatus: factor en aal", async () => {
  assert.deepEqual(await leesMfaStatus(nepMfa({ factors: [VERIFIED], aal: { currentLevel: "aal1", nextLevel: "aal2" } }).api), {
    ok: true,
    factorId: "f1",
    aal2: false,
  });
  assert.deepEqual(await leesMfaStatus(nepMfa({ aal: { currentLevel: "aal1", nextLevel: "aal1" } }).api), {
    ok: true,
    factorId: null,
    aal2: false,
  });
  assert.deepEqual(await leesMfaStatus(nepMfa({ factors: [VERIFIED], aal: { currentLevel: "aal2", nextLevel: "aal2" } }).api), {
    ok: true,
    factorId: "f1",
    aal2: true,
  });
  assert.deepEqual(await leesMfaStatus(nepMfa({ listError: true }).api), { ok: false });
});

test("sessieNodigCode volgt de aal van de sessie", async () => {
  assert.equal(await sessieNodigCode(nepMfa({ aal: { currentLevel: "aal1", nextLevel: "aal2" } }).api), true);
  assert.equal(await sessieNodigCode(nepMfa({ aal: { currentLevel: "aal1", nextLevel: "aal1" } }).api), false);
});

test("verifieerCode: challenge en verify op de geverifieerde factor", async () => {
  const goed = nepMfa({ factors: [{ id: "x", factor_type: "totp", status: "unverified" }, VERIFIED] });
  assert.equal(await verifieerCode(goed.api, "123456"), null);
  assert.deepEqual(goed.verifies, [{ factorId: "f1", code: "123456" }]);

  const fout = nepMfa({ factors: [VERIFIED], verify: { status: 422, code: "mfa_verification_failed" } });
  assert.equal(await verifieerCode(fout.api, "000000"), "invalid_code");

  const teVaak = nepMfa({ factors: [VERIFIED], verify: { status: 429 } });
  assert.equal(await verifieerCode(teVaak.api, "000000"), "rate_limited");
});

test("verifieerCode: geen geldige code of geen factor → geen aanroep", async () => {
  const zonder = nepMfa({});
  assert.equal(await verifieerCode(zonder.api, "123456"), "unknown");
  assert.deepEqual(zonder.verifies, []);
  const kort = nepMfa({ factors: [VERIFIED] });
  assert.equal(await verifieerCode(kort.api, "123"), "invalid_code");
  assert.deepEqual(kort.verifies, []);
});
