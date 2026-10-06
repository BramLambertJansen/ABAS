import { test } from "node:test";
import assert from "node:assert/strict";

import { maakSleutelGeheugen, nieuweSleutel } from "../src/lib/requestId.ts";

/**
 * Het sleutelhulpje voor de idempotentie van de geld-RPC's
 * (docs/features/idempotentie-geld-rpcs.md, ADR 0023): dezelfde opdracht
 * houdt dezelfde sleutel zolang er geen definitieve uitkomst was.
 */

function teller() {
  let n = 0;
  return () => `sleutel-${++n}`;
}

test("dezelfde opdracht geeft dezelfde sleutel", () => {
  const g = maakSleutelGeheugen(teller());
  const a = g.voorOpdracht(["dienst", "lid", [{ productId: "p", qty: 1 }]]);
  const b = g.voorOpdracht(["dienst", "lid", [{ productId: "p", qty: 1 }]]);
  assert.equal(a, b);
});

test("een gewijzigde opdracht geeft een nieuwe sleutel", () => {
  const g = maakSleutelGeheugen(teller());
  const a = g.voorOpdracht(["dienst", "lid", 500]);
  const b = g.voorOpdracht(["dienst", "lid", 600]);
  assert.notEqual(a, b);
});

test("een onbekende uitkomst houdt de sleutel vast", () => {
  const g = maakSleutelGeheugen(teller());
  const a = g.voorOpdracht(["x"]);
  g.afgerond("onbekend");
  assert.equal(g.voorOpdracht(["x"]), a);
});

test("een definitieve uitkomst (succes of bekende fout) vergeet de sleutel", () => {
  const g = maakSleutelGeheugen(teller());
  const a = g.voorOpdracht(["x"]);
  g.afgerond("definitief");
  assert.notEqual(g.voorOpdracht(["x"]), a);
});

test("terug naar een eerdere opdracht na een wijziging geeft geen oude sleutel terug", () => {
  const g = maakSleutelGeheugen(teller());
  const a = g.voorOpdracht(["x"]);
  g.voorOpdracht(["y"]);
  assert.notEqual(g.voorOpdracht(["x"]), a);
});

test("de geheugens van twee hooks zijn onafhankelijk", () => {
  const g1 = maakSleutelGeheugen(teller());
  const g2 = maakSleutelGeheugen(teller());
  g1.voorOpdracht(["x"]);
  assert.equal(g2.voorOpdracht(["x"]), "sleutel-1");
});

test("nieuweSleutel geeft een uuid v4, ook zonder crypto.randomUUID", () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(nieuweSleutel(), uuid);

  const echt = crypto.randomUUID;
  // @ts-expect-error: een onveilige context heeft geen randomUUID
  crypto.randomUUID = undefined;
  try {
    const a = nieuweSleutel();
    assert.match(a, uuid);
    assert.notEqual(a, nieuweSleutel());
  } finally {
    crypto.randomUUID = echt;
  }
});
