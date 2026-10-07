import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutBlockReason } from "../src/features/verkoop/checkout.ts";

const ready = {
  memberSelected: true, cartHasLines: true,
  membersStatus: "ready", productsStatus: "ready", settingsStatus: "ready", crewStatus: "ready",
  rosterEmpty: false, insufficientFunds: false,
} as const;

test("afrekenen vereist een lid en ten minste één product", () => {
  assert.match(checkoutBlockReason({ ...ready, memberSelected: false })!, /Kies eerst een lid/);
  assert.match(checkoutBlockReason({ ...ready, cartHasLines: false })!, /Voeg een product toe/);
  assert.equal(checkoutBlockReason(ready), null);
});

test("een bewaard mandje blijft geblokkeerd tot alle verse gegevens gereed zijn", () => {
  for (const field of ["membersStatus", "productsStatus", "settingsStatus", "crewStatus"] as const) {
    assert.match(checkoutBlockReason({ ...ready, [field]: "loading" })!, /geladen/);
    assert.match(checkoutBlockReason({ ...ready, [field]: "error" })!, /Probeer het opnieuw/);
  }
});

test("laden gaat voor een saldo-waarschuwing op basis van oude gegevens", () => {
  assert.match(checkoutBlockReason({ ...ready, membersStatus: "loading", insufficientFunds: true })!, /geladen/);
});

test("lege bezetting en onvoldoende saldo blijven blokkeren met een herstelactie", () => {
  assert.match(checkoutBlockReason({ ...ready, rosterEmpty: true })!, /Bezetting/);
  assert.match(checkoutBlockReason({ ...ready, insufficientFunds: true })!, /Waardeer/);
});
