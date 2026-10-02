import test from "node:test";
import assert from "node:assert/strict";
import { nextTabIndex } from "../src/lib/tabKeys.ts";

test("horizontaal: Rechts/Links lopen en wrappen", () => {
  assert.equal(nextTabIndex("ArrowRight", 0, 3, "horizontal"), 1);
  assert.equal(nextTabIndex("ArrowRight", 2, 3, "horizontal"), 0);
  assert.equal(nextTabIndex("ArrowLeft", 1, 3, "horizontal"), 0);
  assert.equal(nextTabIndex("ArrowLeft", 0, 3, "horizontal"), 2);
});

test("verticaal: Omlaag/Omhoog lopen en wrappen", () => {
  assert.equal(nextTabIndex("ArrowDown", 0, 2, "vertical"), 1);
  assert.equal(nextTabIndex("ArrowDown", 1, 2, "vertical"), 0);
  assert.equal(nextTabIndex("ArrowUp", 0, 2, "vertical"), 1);
});

test("de andere as doet niets", () => {
  assert.equal(nextTabIndex("ArrowDown", 0, 3, "horizontal"), null);
  assert.equal(nextTabIndex("ArrowUp", 0, 3, "horizontal"), null);
  assert.equal(nextTabIndex("ArrowRight", 0, 2, "vertical"), null);
  assert.equal(nextTabIndex("ArrowLeft", 0, 2, "vertical"), null);
});

test("Home en End, op beide assen", () => {
  assert.equal(nextTabIndex("Home", 2, 5, "horizontal"), 0);
  assert.equal(nextTabIndex("End", 1, 5, "horizontal"), 4);
  assert.equal(nextTabIndex("Home", 1, 2, "vertical"), 0);
  assert.equal(nextTabIndex("End", 0, 2, "vertical"), 1);
});

test("overige toetsen worden niet afgehandeld", () => {
  assert.equal(nextTabIndex("Enter", 0, 3, "horizontal"), null);
  assert.equal(nextTabIndex(" ", 0, 3, "horizontal"), null);
  assert.equal(nextTabIndex("Tab", 0, 3, "horizontal"), null);
});

test("leeg en één item", () => {
  assert.equal(nextTabIndex("ArrowRight", 0, 0, "horizontal"), null);
  assert.equal(nextTabIndex("ArrowRight", 0, 1, "horizontal"), 0);
  assert.equal(nextTabIndex("ArrowLeft", 0, 1, "horizontal"), 0);
  assert.equal(nextTabIndex("End", 0, 1, "horizontal"), 0);
});

test("ongeldige huidige index", () => {
  assert.equal(nextTabIndex("ArrowRight", -1, 3, "horizontal"), null);
  assert.equal(nextTabIndex("ArrowRight", 3, 3, "horizontal"), null);
});
