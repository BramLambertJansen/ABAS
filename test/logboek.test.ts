import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LOGBOEK_FILTERS,
  clockLabel,
  countLabel,
  describeRow,
  filterLogboek,
  logboekEmptyState,
} from "../src/features/logboek/logboek.ts";
import type { LogboekEntry } from "../src/hooks/queries/useLogboek.ts";
import { formatCents } from "../src/lib/money.ts";

/**
 * Unit tests voor src/features/logboek/logboek.ts — de zoek-, filter- en
 * weergavelogica achter het Logboek-scherm (docs/features/logboek.md).
 */

function entry(overrides: Partial<LogboekEntry>): LogboekEntry {
  return {
    id: "e",
    kind: "verkoop",
    createdAt: "2026-09-24T21:10:00",
    memberName: "Anna de Vries",
    servedById: "tom",
    servedByName: "Tom Willems",
    amountCents: 350,
    itemCount: 1,
    productNames: ["Bier"],
    method: null,
    reversal: null,
    ...overrides,
  };
}

test("LOGBOEK_FILTERS bevat alle vijf chips, in deze volgorde", () => {
  assert.deepEqual(
    LOGBOEK_FILTERS.map((f) => f.id),
    ["alles", "aandacht", "geld", "assortiment", "leden"]
  );
});

test("clockLabel geeft lokale HH:MM", () => {
  assert.equal(clockLabel("2026-09-24T09:05:00"), "09:05");
});

test("describeRow: verkoop op saldo", () => {
  const row = describeRow(entry({ itemCount: 3, memberName: "Jan de Vries" }));
  assert.deepEqual(row, {
    tag: "SALDO",
    action: "Bestelling op saldo",
    detail: "3 items · Jan de Vries",
  });
});

test("describeRow: enkelvoud 'item' bij itemCount 1", () => {
  const row = describeRow(entry({ itemCount: 1 }));
  assert.equal(row.detail, "1 item · Anna de Vries");
});

test("describeRow: losse verkoop zonder lid", () => {
  const row = describeRow(entry({ memberName: null }));
  assert.equal(row.detail, "1 item · Losse verkoop");
});

test("describeRow: opwaardering", () => {
  const row = describeRow(
    entry({
      kind: "opwaardering",
      amountCents: 2500,
      method: "contant",
      memberName: "Jan de Vries",
      itemCount: 0,
      productNames: [],
    })
  );
  assert.deepEqual(row, {
    tag: "SALDO",
    action: "Saldo opgewaardeerd",
    detail: `+${formatCents(2500)} · contant · Jan de Vries`,
  });
});

test("describeRow: teruggedraaide bestelling krijgt LET OP en toont reden/wie/via", () => {
  const row = describeRow(
    entry({
      reversal: { reason: "verkeerd lid", reversedByName: "Femke Bos", via: "beheer" },
    })
  );
  assert.deepEqual(row, {
    tag: "LET OP",
    action: "Bestelling teruggedraaid",
    detail: "verkeerd lid · Femke Bos · via beheer",
  });
});

const entries: LogboekEntry[] = [
  entry({ id: "a", memberName: "Anna de Vries", productNames: ["Cola"] }),
  entry({
    id: "b",
    kind: "opwaardering",
    memberName: "Bas Smit",
    servedByName: "Kevin Jansen",
    amountCents: 2000,
    itemCount: 0,
    productNames: [],
    method: "contant",
  }),
  entry({
    id: "c",
    memberName: "Cas de Boer",
    reversal: { reason: "verkeerd product", reversedByName: "Tom Willems", via: "bar" },
  }),
];

test("filterLogboek: 'alles' en 'geld' leveren alles op, nieuwste-eerst-volgorde ongewijzigd", () => {
  const ids = (filter: "alles" | "geld") =>
    filterLogboek(entries, { query: "", filter }).map((e) => e.id);
  assert.deepEqual(ids("alles"), ["a", "b", "c"]);
  assert.deepEqual(ids("geld"), ["a", "b", "c"]);
});

test("filterLogboek: 'aandacht' toont alleen teruggedraaide bestellingen", () => {
  assert.deepEqual(
    filterLogboek(entries, { query: "", filter: "aandacht" }).map((e) => e.id),
    ["c"]
  );
});

test("filterLogboek: 'assortiment' en 'leden' leveren nooit iets op", () => {
  assert.deepEqual(filterLogboek(entries, { query: "", filter: "assortiment" }), []);
  assert.deepEqual(filterLogboek(entries, { query: "", filter: "leden" }), []);
});

test("filterLogboek: gastverkoop (memberName null) is doorzoekbaar op 'losse verkoop'", () => {
  // spec → Randgevallen: "Gastverkoop (orders.member_id is null)" —
  // memberName: null mag geen "onbekend lid"-verzinsel worden, en moet nog
  // altijd matchen op de vaste tekst waarmee de rij zelf getoond wordt
  // (describeRow hierboven).
  const guest = entry({ id: "d", memberName: null });
  assert.deepEqual(
    filterLogboek([guest], { query: "losse verkoop", filter: "alles" }).map((e) => e.id),
    ["d"]
  );
  assert.deepEqual(
    filterLogboek([guest], { query: "anna", filter: "alles" }).map((e) => e.id),
    []
  );
});

test("filterLogboek zoekt hoofdletterongevoelig op lid, boeker, product en actie-tekst", () => {
  const ids = (q: string) =>
    filterLogboek(entries, { query: q, filter: "alles" }).map((e) => e.id);
  assert.deepEqual(ids("cola"), ["a"]);
  assert.deepEqual(ids("  BAS "), ["b"]);
  assert.deepEqual(ids("kevin jansen"), ["b"]);
  assert.deepEqual(ids("opgewaardeerd"), ["b"]);
  assert.deepEqual(ids("teruggedraaid"), ["c"]);
});

test("countLabel", () => {
  assert.equal(countLabel(1, 1), "1 handeling");
  assert.equal(countLabel(5, 5), "5 handelingen");
  assert.equal(countLabel(2, 5), "2 van 5 handelingen");
  assert.equal(countLabel(0, 5), "0 van 5 handelingen");
});

test("logboekEmptyState: assortiment/leden tonen altijd 'Nog niets vastgelegd', ook met bestaande data", () => {
  assert.deepEqual(logboekEmptyState("assortiment", 0, 42), {
    title: "Nog niets vastgelegd",
    hint: "elke handeling in de app komt hier te staan, met naam en tijd erbij",
  });
  assert.deepEqual(logboekEmptyState("leden", 0, 0), {
    title: "Nog niets vastgelegd",
    hint: "elke handeling in de app komt hier te staan, met naam en tijd erbij",
  });
});

test("logboekEmptyState: org-breed nog niets vastgelegd", () => {
  assert.deepEqual(logboekEmptyState("alles", 0, 0), {
    title: "Nog niets vastgelegd",
    hint: "elke handeling in de app komt hier te staan, met naam en tijd erbij",
  });
});

test("logboekEmptyState: filter/zoekterm levert niets op terwijl er wél data is", () => {
  assert.deepEqual(logboekEmptyState("aandacht", 0, 12), {
    title: "Niets gevonden",
    hint: "Andere filter of zoekterm probeert het opnieuw",
  });
});

test("logboekEmptyState: null zodra er resultaten zijn", () => {
  assert.equal(logboekEmptyState("alles", 3, 12), null);
});
