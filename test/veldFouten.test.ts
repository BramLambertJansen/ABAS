import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bedragFout,
  bedragFoutTekst,
  emailFout,
  EMAIL_ONGELDIG_TEKST,
} from "../src/lib/veldFouten.ts";

const OPW = { maxCents: 50000 };

test("bedragFout: elke soort", () => {
  assert.equal(bedragFout("", OPW), "leeg");
  assert.equal(bedragFout("   ", OPW), "leeg");
  assert.equal(bedragFout("abc", OPW), "ongeldig");
  assert.equal(bedragFout("€ 5", OPW), "ongeldig");
  assert.equal(bedragFout("1.000,50", OPW), "ongeldig");
  assert.equal(bedragFout("5,5,5", OPW), "ongeldig");
  assert.equal(bedragFout("0,001", OPW), "teveelDecimalen");
  assert.equal(bedragFout("1,234", OPW), "teveelDecimalen");
  assert.equal(bedragFout("-5", OPW), "negatief");
  assert.equal(bedragFout("-0,50", OPW), "negatief");
  assert.equal(bedragFout("0", OPW), "nul");
  assert.equal(bedragFout("0,00", OPW), "nul");
  assert.equal(bedragFout("500,01", OPW), "tehoog");
  assert.equal(bedragFout("600", OPW), "tehoog");
});

test("bedragFout: geldige invoer geeft null, ook op de grens en met spaties", () => {
  assert.equal(bedragFout("5", OPW), null);
  assert.equal(bedragFout("5,50", OPW), null);
  assert.equal(bedragFout(" 5.5 ", OPW), null);
  assert.equal(bedragFout("500", OPW), null);
  assert.equal(bedragFout("500,00", OPW), null);
});

test("bedragFout: optioneel en nul toegestaan", () => {
  assert.equal(bedragFout("", { optioneel: true }), null);
  assert.equal(bedragFout("0", { nulToegestaan: true }), null);
  assert.equal(bedragFout("0", { optioneel: true, nulToegestaan: true }), null);
  assert.equal(bedragFout("-1", { optioneel: true, nulToegestaan: true }), "negatief");
  assert.equal(bedragFout("abc", { optioneel: true }), "ongeldig");
  assert.equal(bedragFout("600"), null, "zonder maxCents geen tehoog");
});

test("emailFout", () => {
  assert.equal(emailFout(""), null);
  assert.equal(emailFout("   "), null);
  assert.equal(emailFout("naam@voorbeeld.nl"), null);
  assert.equal(emailFout("  naam@voorbeeld.nl  "), null);
  assert.equal(emailFout("naam@voorbeeld"), "ongeldig");
  assert.equal(emailFout("naam"), "ongeldig");
  assert.equal(emailFout("na me@voorbeeld.nl"), "ongeldig");
});

test("teksten: goedgekeurde formuleringen", () => {
  assert.equal(bedragFoutTekst("leeg", "prijs"), "Vul een prijs in.");
  assert.equal(bedragFoutTekst("leeg"), "Kies een bedrag of typ er een.");
  assert.equal(bedragFoutTekst("ongeldig"), "Vul een bedrag in zoals 5 of 5,50.");
  assert.equal(bedragFoutTekst("teveelDecimalen", "prijs"), "Maximaal twee decimalen, bijvoorbeeld 5,50.");
  assert.equal(bedragFoutTekst("negatief"), "Het bedrag mag niet negatief zijn.");
  assert.equal(bedragFoutTekst("nul", "prijs"), "Het bedrag moet meer dan € 0 zijn.");
  assert.equal(
    EMAIL_ONGELDIG_TEKST,
    "Dit lijkt geen e-mailadres. Controleer het adres, bijvoorbeeld naam@voorbeeld.nl."
  );
});
