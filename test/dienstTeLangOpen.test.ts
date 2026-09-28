import { test } from "node:test";
import assert from "node:assert/strict";

import { openHours, shouldWarn } from "../src/lib/dienstTeLangOpen.ts";

/**
 * Unit tests voor src/lib/dienstTeLangOpen.ts (docs/features/
 * dienst-te-lang-open.md → Testgevallen). Vaste tijdstippen, relatief ten
 * opzichte van één start, net als durationLabel in test/ledger.test.ts.
 */

const STARTED_AT = "2026-09-28T18:00:00Z";
const START_MS = Date.parse(STARTED_AT);

/** Tijdstip `h` uur, `m` minuten, `s` seconden na de start. */
function at(h: number, m = 0, s = 0): number {
  return START_MS + ((h * 60 + m) * 60 + s) * 1000;
}

test("shouldWarn zonder snooze: pas vanaf precies 6 uur", () => {
  const warn = (nowMs: number) =>
    shouldWarn({ startedAtIso: STARTED_AT, nowMs, snoozedAtMs: null });
  assert.equal(warn(at(5, 59, 59)), false);
  assert.equal(warn(at(6)), true);
  assert.equal(warn(at(8)), true);
});

test("snooze telt vanaf de tik, niet vanaf het volgende hele uur", () => {
  const snoozedAtMs = at(6, 50);
  const warn = (nowMs: number) =>
    shouldWarn({ startedAtIso: STARTED_AT, nowMs, snoozedAtMs });
  assert.equal(warn(at(7, 0)), false);
  assert.equal(warn(at(7, 49)), false);
  assert.equal(warn(at(7, 50)), true);
});

test("tweede snooze: weer precies een uur na de tik", () => {
  const snoozedAtMs = at(7, 50);
  const warn = (nowMs: number) =>
    shouldWarn({ startedAtIso: STARTED_AT, nowMs, snoozedAtMs });
  assert.equal(warn(at(8, 49)), false);
  assert.equal(warn(at(8, 50)), true);
});

test("openHours: hele uren, naar beneden afgerond, zonder bovengrens", () => {
  assert.equal(openHours(STARTED_AT, at(6)), 6);
  assert.equal(openHours(STARTED_AT, at(6, 59)), 6);
  assert.equal(openHours(STARTED_AT, at(7)), 7);
  assert.equal(openHours(STARTED_AT, at(26)), 26);
});

test("klokverschil: start 5 minuten in de toekomst → 0 uur, geen melding", () => {
  const nowMs = START_MS - 5 * 60 * 1000;
  assert.equal(openHours(STARTED_AT, nowMs), 0);
  assert.equal(
    shouldWarn({ startedAtIso: STARTED_AT, nowMs, snoozedAtMs: null }),
    false
  );
});
