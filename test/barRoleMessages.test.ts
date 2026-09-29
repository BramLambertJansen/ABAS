import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * `no_bar_role` (0023_bar_rpcs_weigeren_lid.sql, #100) → de gedeelde tekst
 * NO_BAR_ROLE_SESSION_MESSAGE, in de drie exporteerbare message-functies.
 * De typecheck dwingt alleen af dát er een `case "no_bar_role"` is (switch
 * zonder default), niet wélke tekst hij teruggeeft — dat bewijst deze test.
 * De bezetting-/dienst-afsluiten-meldingen (addErrorMessage,
 * removeErrorMessage, endShiftErrorMessage) zijn niet geëxporteerd uit hun
 * .tsx en vallen hier dus buiten.
 */
register("./fakes/src-alias-resolve.mjs", import.meta.url);

const { NO_BAR_ROLE_SESSION_MESSAGE, NO_BAR_STAFF_MESSAGE } = await import("../src/lib/staff.ts");
const { placeOrderErrorMessage } = await import("../src/features/verkoop/messages.ts");
const { topUpErrorMessage } = await import("../src/features/opwaarderen/messages.ts");
const { reverseOrderErrorMessage } = await import(
  "../src/features/bestelling-terugdraaien/messages.ts"
);

const GENERIC = "er ging iets mis, probeer het opnieuw";

for (const [name, message] of [
  ["placeOrderErrorMessage", () => placeOrderErrorMessage("no_bar_role")],
  ["topUpErrorMessage", () => topUpErrorMessage("no_bar_role")],
  ["reverseOrderErrorMessage", () => reverseOrderErrorMessage("no_bar_role")],
] as const) {
  test(`${name}: no_bar_role geeft de gedeelde sessie-melding`, () => {
    assert.equal(message(), NO_BAR_ROLE_SESSION_MESSAGE);
  });

  // Negatief: niet de generieke tekst (de oude uitkomst vóór #100) en niet
  // de lege-kandidatenmelding van start_shift/bezetting — dat is een ander
  // geval (rol van het gekozen lid, niet van de sessie).
  test(`${name}: no_bar_role is niet de generieke of de geen-bardienst-melding`, () => {
    assert.notEqual(message(), GENERIC);
    assert.notEqual(message(), NO_BAR_STAFF_MESSAGE);
  });
}

test("NO_BAR_ROLE_SESSION_MESSAGE is een niet-lege tekst", () => {
  assert.equal(typeof NO_BAR_ROLE_SESSION_MESSAGE, "string");
  assert.ok(NO_BAR_ROLE_SESSION_MESSAGE.trim().length > 0);
});

test("de unknown-tak blijft de generieke melding, niet de no_bar_role-tekst", () => {
  assert.equal(placeOrderErrorMessage("unknown"), GENERIC);
  assert.equal(topUpErrorMessage("unknown"), GENERIC);
  assert.equal(reverseOrderErrorMessage("unknown"), GENERIC);
});
