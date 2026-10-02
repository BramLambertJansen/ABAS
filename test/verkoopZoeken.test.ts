import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { filterProducten } from "../src/features/verkoop/productFilter.ts";
import { lidwisselWistMandje } from "../src/features/verkoop/cart.ts";

register("./fakes/src-alias-resolve.mjs", import.meta.url);
const { zoekResultaatTekst, lidwisselAankondiging, lidwisselBevestigVraag } = await import(
  "../src/features/verkoop/messages.ts"
);

/** Zoek-/categoriecontract (D3) en de lidwisselregel van T07
 *  (docs/features/invoerfeedback-zoeken-filters.md). */

const PRODUCTEN = [
  { id: "1", name: "Pils", category: "Bier" },
  { id: "2", name: "Pilsner Speciaal", category: "Bier" },
  { id: "3", name: "Spa rood", category: "Fris" },
  { id: "4", name: "Pils-vrij", category: "Fris" },
  { id: "5", name: "Rode wijn", category: "Wijn" },
];
const ids = (lijst: { id: string }[]) => lijst.map((p) => p.id);

test("filterProducten: zonder zoekterm geldt de categorie, null is Alle", () => {
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "", null)), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "", "Fris")), ["3", "4"]);
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "", "Bestaat niet")), []);
});

test("filterProducten: een zoekterm zoekt over alle categorieën en wint van de categorie", () => {
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "pils", null)), ["1", "2", "4"]);
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "pils", "Wijn")), ["1", "2", "4"]);
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "RODE", null)), ["5"]);
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "  spa ", "Bier")), ["3"]);
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "xyz", null)), []);
});

test("filterProducten: een zoekterm met alleen spaties telt als leeg", () => {
  assert.deepEqual(ids(filterProducten(PRODUCTEN, "   ", "Fris")), ["3", "4"]);
  assert.deepEqual(ids(filterProducten(PRODUCTEN, " ", null)), ["1", "2", "3", "4", "5"]);
});

test("lidwisselWistMandje: alleen een ander lid én een gevuld mandje", () => {
  assert.equal(lidwisselWistMandje(null, "a", 3), false, "geen eerder lid");
  assert.equal(lidwisselWistMandje("a", "a", 3), false, "hetzelfde lid");
  assert.equal(lidwisselWistMandje("a", "b", 0), false, "leeg mandje");
  assert.equal(lidwisselWistMandje("a", "b", 1), true);
  assert.equal(lidwisselWistMandje(null, "b", 0), false);
});

test("teksten: zoekresultaat, aankondiging en bevestiging", () => {
  assert.equal(zoekResultaatTekst(3, "pils"), '3 producten voor "pils" in alle categorieën');
  assert.equal(zoekResultaatTekst(1, "pils"), '1 product voor "pils" in alle categorieën');
  assert.equal(zoekResultaatTekst(0, "xyz"), 'Geen producten voor "xyz"');
  assert.equal(
    lidwisselAankondiging(4),
    "De bestelling (4 stuks) staat nog klaar. Kies je een ander lid, dan wordt de bestelling geleegd."
  );
  assert.equal(lidwisselBevestigVraag("Anna de Vries"), "Bestelling wissen en verder met Anna de Vries?");
});
