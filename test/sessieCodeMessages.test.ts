import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * De zes sessiecodes van de guards (0028, dienst-per-sessie) → geen inline
 * melding in de drie exporteerbare message-functies: de centrale afhandeling
 * (BarSessieProvider) toont één melding, een tweede tekst op het scherm zou
 * dezelfde gebeurtenis twee keer vertellen. De typecheck dwingt alleen af dát
 * elke code afgehandeld wordt, niet wélke tekst hij teruggeeft — dat bewijst
 * deze test. Vervangt barRoleMessages.test.ts (de gedeelde
 * NO_BAR_ROLE_SESSION_MESSAGE uit #100 bestaat niet meer).
 *
 * De bezetting-/dienst-afsluiten-meldingen (addErrorMessage,
 * removeErrorMessage, endShiftErrorMessage) zijn niet geëxporteerd uit hun
 * .tsx en vallen hier dus buiten.
 */
register("./fakes/src-alias-resolve.mjs", import.meta.url);

const { NO_BAR_STAFF_MESSAGE } = await import("../src/lib/staff.ts");
const { SESSION_ERROR_CODES, SESSION_CODE_INLINE_MESSAGE } = await import("../src/lib/barSessie.ts");
const { placeOrderErrorMessage } = await import("../src/features/verkoop/messages.ts");
const { topUpErrorMessage, SELF_TOP_UP_MESSAGE } = await import(
  "../src/features/opwaarderen/messages.ts"
);
const { reverseOrderErrorMessage } = await import(
  "../src/features/bestelling-terugdraaien/messages.ts"
);

const GENERIC = "er ging iets mis, probeer het opnieuw";

for (const code of SESSION_ERROR_CODES) {
  for (const [name, message] of [
    ["placeOrderErrorMessage", () => placeOrderErrorMessage(code)],
    ["topUpErrorMessage", () => topUpErrorMessage(code)],
    ["reverseOrderErrorMessage", () => reverseOrderErrorMessage(code)],
  ] as const) {
    test(`${name}: ${code} geeft geen inline melding (de centrale melding neemt het over)`, () => {
      assert.equal(message(), SESSION_CODE_INLINE_MESSAGE);
    });

    // Negatief: niet de generieke tekst en niet de lege-kandidatenmelding.
    test(`${name}: ${code} is niet de generieke of de geen-bardienst-melding`, () => {
      assert.notEqual(message(), GENERIC);
      assert.notEqual(message(), NO_BAR_STAFF_MESSAGE);
    });
  }
}

test("de inline melding bij een sessiecode is leeg", () => {
  assert.equal(SESSION_CODE_INLINE_MESSAGE, "");
});

test("A4: self_top_up_forbidden geeft de goedgekeurde tekst", () => {
  assert.equal(
    topUpErrorMessage("self_top_up_forbidden"),
    "je kunt jezelf niet opwaarderen — laat een collega of een beheerder dit doen"
  );
  assert.equal(SELF_TOP_UP_MESSAGE, topUpErrorMessage("self_top_up_forbidden"));
});

test("de unknown-tak blijft de generieke melding", () => {
  assert.equal(placeOrderErrorMessage("unknown"), GENERIC);
  assert.equal(topUpErrorMessage("unknown"), GENERIC);
  assert.equal(reverseOrderErrorMessage("unknown"), GENERIC);
});
