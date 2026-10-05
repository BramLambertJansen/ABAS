import { test } from "node:test";
import assert from "node:assert/strict";

import { dagKop, dagSleutel, klokTijd } from "../src/lib/date.ts";

/**
 * Dagsleutel, dagkop en kloktijd in de vaste zone Europe/Amsterdam
 * (docs/features/logboek-chronologisch-reikwijdte.md). Elke verwachting staat
 * vast ongeacht de `TZ` van de machine: alle invoer is UTC (`Z`).
 */

const NU_2026 = new Date("2026-10-05T10:00:00Z");

test("dagSleutel: 31 dec 23:30Z is 1 januari in Amsterdam", () => {
  assert.equal(dagSleutel("2026-12-31T23:30:00Z"), "2027-01-01");
  assert.equal(dagSleutel("2026-12-31T22:30:00Z"), "2026-12-31");
});

test("dagSleutel: 30 sep 22:30Z (zomertijd) is 1 oktober", () => {
  assert.equal(dagSleutel("2026-09-30T22:30:00Z"), "2026-10-01");
  assert.equal(dagSleutel("2026-09-30T21:59:00Z"), "2026-09-30");
});

test("dagSleutel: wintertijd 25 oktober 2026 (25-uursdag): beide 02:30 op dezelfde dag", () => {
  // 02:30 CEST = 00:30Z, 02:30 CET = 01:30Z.
  assert.equal(dagSleutel("2026-10-25T00:30:00Z"), "2026-10-25");
  assert.equal(dagSleutel("2026-10-25T01:30:00Z"), "2026-10-25");
  assert.equal(dagSleutel("2026-10-24T21:59:00Z"), "2026-10-24");
  assert.equal(dagSleutel("2026-10-25T23:00:00Z"), "2026-10-26");
});

test("dagSleutel: zomertijd 29 maart 2026 (23-uursdag)", () => {
  assert.equal(dagSleutel("2026-03-28T23:00:00Z"), "2026-03-29");
  assert.equal(dagSleutel("2026-03-29T21:59:00Z"), "2026-03-29");
  assert.equal(dagSleutel("2026-03-29T22:00:00Z"), "2026-03-30");
});

test("klokTijd: 24-uursklok in Amsterdam, zomer en winter", () => {
  assert.equal(klokTijd("2026-09-29T12:05:00Z"), "14:05");
  assert.equal(klokTijd("2026-01-15T08:05:00Z"), "09:05");
  assert.equal(klokTijd("2026-09-30T22:30:00Z"), "00:30");
  assert.equal(klokTijd("2026-10-25T00:30:00Z"), "02:30");
  assert.equal(klokTijd("2026-10-25T01:30:00Z"), "02:30");
});

test("dagKop: huidig jaar zonder jaartal", () => {
  assert.equal(dagKop("2026-09-29T12:00:00Z", NU_2026), "dinsdag 29 september");
});

test("dagKop: ander jaar met jaartal", () => {
  assert.equal(dagKop("2025-09-29T12:00:00Z", NU_2026), "maandag 29 september 2025");
  assert.equal(dagKop("2027-01-01T12:00:00Z", NU_2026), "vrijdag 1 januari 2027");
});

test("dagKop: het jaar volgt de Amsterdamse klok, ook voor `nu`", () => {
  // 31 dec 23:30Z is in Amsterdam al 1 januari 2027.
  assert.equal(dagKop("2026-12-31T23:30:00Z", NU_2026), "vrijdag 1 januari 2027");
  assert.equal(dagKop("2026-12-31T23:30:00Z", new Date("2026-12-31T23:30:00Z")), "vrijdag 1 januari");
});
