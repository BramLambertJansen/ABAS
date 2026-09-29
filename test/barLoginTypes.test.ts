import { test } from "node:test";
import assert from "node:assert/strict";
import { pinResultaatNaarFout, toPinFout, toWachtwoordFout } from "../src/lib/barLoginTypes.ts";

/**
 * De vertaling van serverantwoorden naar de foutcodes van het inlogscherm
 * (docs/features/dienst-per-sessie.md → Inloggen op de bar, punt 3 en 4):
 * wat de client niet kent, is `unknown`, nooit iets wat op een succes lijkt.
 */

test("wachtwoord: de vijf bekende foutcodes komen door", () => {
  for (const code of ["invalid_credentials", "not_allowed", "no_account", "rate_limited", "unknown"]) {
    assert.equal(toWachtwoordFout(code), code);
  }
});

test("wachtwoord: al het andere is unknown", () => {
  for (const waarde of ["", "ok", "invalid_pin", "INVALID_CREDENTIALS", null, undefined, 3, {}]) {
    assert.equal(toWachtwoordFout(waarde), "unknown");
  }
});

test("pin: de zeven bekende foutcodes komen door", () => {
  for (const code of [
    "pin_not_available",
    "invalid_pin",
    "pin_locked",
    "not_allowed",
    "no_account",
    "rate_limited",
    "unknown",
  ]) {
    assert.equal(toPinFout(code), code);
  }
});

test("pin: al het andere is unknown", () => {
  for (const waarde of ["", "ok", "invalid_credentials", "PIN_LOCKED", null, undefined]) {
    assert.equal(toPinFout(waarde), "unknown");
  }
});

test("verify_bar_pin.result_code: ok is geen fout en wordt nooit als succes doorgelaten", () => {
  assert.equal(pinResultaatNaarFout("ok"), "unknown");
});

test("verify_bar_pin.result_code: de andere codes worden foutcodes", () => {
  for (const code of ["not_allowed", "no_account", "pin_not_available", "pin_locked", "invalid_pin"]) {
    assert.equal(pinResultaatNaarFout(code), code);
  }
  assert.equal(pinResultaatNaarFout(undefined), "unknown");
  assert.equal(pinResultaatNaarFout("iets_nieuws"), "unknown");
});
