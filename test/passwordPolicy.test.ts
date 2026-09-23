import { test } from "node:test";
import assert from "node:assert/strict";

import { checkPassword, MIN_PASSWORD_LENGTH } from "../src/lib/passwordPolicy.ts";

/**
 * Unit tests voor src/lib/passwordPolicy.ts — docs/features/
 * wachtwoord-vergeten.md → Wachtwoordregels. Zie test/money.test.ts voor
 * waarom imports hier een `.ts`-extensie en een relatief pad hebben.
 */

test("een wachtwoord dat aan alle regels voldoet is geldig", () => {
  const check = checkPassword("Aurora#2026");
  assert.deepEqual(check, {
    length: true,
    lowercase: true,
    uppercase: true,
    digit: true,
    symbol: true,
    isValid: true,
  });
});

test("lengte: precies de minimale lengte telt, één minder niet", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(checkPassword("Abcde1!x").length, true);
  assert.equal(checkPassword("Abcd1!x").length, false);
  assert.equal(checkPassword("Abcd1!x").isValid, false);
});

test("elke ontbrekende tekensoort maakt het wachtwoord ongeldig", () => {
  const cases: [string, keyof ReturnType<typeof checkPassword>][] = [
    ["ABCDEFG1!", "lowercase"],
    ["abcdefg1!", "uppercase"],
    ["Abcdefgh!", "digit"],
    ["Abcdefgh1", "symbol"],
  ];
  for (const [password, rule] of cases) {
    const check = checkPassword(password);
    assert.equal(check[rule], false, `${password} zou ${rule} moeten missen`);
    assert.equal(check.isValid, false, `${password} zou ongeldig moeten zijn`);
  }
});

test("leestekens: de volledige Supabase-set telt, spatie en letters met accent niet", () => {
  for (const symbol of "!@#$%^&*()_+-=[]{};':\"|<>?,./`~") {
    assert.equal(checkPassword(`Abcdefg1${symbol}`).symbol, true, `teken ${symbol}`);
  }
  assert.equal(checkPassword("Abcdefg1 ").symbol, false);
  assert.equal(checkPassword("Abcdefg1é").symbol, false);
});

test("letters met accent tellen niet als kleine of hoofdletter", () => {
  const check = checkPassword("éÉ12345!");
  assert.equal(check.lowercase, false);
  assert.equal(check.uppercase, false);
});

// --- Aanvullingen Tester (PR #69) ---

test("leeg wachtwoord: elke regel onvoldaan (checklist start op 'nog niet')", () => {
  assert.deepEqual(checkPassword(""), {
    length: false,
    lowercase: false,
    uppercase: false,
    digit: false,
    symbol: false,
    isValid: false,
  });
});

test("backslash is geen leesteken — zit niet in de Supabase-set", () => {
  // Supabase' set bevat een dubbele punt (in de Go-configuratie
  // geëscaped als `\:`), geen backslash. Telt de client een backslash wél,
  // dan toont de checklist "voldaan" voor iets wat de server weigert.
  assert.equal(checkPassword("Abcdefg1\\").symbol, false);
  assert.equal(checkPassword("Abcdefg1\\").isValid, false);
  assert.equal(checkPassword("Abcdefg1:").symbol, true);
});

test("andere niet-ASCII-tekens tellen niet als leesteken of cijfer", () => {
  for (const char of ["€", "£", "§", "¿", "¡", "–", "…", " ", "\t", "😀"]) {
    assert.equal(checkPassword(`Abcdefg1${char}`).symbol, false, `teken ${JSON.stringify(char)}`);
  }
  // Arabisch-Indisch/volbreedte cijfer is geen 0–9.
  assert.equal(checkPassword("Abcdefg!٣").digit, false);
  assert.equal(checkPassword("Abcdefg!３").digit, false);
});

test("elke regel wordt los beoordeeld — één voldane regel maakt een andere niet waar", () => {
  assert.deepEqual(checkPassword("abcdefgh"), {
    length: true,
    lowercase: true,
    uppercase: false,
    digit: false,
    symbol: false,
    isValid: false,
  });
  assert.deepEqual(checkPassword("A1!"), {
    length: false,
    lowercase: false,
    uppercase: true,
    digit: true,
    symbol: true,
    isValid: false,
  });
});

test("lengte telt tekens, spaties inbegrepen; lange wachtwoorden blijven geldig", () => {
  assert.equal(checkPassword("Ab 1! xy").length, true);
  assert.equal(checkPassword("Ab 1! xy").isValid, true);
  assert.equal(checkPassword(`Aa1!${"x".repeat(200)}`).isValid, true);
});

test("de checklist-labels noemen de minimale lengte die de functie ook hanteert", async () => {
  const { PASSWORD_RULE_LABELS } = await import("../src/lib/passwordPolicy.ts");
  assert.match(PASSWORD_RULE_LABELS.length, new RegExp(`\\b${MIN_PASSWORD_LENGTH}\\b`));
  assert.deepEqual(Object.keys(PASSWORD_RULE_LABELS).sort(), [
    "digit",
    "length",
    "lowercase",
    "symbol",
    "uppercase",
  ]);
});
