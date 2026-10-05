import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Integratietest tegen de echte GoTrue van de lokale stack (`supabase
 * start`): docs/features/account-koppeling-bewijs.md → Tests →
 * Integratietest, ADR 0020. pgTAP draait geen GoTrue en zag daardoor niet
 * dat GoTrue bij het openen van een uitnodiging zelf een tijdelijk
 * wachtwoord zet (verify.go:317-329); deze test doorloopt het hoofdpad en
 * de aanval met echte tokens.
 *
 * Bewust buiten test/ (`npm test` draait in CI vóór `supabase start`) en
 * buiten src/ (testcode, geen app-code: check:arch/check:policy scannen
 * alleen src/). Draait via `npm run test:integration`, in CI na `db:test`.
 *
 * Tokens zonder mail: `auth.admin.generateLink` → `hashed_token` →
 * `verifyOtp({ token_hash, type })` op de gebruikersclient, precies wat
 * src/app/auth/callback/route.ts en src/app/(bar)/beheer/callback/route.ts
 * doen. Daarna dezelfde RPC-aanroep als src/lib/linkInvitedMemberAccount.ts
 * en src/lib/linkLidMemberAccount.ts.
 *
 * Elk scenario maakt een eigen lid en een eigen account op een uniek adres
 * en ruimt die op het eind op; de seed blijft onaangeroerd.
 */

type Omgeving = { url: string; publishableKey: string; secretKey: string };

function omgeving(): Omgeving {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (url && publishableKey && secretKey) return { url, publishableKey, secretKey };

  // Lokaal, buiten CI: dezelfde bron als de CI-stap "Export local Supabase
  // env vars" en e2e/helpers/supabaseAdmin.ts.
  let raw: string;
  try {
    raw = execSync("supabase status -o json", { encoding: "utf8" });
  } catch {
    raw = execSync("npx supabase status -o json", { encoding: "utf8" });
  }
  const status = JSON.parse(raw) as {
    API_URL: string;
    PUBLISHABLE_KEY?: string;
    ANON_KEY?: string;
    SERVICE_ROLE_KEY: string;
  };
  const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  if (!key) throw new Error("supabase status gaf geen PUBLISHABLE_KEY of ANON_KEY");
  return { url: status.API_URL, publishableKey: key, secretKey: status.SERVICE_ROLE_KEY };
}

const env = omgeving();

const clientOpties = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/** Service-role: opzet en controle, buiten RLS om. */
const admin: SupabaseClient = createClient(env.url, env.secretKey, clientOpties);

/** Een "gebruiker" met de publieke key, zoals de browser of een aanvaller. */
function gebruiker(): SupabaseClient {
  return createClient(env.url, env.publishableKey, clientOpties);
}

// ── Opruimen ──────────────────────────────────────────────────────────────

const aangemaakteLeden: string[] = [];
const aangemaakteAccounts: string[] = [];

after(async () => {
  // Eerst de leden: members.auth_user_id verwijst zonder `on delete` naar
  // auth.users, dus een gekoppeld account is pas daarna te verwijderen.
  if (aangemaakteLeden.length > 0) {
    const { error } = await admin.from("members").delete().in("id", aangemaakteLeden);
    if (error) console.error("opruimen members:", error.message);
  }
  for (const id of aangemaakteAccounts) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`opruimen auth-account ${id}:`, error.message);
  }
});

// ── Hulpjes ───────────────────────────────────────────────────────────────

function uniekAdres(): string {
  return `koppel-${randomBytes(8).toString("hex")}@example.test`;
}

function wachtwoord(): string {
  return `Ww-${randomBytes(12).toString("hex")}`;
}

/** De `amr`-methoden uit het ondertekende access token. GoTrue zet ze als
 *  `[{method, timestamp}]`; de RFC 8176-vorm (`string[]`) wordt ook gelezen,
 *  zodat een afwijkende vorm hier zichtbaar wordt in plaats van te crashen. */
function amrMethoden(session: Session): string[] {
  const payload = session.access_token.split(".")[1];
  assert.ok(payload, "access token heeft geen payload");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    amr?: Array<{ method?: string } | string>;
  };
  return (claims.amr ?? []).map((e) => (typeof e === "string" ? e : (e.method ?? "")));
}

/** Uitnodigen zoals src/lib/inviteMember.ts, maar via generateLink (geen
 *  mail): maakt het invite-account aan en geeft id en token-hash terug. */
async function uitnodigen(email: string): Promise<{ userId: string; tokenHash: string }> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  assert.equal(error, null, `generateLink(invite) faalde: ${error?.message}`);
  assert.ok(data.user, "generateLink(invite) gaf geen user");
  aangemaakteAccounts.push(data.user.id);
  return { userId: data.user.id, tokenHash: data.properties.hashed_token };
}

/** Een lid dat uitgenodigd is en gebonden aan het invite-account. Rechtstreeks
 *  via service-role: mark_member_invite_sent eist een beheersessie met aal2
 *  en is al door pgTAP gedekt (spec → Integratietest). */
async function uitgenodigdLid(
  email: string,
  role: "lid" | "bardienst" | "beheerder",
  invitedAuthUserId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("members")
    .insert({
      name: `Koppeltest ${email}`,
      role,
      email,
      invited_at: new Date().toISOString(),
      invited_auth_user_id: invitedAuthUserId,
    })
    .select("id")
    .single();
  assert.equal(error, null, `lid aanmaken faalde: ${error?.message}`);
  const id = (data as { id: string }).id;
  aangemaakteLeden.push(id);
  return id;
}

async function gekoppeldAccount(memberId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("members")
    .select("auth_user_id")
    .eq("id", memberId)
    .single();
  assert.equal(error, null, `lid lezen faalde: ${error?.message}`);
  return (data as { auth_user_id: string | null }).auth_user_id;
}

/** Roept een link-RPC aan zoals de callbacks en geeft het id van het
 *  teruggegeven lid, of null. Een plpgsql-`return null` voor een
 *  composite type komt via PostgREST terug als null of als een rij met
 *  alleen nulls; beide betekenen "niet gekoppeld". De callbacks negeren
 *  `data`; hier is het de controle. */
async function koppel(
  client: SupabaseClient,
  rpc: "link_invited_member_account" | "link_lid_member_account",
): Promise<string | null> {
  const { data, error } = await client.rpc(rpc);
  assert.equal(error, null, `${rpc} gaf een fout: ${error?.message}`);
  const rij = (Array.isArray(data) ? data[0] : data) as { id?: string | null } | null | undefined;
  return rij?.id ?? null;
}

async function verifieer(
  client: SupabaseClient,
  tokenHash: string,
  type: "invite" | "magiclink",
): Promise<Session> {
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  assert.equal(error, null, `verifyOtp(${type}) faalde: ${error?.message}`);
  assert.ok(data.session, `verifyOtp(${type}) gaf geen sessie`);
  return data.session;
}

async function magicLinkHash(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  assert.equal(error, null, `generateLink(magiclink) faalde: ${error?.message}`);
  return data.properties.hashed_token;
}

// ── Scenario's ────────────────────────────────────────────────────────────

test("1. hoofdpad: uitnodiging openen via token_hash koppelt (faalde op 73edbbf)", async () => {
  const email = uniekAdres();
  const { userId, tokenHash } = await uitnodigen(email);
  const memberId = await uitgenodigdLid(email, "bardienst", userId);

  const lid = gebruiker();
  const session = await verifieer(lid, tokenHash, "invite");
  assert.ok(
    amrMethoden(session).includes("otp"),
    `amr na verifyOtp(invite) bevat geen otp: ${JSON.stringify(amrMethoden(session))}`,
  );

  assert.equal(await koppel(lid, "link_invited_member_account"), memberId);
  assert.equal(await gekoppeldAccount(memberId), userId);

  // De sessie die het bewijs leverde, blijft geldig.
  const { error } = await lid.auth.getUser(session.access_token);
  assert.equal(error, null, `de eigen sessie werkt niet meer na koppelen: ${error?.message}`);
});

test("2. portal-pad: een uitgenodigd lid koppelt via een magic link", async () => {
  const email = uniekAdres();
  const { userId } = await uitnodigen(email);
  const memberId = await uitgenodigdLid(email, "lid", userId);

  const lid = gebruiker();
  const session = await verifieer(lid, await magicLinkHash(email), "magiclink");
  assert.ok(
    amrMethoden(session).includes("otp"),
    `amr na verifyOtp(magiclink) bevat geen otp: ${JSON.stringify(amrMethoden(session))}`,
  );

  assert.equal(await koppel(lid, "link_lid_member_account"), memberId);
  assert.equal(await gekoppeldAccount(memberId), userId);
});

test("3. aanval: signup met autoconfirm koppelt niet, en verliest alles zodra het lid koppelt", async () => {
  const email = uniekAdres();
  const { userId } = await uitnodigen(email);
  const memberId = await uitgenodigdLid(email, "beheerder", userId);

  // Aanvaller: signup op het uitgenodigde adres. Lokaal staat
  // enable_confirmations = false, het slechtste geval: GoTrue bevestigt het
  // account en geeft een sessie (signup.go:228-236, :305-315).
  const aanvaller = gebruiker();
  const p1 = wachtwoord();
  const p2 = wachtwoord();
  const signUp = await aanvaller.auth.signUp({ email, password: p1 });
  assert.equal(signUp.error, null, `signUp faalde: ${signUp.error?.message}`);
  assert.ok(signUp.data.session, "signUp gaf geen sessie (verwacht met autoconfirm)");
  assert.equal(signUp.data.user?.id, userId, "signUp landde op een ander account dan het uitgenodigde");

  const update = await aanvaller.auth.updateUser({ password: p2 });
  assert.equal(update.error, null, `updateUser(password) faalde: ${update.error?.message}`);

  const { data: huidig } = await aanvaller.auth.getSession();
  const aanvallerSessie = huidig.session;
  assert.ok(aanvallerSessie, "aanvaller heeft geen sessie meer na updateUser");
  assert.ok(
    amrMethoden(aanvallerSessie).includes("password"),
    `amr van de aanvaller bevat geen password: ${JSON.stringify(amrMethoden(aanvallerSessie))}`,
  );

  assert.equal(await koppel(aanvaller, "link_invited_member_account"), null);
  assert.equal(await gekoppeldAccount(memberId), null);

  // Het lid koppelt via een magic link.
  const lid = gebruiker();
  await verifieer(lid, await magicLinkHash(email), "magiclink");
  assert.equal(await koppel(lid, "link_invited_member_account"), memberId);
  assert.equal(await gekoppeldAccount(memberId), userId);

  // Het wachtwoord van de aanvaller is gewist.
  const login = await gebruiker().auth.signInWithPassword({ email, password: p2 });
  assert.notEqual(login.error, null, "het wachtwoord van de aanvaller werkt nog na de koppeling");

  // Zijn sessie bestaat niet meer: refresh faalt.
  const refresh = await gebruiker().auth.refreshSession({
    refresh_token: aanvallerSessie.refresh_token,
  });
  assert.notEqual(refresh.error, null, "het refresh token van de aanvaller werkt nog na de koppeling");

  // En GoTrue weigert zijn access token (sessie verwijderd). Slaagt dit toch:
  // niet afzwakken, melden aan Bram (ADR 0020 → Restrisico).
  const user = await gebruiker().auth.getUser(aanvallerSessie.access_token);
  assert.notEqual(user.error, null, "GoTrue accepteert het access token van de aanvaller nog na het verwijderen van zijn sessie");
});

test("4. wachtwoordlogin koppelt nooit", async () => {
  const email = uniekAdres();
  const { userId } = await uitnodigen(email);
  const memberId = await uitgenodigdLid(email, "bardienst", userId);

  const p = wachtwoord();
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: p,
    email_confirm: true,
  });
  assert.equal(updateError, null, `updateUserById faalde: ${updateError?.message}`);

  const client = gebruiker();
  const { data, error } = await client.auth.signInWithPassword({ email, password: p });
  assert.equal(error, null, `signInWithPassword faalde: ${error?.message}`);
  assert.ok(data.session, "signInWithPassword gaf geen sessie");
  assert.ok(
    amrMethoden(data.session).includes("password"),
    `amr na wachtwoordlogin bevat geen password: ${JSON.stringify(amrMethoden(data.session))}`,
  );

  assert.equal(await koppel(client, "link_invited_member_account"), null);
  assert.equal(await gekoppeldAccount(memberId), null);
});
