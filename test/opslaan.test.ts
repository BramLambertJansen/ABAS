import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PENDING_TIMEOUT_MS,
  isBezig,
  isKeuzeOnopgeslagen,
  isNieuwOnopgeslagen,
  isPrijsOnopgeslagen,
  isTekstOnopgeslagen,
  magActieStarten,
} from "../src/lib/opslaan.ts";

/** Unit tests voor src/lib/opslaan.ts (docs/features/opslaan-sluiten-pending.md,
 *  Teststrategie → Unit). */

test("time-out voor een hangend verzoek is 30 seconden", () => {
  assert.equal(PENDING_TIMEOUT_MS, 30_000);
});

test("serialisatie: een tweede actie tijdens pending is niet toegestaan", () => {
  assert.equal(isBezig(false, false, false), false);
  assert.equal(isBezig(false, true, false), true);
  assert.equal(magActieStarten(isBezig(false, false)), true);
  assert.equal(magActieStarten(isBezig(true, false)), false);
});

test("prijs: leeg of gelijk aan de huidige prijs is niet onopgeslagen", () => {
  assert.equal(isPrijsOnopgeslagen("", 250), false);
  assert.equal(isPrijsOnopgeslagen("   ", 250), false);
  assert.equal(isPrijsOnopgeslagen("2,50", 250), false);
  assert.equal(isPrijsOnopgeslagen("2.50", 250), false);
});

test("prijs: afwijkende of onleesbare invoer is onopgeslagen", () => {
  assert.equal(isPrijsOnopgeslagen("2,75", 250), true);
  assert.equal(isPrijsOnopgeslagen("abc", 250), true);
});

test("tekst: alleen een afwijking van de opgeslagen waarde telt, spaties niet", () => {
  assert.equal(isTekstOnopgeslagen("Joris", "Joris"), false);
  assert.equal(isTekstOnopgeslagen("  Joris ", "Joris"), false);
  assert.equal(isTekstOnopgeslagen("Jori", "Joris"), true);
  assert.equal(isTekstOnopgeslagen("", "Joris"), true);
  assert.equal(isTekstOnopgeslagen("", ""), false);
});

test("rol: afwijking van de huidige rol is onopgeslagen", () => {
  assert.equal(isKeuzeOnopgeslagen("lid", "lid"), false);
  assert.equal(isKeuzeOnopgeslagen("bardienst", "lid"), true);
});

test("nieuw lid/product: elk ingevuld veld is onopgeslagen", () => {
  assert.equal(isNieuwOnopgeslagen(["", "  ", null]), false);
  assert.equal(isNieuwOnopgeslagen(["", "", undefined]), false);
  assert.equal(isNieuwOnopgeslagen(["Pils", "", null]), true);
  assert.equal(isNieuwOnopgeslagen(["", "", "Bier"]), true);
  assert.equal(isNieuwOnopgeslagen(["", "0", null]), true);
});
