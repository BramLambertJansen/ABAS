import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyDelta,
  removeLine,
  type CartLine,
} from "../src/features/verkoop/cart.ts";

/**
 * Unit tests voor src/features/verkoop/cart.ts — de mandjelogica achter de
 * +/−-steppers en het tikken op een product. Toegevoegd bij de app-review
 * van 2026-09-21; zie test/money.test.ts voor waarom deze suite op Node's
 * ingebouwde runner draait en wat dat voor de importvorm betekent.
 *
 * Het mandje bevat bewust alleen product-id en aantal, nooit een prijs of
 * totaal (CLAUDE.md → Architectuurbeslissingen) — deze functies raken dus
 * geen geld, maar bepalen wel exact wat er als `p_lines` naar `place_order`
 * gaat. Een stil verdwenen of verdubbelde regel is daarmee een
 * afrekenfout, ook al komt het bedrag zelf van de server.
 */

test("applyDelta voegt een nieuwe regel toe bij een positieve delta", () => {
  assert.deepEqual(applyDelta([], "p1", 1), [{ productId: "p1", qty: 1 }]);
});

test("applyDelta negeert een niet-positieve delta op een onbekende regel", () => {
  // Anders zou een regel met qty 0 of negatief in het mandje kunnen
  // ontstaan, die place_order met `invalid_qty` zou weigeren.
  assert.deepEqual(applyDelta([], "p1", -1), []);
  assert.deepEqual(applyDelta([], "p1", 0), []);
});

test("applyDelta hoogt een bestaande regel op zonder de volgorde te wijzigen", () => {
  const lines: CartLine[] = [
    { productId: "p1", qty: 1 },
    { productId: "p2", qty: 3 },
  ];
  assert.deepEqual(applyDelta(lines, "p1", 1), [
    { productId: "p1", qty: 2 },
    { productId: "p2", qty: 3 },
  ]);
});

test("applyDelta verwijdert een regel die op nul uitkomt", () => {
  // Zelfde eindresultaat als de losse verwijderknop, alleen bereikt via de
  // −-stepper — zie de docstring in cart.ts.
  const lines: CartLine[] = [
    { productId: "p1", qty: 1 },
    { productId: "p2", qty: 2 },
  ];
  assert.deepEqual(applyDelta(lines, "p1", -1), [{ productId: "p2", qty: 2 }]);
});

test("applyDelta verwijdert een regel die onder nul zou komen", () => {
  const lines: CartLine[] = [{ productId: "p1", qty: 1 }];
  assert.deepEqual(applyDelta(lines, "p1", -5), []);
});

test("applyDelta laat het oorspronkelijke mandje ongemoeid", () => {
  // De aanroeper is een React-setState met een lijst uit state; muteren
  // zou een re-render kunnen overslaan en het mandje op het scherm uit de
  // pas laten lopen met wat er straks verstuurd wordt.
  const lines: CartLine[] = [{ productId: "p1", qty: 1 }];
  const next = applyDelta(lines, "p1", 1);

  assert.deepEqual(lines, [{ productId: "p1", qty: 1 }]);
  assert.notEqual(next, lines);
});

test("applyDelta houdt regels van verschillende producten uit elkaar", () => {
  const lines: CartLine[] = [{ productId: "p1", qty: 1 }];
  assert.deepEqual(applyDelta(lines, "p2", 1), [
    { productId: "p1", qty: 1 },
    { productId: "p2", qty: 1 },
  ]);
});

test("applyDelta voegt een tweede tik op hetzelfde product samen", () => {
  // Nooit twee losse regels voor één product: place_order zou die als twee
  // order_lines wegschrijven, en het mandje-paneel zou hetzelfde product
  // dubbel tonen.
  const twice = applyDelta(applyDelta([], "p1", 1), "p1", 1);
  assert.deepEqual(twice, [{ productId: "p1", qty: 2 }]);
});

test("removeLine verwijdert alleen het opgegeven product", () => {
  const lines: CartLine[] = [
    { productId: "p1", qty: 1 },
    { productId: "p2", qty: 2 },
  ];
  assert.deepEqual(removeLine(lines, "p1"), [{ productId: "p2", qty: 2 }]);
});

test("removeLine is een no-op voor een product dat niet in het mandje zit", () => {
  const lines: CartLine[] = [{ productId: "p1", qty: 1 }];
  assert.deepEqual(removeLine(lines, "p9"), [{ productId: "p1", qty: 1 }]);
});

test("removeLine laat het oorspronkelijke mandje ongemoeid", () => {
  const lines: CartLine[] = [{ productId: "p1", qty: 1 }];
  const next = removeLine(lines, "p1");

  assert.deepEqual(lines, [{ productId: "p1", qty: 1 }]);
  assert.notEqual(next, lines);
});
