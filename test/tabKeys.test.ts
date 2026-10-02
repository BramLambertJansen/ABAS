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

test("ongeldige huidige index blokkeert ook Home en End", () => {
  assert.equal(nextTabIndex("Home", -1, 3, "horizontal"), null);
  assert.equal(nextTabIndex("End", 3, 3, "horizontal"), null);
  assert.equal(nextTabIndex("Home", 0, 0, "vertical"), null);
  assert.equal(nextTabIndex("End", 0, -1, "vertical"), null);
});

test("sleutelnamen zijn hoofdlettergevoelig en exact", () => {
  assert.equal(nextTabIndex("arrowright", 0, 3, "horizontal"), null);
  assert.equal(nextTabIndex("home", 1, 3, "horizontal"), null);
  assert.equal(nextTabIndex("Right", 0, 3, "horizontal"), null); // oude IE-naam
  assert.equal(nextTabIndex("PageDown", 0, 3, "vertical"), null);
  assert.equal(nextTabIndex("", 0, 3, "vertical"), null);
});

test("wrap-around over de uiteinden, ook bij twee en vijf tabs, in beide richtingen", () => {
  for (const count of [2, 3, 5]) {
    // Een volledige ronde brengt je terug waar je begon.
    let i = 0;
    for (let n = 0; n < count; n++) i = nextTabIndex("ArrowRight", i, count, "horizontal")!;
    assert.equal(i, 0);
    for (let n = 0; n < count; n++) i = nextTabIndex("ArrowUp", i, count, "vertical")!;
    assert.equal(i, 0);
    assert.equal(nextTabIndex("ArrowRight", count - 1, count, "horizontal"), 0);
    assert.equal(nextTabIndex("ArrowLeft", 0, count, "horizontal"), count - 1);
    assert.equal(nextTabIndex("ArrowDown", count - 1, count, "vertical"), 0);
    assert.equal(nextTabIndex("ArrowUp", 0, count, "vertical"), count - 1);
  }
});

test("één tab: elke navigatietoets blijft op die tab, de andere as nog steeds niets", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.equal(nextTabIndex(key, 0, 1, "horizontal"), 0);
  }
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    assert.equal(nextTabIndex(key, 0, 1, "vertical"), 0);
  }
  assert.equal(nextTabIndex("ArrowDown", 0, 1, "horizontal"), null);
  assert.equal(nextTabIndex("ArrowRight", 0, 1, "vertical"), null);
});

test("Home en End negeren de oriëntatie en de huidige positie", () => {
  for (const orientation of ["horizontal", "vertical"] as const) {
    for (let current = 0; current < 4; current++) {
      assert.equal(nextTabIndex("Home", current, 4, orientation), 0);
      assert.equal(nextTabIndex("End", current, 4, orientation), 3);
    }
  }
});
