import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEDUPE_WINDOW_MS,
  MAX_OCCURRENCES,
  buildClientErrorPayload,
  createDedupeState,
  dedupeKey,
  registerOccurrence,
  reportClientError,
  restoreOccurrences,
  sanitizePath,
  type ClientErrorPayload,
} from "../src/lib/clientErrors.ts";

/**
 * Unit tests voor src/lib/clientErrors.ts (docs/features/foutlogging.md →
 * Tests en gates): de payload bevat alleen de allowlist, en de dedupe per
 * (hook, kind, code) telt herhalingen binnen 5 minuten op.
 */

const SHA = "0123456789abcdef0123456789abcdef01234567";

// ── Payload-allowlist ─────────────────────────────────────────────────────

test("payload bevat precies de RPC-argumenten, geen message/details/hint/stack", () => {
  const err = {
    code: "42P01",
    message: "relation \"activity_types\" does not exist — jan@example.com, saldo €12,50",
    details: "geheim",
    hint: "geheim",
    stack: "Error: at x",
  };
  const payload = buildClientErrorPayload("useActiviteitTypes", err, "/", SHA);
  assert.deepEqual(payload, {
    p_hook: "useActiviteitTypes",
    p_kind: "server",
    p_code: "42P01",
    p_path: "/",
    p_occurrences: 1,
    p_build: SHA,
  });
  assert.deepEqual(Object.keys(payload!).sort(), [
    "p_build",
    "p_code",
    "p_hook",
    "p_kind",
    "p_occurrences",
    "p_path",
  ]);
  const serialized = JSON.stringify(payload);
  for (const leaked of ["jan@example.com", "geheim", "stack", "12,50", "does not exist"]) {
    assert.ok(!serialized.includes(leaked), `payload lekt ${leaked}`);
  }
});

test("kind en code komen uit classifyLoadError", () => {
  assert.equal(buildClientErrorPayload("useMembers", new TypeError("Failed to fetch"), "/", null)?.p_kind, "network");
  assert.equal(buildClientErrorPayload("useMembers", new TypeError("Failed to fetch"), "/", null)?.p_code, null);
  // Een code die geen SQLSTATE/PostgREST-code is gaat niet mee.
  assert.equal(
    buildClientErrorPayload("useMembers", { code: "https://example.supabase.co/x" }, "/", null)?.p_code,
    null,
  );
});

test("path gaat zonder query-string, fragment en cijfers", () => {
  assert.equal(sanitizePath("/portal?email=jan@example.com"), "/portal");
  assert.equal(sanitizePath("/beheer#leden"), "/beheer");
  assert.equal(sanitizePath("/beheer/leden/123"), "/beheer/leden/");
  assert.equal(sanitizePath("/jan.example@x"), "/janexamplex");
  assert.equal(sanitizePath(""), "/");
  assert.equal(sanitizePath("/" + "a".repeat(200)).length, 101);
  const payload = buildClientErrorPayload("useMembers", {}, "/beheer/leden/42?x=1", null);
  assert.equal(payload?.p_path, "/beheer/leden/");
  assert.match(payload!.p_path, /^\/[a-z/-]{0,100}$/);
});

test("build is null zonder env of bij iets dat geen SHA is", () => {
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", undefined)?.p_build, null);
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", "")?.p_build, null);
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", "not-a-sha")?.p_build, null);
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", "abc1234")?.p_build, "abc1234");
});

test("een hooknaam buiten het formaat levert geen payload op", () => {
  assert.equal(buildClientErrorPayload("fetchMembers", {}, "/", null), null);
  assert.equal(buildClientErrorPayload("useBeheerSession (role lookup)", {}, "/", null), null);
});

test("occurrences blijft binnen 1–10000", () => {
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", null, 0)?.p_occurrences, 1);
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", null, 50000)?.p_occurrences, MAX_OCCURRENCES);
});

// ── Dedupe ────────────────────────────────────────────────────────────────

const KEY = dedupeKey({ p_hook: "useMembers", p_kind: "server", p_code: "42P01" });

test("eerste melding gaat direct, herhalingen binnen 5 minuten tellen op", () => {
  const state = createDedupeState();
  assert.equal(registerOccurrence(state, KEY, 0), 1);
  assert.equal(registerOccurrence(state, KEY, 1_000), null);
  assert.equal(registerOccurrence(state, KEY, DEDUPE_WINDOW_MS - 1), null);
  // Eerste melding ná het venster neemt de twee opgetelde mee, plus zichzelf.
  assert.equal(registerOccurrence(state, KEY, DEDUPE_WINDOW_MS), 3);
  // En start een nieuw venster.
  assert.equal(registerOccurrence(state, KEY, DEDUPE_WINDOW_MS + 1), null);
  assert.equal(registerOccurrence(state, KEY, 2 * DEDUPE_WINDOW_MS), 2);
});

test("dedupe is per (hook, kind, code)", () => {
  const state = createDedupeState();
  const other = [
    dedupeKey({ p_hook: "useProducts", p_kind: "server", p_code: "42P01" }),
    dedupeKey({ p_hook: "useMembers", p_kind: "network", p_code: null }),
    dedupeKey({ p_hook: "useMembers", p_kind: "server", p_code: null }),
    dedupeKey({ p_hook: "useMembers", p_kind: "server", p_code: "PGRST200" }),
  ];
  assert.equal(registerOccurrence(state, KEY, 0), 1);
  for (const key of other) assert.equal(registerOccurrence(state, key, 1), 1, key);
  assert.equal(new Set([KEY, ...other]).size, 5);
});

test("een mislukte melding: de telling loopt door naar de volgende", () => {
  const state = createDedupeState();
  assert.equal(registerOccurrence(state, KEY, 0), 1);
  restoreOccurrences(state, KEY, 1);
  assert.equal(registerOccurrence(state, KEY, 10), null);
  assert.equal(registerOccurrence(state, KEY, DEDUPE_WINDOW_MS), 3);
});

test("de telling wordt afgekapt op 10000", () => {
  const state = createDedupeState();
  registerOccurrence(state, KEY, 0);
  for (let i = 0; i < MAX_OCCURRENCES + 50; i++) registerOccurrence(state, KEY, 1);
  assert.equal(registerOccurrence(state, KEY, DEDUPE_WINDOW_MS), MAX_OCCURRENCES);
});

// ── reportClientError ─────────────────────────────────────────────────────

function silenceConsole<T>(fn: () => T): T {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
}

test("reportClientError roept log_client_error aan met de payload, en dedupliceert", () => {
  const calls: { fn: string; args: ClientErrorPayload }[] = [];
  const client = {
    rpc(fn: "log_client_error", args: ClientErrorPayload) {
      calls.push({ fn, args });
      return Promise.resolve({ error: null });
    },
  };
  silenceConsole(() => {
    reportClientError(client, "useTestReportOnce", { code: "42P01", message: "geheim" });
    reportClientError(client, "useTestReportOnce", { code: "42P01", message: "geheim" });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "log_client_error");
  assert.equal(calls[0].args.p_hook, "useTestReportOnce");
  assert.equal(calls[0].args.p_code, "42P01");
  assert.equal(calls[0].args.p_occurrences, 1);
  assert.ok(!JSON.stringify(calls[0].args).includes("geheim"));
});

test("reportClientError gooit nooit: niet bij een falende client-factory, rpc of afgewezen promise", async () => {
  silenceConsole(() => {
    assert.doesNotThrow(() =>
      reportClientError(() => {
        throw new Error("geen Supabase-config");
      }, "useTestFactoryThrows", {}),
    );
    assert.doesNotThrow(() =>
      reportClientError(
        {
          rpc() {
            throw new Error("sync");
          },
        },
        "useTestRpcThrows",
        {},
      ),
    );
    assert.doesNotThrow(() =>
      reportClientError(
        { rpc: () => Promise.reject(new TypeError("Failed to fetch")) },
        "useTestRpcRejects",
        {},
      ),
    );
  });
  // Laat de afgewezen promise afhandelen; een unhandled rejection zou de
  // testrunner laten falen.
  await new Promise((resolve) => setImmediate(resolve));
});

test("reportClientError logt ook naar de console, voor lokaal debuggen", () => {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    reportClientError({ rpc: () => Promise.resolve({ error: null }) }, "useTestConsole", "boom");
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, [["useTestConsole:", "boom"]]);
});
