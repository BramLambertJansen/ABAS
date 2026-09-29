import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SHIFT_OPEN_SNOOZE_MS,
  SHIFT_OPEN_WARNING_AFTER_MS,
  openHours,
  shouldWarn,
} from "../src/lib/dienstTeLangOpen.ts";

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

// --- Aanvullingen Tester (spec → Besloten 1, 3, 6; Randgevallen) ---

test("constanten: drempel 6 uur, snooze 1 uur (besluiten 1 en 3)", () => {
  assert.equal(SHIFT_OPEN_WARNING_AFTER_MS, 6 * 60 * 60 * 1000);
  assert.equal(SHIFT_OPEN_SNOOZE_MS, 60 * 60 * 1000);
});

test("negatief: vóór 6 uur nooit een melding, ook niet met een (oude) snooze", () => {
  // Een snooze die al ruim een uur oud is, maakt een melding vóór de
  // drempel niet alsnog 'aan de beurt'.
  assert.equal(
    shouldWarn({ startedAtIso: STARTED_AT, nowMs: at(5, 30), snoozedAtMs: at(0, 10) }),
    false
  );
  assert.equal(
    shouldWarn({ startedAtIso: STARTED_AT, nowMs: at(0), snoozedAtMs: null }),
    false
  );
});

test("negatief: 1 milliseconde vóór het einde van het snooze-uur nog geen melding", () => {
  const snoozedAtMs = at(6, 0);
  assert.equal(
    shouldWarn({ startedAtIso: STARTED_AT, nowMs: snoozedAtMs + SHIFT_OPEN_SNOOZE_MS - 1, snoozedAtMs }),
    false
  );
  assert.equal(
    shouldWarn({ startedAtIso: STARTED_AT, nowMs: snoozedAtMs + SHIFT_OPEN_SNOOZE_MS, snoozedAtMs }),
    true
  );
});

test("snooze direct op 6u00: volgende melding op 7u00 ('dus weer na 7u, 8u, ...')", () => {
  assert.equal(
    shouldWarn({ startedAtIso: STARTED_AT, nowMs: at(6, 59, 59), snoozedAtMs: at(6) }),
    false
  );
  assert.equal(
    shouldWarn({ startedAtIso: STARTED_AT, nowMs: at(7), snoozedAtMs: at(6) }),
    true
  );
});

test("started_at zoals PostgREST hem levert (microseconden, +00:00) werkt gelijk aan Z", () => {
  const postgrest = "2026-09-28T18:00:00.123456+00:00";
  const startMs = Date.parse(postgrest);
  assert.ok(Number.isFinite(startMs));
  assert.equal(openHours(postgrest, at(6, 1)), 6);
  assert.equal(shouldWarn({ startedAtIso: postgrest, nowMs: at(6, 1), snoozedAtMs: null }), true);
  assert.equal(shouldWarn({ startedAtIso: postgrest, nowMs: at(5, 59), snoozedAtMs: null }), false);
});

test("zomer-/wintertijd: 6 echte uren over de terugschakeling (25 okt 2026) = melding", () => {
  // 22:00 zomertijd (+02:00) tot 03:00 wintertijd (+01:00): op de wandklok
  // 5 uur, in werkelijkheid 6 uur (spec → Randgevallen, zomer-/wintertijd).
  const start = "2026-10-24T22:00:00+02:00";
  const nowMs = Date.parse("2026-10-25T03:00:00+01:00");
  assert.equal(openHours(start, nowMs), 6);
  assert.equal(shouldWarn({ startedAtIso: start, nowMs, snoozedAtMs: null }), true);
  // En een minuut eerder nog niet.
  assert.equal(shouldWarn({ startedAtIso: start, nowMs: nowMs - 60_000, snoozedAtMs: null }), false);
});
