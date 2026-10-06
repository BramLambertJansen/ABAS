import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  aangemaakteAccounts,
  aangemaakteLeden,
  admin,
  gebruiker,
  opruimen,
  uniekAdres,
  wachtwoord,
} from "./hulpjes.ts";

/**
 * Integratietest tegen de lokale stack: twee gelijktijdige aanroepen met
 * dezelfde `p_request_id` via PostgREST boeken één keer en geven allebei
 * hetzelfde id terug (docs/features/idempotentie-geld-rpcs.md → Testplan,
 * ADR 0023, migratie 0042). pgTAP draait in één sessie en kan niet bewijzen
 * dat de unieke index twee echte verbindingen goed afhandelt; dit wel.
 *
 * Opzet: een bardienst met een echte GoTrue-sessie en een bar-sessie, een
 * dienst waaraan die sessie gekoppeld is (rechtstreeks via service-role,
 * zoals de pgTAP-fixtures), een lid en een product. Opruimen in `after`.
 */

const eigenIds = {
  producten: [] as string[],
  diensten: [] as string[],
  leden: [] as string[],
};

async function eigenOpruiming(): Promise<void> {
  const log = (stap: string, error: { message: string } | null) => {
    if (error) console.error(`opruimen ${stap}:`, error.message);
  };
  const orderIds = (
    (await admin.from("orders").select("id").in("shift_id", eigenIds.diensten)).data ?? []
  ).map((r: { id: string }) => r.id);
  if (orderIds.length > 0) {
    log("order_lines", (await admin.from("order_lines").delete().in("order_id", orderIds)).error);
  }
  log("orders", (await admin.from("orders").delete().in("shift_id", eigenIds.diensten)).error);
  log("top_ups", (await admin.from("top_ups").delete().in("shift_id", eigenIds.diensten)).error);
  log(
    "idempotency_keys",
    (await admin.from("idempotency_keys").delete().in("actor_member_id", aangemaakteLeden)).error,
  );
  log("shift_sessions", (await admin.from("shift_sessions").delete().in("shift_id", eigenIds.diensten)).error);
  log("shift_members", (await admin.from("shift_members").delete().in("shift_id", eigenIds.diensten)).error);
  log("shifts", (await admin.from("shifts").delete().in("id", eigenIds.diensten)).error);
  log("products", (await admin.from("products").delete().in("id", eigenIds.producten)).error);
}

after(async () => {
  await eigenOpruiming();
  await opruimen();
});

type Opstelling = {
  bar: SupabaseClient;
  shiftId: string;
  barMemberId: string;
  lidId: string;
  productId: string;
};

async function opstelling(): Promise<Opstelling> {
  const email = uniekAdres("idem");
  const password = wachtwoord();
  const gemaakt = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(gemaakt.error, null, `createUser faalde: ${gemaakt.error?.message}`);
  assert.ok(gemaakt.data.user, "createUser gaf geen user");
  aangemaakteAccounts.push(gemaakt.data.user.id);

  const bardienst = await admin
    .from("members")
    .insert({ name: `Idem bardienst ${email}`, role: "bardienst", email, auth_user_id: gemaakt.data.user.id })
    .select("id")
    .single();
  assert.equal(bardienst.error, null, `bardienst aanmaken faalde: ${bardienst.error?.message}`);
  const barMemberId = (bardienst.data as { id: string }).id;
  aangemaakteLeden.push(barMemberId);

  const lid = await admin
    .from("members")
    .insert({ name: `Idem lid ${email}`, role: "lid", balance_cents: 10000 })
    .select("id")
    .single();
  assert.equal(lid.error, null, `lid aanmaken faalde: ${lid.error?.message}`);
  const lidId = (lid.data as { id: string }).id;
  aangemaakteLeden.push(lidId);

  const product = await admin
    .from("products")
    .insert({ name: `Idem product ${email}`, category: "Test", price_cents: 250, archived: false })
    .select("id")
    .single();
  assert.equal(product.error, null, `product aanmaken faalde: ${product.error?.message}`);
  const productId = (product.data as { id: string }).id;
  eigenIds.producten.push(productId);

  const bar = gebruiker();
  const login = await bar.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, `signInWithPassword faalde: ${login.error?.message}`);
  const registratie = await bar.rpc("register_bar_session", { p_mode: "bar" });
  assert.equal(registratie.error, null, `register_bar_session faalde: ${registratie.error?.message}`);
  const barSessionId = (registratie.data as { id: string }).id;

  const dienst = await admin.from("shifts").insert({ started_by: barMemberId }).select("id").single();
  assert.equal(dienst.error, null, `dienst aanmaken faalde: ${dienst.error?.message}`);
  const shiftId = (dienst.data as { id: string }).id;
  eigenIds.diensten.push(shiftId);
  const bezetting = await admin.from("shift_members").insert({ shift_id: shiftId, member_id: barMemberId });
  assert.equal(bezetting.error, null, `bezetting aanmaken faalde: ${bezetting.error?.message}`);
  const koppeling = await admin.from("shift_sessions").insert({ shift_id: shiftId, bar_session_id: barSessionId });
  assert.equal(koppeling.error, null, `koppeling aanmaken faalde: ${koppeling.error?.message}`);

  return { bar, shiftId, barMemberId, lidId, productId };
}

async function saldo(lidId: string): Promise<number> {
  const { data, error } = await admin.from("members").select("balance_cents").eq("id", lidId).single();
  assert.equal(error, null, `saldo lezen faalde: ${error?.message}`);
  return (data as { balance_cents: number }).balance_cents;
}

test("twee gelijktijdige place_order-aanroepen met dezelfde sleutel boeken één keer", async () => {
  const o = await opstelling();
  const requestId = randomUUID();
  const aanroep = () =>
    o.bar.rpc("place_order", {
      p_shift_id: o.shiftId,
      p_member_id: o.lidId,
      p_lines: [{ product_id: o.productId, qty: 2 }],
      p_served_by: o.barMemberId,
      p_request_id: requestId,
    });

  const [a, b] = await Promise.all([aanroep(), aanroep()]);
  assert.equal(a.error, null, `eerste aanroep faalde: ${a.error?.message}`);
  assert.equal(b.error, null, `tweede aanroep faalde: ${b.error?.message}`);
  const idA = (a.data as { id: string }).id;
  const idB = (b.data as { id: string }).id;
  assert.ok(idA, "eerste aanroep gaf geen bestelling-id");
  assert.equal(idA, idB, "beide aanroepen moeten dezelfde bestelling teruggeven");

  const bestellingen = await admin.from("orders").select("id").eq("shift_id", o.shiftId);
  assert.equal(bestellingen.error, null);
  assert.equal(bestellingen.data?.length, 1, "er moet precies één bestelling zijn");
  assert.equal(await saldo(o.lidId), 10000 - 500, "het saldo moet één keer gedaald zijn");

  const sleutels = await admin.from("idempotency_keys").select("request_id").eq("request_id", requestId);
  assert.equal(sleutels.data?.length, 1, "er moet precies één sleutelrij zijn");

  // Een herhaling na afloop geeft nog steeds hetzelfde id en boekt niets.
  const nogmaals = await aanroep();
  assert.equal(nogmaals.error, null, `herhaling faalde: ${nogmaals.error?.message}`);
  assert.equal((nogmaals.data as { id: string }).id, idA);
  assert.equal(await saldo(o.lidId), 10000 - 500, "een herhaling mag het saldo niet wijzigen");
});

test("twee gelijktijdige top_up-aanroepen met dezelfde sleutel boeken één keer", async () => {
  const o = await opstelling();
  const requestId = randomUUID();
  const aanroep = () =>
    o.bar.rpc("top_up", {
      p_shift_id: o.shiftId,
      p_member_id: o.lidId,
      p_amount_cents: 700,
      p_method: "cash",
      p_served_by: o.barMemberId,
      p_request_id: requestId,
    });

  const [a, b] = await Promise.all([aanroep(), aanroep()]);
  assert.equal(a.error, null, `eerste aanroep faalde: ${a.error?.message}`);
  assert.equal(b.error, null, `tweede aanroep faalde: ${b.error?.message}`);
  const idA = (a.data as { id: string }).id;
  const idB = (b.data as { id: string }).id;
  assert.ok(idA, "eerste aanroep gaf geen opwaardering-id");
  assert.equal(idA, idB, "beide aanroepen moeten dezelfde opwaardering teruggeven");

  const opwaarderingen = await admin.from("top_ups").select("id").eq("shift_id", o.shiftId);
  assert.equal(opwaarderingen.error, null);
  assert.equal(opwaarderingen.data?.length, 1, "er moet precies één opwaardering zijn");
  assert.equal(await saldo(o.lidId), 10000 + 700, "het saldo moet één keer gestegen zijn");
});

test("dezelfde sleutel met een andere opdracht geeft request_id_conflict via PostgREST", async () => {
  const o = await opstelling();
  const requestId = randomUUID();
  const eerste = await o.bar.rpc("top_up", {
    p_shift_id: o.shiftId,
    p_member_id: o.lidId,
    p_amount_cents: 700,
    p_method: "cash",
    p_served_by: o.barMemberId,
    p_request_id: requestId,
  });
  assert.equal(eerste.error, null, `eerste aanroep faalde: ${eerste.error?.message}`);

  const andereOpdracht = await o.bar.rpc("top_up", {
    p_shift_id: o.shiftId,
    p_member_id: o.lidId,
    p_amount_cents: 800,
    p_method: "cash",
    p_served_by: o.barMemberId,
    p_request_id: requestId,
  });
  assert.equal(andereOpdracht.error?.message, "request_id_conflict");
  assert.equal(await saldo(o.lidId), 10000 + 700, "de geweigerde aanroep mag het saldo niet wijzigen");
});
