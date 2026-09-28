import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { fakeMoney, resetFakeMoney } from "./fakes/moneyHookCalls.ts";

/**
 * usePlaceOrder/useTopUp en foutlogging (docs/features/foutlogging.md →
 * beslissing 3, #94): een domeinuitkomst die de RPC bewust teruggeeft
 * (`insufficient_balance` en dergelijke) is geen fout en wordt niet gemeld;
 * alleen de onverwachte tak (`unknown`) roept reportClientError aan.
 * Onderaan dezelfde check voor `no_bar_role` in de vier andere bar-hooks
 * (0023_bar_rpcs_weigeren_lid.sql, #100).
 *
 * De hooks draaien ongewijzigd; `react`, de Supabase-client en
 * clientErrors worden via een resolve-hook vervangen door nep-modules
 * (test/fakes/money-hooks-resolve.mjs). De hook wordt als gewone functie
 * aangeroepen — hij gebruikt alleen `useState`.
 */
register("./fakes/money-hooks-resolve.mjs", import.meta.url);

const { usePlaceOrder } = await import("../src/hooks/queries/usePlaceOrder.ts");
const { useTopUp } = await import("../src/hooks/queries/useTopUp.ts");
const { useReverseOrderAtBar } = await import("../src/hooks/queries/useReverseOrder.ts");
const { useAddShiftMember } = await import("../src/hooks/queries/useAddShiftMember.ts");
const { useRemoveShiftMember } = await import("../src/hooks/queries/useRemoveShiftMember.ts");
const { useEndShift } = await import("../src/hooks/queries/useEndShift.ts");

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

// Precies de codes die place_order (0023) bewust raiset en die de hook als
// domeinuitkomst kent.
const PLACE_ORDER_DOMAIN = [
  "no_bar_role",
  "shift_not_open",
  "served_by_not_on_shift",
  "empty_order",
  "invalid_qty",
  "product_not_available",
  "member_not_found",
  "insufficient_balance",
] as const;

const TOP_UP_DOMAIN = [
  "no_bar_role",
  "shift_not_open",
  "served_by_not_on_shift",
  "invalid_amount",
  "amount_exceeds_max",
  "member_not_found",
] as const;

for (const code of PLACE_ORDER_DOMAIN) {
  test(`usePlaceOrder meldt domeinuitkomst ${code} niet`, async () => {
    rpcError(code);
    const result = await placeOrder();
    assert.deepEqual(result, { ok: false, code });
    assert.equal(fakeMoney().rpcCalls[0]?.fn, "place_order");
    assert.deepEqual(fakeMoney().reports, []);
  });
}

for (const code of TOP_UP_DOMAIN) {
  test(`useTopUp meldt domeinuitkomst ${code} niet`, async () => {
    rpcError(code);
    const result = await topUp();
    assert.deepEqual(result, { ok: false, code });
    assert.equal(fakeMoney().rpcCalls[0]?.fn, "top_up");
    assert.deepEqual(fakeMoney().reports, []);
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

// no_bar_role (0023) in de andere bar-hooks: bekende domeinuitkomst, geen
// melding. Een onverwachte fout blijft wél gemeld — anders bewijst de eerste
// test niets.
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
  test(`${name} meldt domeinuitkomst no_bar_role niet`, async () => {
    rpcError("no_bar_role");
    assert.equal(await run(), false);
    assert.equal(fakeMoney().rpcCalls[0]?.fn, fn);
    assert.deepEqual(fakeMoney().reports, []);
  });

  test(`${name} meldt een onverwachte serverfout wel`, async () => {
    fakeMoney().next = { kind: "result", data: null, error: { message: "boom", code: "42P01" } };
    assert.equal(await run(), false);
    assert.equal(fakeMoney().reports.length, 1);
    assert.equal(fakeMoney().reports[0].hook, name === "useReverseOrderAtBar" ? "useReverseOrder" : name);
  });
}
