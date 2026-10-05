import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REVERSAL_EXPLANATION,
  RECENT_TRANSACTIONS_LIMIT,
  amountSign,
  dateLabel,
  filterTransactions,
  groupByMonth,
  recentTransactions,
  reversalLines,
  showReversalExplanation,
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
    transactionDetail(transaction({ itemsDescription: "2× pils, 1× chips" })),
    "2× pils, 1× chips"
  );
  assert.equal(
    transactionDetail(transaction({ kind: "opwaardering", method: "cash", itemsDescription: null })),
    "contant"
  );
});

test("transactionDetail: 'bestelling' als terugval bij een lege itemomschrijving", () => {
  assert.equal(transactionDetail(transaction({ itemsDescription: "" })), "bestelling");
});

test("transactionDetail: de teruggedraaid-status zit niet meer in de (afbreekbare) subtitel", () => {
  const reversedOrder = transaction({
    reversed: true,
    reversalReason: "verkeerd geboekt",
    reversedByName: "Sanne",
  });
  assert.equal(transactionDetail(reversedOrder), "2× pils, 1× chips");
  assert.equal(transactionDetail(transaction({ reversed: false })), "2× pils, 1× chips");
});

test("reversalLines: 'Door: {naam}' en 'Reden: {reden}', in die volgorde, letterlijk", () => {
  const t = transaction({
    reversed: true,
    reversalReason: "verkeerd product getikt",
    reversedByName: "Sanne Bakker",
  });
  assert.deepEqual(reversalLines(t), ["Door: Sanne Bakker", "Reden: verkeerd product getikt"]);
});

test("reversalLines: identiek voor een bar- en een beheer-terugdraaiing, kanaal nergens in de uitvoer", () => {
  const bar = transaction({
    reversed: true,
    reversalReason: "dubbel",
    reversedByName: "Sanne",
    reversedVia: "bar",
  });
  const beheer = { ...bar, reversedVia: "beheer" as const };
  assert.deepEqual(reversalLines(bar), reversalLines(beheer));
  const tekst = reversalLines(bar).join(" ").toLowerCase();
  assert.ok(!tekst.includes("bar"));
  assert.ok(!tekst.includes("beheer"));
  assert.ok(!tekst.includes("via"));
});

test("reversalLines: lege of ontbrekende naam/reden laat alleen die regel vervallen, geen hangend scheidingsteken", () => {
  const base = { reversed: true } as const;
  assert.deepEqual(
    reversalLines(transaction({ ...base, reversalReason: "dubbel", reversedByName: null })),
    ["Reden: dubbel"]
  );
  assert.deepEqual(
    reversalLines(transaction({ ...base, reversalReason: "dubbel", reversedByName: "  " })),
    ["Reden: dubbel"]
  );
  assert.deepEqual(
    reversalLines(transaction({ ...base, reversalReason: null, reversedByName: "Sanne" })),
    ["Door: Sanne"]
  );
  assert.deepEqual(
    reversalLines(transaction({ ...base, reversalReason: "", reversedByName: null })),
    []
  );
});

test("reversalLines: nooit voor een gewone bestelling of een opwaardering", () => {
  assert.deepEqual(
    reversalLines(transaction({ reversedByName: "Sanne", reversalReason: "x" })),
    []
  );
  assert.deepEqual(
    reversalLines(transaction({ kind: "opwaardering", method: "cash", itemsDescription: null })),
    []
  );
});

test("amountSign: geen teken bij een teruggedraaide bestelling, '+' bij opwaardering, '−' bij gewone bestelling", () => {
  assert.equal(amountSign(transaction({ reversed: true })), "");
  assert.equal(amountSign(transaction({})), "− ");
  assert.equal(amountSign(transaction({ kind: "opwaardering" })), "+ ");
});

test("showReversalExplanation: alleen met minstens één teruggedraaide bestelling in de zichtbare rijen, ook na een filter", () => {
  const list = [
    transaction({ id: "a" }),
    transaction({ id: "b", reversed: true }),
    transaction({ id: "c", kind: "opwaardering" }),
  ];
  assert.equal(showReversalExplanation(list), true);
  assert.equal(showReversalExplanation(filterTransactions(list, "uitgaven")), true);
  assert.equal(showReversalExplanation(filterTransactions(list, "opwaarderingen")), false);
  assert.equal(showReversalExplanation([transaction({})]), false);
  assert.equal(showReversalExplanation([]), false);
  assert.match(REVERSAL_EXPLANATION, /niet meer afgeschreven/);
});

test("recentTransactions: de eerste vijf in servervolgorde, teruggedraaide tellen mee, nooit hersorteerd", () => {
  const list = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) =>
    transaction({ id, reversed: i === 1, createdAt: `2026-0${(i % 9) + 1}-01T00:00:00Z` })
  );
  assert.equal(RECENT_TRANSACTIONS_LIMIT, 5);
  assert.deepEqual(
    recentTransactions(list).map((t) => t.id),
    ["a", "b", "c", "d", "e"]
  );
  assert.deepEqual(recentTransactions([transaction({ id: "x" })]).map((t) => t.id), ["x"]);
  assert.deepEqual(recentTransactions([]), []);
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

test("dateLabel: dag + verkorte maandnaam in Nederlandse tijd", () => {
  assert.equal(dateLabel("2026-07-28T12:00:00Z"), "28 jul");
});

// Besluit 4: de zone is vast Europe/Amsterdam, niet die van de machine. De
// grenzen hieronder zijn alleen in Amsterdam-tijd een andere dag/maand dan in
// UTC; `npm run test` is dus ook met TZ=UTC of TZ=America/Los_Angeles gelijk.
test("dateLabel en groepering: 30 sep 22:30 UTC is 1 okt 00:30 Amsterdam (zomertijd)", () => {
  assert.equal(dateLabel("2026-09-30T22:30:00Z"), "1 okt");
  const groups = groupByMonth([
    transaction({ id: "a", createdAt: "2026-09-30T22:30:00Z" }),
    transaction({ id: "b", createdAt: "2026-09-30T21:30:00Z" }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((t) => t.id)]),
    [
      ["Oktober 2026", ["a"]],
      ["September 2026", ["b"]],
    ]
  );
});

test("dateLabel en groepering: 31 dec 23:30 UTC is 1 jan 00:30 Amsterdam (wintertijd), nieuw jaar is een eigen groep", () => {
  assert.equal(dateLabel("2026-12-31T23:30:00Z"), "1 jan");
  const groups = groupByMonth([
    transaction({ id: "a", createdAt: "2026-12-31T23:30:00Z" }),
    transaction({ id: "b", createdAt: "2026-12-31T22:30:00Z" }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((t) => t.id)]),
    [
      ["Januari 2027", ["a"]],
      ["December 2026", ["b"]],
    ]
  );
});

test("dateLabel en groepering: grensgevallen net vóór middernacht Amsterdam blijven in de oude maand/dag", () => {
  assert.equal(dateLabel("2026-12-31T22:59:00Z"), "31 dec");
  assert.equal(dateLabel("2026-12-31T23:00:00Z"), "1 jan");
  assert.equal(dateLabel("2026-09-30T21:59:00Z"), "30 sep");
  assert.equal(dateLabel("2026-09-30T22:00:00Z"), "1 okt");
});

test("reversalLines: reden met alleen whitespace vervalt; naam en reden worden niet bewerkt (geen trim, geen opmaak)", () => {
  assert.deepEqual(
    reversalLines(transaction({ reversed: true, reversalReason: "\t \n", reversedByName: "Sanne" })),
    ["Door: Sanne"]
  );
  const lang = "x".repeat(200);
  assert.deepEqual(
    reversalLines(transaction({ reversed: true, reversalReason: lang, reversedByName: "Jan-Willem  van der Berg" })),
    ["Door: Jan-Willem  van der Berg", `Reden: ${lang}`]
  );
});

test("amountSign en bedrag: een teruggedraaide opwaardering-achtige rij krijgt nooit een teken; geen rekenwerk op bedragen", () => {
  assert.equal(amountSign(transaction({ kind: "opwaardering", reversed: true })), "");
  const list = [transaction({ id: "a", amountCents: 100 }), transaction({ id: "b", amountCents: 200, reversed: true })];
  assert.deepEqual(recentTransactions(list).map((t) => t.amountCents), [100, 200]);
});
