import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Real independent HTTP transactions, not sequential calls in one pgTAP transaction.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Money integration tests require a local disposable Supabase stack");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, options);
const bar = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);
const secondBar = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);

test("concurrent distinct Auth sessions commit one top-up and one order; lost response replays original price", async () => {
  const actor = randomUUID(), member = randomUUID(), shift = randomUUID(), product = randomUUID();
  const email = `receipt-${randomUUID()}@example.test`, password = `Test-${randomUUID()}!`;
  let userId: string | undefined;
  async function insert(table: string, values: Record<string, unknown> | Record<string, unknown>[]) {
    const { error } = await admin.from(table).insert(values); assert.equal(error, null);
  }
  try {
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(user.error, null); userId = user.data.user!.id;
    await insert("members", [{ id: actor, name: "Receipt tester", role: "bardienst", auth_user_id: userId, balance_cents: 0 }, { id: member, name: "Receipt target", role: "lid", balance_cents: 5000 }]);
    assert.equal((await bar.auth.signInWithPassword({ email, password })).error, null);
    assert.equal((await bar.rpc("register_bar_session", { p_mode: "bar" })).error, null);
    const session = await admin.from("bar_sessions").select("id").eq("member_id", actor).single(); assert.equal(session.error, null);
    assert.equal((await secondBar.auth.signInWithPassword({ email, password })).error, null);
    assert.equal((await secondBar.rpc("register_bar_session", { p_mode: "bar" })).error, null);
    const secondSession = await admin.from("bar_sessions").select("id").eq("member_id", actor).neq("id", session.data!.id).single();
    assert.equal(secondSession.error, null);
    assert.notEqual(secondSession.data!.id, session.data!.id);
    await insert("shifts", { id: shift, started_by: actor });
    await insert("shift_members", { shift_id: shift, member_id: actor });
    await insert("shift_sessions", [{ shift_id: shift, bar_session_id: session.data!.id }, { shift_id: shift, bar_session_id: secondSession.data!.id }]);
    await insert("products", { id: product, name: "Receipt test product", category: "test", price_cents: 300 });
    const topArgs = { p_request_id: randomUUID(), p_shift_id: shift, p_member_id: member, p_amount_cents: 100, p_method: "cash", p_served_by: actor };
    const top = await Promise.all([bar.rpc("top_up_once", topArgs), secondBar.rpc("top_up_once", topArgs)]);
    for (const result of top) assert.equal(result.error, null);
    assert.equal(top[0].data.id, top[1].data.id);
    const topRows = await admin.from("top_ups").select("id").eq("member_id", member); assert.equal(topRows.error, null); assert.equal(topRows.data!.length, 1);
    const orderArgs = { p_request_id: randomUUID(), p_shift_id: shift, p_member_id: member, p_lines: [{ product_id: product, qty: 1 }], p_served_by: actor };
    const orders = await Promise.all([bar.rpc("place_order_once", orderArgs), secondBar.rpc("place_order_once", orderArgs)]);
    for (const result of orders) assert.equal(result.error, null);
    assert.equal(orders[0].data.id, orders[1].data.id);
    assert.equal((await admin.from("products").update({ price_cents: 900 }).eq("id", product)).error, null);
    const replay = await bar.rpc("place_order_once", orderArgs); assert.equal(replay.error, null); assert.equal(replay.data.total_cents, 300);
    const orderRows = await admin.from("orders").select("id").eq("member_id", member); assert.equal(orderRows.error, null); assert.equal(orderRows.data!.length, 1);
    const balance = await admin.from("members").select("balance_cents").eq("id", member).single(); assert.equal(balance.error, null); assert.equal(balance.data!.balance_cents, 4800);
    assert.equal((await bar.rpc("top_up_once", { ...topArgs, p_amount_cents: 200 })).error?.message, "request_id_conflict");
    const raceArgs = { ...topArgs, p_request_id: randomUUID(), p_amount_cents: 77 };
    const [booking, cancellation] = await Promise.all([
      bar.rpc("top_up_once", raceArgs),
      secondBar.rpc("inspect_money_request", { p_request_id: raceArgs.p_request_id, p_operation: "top_up",
        p_payload: [shift, member, 77, "cash", actor], p_cancel: true }),
    ]);
    assert.equal(cancellation.error, null);
    if (cancellation.data.status === "cancelled") {
      assert.equal(booking.error?.message, "request_cancelled");
      assert.equal((await bar.rpc("top_up_once", raceArgs)).error?.message, "request_cancelled");
    } else {
      assert.equal(cancellation.data.status, "completed");
      assert.equal(booking.error, null);
      assert.equal(cancellation.data.result.id, booking.data.id);
    }
    const finalBalance = await admin.from("members").select("balance_cents").eq("id", member).single();
    assert.equal(finalBalance.error, null);
    assert.equal(finalBalance.data!.balance_cents, cancellation.data.status === "cancelled" ? 4800 : 4877);
  } finally {
    // Fixture records only. Receipts deliberately have no expiry and survive until
    // the disposable CI stack is removed; there is no service-role receipt grant.
    const orders = await admin.from("orders").select("id").eq("shift_id", shift);
    if (orders.data?.length) await admin.from("order_lines").delete().in("order_id", orders.data.map((row) => row.id));
    for (const table of ["orders", "top_ups", "shift_sessions", "shift_members"]) await admin.from(table).delete().eq("shift_id", shift);
    await admin.from("shifts").delete().eq("id", shift);
    await admin.from("bar_sessions").delete().eq("member_id", actor);
    await admin.from("products").delete().eq("id", product);
    await admin.from("members").delete().in("id", [actor, member]);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
