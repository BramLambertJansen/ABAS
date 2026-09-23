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
