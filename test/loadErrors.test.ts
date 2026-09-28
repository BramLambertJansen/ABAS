import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyLoadError, loadErrorMessage } from "../src/lib/loadErrors.ts";

const WHAT = "Kan de ledenlijst niet laden.";

test("PostgREST-schemafout (#67) is een serverfout met code, geen verbindingsfout", () => {
  const err = { code: "PGRST200", message: "Could not find a relationship", details: "…", hint: null };
  assert.deepEqual(classifyLoadError(err), { kind: "server", code: "PGRST200" });
  assert.equal(
    loadErrorMessage(WHAT, err),
    "Kan de ledenlijst niet laden. Er ging iets mis aan de serverkant — meld dit bij de beheerder (code PGRST200).",
  );
});

test("Postgres SQLSTATE's (ontbrekende tabel, RLS) tonen hun code", () => {
  assert.deepEqual(classifyLoadError({ code: "42P01", message: "x" }), { kind: "server", code: "42P01" });
  assert.deepEqual(classifyLoadError({ code: "42501", message: "x" }), { kind: "server", code: "42501" });
});

test("een code die geen SQLSTATE/PostgREST-code is komt niet op het scherm", () => {
  const err = { code: "https://example.supabase.co/secret", message: "x" };
  assert.deepEqual(classifyLoadError(err), { kind: "server", code: null });
  assert.equal(
    loadErrorMessage(WHAT, err),
    "Kan de ledenlijst niet laden. Er ging iets mis aan de serverkant — meld dit bij de beheerder.",
  );
});

test("mislukte fetch (per browser) is een netwerkfout", () => {
  for (const message of [
    "TypeError: Failed to fetch",
    "TypeError: NetworkError when attempting to fetch resource.",
    "TypeError: Load failed",
  ]) {
    // postgrest-js-vorm: lege code.
    assert.equal(classifyLoadError({ code: "", message }).kind, "network", message);
  }
  assert.equal(classifyLoadError(new TypeError("Failed to fetch")).kind, "network");
  assert.equal(
    loadErrorMessage(WHAT, new TypeError("Failed to fetch")),
    "Kan de ledenlijst niet laden. Controleer de verbinding.",
  );
});

test("abort/timeout is een netwerkfout", () => {
  assert.equal(classifyLoadError({ name: "AbortError", message: "aborted" }).kind, "network");
  assert.equal(classifyLoadError({ name: "TimeoutError", message: "x" }).kind, "network");
});

test("onbekende fout (bv. bug in de mapping) geeft niet de verbinding de schuld", () => {
  assert.deepEqual(classifyLoadError(new TypeError("Cannot read properties of undefined")), {
    kind: "server",
    code: null,
  });
  assert.deepEqual(classifyLoadError("string"), { kind: "server", code: null });
  assert.deepEqual(classifyLoadError(null), { kind: "server", code: null });
});
