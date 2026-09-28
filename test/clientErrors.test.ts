import { test, mock } from "node:test";
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
  sanitizeBuild,
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

// ── Aanvullend (Tester, #94) ──────────────────────────────────────────────

test("dedupe: network en server zonder code in dezelfde hook zijn aparte sleutels", () => {
  const network = buildClientErrorPayload("useMembers", new TypeError("Failed to fetch"), "/", null)!;
  const serverNoCode = buildClientErrorPayload("useMembers", { message: "boom" }, "/", null)!;
  assert.equal(network.p_kind, "network");
  assert.equal(network.p_code, null);
  assert.equal(serverNoCode.p_kind, "server");
  assert.equal(serverNoCode.p_code, null);
  assert.notEqual(dedupeKey(network), dedupeKey(serverNoCode));
});

test("reportClientError: network en server zonder code in dezelfde hook worden allebei gemeld", () => {
  const calls: ClientErrorPayload[] = [];
  const client = {
    rpc(_fn: "log_client_error", args: ClientErrorPayload) {
      calls.push(args);
      return Promise.resolve({ error: null });
    },
  };
  silenceConsole(() => {
    reportClientError(client, "useTestKindSplit", new TypeError("Failed to fetch"));
    reportClientError(client, "useTestKindSplit", { message: "boom" });
    // Herhaling van elk: binnen het venster, dus niet opnieuw.
    reportClientError(client, "useTestKindSplit", new TypeError("Failed to fetch"));
    reportClientError(client, "useTestKindSplit", { message: "boom" });
  });
  assert.deepEqual(
    calls.map((c) => [c.p_kind, c.p_code]),
    [
      ["network", null],
      ["server", null],
    ],
  );
});

test("venstergrens: net onder 5 minuten telt op, op en net over 5 minuten meldt", () => {
  const justUnder = createDedupeState();
  assert.equal(registerOccurrence(justUnder, KEY, 1_000), 1);
  assert.equal(registerOccurrence(justUnder, KEY, 1_000 + DEDUPE_WINDOW_MS - 1), null);

  const exactly = createDedupeState();
  assert.equal(registerOccurrence(exactly, KEY, 1_000), 1);
  assert.equal(registerOccurrence(exactly, KEY, 1_000 + DEDUPE_WINDOW_MS), 1);

  const justOver = createDedupeState();
  assert.equal(registerOccurrence(justOver, KEY, 1_000), 1);
  assert.equal(registerOccurrence(justOver, KEY, 1_000 + DEDUPE_WINDOW_MS + 1), 1);
});

test("een nieuw venster begint bij de melding ná het venster, niet bij het oude begin", () => {
  const state = createDedupeState();
  assert.equal(registerOccurrence(state, KEY, 0), 1);
  // Melding op 7 min start het nieuwe venster; 11 min valt daar nog binnen.
  assert.equal(registerOccurrence(state, KEY, 7 * 60_000), 1);
  assert.equal(registerOccurrence(state, KEY, 11 * 60_000), null);
  assert.equal(registerOccurrence(state, KEY, 12 * 60_000), 2);
});

test("restoreOccurrences zonder bestaande sleutel doet niets en wordt afgekapt op 10000", () => {
  const state = createDedupeState();
  restoreOccurrences(state, KEY, 5);
  assert.equal(state.size, 0);
  registerOccurrence(state, KEY, 0);
  restoreOccurrences(state, KEY, MAX_OCCURRENCES * 2);
  assert.equal(registerOccurrence(state, KEY, DEDUPE_WINDOW_MS), MAX_OCCURRENCES);
});

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

for (const [label, outcome] of [
  ["de RPC een error teruggeeft", () => Promise.resolve({ error: { code: "PGRST202" } })],
  ["de RPC-promise afwijst", () => Promise.reject(new TypeError("Failed to fetch"))],
] as const) {
  test(`reportClientError: als ${label}, loopt de telling door naar de volgende melding`, async () => {
    const hook = label.includes("afwijst") ? "useTestCarryReject" : "useTestCarryError";
    mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    try {
      const calls: ClientErrorPayload[] = [];
      let fail = true;
      const client = {
        rpc(_fn: "log_client_error", args: ClientErrorPayload) {
          calls.push({ ...args });
          return fail ? outcome() : Promise.resolve({ error: null });
        },
      };
      silenceConsole(() => reportClientError(client, hook, { code: "42P01" }));
      await flush();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].p_occurrences, 1);

      fail = false;
      mock.timers.tick(1_000);
      silenceConsole(() => reportClientError(client, hook, { code: "42P01" }));
      await flush();
      assert.equal(calls.length, 1, "binnen het venster geen tweede aanroep (geen herhaalpoging)");

      mock.timers.tick(DEDUPE_WINDOW_MS);
      silenceConsole(() => reportClientError(client, hook, { code: "42P01" }));
      await flush();
      assert.equal(calls.length, 2);
      // 1 mislukt + 1 opgeteld + deze.
      assert.equal(calls[1].p_occurrences, 3);
    } finally {
      mock.timers.reset();
    }
  });
}

test("reportClientError: een mislukte melding wordt niet zelf opnieuw gemeld (geen lus)", async () => {
  const calls: ClientErrorPayload[] = [];
  const client = {
    rpc(_fn: "log_client_error", args: ClientErrorPayload) {
      calls.push(args);
      return Promise.resolve({ error: { code: "42501", message: "permission denied" } });
    },
  };
  silenceConsole(() => reportClientError(client, "useTestNoLoop", { code: "42P01" }));
  await flush();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_hook, "useTestNoLoop");
});

test("reportClientError: een hook zonder use-prefix roept de RPC niet aan, maar logt wel lokaal", () => {
  const calls: unknown[] = [];
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    reportClientError(
      {
        rpc(_fn, args) {
          calls.push(args);
          return Promise.resolve({ error: null });
        },
      },
      "fetchMembers",
      { code: "42P01" },
    );
  } finally {
    console.error = original;
  }
  assert.equal(calls.length, 0);
  assert.equal(logged.length, 1);
});

test("reportClientError gooit niet als err zelf een getter heeft die gooit", () => {
  const hostile = {
    get code(): string {
      throw new Error("getter");
    },
    get message(): string {
      throw new Error("getter");
    },
  };
  silenceConsole(() => {
    assert.doesNotThrow(() =>
      reportClientError({ rpc: () => Promise.resolve({ error: null }) }, "useTestHostileErr", hostile),
    );
  });
});

test("reportClientError stuurt het gesaneerde pad uit window.location mee", async () => {
  const g = globalThis as unknown as { window?: unknown };
  const had = "window" in g;
  const previous = g.window;
  g.window = { location: { pathname: "/Beheer/leden/42" } };
  try {
    const calls: ClientErrorPayload[] = [];
    silenceConsole(() =>
      reportClientError(
        {
          rpc(_fn, args) {
            calls.push(args);
            return Promise.resolve({ error: null });
          },
        },
        "useTestWindowPath",
        { code: "42P01" },
      ),
    );
    assert.equal(calls[0]?.p_path, "/beheer/leden/");
  } finally {
    if (had) g.window = previous;
    else delete g.window;
  }
});

test("sanitizePath: elke uitkomst voldoet aan het RPC-formaat, ook bij vijandige invoer", () => {
  const inputs = [
    "",
    "?",
    "#",
    "?email=jan@example.com",
    "portal",
    "/Portal",
    "/jan%40example.com",
    "/beheer/leden/00000000-0000-0000-0000-000000000001",
    "/ruimte met spaties",
    "/ü/é/ß",
    "//dubbel//",
    "/a_b.c",
    "/" + "x".repeat(500),
    "x".repeat(500),
    "/€12,50",
  ];
  for (const input of inputs) {
    const out = sanitizePath(input);
    assert.match(out, /^\/[a-z/-]{0,100}$/, `sanitizePath(${JSON.stringify(input)}) = ${out}`);
    assert.ok(!/[0-9@.?#%]/.test(out), `${out} bevat een verboden teken`);
  }
  assert.equal(sanitizePath("/Portal"), "/portal");
  assert.equal(sanitizePath("/jan%40example.com"), "/janexamplecom");
  assert.equal(sanitizePath("portal"), "/portal");
});

test("sanitizeBuild accepteert alleen 7–40 kleine hex-tekens", () => {
  assert.equal(sanitizeBuild("abcdef1"), "abcdef1");
  assert.equal(sanitizeBuild("abcdef"), null);
  assert.equal(sanitizeBuild("a".repeat(40)), "a".repeat(40));
  assert.equal(sanitizeBuild("a".repeat(41)), null);
  assert.equal(sanitizeBuild("ABCDEF1"), null);
  assert.equal(sanitizeBuild(" abcdef1"), null);
  assert.equal(sanitizeBuild(null), null);
});

test("occurrences: NaN, Infinity en breuken worden een geldig geheel getal", () => {
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", null, Number.NaN)?.p_occurrences, 1);
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", null, Infinity)?.p_occurrences, 1);
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", null, 2.7)?.p_occurrences, 2);
  assert.equal(buildClientErrorPayload("useMembers", {}, "/", null, MAX_OCCURRENCES)?.p_occurrences, MAX_OCCURRENCES);
});

for (const [label, hook, failing] of [
  [
    "de client-factory synchroon gooit",
    "useTestCarryFactoryThrows",
    (() => {
      throw new Error("geen Supabase-config");
    }) as () => { rpc(fn: "log_client_error", args: ClientErrorPayload): PromiseLike<{ error: unknown }> },
  ],
  [
    "rpc() synchroon gooit",
    "useTestCarryRpcThrows",
    {
      rpc(): PromiseLike<{ error: unknown }> {
        throw new Error("sync");
      },
    },
  ],
] as const) {
  test(`reportClientError: als ${label}, gooit hij niet en loopt de telling door na het venster`, async () => {
    mock.timers.enable({ apis: ["Date"], now: 5_000_000 });
    try {
      silenceConsole(() => {
        assert.doesNotThrow(() => reportClientError(failing, hook, { code: "42P01" }));
      });

      const calls: ClientErrorPayload[] = [];
      const working = {
        rpc(_fn: "log_client_error", args: ClientErrorPayload) {
          calls.push({ ...args });
          return Promise.resolve({ error: null });
        },
      };

      // Binnen het venster: telt op, geen aanroep.
      mock.timers.tick(1_000);
      silenceConsole(() => reportClientError(working, hook, { code: "42P01" }));
      assert.equal(calls.length, 0);

      // Na het venster: 1 teruggegeven + 1 opgeteld + deze.
      mock.timers.tick(DEDUPE_WINDOW_MS);
      silenceConsole(() => reportClientError(working, hook, { code: "42P01" }));
      await flush();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].p_hook, hook);
      assert.equal(calls[0].p_occurrences, 3);
    } finally {
      mock.timers.reset();
    }
  });
}
