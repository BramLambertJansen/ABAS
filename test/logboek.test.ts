import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LOGBOEK_FILTERS,
  clockLabel,
  countLabel,
  describeRow,
  filterLogboek,
  groepeerPerDag,
  logboekEmptyState,
  reikwijdteTekst,
} from "../src/features/logboek/logboek.ts";
import {
  logboekKey,
  voegLogboekSamen,
} from "../src/hooks/queries/logboekSamenvoegen.ts";
import type { LogboekEntry } from "../src/hooks/queries/useLogboek.ts";
import { formatCents } from "../src/lib/money.ts";

/**
 * Unit tests voor src/features/logboek/logboek.ts en
 * src/hooks/queries/logboekSamenvoegen.ts — zoek-, filter-, groepeer- en
 * weergavelogica achter het Logboek (docs/features/logboek.md en
 * logboek-chronologisch-reikwijdte.md). Alle tijden zijn UTC (`Z`) en
 * `nu` is een vaste parameter: de uitkomst hangt niet van de `TZ` of de
 * klok van de machine af.
 */

const NU = new Date("2026-10-05T10:00:00Z");
const LIMIET = 200;

function entry(overrides: Partial<LogboekEntry>): LogboekEntry {
  return {
    id: "e",
    kind: "verkoop",
    createdAt: "2026-09-24T21:10:00Z",
    memberName: "Anna de Vries",
    actorId: "tom",
    actorName: "Tom Willems",
    amountCents: 350,
    itemCount: 1,
    productNames: ["Bier"],
    method: null,
    reversed: false,
    reversal: null,
    ...overrides,
  };
}

/** Een terugdraaiing: de actor is de terugdraaier, het lid dat van de
 *  oorspronkelijke bestelling. */
function terugdraaiing(overrides: Partial<LogboekEntry> = {}): LogboekEntry {
  return entry({
    kind: "terugdraaiing",
    actorId: "femke",
    actorName: "Femke Bos",
    amountCents: 350,
    reversal: {
      reason: "verkeerd lid",
      via: "beheer",
      refundedCents: 350,
      originalCreatedAt: "2026-09-20T12:05:00Z",
    },
    ...overrides,
  });
}

test("LOGBOEK_FILTERS bevat alle vijf chips, in deze volgorde", () => {
  assert.deepEqual(
    LOGBOEK_FILTERS.map((f) => f.id),
    ["alles", "aandacht", "geld", "assortiment", "leden"]
  );
});

test("clockLabel geeft HH:MM in Nederlandse tijd, niet apparaattijd", () => {
  assert.equal(clockLabel("2026-09-24T07:05:00Z"), "09:05");
  assert.equal(clockLabel("2026-01-24T07:05:00Z"), "08:05");
});

test("describeRow: verkoop op saldo", () => {
  const row = describeRow(entry({ itemCount: 3, memberName: "Jan de Vries" }), NU);
  assert.deepEqual(row, {
    tag: "SALDO",
    action: "Bestelling op saldo",
    detail: "3 items · Jan de Vries",
    statusLabel: null,
  });
});

test("describeRow: enkelvoud 'item' bij itemCount 1", () => {
  assert.equal(describeRow(entry({ itemCount: 1 }), NU).detail, "1 item · Anna de Vries");
});

test("describeRow: losse verkoop zonder lid", () => {
  assert.equal(describeRow(entry({ memberName: null }), NU).detail, "1 item · Losse verkoop");
});

test("describeRow: een later teruggedraaide verkoop krijgt het zichtbare label 'Teruggedraaid', geen LET OP", () => {
  const row = describeRow(entry({ reversed: true }), NU);
  assert.equal(row.tag, "SALDO");
  assert.equal(row.action, "Bestelling op saldo");
  assert.equal(row.statusLabel, "Teruggedraaid");
});

test("describeRow: opwaardering toont 'contant', nooit 'cash'", () => {
  const row = describeRow(
    entry({
      kind: "opwaardering",
      amountCents: 2500,
      method: "cash",
      memberName: "Jan de Vries",
      itemCount: 0,
      productNames: [],
    }),
    NU
  );
  assert.deepEqual(row, {
    tag: "SALDO",
    action: "Saldo opgewaardeerd",
    detail: `+${formatCents(2500)} · contant · Jan de Vries`,
    statusLabel: null,
  });
  assert.doesNotMatch(row.detail, /cash/);
});

test("describeRow: opwaardering zonder methode heeft geen hangend scheidingsteken", () => {
  const row = describeRow(
    entry({ kind: "opwaardering", amountCents: 2500, method: null, memberName: "Jan" }),
    NU
  );
  assert.equal(row.detail, `+${formatCents(2500)} · Jan`);
});

test("describeRow: terugdraaiing is LET OP met reden, terugdraaier, via, bedrag en verwijzing", () => {
  const row = describeRow(terugdraaiing(), NU);
  assert.deepEqual(row, {
    tag: "LET OP",
    action: "Bestelling teruggedraaid",
    detail: `verkeerd lid · door Femke Bos via beheer · ${formatCents(
      350
    )} teruggeboekt · Bestelling van zondag 20 september 14:05 · Anna de Vries`,
    statusLabel: null,
  });
});

test("describeRow: verwijzing naar een bestelling van een ander jaar bevat het jaar", () => {
  const row = describeRow(
    terugdraaiing({
      memberName: null,
      reversal: {
        reason: "fout",
        via: "bar",
        refundedCents: 100,
        originalCreatedAt: "2025-12-30T12:00:00Z",
      },
    }),
    NU
  );
  assert.match(row.detail, /Bestelling van dinsdag 30 december 2025 13:00 · Losse verkoop$/);
  assert.match(row.detail, /door Femke Bos via bar/);
});

test("describeRow: lege reden geeft geen hangend scheidingsteken", () => {
  const row = describeRow(
    terugdraaiing({
      reversal: { reason: "", via: "bar", refundedCents: 100, originalCreatedAt: null },
    }),
    NU
  );
  assert.equal(row.detail, `door Femke Bos via bar · ${formatCents(100)} teruggeboekt`);
  assert.doesNotMatch(row.detail, /^ ·| · $| ·  ·/);
});

test("describeRow: terugdraaiing toont geen plusteken en de verkoper komt er niet in voor", () => {
  const row = describeRow(terugdraaiing({ actorName: "Femke Bos" }), NU);
  assert.doesNotMatch(row.detail, /\+/);
  assert.doesNotMatch(row.detail, /Tom Willems/);
});

const entries: LogboekEntry[] = [
  entry({ id: "a", memberName: "Anna de Vries", productNames: ["Cola"] }),
  entry({
    id: "b",
    kind: "opwaardering",
    memberName: "Bas Smit",
    actorName: "Kevin Jansen",
    amountCents: 2000,
    itemCount: 0,
    productNames: [],
    method: "cash",
  }),
  terugdraaiing({
    id: "c",
    memberName: "Cas de Boer",
    actorName: "Tom Willems",
    reversal: {
      reason: "verkeerd product",
      via: "bar",
      refundedCents: 350,
      originalCreatedAt: "2026-09-20T12:05:00Z",
    },
  }),
  entry({ id: "c", reversed: true, memberName: "Cas de Boer", productNames: ["Wijn"] }),
];

test("filterLogboek: 'alles' en 'geld' leveren alles op (ook de terugdraaiing), volgorde ongewijzigd", () => {
  const sleutels = (filter: "alles" | "geld") =>
    filterLogboek(entries, { query: "", filter }).map(logboekKey);
  const verwacht = ["verkoop:a", "opwaardering:b", "terugdraaiing:c", "verkoop:c"];
  assert.deepEqual(sleutels("alles"), verwacht);
  assert.deepEqual(sleutels("geld"), verwacht);
});

test("filterLogboek: 'aandacht' toont alleen terugdraai-gebeurtenissen, niet de teruggedraaide verkoop", () => {
  assert.deepEqual(
    filterLogboek(entries, { query: "", filter: "aandacht" }).map(logboekKey),
    ["terugdraaiing:c"]
  );
});

test("filterLogboek: 'assortiment' en 'leden' leveren nooit iets op", () => {
  assert.deepEqual(filterLogboek(entries, { query: "", filter: "assortiment" }), []);
  assert.deepEqual(filterLogboek(entries, { query: "", filter: "leden" }), []);
});

test("filterLogboek: gastverkoop (memberName null) is doorzoekbaar op 'losse verkoop'", () => {
  const guest = entry({ id: "d", memberName: null });
  assert.deepEqual(
    filterLogboek([guest], { query: "losse verkoop", filter: "alles" }).map((e) => e.id),
    ["d"]
  );
  assert.deepEqual(filterLogboek([guest], { query: "anna", filter: "alles" }), []);
});

test("filterLogboek zoekt hoofdletterongevoelig op lid, actor, product en actie-tekst", () => {
  const ids = (q: string) =>
    filterLogboek(entries, { query: q, filter: "alles" }).map(logboekKey);
  assert.deepEqual(ids("cola"), ["verkoop:a"]);
  assert.deepEqual(ids("  BAS "), ["opwaardering:b"]);
  assert.deepEqual(ids("kevin jansen"), ["opwaardering:b"]);
  assert.deepEqual(ids("opgewaardeerd"), ["opwaardering:b"]);
  assert.deepEqual(ids("bestelling teruggedraaid"), ["terugdraaiing:c"]);
});

test("filterLogboek zoekt een terugdraaiing op reden en terugdraaier", () => {
  const ids = (q: string) =>
    filterLogboek(entries, { query: q, filter: "alles" }).map(logboekKey);
  assert.deepEqual(ids("verkeerd product"), ["terugdraaiing:c"]);
  // "Tom Willems" is terugdraaier van c, en ook actor van verkoop a en c.
  assert.ok(ids("tom willems").includes("terugdraaiing:c"));
});

test("filterLogboek: de verkoper van een teruggedraaide bestelling is niet de actor van de terugdraaiing", () => {
  const rev = terugdraaiing({ id: "x", actorName: "Femke Bos" });
  assert.deepEqual(filterLogboek([rev], { query: "tom willems", filter: "alles" }), []);
  assert.equal(filterLogboek([rev], { query: "femke", filter: "alles" }).length, 1);
});

test("groepeerPerDag: aaneengesloten dagen, 'dinsdag 29 september' zonder jaar in het huidige jaar", () => {
  const lijst = [
    entry({ id: "1", createdAt: "2026-09-29T18:00:00Z" }),
    entry({ id: "2", createdAt: "2026-09-29T09:00:00Z" }),
    entry({ id: "3", createdAt: "2026-09-28T09:00:00Z" }),
  ];
  const groepen = groepeerPerDag(lijst, NU);
  assert.deepEqual(
    groepen.map((g) => [g.label, g.entries.map((e) => e.id)]),
    [
      ["dinsdag 29 september", ["1", "2"]],
      ["maandag 28 september", ["3"]],
    ]
  );
});

test("groepeerPerDag: jaar in de kop alleen bij een ander jaar", () => {
  const groepen = groepeerPerDag(
    [
      entry({ id: "1", createdAt: "2026-01-02T12:00:00Z" }),
      entry({ id: "2", createdAt: "2025-12-30T12:00:00Z" }),
    ],
    NU
  );
  assert.deepEqual(
    groepen.map((g) => g.label),
    ["vrijdag 2 januari", "dinsdag 30 december 2025"]
  );
});

test("groepeerPerDag: jaargrens 31 dec 23:30Z valt onder 1 januari", () => {
  const groepen = groepeerPerDag(
    [
      entry({ id: "1", createdAt: "2026-12-31T23:30:00Z" }),
      entry({ id: "2", createdAt: "2026-12-31T22:30:00Z" }),
    ],
    NU
  );
  assert.deepEqual(
    groepen.map((g) => [g.key, g.entries.map((e) => e.id)]),
    [
      ["2027-01-01", ["1"]],
      ["2026-12-31", ["2"]],
    ]
  );
});

test("groepeerPerDag: maandgrens 30 sep 22:30Z valt onder 1 oktober", () => {
  const groepen = groepeerPerDag(
    [
      entry({ id: "1", createdAt: "2026-09-30T22:30:00Z" }),
      entry({ id: "2", createdAt: "2026-09-30T21:30:00Z" }),
    ],
    NU
  );
  assert.deepEqual(
    groepen.map((g) => g.key),
    ["2026-10-01", "2026-09-30"]
  );
});

test("groepeerPerDag: wintertijdovergang 25 oktober 2026: beide 02:30 onder één dag, geen dubbele of verdwenen dag", () => {
  const lijst = [
    entry({ id: "late", createdAt: "2026-10-25T01:30:00Z" }),
    entry({ id: "vroeg", createdAt: "2026-10-25T00:30:00Z" }),
    entry({ id: "gisteren", createdAt: "2026-10-24T21:00:00Z" }),
  ];
  const groepen = groepeerPerDag(lijst, NU);
  assert.deepEqual(
    groepen.map((g) => [g.key, g.entries.map((e) => e.id)]),
    [
      ["2026-10-25", ["late", "vroeg"]],
      ["2026-10-24", ["gisteren"]],
    ]
  );
  assert.equal(clockLabel("2026-10-25T00:30:00Z"), "02:30");
  assert.equal(clockLabel("2026-10-25T01:30:00Z"), "02:30");
});

test("groepeerPerDag: zomertijdovergang 29 maart 2026", () => {
  const groepen = groepeerPerDag(
    [
      entry({ id: "1", createdAt: "2026-03-29T22:00:00Z" }),
      entry({ id: "2", createdAt: "2026-03-29T21:59:00Z" }),
      entry({ id: "3", createdAt: "2026-03-28T23:00:00Z" }),
    ],
    NU
  );
  assert.deepEqual(
    groepen.map((g) => [g.key, g.entries.map((e) => e.id)]),
    [
      ["2026-03-30", ["1"]],
      ["2026-03-29", ["2", "3"]],
    ]
  );
});

test("groepeerPerDag: lege lijst geeft geen groepen", () => {
  assert.deepEqual(groepeerPerDag([], NU), []);
});

test("logboekKey bevat het soort: verkoop en terugdraaiing met hetzelfde order-id botsen niet", () => {
  assert.notEqual(
    logboekKey(entry({ id: "o1" })),
    logboekKey(terugdraaiing({ id: "o1" }))
  );
  assert.equal(logboekKey(terugdraaiing({ id: "o1" })), "terugdraaiing:o1");
});

test("voegLogboekSamen: sorteert drie bronnen op gebeurtenistijd, nieuwste eerst", () => {
  const { entries: samen } = voegLogboekSamen(
    [
      [entry({ id: "o1", createdAt: "2026-09-20T10:00:00Z" })],
      [entry({ id: "t1", kind: "opwaardering", createdAt: "2026-09-22T10:00:00Z" })],
      [terugdraaiing({ id: "o0", createdAt: "2026-09-21T10:00:00Z" })],
    ],
    LIMIET
  );
  assert.deepEqual(samen.map(logboekKey), [
    "opwaardering:t1",
    "terugdraaiing:o0",
    "verkoop:o1",
  ]);
});

test("voegLogboekSamen: een late terugdraaiing van een zeer oude bestelling staat op de terugdraaitijd, ook als `orders` die bestelling niet bevat", () => {
  const recenteOrders = Array.from({ length: 5 }, (_, i) =>
    entry({ id: `o${i}`, createdAt: `2026-09-1${i}T10:00:00Z` })
  );
  const laat = terugdraaiing({
    id: "oud",
    createdAt: "2026-09-30T10:00:00Z",
    reversal: {
      reason: "oud",
      via: "beheer",
      refundedCents: 100,
      originalCreatedAt: "2024-01-05T10:00:00Z",
    },
  });
  const { entries: samen } = voegLogboekSamen([recenteOrders, [], [laat]], LIMIET);
  assert.equal(logboekKey(samen[0]), "terugdraaiing:oud");
  assert.ok(!samen.some((e) => e.kind === "verkoop" && e.id === "oud"));
});

test("voegLogboekSamen: exact 200 is niet beperkt, 201 wel en de oudste valt weg", () => {
  const maak = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      entry({
        id: `o${String(i).padStart(3, "0")}`,
        createdAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
      })
    );
  const tweehonderd = voegLogboekSamen([maak(120), [], maak(80).map((e) => ({ ...e, id: `x${e.id}`, kind: "terugdraaiing" as const }))], LIMIET);
  assert.equal(tweehonderd.entries.length, 200);
  assert.equal(tweehonderd.beperkt, false);

  const alle = maak(201);
  const eenEnTweehonderd = voegLogboekSamen([alle], LIMIET);
  assert.equal(eenEnTweehonderd.entries.length, 200);
  assert.equal(eenEnTweehonderd.beperkt, true);
  // De oudste (i = 0) is weggevallen.
  assert.ok(!eenEnTweehonderd.entries.some((e) => e.id === "o000"));
});

test("voegLogboekSamen: gelijk tijdstip, een terugdraaiing staat boven zijn eigen verkoop", () => {
  const tijd = "2026-09-24T10:00:00Z";
  const { entries: samen } = voegLogboekSamen(
    [[entry({ id: "o1", createdAt: tijd })], [], [terugdraaiing({ id: "o1", createdAt: tijd })]],
    LIMIET
  );
  assert.deepEqual(samen.map(logboekKey), ["terugdraaiing:o1", "verkoop:o1"]);
});

test("voegLogboekSamen: gelijk tijdstip, grootste id eerst, ongeacht invoervolgorde", () => {
  const tijd = "2026-09-24T10:00:00Z";
  const a = entry({ id: "a", createdAt: tijd });
  const b = entry({ id: "b", createdAt: tijd });
  assert.deepEqual(voegLogboekSamen([[a, b]], LIMIET).entries.map((e) => e.id), ["b", "a"]);
  assert.deepEqual(voegLogboekSamen([[b, a]], LIMIET).entries.map((e) => e.id), ["b", "a"]);
});

test("countLabel", () => {
  assert.equal(countLabel(1, 1), "1 handeling");
  assert.equal(countLabel(5, 5), "5 handelingen");
  assert.equal(countLabel(2, 5), "2 van 5 handelingen");
  assert.equal(countLabel(0, 5), "0 van 5 handelingen");
});

test("countLabel: bij een beperkt resultaat staat 'meest recente 200' erbij", () => {
  const r = { beperkt: true, limit: 200 };
  assert.equal(countLabel(200, 200, r), "meest recente 200 handelingen");
  assert.equal(countLabel(12, 200, r), "12 van de meest recente 200");
});

test("reikwijdteTekst: altijd de soorten, alleen bij beperkt de melding over 200", () => {
  assert.equal(
    reikwijdteTekst({ beperkt: false, limit: 200 }),
    "Verkopen, opwaarderingen en terugdraaiingen van alle diensten."
  );
  assert.equal(
    reikwijdteTekst({ beperkt: true, limit: 200 }),
    "Verkopen, opwaarderingen en terugdraaiingen van alle diensten. Alleen de meest recente 200 handelingen. Zoeken en filteren werkt alleen binnen die 200."
  );
});

test("logboekEmptyState: assortiment en leden zijn eerlijk, altijd, met hun eigen tekst", () => {
  assert.deepEqual(logboekEmptyState("assortiment", 0, 42), {
    title: "Nog niet geregistreerd",
    hint: "Wijzigingen aan het assortiment worden nog niet in het logboek vastgelegd.",
  });
  assert.deepEqual(logboekEmptyState("leden", 0, 0), {
    title: "Nog niet geregistreerd",
    hint: "Wijzigingen aan leden worden nog niet in het logboek vastgelegd.",
  });
});

test("logboekEmptyState: geen enkele tekst belooft 'elke handeling in de app'", () => {
  const staten = [
    logboekEmptyState("alles", 0, 0),
    logboekEmptyState("assortiment", 0, 3),
    logboekEmptyState("leden", 0, 3),
    logboekEmptyState("aandacht", 0, 12),
    logboekEmptyState("aandacht", 0, 200, { beperkt: true, limit: 200 }),
  ];
  for (const staat of staten) {
    assert.doesNotMatch(JSON.stringify(staat), /elke handeling in de app/);
  }
});

test("logboekEmptyState: org-breed nog niets vastgelegd", () => {
  assert.deepEqual(logboekEmptyState("alles", 0, 0), {
    title: "Nog niets vastgelegd",
    hint: "Verkopen, opwaarderingen en terugdraaiingen komen hier te staan, met naam en tijd erbij.",
  });
});

test("logboekEmptyState: filter/zoekterm levert niets op terwijl er wél data is", () => {
  assert.deepEqual(logboekEmptyState("aandacht", 0, 12), {
    title: "Niets gevonden",
    hint: "Andere filter of zoekterm probeert het opnieuw",
  });
});

test("logboekEmptyState: bij een beperkt resultaat noemt 'niets gevonden' de reikwijdte", () => {
  assert.deepEqual(logboekEmptyState("aandacht", 0, 200, { beperkt: true, limit: 200 }), {
    title: "Niets gevonden",
    hint: "Niets gevonden in de meest recente 200 handelingen. Oudere staan niet in dit overzicht.",
  });
});

test("logboekEmptyState: null zodra er resultaten zijn", () => {
  assert.equal(logboekEmptyState("alles", 3, 12), null);
});
