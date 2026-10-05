import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";

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
 *
 * Herziening 2 (ADR 0020 → Beslissing 8): scenario 1 bewijst dat een gewone
 * wachtwoordsessie een `auth.sessions`-rij met het `session_id` uit het
 * token heeft (register_bar_session slaagt), scenario 3 dat het overgebleven
 * token van de aanvaller geen bar-sessie registreert en geen PIN zet.
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

/** Een client die alleen een vast access token meestuurt: geen eigen
 *  sessie, dus supabase-js ververst niets stil. Zo roept de aanvaller met
 *  zijn overgebleven token PostgREST aan. */
function metToken(accessToken: string): SupabaseClient {
  return createClient(env.url, env.publishableKey, {
    ...clientOpties,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// ── Opruimen ──────────────────────────────────────────────────────────────

const aangemaakteLeden: string[] = [];
const aangemaakteAccounts: string[] = [];

after(async () => {
  // Eerst de bar-sessies: bar_sessions.member_id verwijst zonder `on delete`
  // naar members (scenario 1 registreert er een).
  if (aangemaakteLeden.length > 0) {
    const { error } = await admin.from("bar_sessions").delete().in("member_id", aangemaakteLeden);
    if (error) console.error("opruimen bar_sessions:", error.message);
  }
  // Dan de leden: members.auth_user_id verwijst zonder `on delete` naar
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

type TokenClaims = {
  amr?: Array<{ method?: string } | string>;
  session_id?: string;
  aal?: string;
};

/** De claims uit het ondertekende access token (niet geverifieerd: alleen
 *  om te lezen wat GoTrue uitgaf). */
function tokenClaims(session: Session): TokenClaims {
  const payload = session.access_token.split(".")[1];
  assert.ok(payload, "access token heeft geen payload");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
}

/** De `amr`-methoden uit het ondertekende access token. GoTrue zet ze als
 *  `[{method, timestamp}]`; de RFC 8176-vorm (`string[]`) wordt ook gelezen,
 *  zodat een afwijkende vorm hier zichtbaar wordt in plaats van te crashen. */
function amrMethoden(session: Session): string[] {
  return (tokenClaims(session).amr ?? []).map((e) => (typeof e === "string" ? e : (e.method ?? "")));
}

function sessieId(session: Session): string {
  const id = tokenClaims(session).session_id;
  assert.ok(id, "access token heeft geen session_id-claim");
  return id;
}

/** RFC 4648 base32 (zonder padding), zoals GoTrue het TOTP-geheim geeft. */
function base32Decode(invoer: string): Buffer {
  const alfabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let waarde = 0;
  const uit: number[] = [];
  for (const teken of invoer.replace(/=+$/, "").toUpperCase()) {
    const index = alfabet.indexOf(teken);
    assert.ok(index >= 0, `ongeldig base32-teken in TOTP-geheim: ${teken}`);
    waarde = (waarde << 5) | index;
    bits += 5;
    if (bits >= 8) {
      uit.push((waarde >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(uit);
}

/** TOTP volgens RFC 6238: HMAC-SHA1, stap 30 s, 6 cijfers. */
function totpCode(geheim: string, nu: number = Date.now()): string {
  const teller = Buffer.alloc(8);
  teller.writeBigUInt64BE(BigInt(Math.floor(nu / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(geheim)).update(teller).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const getal = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return getal.toString().padStart(6, "0");
}

/** Bar-sessies van een lid, via service-role. */
async function barSessiesVan(memberId: string): Promise<Array<{ auth_session_id: string }>> {
  const { data, error } = await admin
    .from("bar_sessions")
    .select("auth_session_id")
    .eq("member_id", memberId);
  assert.equal(error, null, `bar_sessions lezen faalde: ${error?.message}`);
  return (data ?? []) as Array<{ auth_session_id: string }>;
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

  // Herziening 2: het lid zet na het koppelen zelf een wachtwoord (het
  // GoTrue-tijdelijke is gewist) ...
  const p = wachtwoord();
  const update = await lid.auth.updateUser({ password: p });
  assert.equal(update.error, null, `updateUser(password) na koppelen faalde: ${update.error?.message}`);

  // ... logt daarmee in, en die gewone wachtwoordsessie registreert een
  // bar-sessie: ze heeft een auth.sessions-rij met het session_id uit het
  // token (ADR 0020 → Beslissing 8 blokkeert het normale pad niet).
  const bar = gebruiker();
  const login = await bar.auth.signInWithPassword({ email, password: p });
  assert.equal(login.error, null, `signInWithPassword na koppelen faalde: ${login.error?.message}`);
  assert.ok(login.data.session, "signInWithPassword gaf geen sessie");
  assert.ok(
    amrMethoden(login.data.session).includes("password"),
    `amr na wachtwoordlogin bevat geen password: ${JSON.stringify(amrMethoden(login.data.session))}`,
  );

  const registratie = await bar.rpc("register_bar_session", { p_mode: "bar" });
  assert.equal(
    registratie.error,
    null,
    `register_bar_session met een gewone wachtwoordsessie faalde: ${registratie.error?.message}`,
  );
  const sessies = await barSessiesVan(memberId);
  assert.deepEqual(
    sessies.map((s) => s.auth_session_id),
    [sessieId(login.data.session)],
    "er is geen bar_sessions-rij met auth_session_id = de session_id-claim van de wachtwoordsessie",
  );
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

  const { data: naUpdate } = await aanvaller.auth.getSession();
  assert.ok(naUpdate.session, "aanvaller heeft geen sessie meer na updateUser");
  const aal1SessieId = sessieId(naUpdate.session);

  // Herziening 2: de aanvaller zet ook een eigen TOTP-factor en hoogt zijn
  // sessie op naar aal2.
  const enroll = await aanvaller.auth.mfa.enroll({ factorType: "totp" });
  assert.equal(enroll.error, null, `mfa.enroll faalde: ${enroll.error?.message}`);
  assert.ok(enroll.data && enroll.data.type === "totp", "mfa.enroll gaf geen TOTP-factor");
  const factorId = enroll.data.id;
  const challenge = await aanvaller.auth.mfa.challenge({ factorId });
  assert.equal(challenge.error, null, `mfa.challenge faalde: ${challenge.error?.message}`);
  assert.ok(challenge.data, "mfa.challenge gaf geen challenge");
  const verify = await aanvaller.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: totpCode(enroll.data.totp.secret),
  });
  assert.equal(verify.error, null, `mfa.verify faalde: ${verify.error?.message}`);

  const { data: huidig } = await aanvaller.auth.getSession();
  const aanvallerSessie = huidig.session;
  assert.ok(aanvallerSessie, "aanvaller heeft geen sessie meer na mfa.verify");
  assert.equal(tokenClaims(aanvallerSessie).aal, "aal2", "het token van de aanvaller is na mfa.verify geen aal2");
  assert.equal(sessieId(aanvallerSessie), aal1SessieId, "mfa.verify gaf een ander session_id");
  assert.ok(
    amrMethoden(aanvallerSessie).includes("password"),
    `amr van de aanvaller bevat geen password: ${JSON.stringify(amrMethoden(aanvallerSessie))}`,
  );

  const factorenVoor = await admin.auth.admin.mfa.listFactors({ userId });
  assert.equal(factorenVoor.error, null, `listFactors faalde: ${factorenVoor.error?.message}`);
  assert.deepEqual(
    (factorenVoor.data?.factors ?? []).map((f) => [f.factor_type, f.status]),
    [["totp", "verified"]],
    "vóór de koppeling heeft het account niet precies één geverifieerde TOTP-factor",
  );

  assert.equal(await koppel(aanvaller, "link_invited_member_account"), null);
  assert.equal(await gekoppeldAccount(memberId), null);

  // Het lid koppelt via een magic link.
  const lid = gebruiker();
  await verifieer(lid, await magicLinkHash(email), "magiclink");
  assert.equal(await koppel(lid, "link_invited_member_account"), memberId);
  assert.equal(await gekoppeldAccount(memberId), userId);

  // Zijn TOTP-factor is weg.
  const factorenNa = await admin.auth.admin.mfa.listFactors({ userId });
  assert.equal(factorenNa.error, null, `listFactors faalde: ${factorenNa.error?.message}`);
  assert.deepEqual(factorenNa.data?.factors ?? [], [], "de factor van de aanvaller bestaat nog na de koppeling");

  // Herziening 2: met het overgebleven (aal2-)access token geen bar-sessie
  // en geen PIN (ADR 0020 → Beslissing 8). Slaagt een van deze RPC's toch:
  // niet afzwakken, melden.
  const oudToken = metToken(aanvallerSessie.access_token);
  for (const mode of ["bar", "beheer"] as const) {
    const { error } = await oudToken.rpc("register_bar_session", { p_mode: mode });
    assert.equal(
      error?.message,
      "session_ended",
      `register_bar_session('${mode}') met het token van de verwijderde sessie gaf geen session_ended`,
    );
  }
  const pin = await oudToken.rpc("set_own_pin", { p_pin: "1234" });
  assert.equal(
    pin.error?.message,
    "actor_not_found",
    "set_own_pin met het token van de verwijderde sessie gaf geen actor_not_found",
  );
  assert.deepEqual(await barSessiesVan(memberId), [], "er is een bar-sessie voor het lid aangemaakt");
  const pinRij = await admin.from("members").select("pin_hash").eq("id", memberId).single();
  assert.equal(pinRij.error, null, `pin_hash lezen faalde: ${pinRij.error?.message}`);
  assert.equal((pinRij.data as { pin_hash: string | null }).pin_hash, null, "het lid heeft een PIN gekregen");

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
