import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { fakeInviteMember, resetFakeInviteMember } from "./fakes/inviteMemberState.ts";

/**
 * De invite-actie (src/lib/inviteMember.ts) controleert de sessie vóór hij een
 * mail verstuurt (dienst-per-sessie, review-fix B2, Bram 2026-09-30): een
 * beheerder in een sessie in modus bar, of zonder geregistreerde sessie,
 * verstuurt geen invite. De Supabase-clients zijn nep-modules
 * (test/fakes/invite-member-resolve.mjs); de voorwaarde zelf
 * (`check_beheer_session`, 0031) is bewezen in
 * supabase/tests/beheer_rpcs_modus.test.sql.
 */
register("./fakes/invite-member-resolve.mjs", import.meta.url);

const { sendMemberInvite } = await import("../src/lib/inviteMember.ts");

beforeEach(() => {
  resetFakeInviteMember();
  fakeInviteMember().rpc.mark_member_invite_sent = { data: { invited_at: "2026-09-30T20:00:00Z" } };
});

for (const code of [
  "wrong_mode",
  "no_bar_session",
  "session_ended",
  "session_inactive",
  "no_bar_role",
  // 0034 (ADR 0017): een beheersessie zonder tweede factor verstuurt ook niets.
  "aal2_required",
]) {
  test(`een sessie die de beheercontrole niet haalt (${code}) verstuurt geen invite`, async () => {
    fakeInviteMember().rpc.check_beheer_session = { error: { message: code } };
    const result = await sendMemberInvite("m-doel");
    assert.deepEqual(result, { ok: false, errorCode: "unknown" });
    assert.deepEqual(fakeInviteMember().calls, ["rpc:check_beheer_session"]);
  });
}

test("no_admin_role uit de beheercontrole: dezelfde code als bij mark_member_invite_sent, geen invite", async () => {
  fakeInviteMember().rpc.check_beheer_session = { error: { message: "no_admin_role" } };
  const result = await sendMemberInvite("m-doel");
  assert.deepEqual(result, { ok: false, errorCode: "no_admin_role" });
  assert.deepEqual(fakeInviteMember().calls, ["rpc:check_beheer_session"]);
});

test("een sessie in modus beheer: eerst de controle, dan de invite, dan de registratie", async () => {
  const result = await sendMemberInvite("m-doel");
  assert.deepEqual(result, { ok: true, invited: true, invitedAt: "2026-09-30T20:00:00Z" });
  assert.deepEqual(fakeInviteMember().calls, [
    "rpc:check_beheer_session",
    "inviteUserByEmail",
    "rpc:mark_member_invite_sent",
  ]);
});

test("een lid dat geen beheerder is, komt niet eens bij de controle (actorcheck blijft eerst)", async () => {
  fakeInviteMember().actor = { id: "m-bar", role: "bardienst" };
  const result = await sendMemberInvite("m-doel");
  assert.deepEqual(result, { ok: false, errorCode: "no_admin_role" });
  assert.deepEqual(fakeInviteMember().calls, []);
});

// ADR 0020 (docs/features/account-koppeling-bewijs.md → keuze 2): het id dat
// inviteUserByEmail teruggeeft gaat mee naar mark_member_invite_sent. De
// nep-RPC weigert met invite_account_mismatch als het niet klopt, dus een
// geslaagde invite bewijst dat het juiste id meeging.
test("de registratie krijgt het auth-id dat inviteUserByEmail teruggaf", async () => {
  fakeInviteMember().invitedAuthUserId = "u-andere-uitnodiging";
  const result = await sendMemberInvite("m-doel");
  assert.deepEqual(result, { ok: true, invited: true, invitedAt: "2026-09-30T20:00:00Z" });
});

test("invite_account_mismatch uit de registratie valt in unknown", async () => {
  fakeInviteMember().rpc.mark_member_invite_sent = {
    error: { message: "invite_account_mismatch" },
  };
  const result = await sendMemberInvite("m-doel");
  assert.deepEqual(result, { ok: false, errorCode: "unknown" });
});

// ADR 0020 → keuze 7: een gearchiveerd lid kan niet koppelen, dus er gaat
// ook geen mail uit. No-op, zoals een lid zonder adres.
test("gearchiveerd lid: geen invite, geen RPC", async () => {
  const member = fakeInviteMember().member;
  assert.ok(member);
  member.archived = true;
  const result = await sendMemberInvite("m-doel");
  assert.deepEqual(result, { ok: true, invited: false });
  assert.deepEqual(fakeInviteMember().calls, ["rpc:check_beheer_session"]);
});
