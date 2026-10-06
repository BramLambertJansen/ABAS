import { after, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as wacht } from "node:timers/promises";

import type { Session, SupabaseClient } from "@supabase/supabase-js";

import {
  aangemaakteAccounts,
  aangemaakteLeden,
  admin,
  gebruiker,
  metToken,
  opruimen,
  sessieId,
  uniekAdres,
  wachtwoord,
} from "./hulpjes.ts";

/**
 * Integratietest tegen de echte GoTrue van de lokale stack: een token van
 * een beëindigde Auth-sessie leest en schrijft niets meer
 * (docs/features/sessie-na-afmelden.md → Tests → Integratietest, ADR 0022,
 * migratie 0041). pgTAP bootst "sessie weg" na met een ontbrekende rij in
 * auth.sessions; hier verwijdert GoTrue zelf die rij (uitloggen,
 * wachtwoordherstel) en draait de cron-job van de stack.
 *
 * Opzet per scenario: een account via `auth.admin.createUser` en een lid
 * dat er rechtstreeks via service-role aan gekoppeld is (koppelen zelf dekt
 * account-koppeling.test.ts). Opruimen in `after`.
 */

after(opruimen);

/** Account met wachtwoord en een direct gekoppeld lid. */
async function accountMetLid(
  role: "lid" | "bardienst",
): Promise<{ email: string; password: string; userId: string; memberId: string }> {
  const email = uniekAdres("sessie");
  const password = wachtwoord();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(error, null, `createUser faalde: ${error?.message}`);
  assert.ok(data.user, "createUser gaf geen user");
  aangemaakteAccounts.push(data.user.id);

  const lid = await admin
    .from("members")
    .insert({ name: `Sessietest ${email}`, role, email, auth_user_id: data.user.id })
    .select("id")
    .single();
  assert.equal(lid.error, null, `lid aanmaken faalde: ${lid.error?.message}`);
  const memberId = (lid.data as { id: string }).id;
  aangemaakteLeden.push(memberId);
  return { email, password, userId: data.user.id, memberId };
}

async function inloggen(email: string, password: string): Promise<{ client: SupabaseClient; session: Session }> {
  const client = gebruiker();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.equal(error, null, `signInWithPassword faalde: ${error?.message}`);
  assert.ok(data.session, "signInWithPassword gaf geen sessie");
  return { client, session: data.session };
}

async function aantalRijen(client: SupabaseClient, tabel: string): Promise<number> {
  // Alleen `id`: op members zijn email en pin_hash kolomgewijs REVOKEd
  // (0009/0010), dus `select("*")` geeft daar altijd permission denied.
  const { data, error } = await client.from(tabel).select("id");
  assert.equal(error, null, `select op ${tabel} gaf een fout: ${error?.message}`);
  return (data ?? []).length;
}

async function totaalViaServiceRole(tabel: string): Promise<number> {
  const { count, error } = await admin.from(tabel).select("*", { count: "exact", head: true });
  assert.equal(error, null, `tellen van ${tabel} faalde: ${error?.message}`);
  return count ?? 0;
}

async function naamVan(memberId: string): Promise<string> {
  const { data, error } = await admin.from("members").select("name").eq("id", memberId).single();
  assert.equal(error, null, `naam lezen faalde: ${error?.message}`);
  return (data as { name: string }).name;
}

test("1. uitloggen beëindigt alleen deze sessie, en het oude token kan niets meer", async () => {
  const { email, password, memberId } = await accountMetLid("lid");
  const p1 = await inloggen(email, password);
  const p2 = await inloggen(email, password);

  // Vooraf: het token van P1 werkt.
  assert.equal(await aantalRijen(p1.client, "members"), 1, "P1 ziet vooraf niet de eigen members-rij");
  const vooraf = await p1.client.rpc("update_own_name", { p_name: "Sessietest Vooraf" });
  assert.equal(vooraf.error, null, `update_own_name vooraf faalde: ${vooraf.error?.message}`);

  const uit = await p1.client.auth.signOut({ scope: "local" });
  assert.equal(uit.error, null, `signOut(local) faalde: ${uit.error?.message}`);

  const oud = metToken(p1.session.access_token);
  for (const tabel of ["members", "orders", "top_ups"]) {
    assert.equal(await aantalRijen(oud, tabel), 0, `het oude token ziet nog rijen in ${tabel}`);
  }

  const transacties = await oud.rpc("list_own_transactions");
  assert.equal(transacties.error, null, `list_own_transactions gaf een fout: ${transacties.error?.message}`);
  assert.deepEqual(transacties.data, [], "list_own_transactions geeft het oude token nog rijen");

  const naam = await oud.rpc("update_own_name", { p_name: "Overgenomen" });
  assert.equal(naam.error?.message, "actor_not_found", "update_own_name met het oude token gaf geen actor_not_found");
  assert.equal(await naamVan(memberId), "Sessietest Vooraf", "de naam is gewijzigd met het oude token");

  const staat = await oud.rpc("my_bar_state");
  assert.equal(staat.error, null, `my_bar_state gaf een fout: ${staat.error?.message}`);
  assert.deepEqual(staat.data, { session: null }, "my_bar_state geeft het oude token meer dan een lege toestand");

  const koppel = await oud.rpc("link_invited_member_account");
  assert.equal(koppel.error, null, `link_invited_member_account gaf een fout: ${koppel.error?.message}`);
  const rij = (Array.isArray(koppel.data) ? koppel.data[0] : koppel.data) as { id?: string | null } | null;
  assert.equal(rij?.id ?? null, null, "link_invited_member_account gaf het oude token een lid terug");

  // De andere sessie van hetzelfde lid werkt door (uitloggen is lokaal).
  assert.equal(await aantalRijen(p2.client, "members"), 1, "P2 ziet de eigen members-rij niet meer na uitloggen op P1");
});

test("2. wachtwoordherstel beëindigt de bar-sessie", async () => {
  const { email, password } = await accountMetLid("bardienst");

  // Tablet T: wachtwoordlogin en een bar-sessie.
  const t = await inloggen(email, password);
  const registratie = await t.client.rpc("register_bar_session", { p_mode: "bar" });
  assert.equal(registratie.error, null, `register_bar_session faalde: ${registratie.error?.message}`);

  // Andere testbestanden draaien parallel en maken leden aan: het aantal van
  // T moet tussen de service-role-tellingen ervoor en erna liggen.
  const voor = await totaalViaServiceRole("members");
  const gezien = await aantalRijen(t.client, "members");
  const na = await totaalViaServiceRole("members");
  assert.ok(gezien > 1, `de bardienst ziet vooraf ${gezien} leden, verwacht meer dan 1`);
  assert.ok(
    gezien >= Math.min(voor, na) && gezien <= Math.max(voor, na),
    `de bardienst ziet ${gezien} leden, service-role telt ${voor}..${na}`,
  );

  // Exact het pad van useWachtwoordHerstellen.ts, op een tweede client.
  const link = await admin.auth.admin.generateLink({ type: "recovery", email });
  assert.equal(link.error, null, `generateLink(recovery) faalde: ${link.error?.message}`);
  const herstel = gebruiker();
  const verify = await herstel.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "recovery" });
  assert.equal(verify.error, null, `verifyOtp(recovery) faalde: ${verify.error?.message}`);
  const update = await herstel.auth.updateUser({ password: wachtwoord() });
  assert.equal(update.error, null, `updateUser(password) faalde: ${update.error?.message}`);
  const uit = await herstel.auth.signOut();
  assert.equal(uit.error, null, `signOut() faalde: ${uit.error?.message}`);

  const oud = metToken(t.session.access_token);
  assert.equal(await aantalRijen(oud, "members"), 0, "het tablet-token ziet na herstel nog leden");
  assert.equal(await aantalRijen(oud, "bar_sessions"), 0, "het tablet-token ziet na herstel nog bar-sessies");

  const hartslag = await oud.rpc("touch_bar_session");
  assert.equal(hartslag.error?.message, "session_ended", "touch_bar_session met het tablet-token gaf geen session_ended");

  // my_bar_state pas na de poll: de cron-job kan al tussen signOut() en hier
  // gedraaid hebben (keuze 5). De null-tak dekt pgTAP blok 9.

  // De cron-job (elke minuut) sluit de bar-sessie. Wordt ze niet binnen 90 s
  // gesloten: niet afzwakken, melden.
  const authSessie = sessieId(t.session);
  let rij: { ended_at: string | null; end_reason: string | null } | null = null;
  for (let poging = 0; poging < 45; poging++) {
    const { data, error } = await admin
      .from("bar_sessions")
      .select("ended_at, end_reason")
      .eq("auth_session_id", authSessie)
      .single();
    assert.equal(error, null, `bar_sessions lezen faalde: ${error?.message}`);
    rij = data as { ended_at: string | null; end_reason: string | null };
    if (rij.ended_at) break;
    await wacht(2000);
  }
  assert.ok(rij?.ended_at, "de cron-job sloot de bar-sessie niet binnen 90 s");
  assert.equal(rij?.end_reason, "elders_uitgelogd", "de bar-sessie is met een andere reden gesloten");

  // Gesloten bar-sessie: de sluitreden blijft zichtbaar, zonder dienst- of beheergegevens.
  const staat = await oud.rpc("my_bar_state");
  assert.equal(staat.error, null, `my_bar_state gaf een fout: ${staat.error?.message}`);
  const toestand = staat.data as Record<string, unknown> & {
    session: { status?: string; end_reason?: string | null; left_shift_open?: boolean } | null;
  };
  assert.equal(toestand.session?.status, "ended", "my_bar_state geeft geen status ended");
  assert.equal(toestand.session?.end_reason, "elders_uitgelogd", "my_bar_state geeft een andere sluitreden");
  assert.equal(toestand.session?.left_shift_open, false, "my_bar_state meldt een open dienst");
  for (const sleutel of ["shift", "other_shift", "notifications"]) {
    assert.ok(!(sleutel in toestand), `my_bar_state geeft het tablet-token nog ${sleutel}`);
  }
});
