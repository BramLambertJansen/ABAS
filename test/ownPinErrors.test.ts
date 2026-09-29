import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PIN_PATTERN,
  setOwnPinErrorMessage,
  toSetOwnPinErrorCode,
} from "../src/lib/ownPinErrors.ts";

/**
 * Unit tests voor src/lib/ownPinErrors.ts — docs/features/portal-profiel.md
 * → Testplan → test (unit). Gedeeld door useSetOwnPin.ts (/beheer),
 * usePortalSetOwnPin.ts (portal) en MijnAccountOverlay.tsx. Zie
 * test/money.test.ts voor waarom imports hier een `.ts`-extensie hebben.
 */

test("toSetOwnPinErrorCode: elke foutcode die set_own_pin (0014) geeft komt ongewijzigd terug", () => {
  for (const code of ["invalid_pin_format", "actor_not_found", "no_bar_role"] as const) {
    assert.equal(toSetOwnPinErrorCode(code), code);
  }
});

test("toSetOwnPinErrorCode: al het andere valt terug op unknown", () => {
  for (const message of [undefined, "", "Failed to fetch", "invalid_name", "NO_BAR_ROLE"]) {
    assert.equal(toSetOwnPinErrorCode(message), "unknown");
  }
});

test("setOwnPinErrorMessage: dezelfde teksten als /beheer → Mijn account", () => {
  assert.equal(setOwnPinErrorMessage("invalid_pin_format"), "een pincode is 4 cijfers");
  assert.equal(
    setOwnPinErrorMessage("actor_not_found"),
    "dit account is niet gekoppeld aan een lid — log opnieuw in"
  );
  assert.equal(
    setOwnPinErrorMessage("no_bar_role"),
    "dit account kan geen pincode instellen — vraag een beheerder"
  );
  assert.equal(setOwnPinErrorMessage("unknown"), "er ging iets mis, probeer het opnieuw");
});

test("PIN_PATTERN: precies vier cijfers, zelfde regel als set_own_pin", () => {
  for (const ok of ["0000", "1234", "9876"]) assert.ok(PIN_PATTERN.test(ok), ok);
  for (const bad of ["", "123", "12345", "abcd", "12a4", " 1234", "1234 "]) {
    assert.ok(!PIN_PATTERN.test(bad), bad);
  }
});
