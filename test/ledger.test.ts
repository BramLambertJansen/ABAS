import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_PEOPLE,
  durationLabel,
  filterLedger,
  groupByHour,
  ordersPerMember,
  peopleWithCounts,
} from "../src/features/dienst-overzicht/ledger.ts";
import type { LedgerEntry } from "../src/hooks/queries/useShiftLedger.ts";

/**
 * Unit tests voor src/features/dienst-overzicht/ledger.ts — de zoek-,
 * filter- en groepeerlogica achter de transactielijst op het Dienst-scherm
 * (docs/features/dienst-overzicht.md). Tijden zonder offset worden als
 * lokale tijd gelezen, net als de lijst ze toont.
 */

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
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
    ...overrides,
  };
}

const ledger: LedgerEntry[] = [
  entry({ id: "a", createdAt: "2026-09-24T22:05:00", productNames: ["Cola"] }),
  entry({
    id: "b",
    kind: "opwaardering",
    createdAt: "2026-09-24T21:40:00",
    memberName: "Bas Smit",
    servedById: "kevin",
    servedByName: "Kevin Jansen",
    amountCents: 2000,
    itemCount: 0,
    productNames: [],
    method: "contant",
  }),
  entry({ id: "c", createdAt: "2026-09-24T21:10:00", amountCents: 700 }),
];

test("filterLedger zoekt hoofdletterongevoelig op lid en product", () => {
  const ids = (q: string) =>
    filterLedger(ledger, { query: q, personId: ALL_PEOPLE }).map((e) => e.id);
  assert.deepEqual(ids("cola"), ["a"]);
  assert.deepEqual(ids("  BAS "), ["b"]);
  assert.deepEqual(ids("opwaardering"), ["b"]);
  assert.deepEqual(ids(""), ["a", "b", "c"]);
});

test("filterLedger filtert op wie de boeking deed", () => {
  assert.deepEqual(
    filterLedger(ledger, { query: "", personId: "kevin" }).map((e) => e.id),
    ["b"]
  );
});

test("groupByHour groepeert per uur en telt alleen verkopen als omzet", () => {
  const groups = groupByHour(ledger);
  assert.deepEqual(
    groups.map((g) => [g.label, g.entries.map((e) => e.id), g.orderCount, g.turnoverCents]),
    [
      ["22:00 – 23:00", ["a"], 1, 350],
      ["21:00 – 22:00", ["b", "c"], 1, 700],
    ]
  );
});

test("groupByHour loopt over middernacht heen", () => {
  const [group] = groupByHour([entry({ createdAt: "2026-09-24T23:30:00" })]);
  assert.equal(group.label, "23:00 – 00:00");
});

test("peopleWithCounts en ordersPerMember", () => {
  assert.deepEqual(peopleWithCounts(ledger), [
    { id: "kevin", name: "Kevin Jansen", count: 1 },
    { id: "tom", name: "Tom Willems", count: 2 },
  ]);
  // Een opwaardering is geen bon.
  assert.deepEqual([...ordersPerMember(ledger)], [["tom", 2]]);
});

test("durationLabel", () => {
  const start = "2026-09-24T20:00:00";
  const at = (hhmm: string) => Date.parse(`2026-09-24T${hhmm}:00`);
  assert.equal(durationLabel(start, at("20:45")), "45 min");
  assert.equal(durationLabel(start, at("22:05")), "2u 05m");
  assert.equal(durationLabel(start, at("19:00")), "0 min");
});
