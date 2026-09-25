import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side invite-actie — docs/features/lid-account-invite.md → RPC's
 * punt 3, ADR 0006. Uitsluitend aangeroepen vanuit
 * src/app/(bar)/beheer/invite/route.ts, nooit rechtstreeks vanuit een
 * client-hook (dit bestand importeert admin.ts, dat nooit vanuit
 * `"use client"`-code mag komen). Elke `.from()/.rpc()`/`.auth.admin.*`-
 * aanroep leeft hier, onder src/lib/ — de route zelf mag zo'n aanroep niet
 * rechtstreeks doen (check:policy's bestaande regel, ADR 0006 → Beslissing
 * punt 4).
 */

export type SendMemberInviteErrorCode =
  | "actor_not_found"
  | "no_admin_role"
  | "member_not_found"
  | "already_linked"
  | "email_already_registered"
  | "rate_limited"
  | "unknown";

export type SendMemberInviteResult =
  // `invitedAt` (het `invited_at` dat `mark_member_invite_sent` zojuist
  // zette) gaat mee zodat de aanroeper (LidBeherenOverlay.tsx, via
  // useSendMemberInvite.ts) `member`/`invitedAt` kan verversen zonder een
  // aparte refetch nodig te hebben (spec → Schermflow stap 3). **(Herzien,
  // PR #62-review, Bug 1-fix): geen koppelingsinformatie meer** — het lid
  // heeft ná dit succes nog steeds geen gekoppeld account, dat gebeurt pas
  // bij acceptatie via `link_invited_member_account`
  // (src/app/(bar)/beheer/callback/route.ts).
  | { ok: true; invited: true; invitedAt: string }
  | { ok: true; invited: false }
  | { ok: false; errorCode: SendMemberInviteErrorCode };

// Structureel getypeerd (`code`, wat AuthError van @supabase/auth-js altijd
// heeft) i.p.v. het echte AuthError-type te importeren — dat zou een
// `@supabase/supabase-js`-import buiten src/lib/supabase/ zijn, verboden
// door check:arch (CLAUDE.md → Verificatie, "Supabase-client privé").
function toInviteErrorCode(error: { code?: string | null }): SendMemberInviteErrorCode {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return "email_already_registered";
  }
  if (
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  ) {
    return "rate_limited";
  }
  return "unknown";
}

function toMarkErrorCode(message: string | undefined): SendMemberInviteErrorCode {
  if (
    message === "actor_not_found" ||
    message === "no_admin_role" ||
    message === "member_not_found" ||
    message === "already_linked"
  ) {
    return message;
  }
  return "unknown";
}

/**
 * Stuurt (opnieuw) een magic-link-invite voor `memberId`, of no-opt als het
 * lid daar niet voor eligible is. Zie spec → RPC's punt 3 voor de vijf
 * stappen hieronder — genummerd in dezelfde volgorde.
 */
export async function sendMemberInvite(
  memberId: string
): Promise<SendMemberInviteResult> {
  // 1. Actorcheck, sessie-gebonden client — eigen, onafhankelijk van elke
  //    eerdere RPC-call in dezelfde request (ADR 0006 → Beslissing punt 1).
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, errorCode: "actor_not_found" };
  }

  const { data: actor, error: actorError } = await supabase
    .from("members")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .eq("archived", false)
    .maybeSingle();

  if (actorError) {
    console.error("sendMemberInvite (actorcheck):", actorError);
    return { ok: false, errorCode: "unknown" };
  }
  if (!actor) {
    return { ok: false, errorCode: "actor_not_found" };
  }
  if (actor.role !== "beheerder") {
    return { ok: false, errorCode: "no_admin_role" };
  }

  // 2. Doellid lezen via de service-role-client — mag hier, stap 1 heeft de
  //    aanroeper al geautoriseerd; een gewone lezing, geen RLS-gevoelige
  //    schrijving (spec → RPC's punt 3).
  const admin = createAdminClient();
  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id, role, email, auth_user_id")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) {
    console.error("sendMemberInvite (member read):", memberError);
    return { ok: false, errorCode: "unknown" };
  }
  if (!member) {
    return { ok: false, errorCode: "member_not_found" };
  }

  // 3. Eligibility: role in ('bardienst', 'beheerder', 'lid') en
  //    auth_user_id is null en email is not null. Niet eligible -> geen
  //    fout, no-op (lid-account-invite.md → RPC's punt 3.3) — de
  //    role-voorwaarde is de server-side afdwinging van de eligibility-eis,
  //    onafhankelijk van wat de UI toont. Uitgebreid met 'lid'
  //    (docs/features/portal-login.md → "Ledenkoppeling voor rol `lid`",
  //    Besloten door Bram punt 1): een beheerder kan zo ook een `lid`-rol
  //    member een magic-link-invite sturen — de koppeling zelf gebeurt
  //    daarna via `link_lid_member_account()` (0022), niet via
  //    `link_invited_member_account()`, dat op zijn beurt nooit een `lid`-rij
  //    koppelt (geen `role`-filter daar, maar ook geen `role = 'lid'`-match
  //    nodig — beide RPC's draaien altijd allebei, zie
  //    src/app/auth/callback/route.ts).
  const eligible =
    (member.role === "bardienst" || member.role === "beheerder" || member.role === "lid") &&
    member.auth_user_id === null &&
    member.email !== null;

  if (!eligible) {
    return { ok: true, invited: false };
  }

  // 4. inviteUserByEmail() via de service-role-client.
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(member.email as string);

  if (inviteError) {
    console.error("sendMemberInvite (inviteUserByEmail):", inviteError);
    return { ok: false, errorCode: toInviteErrorCode(inviteError) };
  }

  const authUserId = inviteData.user?.id;
  if (!authUserId) {
    console.error("sendMemberInvite: inviteUserByEmail succeeded without a user id");
    return { ok: false, errorCode: "unknown" };
  }

  // mark_member_invite_sent via de sessie-gebonden client, nooit de
  // service-role-client — auth.uid() moet de echte beheerder-sessie zijn
  // (RPC's punt 1, ADR 0006 → Beslissing punt 3). Geen p_auth_user_id meer
  // (herzien, Bug 1-fix): het geretourneerde auth.users-id van
  // inviteUserByEmail() wordt hier niet meer gebruikt — dat record-id komt
  // terug via link_invited_member_account() bij acceptatie, niet hier.
  const { data: markData, error: markError } = await supabase.rpc(
    "mark_member_invite_sent",
    { p_member_id: memberId }
  );

  if (markError) {
    // Geaccepteerd risico: een geslaagde inviteUserByEmail() gevolgd door
    // een mislukte mark_member_invite_sent laat een auth.users-rij bestaan
    // terwijl members.invited_at op null blijft staan — spec → Randgevallen
    // "Dubbele/gelijktijdige invite-afronding". Geen herstelpoging hier.
    console.error("sendMemberInvite (mark_member_invite_sent):", markError);
    return { ok: false, errorCode: toMarkErrorCode(markError.message) };
  }

  return { ok: true, invited: true, invitedAt: markData.invited_at as string };
}
