import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countLabel,
  describeRow,
  filterLogboek,
  groepeerPerDag,
} from "../src/features/logboek/logboek.ts";
import { logboekKey, voegLogboekSamen } from "../src/hooks/queries/logboekSamenvoegen.ts";
import type { LogboekEntry } from "../src/hooks/queries/useLogboek.ts";
import { dagKop, dagSleutel, klokTijd } from "../src/lib/date.ts";
import { methodLabel } from "../src/lib/betaalmethode.ts";

/**
 * Adversariele aanvullingen (Tester, PR #166) op test/logboek.test.ts en
 * test/date.test.ts: precisie van PostgREST-timestamps, volgorde-invariantie
 * van het samenvoegen, de cap over bronnen heen, DST-kloktijden en randen van
 * de reversalrij. Alle invoer is UTC (`Z`/`+00:00`): TZ-onafhankelijk.
 */

const NU = new Date("2026-10-05T10:00:00Z");

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

function terugdraaiing(overrides: Partial<LogboekEntry> = {}, reden = "verkeerd lid"): LogboekEntry {
  return entry({
    kind: "terugdraaiing",
    actorId: "femke",
    actorName: "Femke Bos",
    reversal: {
      reason: reden,
      via: "beheer",
      refundedCents: 350,
      originalCreatedAt: "2026-09-20T12:05:00Z",
    },
    ...overrides,
  });
}

test("PostgREST-timestamps met microseconden en +00:00 sorteren en groeperen correct", () => {
  const a = entry({ id: "a", createdAt: "2026-10-25T00:30:00.123456+00:00" });
  const b = entry({ id: "b", createdAt: "2026-10-25T01:30:00.000001+00:00" });
  const { entries } = voegLogboekSamen([[a], [b]], 200);
  assert.deepEqual(entries.map((e) => e.id), ["b", "a"]);
  assert.equal(groepeerPerDag(entries, NU).length, 1);
  assert.equal(klokTijd(a.createdAt), "02:30");
  assert.equal(klokTijd(b.createdAt), "02:30");
});

test("voegLogboekSamen: uitkomst is onafhankelijk van de invoervolgorde (totale orde, ook bij gelijke tijden)", () => {
  const t = "2026-09-24T10:00:00Z";
  const alle = [
    entry({ id: "o1", createdAt: t }),
    terugdraaiing({ id: "o1", createdAt: t }),
    entry({ id: "o2", createdAt: t }),
    entry({ id: "o1", kind: "opwaardering", createdAt: t }),
    terugdraaiing({ id: "o0", createdAt: t }),
    entry({ id: "o3", createdAt: "2026-09-25T10:00:00Z" }),
  ];
  const verwacht = voegLogboekSamen([alle], 200).entries.map(logboekKey);
  // Deterministische permutaties (geen Math.random).
  for (let shift = 0; shift < alle.length; shift++) {
    const gedraaid = [...alle.slice(shift), ...alle.slice(0, shift)];
    assert.deepEqual(voegLogboekSamen([gedraaid], 200).entries.map(logboekKey), verwacht);
    assert.deepEqual(
      voegLogboekSamen([[...gedraaid].reverse()], 200).entries.map(logboekKey),
      verwacht
    );
  }
  assert.equal(new Set(verwacht).size, alle.length, "keys uniek, ook bij gelijk order-id");
});

test("voegLogboekSamen: de top 200 is de echte top 200 als één bron er 201 levert en de andere nieuwere", () => {
  const ordersBron = Array.from({ length: 201 }, (_, i) =>
    entry({ id: `o${String(i).padStart(3, "0")}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() })
  );
  // Reversal valt tussen order 100 en 101 in tijd.
  const rev = terugdraaiing({ id: "o000", createdAt: new Date(Date.UTC(2026, 0, 1, 0, 100, 30)).toISOString() });
  const { entries, beperkt } = voegLogboekSamen([ordersBron, [], [rev]], 200);
  assert.equal(entries.length, 200);
  assert.equal(beperkt, true);
  assert.ok(entries.some((e) => e.kind === "terugdraaiing"));
  // 202 bestaan: de twee oudste orders (o000, o001) vallen weg; de reversal van o000 blijft.
  assert.ok(!entries.some((e) => e.kind === "verkoop" && (e.id === "o000" || e.id === "o001")));
  assert.ok(entries.some((e) => e.kind === "verkoop" && e.id === "o002"));
});

test("voegLogboekSamen: leeg en minder dan de limiet geeft nooit beperkt", () => {
  assert.deepEqual(voegLogboekSamen([[], [], []], 200), { entries: [], beperkt: false });
  assert.equal(voegLogboekSamen([[entry({})]], 200).beperkt, false);
});

test("dagKop/klokTijd rond de zomertijdovergang 29 maart 2026 en wintertijd 25 oktober 2026", () => {
  // 02:00 CET bestaat niet op 29 maart: 00:59Z = 01:59, 01:00Z = 03:00.
  assert.equal(klokTijd("2026-03-29T00:59:00Z"), "01:59");
  assert.equal(klokTijd("2026-03-29T01:00:00Z"), "03:00");
  assert.equal(dagKop("2026-03-29T00:59:00Z", NU), "zondag 29 maart");
  assert.equal(dagKop("2026-03-29T01:00:00Z", NU), "zondag 29 maart");
  assert.equal(dagKop("2026-10-25T00:30:00Z", NU), "zondag 25 oktober");
  assert.equal(dagKop("2026-10-25T23:30:00Z", NU), "maandag 26 oktober");
  // Middernacht Amsterdam geeft 00:00, nooit 24:00.
  assert.equal(klokTijd("2026-03-27T23:00:00Z"), "00:00");
  assert.equal(dagSleutel("2026-03-27T23:00:00Z"), "2026-03-28");
  assert.equal(dagSleutel("2026-03-28T22:59:00Z"), "2026-03-28");
});

test("dagKop: `nu` op de jaarwissel in Amsterdam bepaalt het 'huidige jaar'", () => {
  const nuNieuwjaar = new Date("2026-12-31T23:30:00Z"); // 1 jan 2027 00:30 NL
  assert.equal(dagKop("2026-12-31T22:30:00Z", nuNieuwjaar), "donderdag 31 december 2026");
  assert.equal(dagKop("2027-01-01T10:00:00Z", nuNieuwjaar), "vrijdag 1 januari");
});

test("describeRow: reden met alleen spaties geeft geen hangend scheidingsteken", () => {
  const { detail } = describeRow(terugdraaiing({}, "   "), NU);
  assert.ok(!detail.startsWith(" "));
  assert.ok(!detail.startsWith("·"));
  assert.ok(!/·\s*·/.test(detail));
  assert.ok(!detail.endsWith("·") && !detail.endsWith(" "));
});

test("describeRow: terugdraaiing zonder oorspronkelijke bestelling (embed null) heeft geen verwijzing en geen hangend teken", () => {
  const e = terugdraaiing({ memberName: null });
  const zonder = { ...e, reversal: { ...e.reversal!, originalCreatedAt: null } };
  const { detail, action, tag } = describeRow(zonder, NU);
  assert.equal(tag, "LET OP");
  assert.equal(action, "Bestelling teruggedraaid");
  assert.ok(!detail.includes("Bestelling van"));
  assert.ok(!detail.endsWith("·") && !detail.endsWith(" "));
  assert.match(detail, /door Femke Bos via beheer/);
});

test("describeRow: terugdraaiing met refund 0 toont '€ 0,00 teruggeboekt' zonder teken; via bar", () => {
  const e = terugdraaiing({});
  const nul = { ...e, reversal: { ...e.reversal!, refundedCents: 0, via: "bar" as const } };
  const { detail } = describeRow(nul, NU);
  assert.match(detail, /door Femke Bos via bar/);
  assert.match(detail, /€\s?0,00 teruggeboekt/);
  assert.ok(!/[+−-]\s?€/.test(detail));
});

test("describeRow: onbekende betaalmethode toont de waarde zelf; geen enkele rij toont rauw 'cash'", () => {
  assert.equal(methodLabel("cash"), "contant");
  assert.equal(methodLabel("ideal"), "ideal");
  assert.equal(methodLabel(null), "");
  const rij = describeRow(entry({ kind: "opwaardering", method: "cash", memberName: null }), NU);
  assert.ok(!/cash/i.test(rij.detail));
  assert.match(rij.detail, /contant/);
  assert.match(rij.detail, /onbekend$/);
});

test("filterLogboek: whitespace-zoekterm is geen filter; zoeken matcht niet op de bedragtekst of 'cash'", () => {
  const lijst = [entry({ id: "o1" }), entry({ id: "t1", kind: "opwaardering", method: "cash" })];
  assert.equal(filterLogboek(lijst, { query: "   ", filter: "alles" }).length, 2);
  assert.equal(filterLogboek(lijst, { query: "cash", filter: "alles" }).length, 0);
});

test("filterLogboek: aandacht + zoekterm op terugdraaier vindt alleen de terugdraaiing; verkoper vindt niets", () => {
  const verkoop = entry({ id: "o1", reversed: true, actorName: "Tom Willems" });
  const terug = terugdraaiing({ id: "o1", actorName: "Femke Bos" });
  assert.deepEqual(
    filterLogboek([terug, verkoop], { query: "femke", filter: "aandacht" }).map(logboekKey),
    ["terugdraaiing:o1"]
  );
  assert.deepEqual(filterLogboek([terug], { query: "tom", filter: "aandacht" }), []);
});

test("countLabel: beperkt met filter en 0 resultaten", () => {
  const r = { beperkt: true, limit: 200 };
  assert.equal(countLabel(0, 200, r), "0 van de meest recente 200");
  assert.equal(countLabel(1, 1, { beperkt: false, limit: 200 }), "1 handeling");
});

test("µs-volgorde over bronnen: zelfde ms, andere µs, ongeacht id en fractielengte", () => {
  const a = entry({ id: "a", kind: "verkoop", createdAt: "2026-09-24T21:10:00.123456Z" });
  const b = entry({ id: "z", kind: "terugdraaiing", createdAt: "2026-09-24T21:10:00.123457+00:00" });
  const c = entry({ id: "m", kind: "opwaardering", createdAt: "2026-09-24T21:10:00.1234Z" });
  const d = entry({ id: "b", kind: "verkoop", createdAt: "2026-09-24T21:10:00.12Z" });
  const verwacht = ["z", "a", "m", "b"];
  for (const bronnen of [[[a], [b], [c, d]], [[d, c], [b, a]], [[c], [a, d], [b]]]) {
    const { entries } = voegLogboekSamen(bronnen, 10);
    assert.deepEqual(entries.map((e) => e.id), verwacht);
  }
});

test("µs-gelijk valt terug op id aflopend", () => {
  const x = entry({ id: "a", createdAt: "2026-09-24T21:10:00.123456Z" });
  const y = entry({ id: "b", createdAt: "2026-09-24T21:10:00.123456+00:00" });
  assert.deepEqual(voegLogboekSamen([[x], [y]], 10).entries.map((e) => e.id), ["b", "a"]);
});
