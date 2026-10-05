import { test } from "node:test";
import assert from "node:assert/strict";

import { methodLabel } from "../src/lib/betaalmethode.ts";

test("methodLabel: 'cash' wordt 'contant', een onbekende methode blijft zoals hij is, null is leeg", () => {
  assert.equal(methodLabel("cash"), "contant");
  assert.equal(methodLabel("ideal"), "ideal");
  assert.equal(methodLabel(null), "");
});
