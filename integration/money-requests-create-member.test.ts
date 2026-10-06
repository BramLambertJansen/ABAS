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
  totpCode,
  uniekAdres,
  wachtwoord,
} from "./hulpjes.ts";

/**
 * Aanvulling op money-requests.test.ts (ADR 0024): twee gelijktijdige
 * create_member_once-aanroepen met dezelfde sleutel vanuit twee aparte
 * Auth-sessies (en dus twee bar-sessies in modus beheer) van één beheerder.
 * Precies één lid, hetzelfde id in beide antwoorden. Beheer eist aal2, dus
 * beide sessies doorlopen een TOTP-controle met dezelfde factor.
 */

after(opruimen);

/** Verhoogt de sessie van `client` naar aal2. De tweede sessie krijgt een
 *  andere stap-offset zodat de code niet gelijk is aan die van de eerste; een
 *  afgewezen code probeert de volgende offset (GoTrue staat een stap marge toe). */
async function naarAal2(client: SupabaseClient, factorId: string, geheim: string, offsets: number[]): Promise<void> {
  let laatsteFout = "";
  for (const offset of offsets) {
    const challenge = await client.auth.mfa.challenge({ factorId });
    assert.equal(challenge.error, null, `mfa.challenge faalde: ${challenge.error?.message}`);
    const verify = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.data!.id,
      code: totpCode(geheim, Date.now() + offset),
    });
    if (verify.error === null) return;
    laatsteFout = verify.error.message;
  }
  assert.fail(`mfa.verify faalde voor elke offset: ${laatsteFout}`);
}

test("concurrent create_member_once with one key from two beheer sessions creates exactly one member", async () => {
  const email = uniekAdres("receipt-lid"), password = wachtwoord();
  const actor = randomUUID();
  const naam = `Receipt lid ${randomUUID()}`;

  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(user.error, null, `createUser faalde: ${user.error?.message}`);
  aangemaakteAccounts.push(user.data.user!.id);
  const inserted = await admin.from("members").insert({
    id: actor, name: "Receipt beheerder", role: "beheerder", auth_user_id: user.data.user!.id, balance_cents: 0,
  });
  assert.equal(inserted.error, null, `member insert faalde: ${inserted.error?.message}`);
  aangemaakteLeden.push(actor);

  const eerste = gebruiker(), tweede = gebruiker();
  assert.equal((await eerste.auth.signInWithPassword({ email, password })).error, null);
  assert.equal((await tweede.auth.signInWithPassword({ email, password })).error, null);

  const enroll = await eerste.auth.mfa.enroll({ factorType: "totp" });
  assert.equal(enroll.error, null, `mfa.enroll faalde: ${enroll.error?.message}`);
  const factorId = enroll.data!.id, geheim = enroll.data!.totp.secret;
  await naarAal2(eerste, factorId, geheim, [0, -30_000, 30_000]);
  await naarAal2(tweede, factorId, geheim, [30_000, -30_000, 0]);

  for (const client of [eerste, tweede]) {
    const registered = await client.rpc("register_bar_session", { p_mode: "beheer" });
    assert.equal(registered.error, null, `register_bar_session faalde: ${registered.error?.message}`);
  }
  const sessies = await admin.from("bar_sessions").select("id").eq("member_id", actor);
  assert.equal(sessies.error, null);
  assert.equal(sessies.data!.length, 2, "twee aparte bar-sessies verwacht");

  const args = { p_request_id: randomUUID(), p_name: naam, p_starting_balance_cents: 250, p_email: null };
  const resultaten = await Promise.all([eerste.rpc("create_member_once", args), tweede.rpc("create_member_once", args)]);
  for (const r of resultaten) assert.equal(r.error, null, `create_member_once faalde: ${r.error?.message}`);
  assert.ok(resultaten[0]!.data.id, "antwoord bevat een lid-id");
  aangemaakteLeden.push(resultaten[0]!.data.id);
  assert.equal(resultaten[0]!.data.id, resultaten[1]!.data.id, "beide antwoorden hebben hetzelfde lid-id");
  assert.equal(resultaten[0]!.data.pin_hash, null);

  const leden = await admin.from("members").select("id, balance_cents").eq("name", naam);
  assert.equal(leden.error, null);
  assert.equal(leden.data!.length, 1, "precies één lid aangemaakt");
  assert.equal(leden.data![0]!.balance_cents, 250);

  // Een herhaling na het antwoord geeft hetzelfde lid, en een gewijzigd verzoek een conflict.
  const herhaald = await eerste.rpc("create_member_once", args);
  assert.equal(herhaald.error, null);
  assert.equal(herhaald.data.id, resultaten[0]!.data.id);
  assert.equal((await tweede.rpc("create_member_once", { ...args, p_starting_balance_cents: 300 })).error?.message, "request_id_conflict");
});
