import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dateLabel,
  filterTransactions,
  groupByMonth,
  transactionDetail,
  transactionLabel,
} from "../src/features/portal-dashboard/transacties.ts";
import type { PortalTransaction } from "../src/hooks/queries/usePortalTransactions.ts";

/**
 * Unit tests voor src/features/portal-dashboard/transacties.ts — de
 * filter-, groepeer- en tekstlogica achter het Transacties-tabblad
 * (docs/features/portal-dashboard.md → Schermflow §2). Geen Supabase, geen
 * React — zelfde scheiding als test/ledger.test.ts.
 */

function transaction(overrides: Partial<PortalTransaction>): PortalTransaction {
  return {
    id: "t",
    kind: "bestelling",
    createdAt: "2026-07-28T00:00:00Z",
    amountCents: 650,
    method: null,
    serverName: "Tom Willems",
    reversed: false,
    reversalReason: null,
    reversedVia: null,
    reversedByName: null,
    itemsDescription: "2× pils, 1× chips",
    ...overrides,
  };
}

test("transactionLabel: 'Bestelling' of 'Opgewaardeerd', ongewijzigd voor een teruggedraaide bestelling", () => {
  assert.equal(transactionLabel(transaction({ kind: "bestelling" })), "Bestelling");
  assert.equal(
    transactionLabel(transaction({ kind: "bestelling", reversed: true })),
    "Bestelling"
  );
  assert.equal(transactionLabel(transaction({ kind: "opwaardering" })), "Opgewaardeerd");
});

test("transactionDetail: itemomschrijving voor een bestelling, 'contant' voor een opwaardering", () => {
  assert.equal(
    transactionDetail(transaction({ itemsDescription: "2× pils, 1× chips" }), false),
    "2× pils, 1× chips"
  );
  assert.equal(
    transactionDetail(
      transaction({ kind: "opwaardering", method: "cash", itemsDescription: null }),
      false
    ),
    "contant"
  );
});

test("transactionDetail: 'bestelling' als terugval bij een lege itemomschrijving", () => {
  assert.equal(transactionDetail(transaction({ itemsDescription: "" }), false), "bestelling");
});

test("transactionDetail: teruggedraaid-toevoeging alleen met showReversal=true", () => {
  const reversedOrder = transaction({
    reversed: true,
    reversalReason: "verkeerd geboekt",
  });
  assert.equal(transactionDetail(reversedOrder, false), "2× pils, 1× chips");
  assert.equal(
    transactionDetail(reversedOrder, true),
    "2× pils, 1× chips · teruggedraaid · verkeerd geboekt"
  );
});

test("transactionDetail: geen teruggedraaid-toevoeging voor een niet-teruggedraaide bestelling, ook niet met showReversal=true", () => {
  assert.equal(transactionDetail(transaction({ reversed: false }), true), "2× pils, 1× chips");
});

test("filterTransactions: 'uitgaven' telt een teruggedraaide bestelling nog steeds mee — het is en blijft een bestelling", () => {
  const list = [
    transaction({ id: "a", kind: "bestelling" }),
    transaction({ id: "b", kind: "bestelling", reversed: true }),
    transaction({ id: "c", kind: "opwaardering" }),
  ];
  assert.deepEqual(
    filterTransactions(list, "uitgaven").map((t) => t.id),
    ["a", "b"]
  );
  assert.deepEqual(
    filterTransactions(list, "opwaarderingen").map((t) => t.id),
    ["c"]
  );
  assert.deepEqual(
    filterTransactions(list, "alles").map((t) => t.id),
    ["a", "b", "c"]
  );
});

test("groupByMonth: groepeert opeenvolgende transacties van dezelfde maand, nieuwste eerst behouden", () => {
  const list = [
    transaction({ id: "a", createdAt: "2026-07-28T00:00:00Z" }),
    transaction({ id: "b", createdAt: "2026-07-21T00:00:00Z" }),
    transaction({ id: "c", createdAt: "2026-06-29T00:00:00Z" }),
  ];
  const groups = groupByMonth(list);
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((t) => t.id)]),
    [
      ["Juli 2026", ["a", "b"]],
      ["Juni 2026", ["c"]],
    ]
  );
});

test("groupByMonth: dezelfde maandnaam in een ander jaar is een eigen groep", () => {
  const list = [
    transaction({ id: "a", createdAt: "2027-01-05T00:00:00Z" }),
    transaction({ id: "b", createdAt: "2026-01-20T00:00:00Z" }),
  ];
  const groups = groupByMonth(list);
  assert.deepEqual(
    groups.map((g) => g.items.map((t) => t.id)),
    [["a"], ["b"]]
  );
});

test("dateLabel: dag + verkorte maandnaam, lokale tijd", () => {
  assert.equal(dateLabel("2026-07-28T00:00:00"), "28 jul");
});
