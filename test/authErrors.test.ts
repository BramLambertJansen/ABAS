import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RATE_LIMITED_MESSAGE,
  passwordUpdateErrorMessage,
  toPasswordUpdateErrorCode,
} from "../src/lib/authErrors.ts";

/**
 * Unit tests voor de gedeelde `updateUser({ password })`-mapping in
 * src/lib/authErrors.ts — docs/features/portal-profiel.md → Testplan → test
 * (unit). Gebruikt door beide herstelflows en door "Wachtwoord wijzigen" in
 * de portal. Zie test/money.test.ts voor waarom imports hier een
 * `.ts`-extensie hebben.
 */

test("weak_password en same_password worden op error.code herkend", () => {
  assert.equal(toPasswordUpdateErrorCode({ code: "weak_password", message: "x" }), "weak_password");
  assert.equal(toPasswordUpdateErrorCode({ code: "same_password", message: "x" }), "same_password");
});

test("reauthentication_needed en reauthentication_not_valid → reauth_required", () => {
  assert.equal(toPasswordUpdateErrorCode({ code: "reauthentication_needed" }), "reauth_required");
  assert.equal(toPasswordUpdateErrorCode({ code: "reauthentication_not_valid" }), "reauth_required");
});

test("rate limit wordt op de tekst herkend, zoals isRateLimitedMessage", () => {
  assert.equal(
    toPasswordUpdateErrorCode({ code: "over_request_rate_limit", message: "Request rate limit reached" }),
    "rate_limited"
  );
  assert.equal(toPasswordUpdateErrorCode({ message: "Too many requests" }), "rate_limited");
});

test("al het andere is unknown", () => {
  assert.equal(toPasswordUpdateErrorCode({}), "unknown");
  assert.equal(toPasswordUpdateErrorCode({ code: "unexpected_failure", message: "boom" }), "unknown");
  assert.equal(toPasswordUpdateErrorCode({ code: "reauth_nonce_missing" }), "unknown");
});

test("passwordUpdateErrorMessage: de vastgelegde teksten", () => {
  assert.equal(passwordUpdateErrorMessage("weak_password"), "Dit wachtwoord voldoet niet aan de eisen.");
  assert.equal(passwordUpdateErrorMessage("same_password"), "Kies een ander wachtwoord dan je huidige.");
  assert.equal(passwordUpdateErrorMessage("reauth_required"), "log opnieuw in en probeer het nog eens");
  assert.equal(passwordUpdateErrorMessage("rate_limited"), RATE_LIMITED_MESSAGE);
  assert.equal(passwordUpdateErrorMessage("unknown"), "er ging iets mis, probeer het opnieuw");
});
