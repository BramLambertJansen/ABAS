import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { fakeMoney, resetFakeMoney } from "./fakes/moneyHookCalls.ts";

/**
 * usePlaceOrder/useTopUp en foutlogging (docs/features/foutlogging.md →
 * beslissing 3, #94): een domeinuitkomst die de RPC bewust teruggeeft
 * (`insufficient_balance` en dergelijke) is geen fout en wordt niet gemeld;
 * alleen de onverwachte tak (`unknown`) roept reportClientError aan.
 * Onderaan dezelfde check voor de andere bar-hooks. Sinds dienst-per-sessie
 * (0028/0029) kennen alle zes de zes sessiecodes van de guards
 * (`no_bar_session`, `session_ended`, `session_inactive`, `wrong_mode`,
 * `no_bar_role`, `session_not_on_shift`) als bekende domeinuitkomst: niet
 * gemeld aan `client_errors`, maar doorgegeven aan de centrale afhandeling
 * (`notifySessionCode`).
 *
 * De hooks draaien ongewijzigd; `react`, de Supabase-client en
 * clientErrors worden via een resolve-hook vervangen door nep-modules
 * (test/fakes/money-hooks-resolve.mjs). De hook wordt als gewone functie
 * aangeroepen — hij gebruikt alleen `useState`.
 */
register("./fakes/money-hooks-resolve.mjs", import.meta.url);

const { usePlaceOrder } = await import("../src/hooks/queries/usePlaceOrder.ts");
const { useTopUp } = await import("../src/hooks/queries/useTopUp.ts");
const { useCreateMember } = await import("../src/hooks/queries/useCreateMember.ts");
const { useReverseOrderAtBar } = await import("../src/hooks/queries/useReverseOrder.ts");
const { useAddShiftMember } = await import("../src/hooks/queries/useAddShiftMember.ts");
const { useRemoveShiftMember } = await import("../src/hooks/queries/useRemoveShiftMember.ts");
const { useEndShift } = await import("../src/hooks/queries/useEndShift.ts");
const { useStartShift } = await import("../src/hooks/queries/useStartShift.ts");
const { useAdminEndShift } = await import("../src/hooks/queries/useAdminEndShift.ts");
const { useAdminTakeOverShift } = await import("../src/hooks/queries/useAdminTakeOverShift.ts");
const { useResumeOrphanShift } = await import("../src/hooks/queries/useResumeOrphanShift.ts");
const { useAdminEndBarSession } = await import("../src/hooks/queries/useAdminEndBarSession.ts");
const { useRegisterBarSession } = await import("../src/hooks/queries/useRegisterBarSession.ts");
const { useEndBarSession } = await import("../src/hooks/queries/useEndBarSession.ts");

const SHIFT = "00000000-0000-0000-0000-000000000001";
const MEMBER = "00000000-0000-0000-0000-000000000002";
const SERVER = "00000000-0000-0000-0000-000000000003";

function placeOrder() {
  return usePlaceOrder().placeOrder(SHIFT, MEMBER, [{ productId: "p", qty: 1 }], SERVER);
}

function topUp() {
  return useTopUp().topUp(SHIFT, MEMBER, 1000, SERVER);
}

function rpcError(message: string, code = "P0001") {
  fakeMoney().next = { kind: "result", data: null, error: { message, code } };
}

beforeEach(() => {
  resetFakeMoney();
});

// De zes sessiecodes van de guards (0028): elke bar-hook kent ze.
const SESSION_CODES = [
  "no_bar_session",
  "session_ended",
  "session_inactive",
  "wrong_mode",
  "no_bar_role",
  "session_not_on_shift",
] as const;

// Precies de codes die place_order (0029) bewust raiset en die de hook als
// domeinuitkomst kent.
const PLACE_ORDER_DOMAIN = [
  ...SESSION_CODES,
  "shift_not_open",
  "served_by_not_on_shift",
  "empty_order",
  "invalid_qty",
  "product_not_available",
  "member_not_found",
  "insufficient_balance",
  // 0042 (ADR 0023): dezelfde sleutel met een andere opdracht, lid of RPC.
  "request_id_conflict",
] as const;

const TOP_UP_DOMAIN = [
  ...SESSION_CODES,
  "self_top_up_forbidden",
  "shift_not_open",
  "served_by_not_on_shift",
  "invalid_amount",
  "amount_exceeds_max",
  "member_not_found",
  "request_id_conflict",
] as const;

function verwachtNotificaties(code: string): string[] {
  return (SESSION_CODES as readonly string[]).includes(code) ? [code] : [];
}

for (const code of PLACE_ORDER_DOMAIN) {
  test(`usePlaceOrder meldt domeinuitkomst ${code} niet`, async () => {
    rpcError(code);
    const result = await placeOrder();
    assert.deepEqual(result, { ok: false, code });
    assert.equal(fakeMoney().rpcCalls[0]?.fn, "place_order");
    assert.deepEqual(fakeMoney().reports, []);
    // Een sessiecode gaat naar de centrale afhandeling, een andere uitkomst niet.
    assert.deepEqual(fakeMoney().notifications, verwachtNotificaties(code));
  });
}

for (const code of TOP_UP_DOMAIN) {
  test(`useTopUp meldt domeinuitkomst ${code} niet`, async () => {
    rpcError(code);
    const result = await topUp();
    assert.deepEqual(result, { ok: false, code });
    assert.equal(fakeMoney().rpcCalls[0]?.fn, "top_up");
    assert.deepEqual(fakeMoney().reports, []);
    assert.deepEqual(fakeMoney().notifications, verwachtNotificaties(code));
  });
}

test("usePlaceOrder meldt niets bij een geslaagde bestelling", async () => {
  fakeMoney().next = { kind: "result", data: { total_cents: 250 }, error: null };
  assert.deepEqual(await placeOrder(), { ok: true, totalCents: 250 });
  assert.deepEqual(fakeMoney().reports, []);
});

test("useTopUp meldt niets bij een geslaagde opwaardering", async () => {
  fakeMoney().next = { kind: "result", data: { amount_cents: 1000 }, error: null };
  assert.deepEqual(await topUp(), { ok: true, amountCents: 1000 });
  assert.deepEqual(fakeMoney().reports, []);
});

for (const [name, run, hook] of [
  ["usePlaceOrder", placeOrder, "usePlaceOrder"],
  ["useTopUp", topUp, "useTopUp"],
] as const) {
  test(`${name} meldt een onverwachte serverfout precies één keer, met de eigen client`, async () => {
    const error = { message: 'relation "orders" does not exist', code: "42P01" };
    fakeMoney().next = { kind: "result", data: null, error };
    const result = await run();
    assert.deepEqual(result, { ok: false, code: "unknown" });
    assert.equal(fakeMoney().reports.length, 1);
    assert.equal(fakeMoney().reports[0].hook, hook);
    assert.equal(fakeMoney().reports[0].err, error);
    assert.equal(fakeMoney().reports[0].clientIsFactory, false);
  });

  test(`${name} meldt een netwerkfout (gegooid) via de client-factory`, async () => {
    const err = new TypeError("Failed to fetch");
    fakeMoney().next = { kind: "throw", error: err };
    const result = await run();
    assert.deepEqual(result, { ok: false, code: "unknown" });
    assert.equal(fakeMoney().reports.length, 1);
    assert.equal(fakeMoney().reports[0].hook, hook);
    assert.equal(fakeMoney().reports[0].err, err);
    assert.equal(fakeMoney().reports[0].clientIsFactory, true);
  });

  // Een code die op een domeinuitkomst líjkt maar het niet exact is, is
  // onverwacht: de hook vergelijkt exact, niet op prefix/hoofdletters.
  test(`${name} behandelt een bijna-domeincode als onverwacht en meldt hem`, async () => {
    rpcError("INSUFFICIENT_BALANCE");
    assert.deepEqual(await run(), { ok: false, code: "unknown" });
    assert.equal(fakeMoney().reports.length, 1);
  });
}

// De zes sessiecodes in de andere bar-hooks: bekende domeinuitkomst, geen
// melding aan client_errors maar wel aan de centrale afhandeling. Een
// onverwachte fout blijft wél gemeld — anders bewijst de eerste test niets.
for (const [name, fn, run] of [
  [
    "useReverseOrderAtBar",
    "reverse_order_at_bar",
    async () => (await useReverseOrderAtBar().reverse("o", SHIFT, "reden", SERVER)).ok,
  ],
  ["useAddShiftMember", "add_shift_member", () => useAddShiftMember().addShiftMember(SHIFT, MEMBER)],
  [
    "useRemoveShiftMember",
    "remove_shift_member",
    () => useRemoveShiftMember().removeShiftMember(SHIFT, MEMBER),
  ],
  ["useEndShift", "end_shift", () => useEndShift().endShift(SHIFT)],
] as const) {
  for (const code of SESSION_CODES) {
    test(`${name} meldt sessiecode ${code} niet als fout, maar geeft hem door`, async () => {
      rpcError(code);
      assert.equal(await run(), false);
      assert.equal(fakeMoney().rpcCalls[0]?.fn, fn);
      assert.deepEqual(fakeMoney().reports, []);
      assert.deepEqual(fakeMoney().notifications, [code]);
    });
  }

  test(`${name} meldt een onverwachte serverfout wel`, async () => {
    fakeMoney().next = { kind: "result", data: null, error: { message: "boom", code: "42P01" } };
    assert.equal(await run(), false);
    assert.equal(fakeMoney().reports.length, 1);
    assert.equal(fakeMoney().reports[0].hook, name === "useReverseOrderAtBar" ? "useReverseOrder" : name);
    assert.deepEqual(fakeMoney().notifications, []);
  });
}

// Dezelfde zes hooks, andere takken: een gegooide Error met een sessiecode
// als message gaat door de catch-tak (toErrorCode op err.message) en is daar
// óók een domeinuitkomst; een bijna-code (hoofdletters) is dat niet en wordt
// wel gemeld — de hooks vergelijken exact.
for (const [name, run] of [
  ["usePlaceOrder", async () => (await placeOrder()).ok],
  ["useTopUp", async () => (await topUp()).ok],
  [
    "useReverseOrderAtBar",
    async () => (await useReverseOrderAtBar().reverse("o", SHIFT, "reden", SERVER)).ok,
  ],
  ["useAddShiftMember", () => useAddShiftMember().addShiftMember(SHIFT, MEMBER)],
  ["useRemoveShiftMember", () => useRemoveShiftMember().removeShiftMember(SHIFT, MEMBER)],
  ["useEndShift", () => useEndShift().endShift(SHIFT)],
] as const) {
  test(`${name} meldt een gegooide sessiecode niet (catch-tak)`, async () => {
    fakeMoney().next = { kind: "throw", error: new Error("session_ended") };
    assert.equal(await run(), false);
    assert.deepEqual(fakeMoney().reports, []);
    assert.deepEqual(fakeMoney().notifications, ["session_ended"]);
  });

  test(`${name} behandelt NO_BAR_ROLE (bijna-code) als onverwacht en meldt hem`, async () => {
    rpcError("NO_BAR_ROLE");
    assert.equal(await run(), false);
    assert.equal(fakeMoney().reports.length, 1);
    assert.deepEqual(fakeMoney().notifications, []);
  });
}

// ── Dienst-per-sessie: start_shift, de beheerderingrepen en het uitloggen ──
// (docs/features/dienst-per-sessie.md → RPC's). Dezelfde regel: een
// sessiecode is een bekende uitkomst, niet gemeld en wel doorgegeven; een
// onverwachte fout blijft gemeld.

test("useStartShift stuurt alleen het activiteittype mee, geen PIN en geen lid", async () => {
  fakeMoney().next = { kind: "result", data: null, error: null };
  const result = await useStartShift().startShift("activiteit-1");
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(fakeMoney().rpcCalls, [
    { fn: "start_shift", args: { p_activity_type_id: "activiteit-1" } },
  ]);
});

for (const code of [
  ...SESSION_CODES,
  "shift_already_open",
  "session_has_shift",
  "invalid_activity_type",
  "activity_type_not_found",
  "activity_type_archived",
]) {
  test(`useStartShift meldt domeinuitkomst ${code} niet`, async () => {
    rpcError(code);
    assert.deepEqual(await useStartShift().startShift("a"), { ok: false, code });
    assert.deepEqual(fakeMoney().reports, []);
    assert.deepEqual(fakeMoney().notifications, verwachtNotificaties(code));
  });
}

// De PIN speelt bij het starten geen rol meer: deze codes bestaan niet meer
// en zijn dus onverwacht.
for (const code of ["invalid_pin", "member_not_found"]) {
  test(`useStartShift behandelt ${code} als onverwacht (start_shift raiset hem niet meer)`, async () => {
    rpcError(code);
    assert.deepEqual(await useStartShift().startShift("a"), { ok: false, code: "unknown" });
    assert.equal(fakeMoney().reports.length, 1);
  });
}

for (const [name, fn, run, domain] of [
  [
    "useAdminEndShift",
    "admin_end_shift",
    () => useAdminEndShift().adminEndShift(SHIFT),
    ["actor_not_found", "no_admin_role", "shift_not_open"],
  ],
  [
    "useAdminTakeOverShift",
    "admin_take_over_shift",
    () => useAdminTakeOverShift().takeOverShift(SHIFT),
    ["actor_not_found", "no_admin_role", "session_has_shift", "shift_not_open"],
  ],
  [
    "useResumeOrphanShift",
    "resume_orphan_shift",
    () => useResumeOrphanShift().resumeOrphanShift(SHIFT),
    ["not_in_shift_crew", "shift_not_orphan", "session_has_shift", "shift_not_open"],
  ],
  [
    "useAdminEndBarSession",
    "admin_end_bar_session",
    () => useAdminEndBarSession().endBarSession("sessie"),
    ["actor_not_found", "no_admin_role", "session_not_found", "target_session_ended"],
  ],
  [
    "useRegisterBarSession",
    "register_bar_session",
    async () => (await useRegisterBarSession().registerBarSession("bar")).ok,
    ["invalid_mode", "no_admin_role", "mode_locked"],
  ],
] as const) {
  for (const code of [...SESSION_CODES, ...domain]) {
    test(`${name} meldt ${code} niet als fout`, async () => {
      rpcError(code);
      assert.equal(await run(), false);
      assert.equal(fakeMoney().rpcCalls[0]?.fn, fn);
      assert.deepEqual(fakeMoney().reports, []);
      assert.deepEqual(fakeMoney().notifications, verwachtNotificaties(code));
    });
  }

  test(`${name} meldt een onverwachte serverfout wel`, async () => {
    fakeMoney().next = { kind: "result", data: null, error: { message: "boom", code: "42P01" } };
    assert.equal(await run(), false);
    assert.equal(fakeMoney().reports.length, 1);
    assert.equal(fakeMoney().reports[0].hook, name);
  });
}

test("target_session_ended is niet de sessiecode session_ended: geen centrale melding", async () => {
  rpcError("target_session_ended");
  assert.equal(await useAdminEndBarSession().endBarSession("sessie"), false);
  assert.deepEqual(fakeMoney().notifications, []);
});

// useEndBarSession: uitloggen sluit altijd de sessie lokaal, behalve bij een
// onverwachte fout (dan blijft de sessie staan en staat het scherm de
// gebruiker een nieuwe poging toe).
test("useEndBarSession: geslaagd → RPC met keuze en reden, daarna lokaal uitloggen", async () => {
  const result = await useEndBarSession().endBarSession(true);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(fakeMoney().rpcCalls, [
    { fn: "end_bar_session", args: { p_close_shift: true, p_reason: "uitgelogd" } },
  ]);
  assert.deepEqual(fakeMoney().signOuts, [{ scope: "local" }]);
});

test("useEndBarSession: een beheersessie die niet wordt hervat", async () => {
  await useEndBarSession().endBarSession(false, "niet_hervat");
  assert.deepEqual(fakeMoney().rpcCalls[0]?.args, { p_close_shift: false, p_reason: "niet_hervat" });
});

for (const code of SESSION_CODES) {
  test(`useEndBarSession: bij ${code} is de sessie al weg, dus alleen lokaal uitloggen`, async () => {
    rpcError(code);
    assert.deepEqual(await useEndBarSession().endBarSession(false), { ok: true });
    assert.deepEqual(fakeMoney().signOuts, [{ scope: "local" }]);
    assert.deepEqual(fakeMoney().reports, []);
  });
}

test("useEndBarSession: een onverwachte fout laat de sessie staan (niet stil uitloggen)", async () => {
  fakeMoney().next = { kind: "result", data: null, error: { message: "boom", code: "42P01" } };
  assert.deepEqual(await useEndBarSession().endBarSession(true), { ok: false, code: "unknown" });
  assert.deepEqual(fakeMoney().signOuts, []);
  assert.equal(fakeMoney().reports.length, 1);
});

test("useEndBarSession: een gegooide netwerkfout laat de sessie ook staan", async () => {
  fakeMoney().next = { kind: "throw", error: new TypeError("Failed to fetch") };
  assert.deepEqual(await useEndBarSession().endBarSession(false), { ok: false, code: "unknown" });
  assert.deepEqual(fakeMoney().signOuts, []);
});

// ── Idempotentiesleutel (0042, ADR 0023, docs/features/idempotentie-geld-rpcs.md) ──
// De hooks sturen `p_request_id` mee, één sleutel per intentie, in het
// geheugen van de hookinstantie. De client stuurt nooit een berekend bedrag.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function laatsteSleutel(): unknown {
  const calls = fakeMoney().rpcCalls;
  return (calls[calls.length - 1]?.args as Record<string, unknown>).p_request_id;
}

test("usePlaceOrder stuurt een p_request_id mee, en alleen ids en aantallen (geen totaal)", async () => {
  fakeMoney().next = { kind: "result", data: { total_cents: 250 }, error: null };
  await placeOrder();
  const args = fakeMoney().rpcCalls[0]?.args as Record<string, unknown>;
  assert.deepEqual(Object.keys(args).sort(), [
    "p_lines",
    "p_member_id",
    "p_request_id",
    "p_served_by",
    "p_shift_id",
  ]);
  assert.match(String(args.p_request_id), UUID);
  assert.deepEqual(args.p_lines, [{ product_id: "p", qty: 1 }]);
});

test("useTopUp stuurt een p_request_id mee, en alleen lid, bedrag en served_by (geen saldo)", async () => {
  fakeMoney().next = { kind: "result", data: { amount_cents: 1000 }, error: null };
  await topUp();
  const args = fakeMoney().rpcCalls[0]?.args as Record<string, unknown>;
  assert.deepEqual(Object.keys(args).sort(), [
    "p_amount_cents",
    "p_member_id",
    "p_method",
    "p_request_id",
    "p_served_by",
    "p_shift_id",
  ]);
  assert.match(String(args.p_request_id), UUID);
});

test("useCreateMember stuurt een p_request_id mee", async () => {
  fakeMoney().next = { kind: "result", data: { id: "m", name: "n", role: "lid", balance_cents: 0, archived: false, auth_user_id: null, has_pin: false, email: null, invited_at: null }, error: null };
  await useCreateMember().createMember("Nieuw", 500, null);
  const args = fakeMoney().rpcCalls[0]?.args as Record<string, unknown>;
  assert.deepEqual(Object.keys(args).sort(), [
    "p_email",
    "p_name",
    "p_request_id",
    "p_starting_balance_cents",
  ]);
  assert.match(String(args.p_request_id), UUID);
});

test("usePlaceOrder: een onbekende uitkomst houdt de sleutel vast voor dezelfde opdracht", async () => {
  const hook = usePlaceOrder();
  const lines = [{ productId: "p", qty: 1 }];
  fakeMoney().next = { kind: "throw", error: new TypeError("Failed to fetch") };
  await hook.placeOrder(SHIFT, MEMBER, lines, SERVER);
  const eerste = laatsteSleutel();
  await hook.placeOrder(SHIFT, MEMBER, [{ productId: "p", qty: 1 }], SERVER);
  assert.equal(laatsteSleutel(), eerste, "dezelfde opdracht na een onbekende uitkomst: dezelfde sleutel");
});

test("usePlaceOrder: een gewijzigde opdracht, succes of een bekende fout geeft een nieuwe sleutel", async () => {
  const hook = usePlaceOrder();
  const lines = [{ productId: "p", qty: 1 }];

  fakeMoney().next = { kind: "throw", error: new TypeError("Failed to fetch") };
  await hook.placeOrder(SHIFT, MEMBER, lines, SERVER);
  const eerste = laatsteSleutel();

  await hook.placeOrder(SHIFT, MEMBER, [{ productId: "p", qty: 2 }], SERVER);
  const gewijzigd = laatsteSleutel();
  assert.notEqual(gewijzigd, eerste, "andere aantallen: nieuwe sleutel");

  rpcError("insufficient_balance");
  await hook.placeOrder(SHIFT, MEMBER, [{ productId: "p", qty: 2 }], SERVER);
  assert.equal(laatsteSleutel(), gewijzigd, "de bekende fout zelf gebruikte nog dezelfde sleutel");
  await hook.placeOrder(SHIFT, MEMBER, [{ productId: "p", qty: 2 }], SERVER);
  assert.notEqual(laatsteSleutel(), gewijzigd, "na een bekende fout: nieuwe sleutel");

  fakeMoney().next = { kind: "result", data: { total_cents: 250 }, error: null };
  await hook.placeOrder(SHIFT, MEMBER, lines, SERVER);
  const voorSucces = laatsteSleutel();
  await hook.placeOrder(SHIFT, MEMBER, lines, SERVER);
  assert.notEqual(laatsteSleutel(), voorSucces, "na succes: nieuwe sleutel (een bewust tweede identieke bestelling)");
});

test("useTopUp: onbekende uitkomst houdt de sleutel vast; een ander bedrag is een nieuwe intentie", async () => {
  const hook = useTopUp();
  fakeMoney().next = { kind: "throw", error: new TypeError("Failed to fetch") };
  await hook.topUp(SHIFT, MEMBER, 1000, SERVER);
  const eerste = laatsteSleutel();
  await hook.topUp(SHIFT, MEMBER, 1000, SERVER);
  assert.equal(laatsteSleutel(), eerste);
  await hook.topUp(SHIFT, MEMBER, 2000, SERVER);
  assert.notEqual(laatsteSleutel(), eerste);
});

test("useCreateMember: onbekende uitkomst houdt de sleutel vast; een andere naam is een nieuwe intentie", async () => {
  const hook = useCreateMember();
  fakeMoney().next = { kind: "throw", error: new TypeError("Failed to fetch") };
  await hook.createMember("Nieuw", 500, null);
  const eerste = laatsteSleutel();
  await hook.createMember("Nieuw", 500, null);
  assert.equal(laatsteSleutel(), eerste);
  await hook.createMember("Anders", 500, null);
  assert.notEqual(laatsteSleutel(), eerste);
});

test("useCreateMember meldt request_id_conflict niet als fout", async () => {
  rpcError("request_id_conflict");
  const hook = useCreateMember();
  assert.equal(await hook.createMember("Nieuw", 500, null), null);
  assert.deepEqual(fakeMoney().reports, []);
});
