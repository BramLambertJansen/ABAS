import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { fakeBarLogin, resetFakeBarLogin } from "./fakes/barLoginState.ts";

/**
 * De server-only loginflow van de bar (src/lib/barLogin.ts, docs/features/
 * dienst-per-sessie.md → Inloggen op de bar; ADR 0016 → Beslissing 6 en 7):
 * de sessie wordt server-side aangemaakt en geregistreerd, het apparaat
 * wordt met een eigen cookie vertrouwd, en een mislukking laat nooit een
 * niet-geregistreerde sessie achter. De Supabase-clients en `next/headers`
 * zijn nep-modules (test/fakes/bar-login-resolve.mjs); de databasekant
 * (verify_bar_pin, lockout, ...) is bewezen in supabase/tests/.
 */
register("./fakes/bar-login-resolve.mjs", import.meta.url);

const {
  isUuid,
  leesLoginOpties,
  leesNamenlijst,
  loginMetPin,
  loginMetWachtwoord,
  stuurHerstellink,
} = await import("../src/lib/barLogin.ts");
const { hashApparaatToken, APPARAAT_COOKIE_NAAM } = await import("../src/lib/apparaat.ts");

const MEMBER = "11111111-1111-4111-8111-111111111111";
const SESSIE_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const OUD_TOKEN = "a".repeat(43);
const IP = "203.0.113.7";

function jwt(payload: unknown): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

function stubConsole<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = original;
  });
}

beforeEach(() => {
  resetFakeBarLogin();
  const state = fakeBarLogin();
  state.signIn.accessToken = jwt({ session_id: SESSIE_ID });
  state.otp.accessToken = jwt({ session_id: SESSIE_ID });
  state.rpc.record_bar_password_login = () => ({ data: DEVICE });
  state.rpc.register_bar_session_server = () => ({ data: null });
  state.rpc.verify_bar_pin = () => ({
    data: [{ result_code: "ok", member_auth_user_id: "u1", trusted_device_id: DEVICE, attempts_left: null }],
  });
  // De eigen limiet (0035): standaard is er nog ruimte.
  state.rpc.login_throttle_allowed = () => ({ data: true });
});

const isThrottle = (fn: string) => fn.startsWith("login_throttle_");
/** De databaseaanroepen van de loginflow zelf, zonder de limiet. */
const eigen = () => fakeBarLogin().rpcCalls.filter((c) => !isThrottle(c.fn));
const aanroepen = () => eigen().map((c) => c.fn);
/** Alleen de aanroepen van de limiet: `functie:bucket:sleutel`. */
const limiet = () =>
  fakeBarLogin()
    .rpcCalls.filter((c) => isThrottle(c.fn))
    .map((c) => `${c.fn.replace("login_throttle_", "")}:${c.args.p_bucket}:${c.args.p_key}`);
/** Laat `login_throttle_allowed` voor één bucket "vol" antwoorden. */
function vol(bucket: string) {
  fakeBarLogin().rpc.login_throttle_allowed = (args) => ({ data: args.p_bucket !== bucket });
}

// ── Namenlijst ───────────────────────────────────────────────────────────

test("de namenlijst geeft alleen id en naam, nooit de rol (ADR 0017)", async () => {
  fakeBarLogin().namen = [
    { id: "a", name: "Anna", role: "bardienst" },
    { id: "b", name: "Bram", role: "beheerder" },
  ];
  const namen = await leesNamenlijst();
  assert.deepEqual(namen, [
    { id: "a", name: "Anna" },
    { id: "b", name: "Bram" },
  ]);
  for (const naam of namen) assert.equal("role" in naam, false);
});

test("isUuid accepteert alleen een uuid", () => {
  assert.equal(isUuid(MEMBER), true);
  for (const waarde of ["", "x", 5, null, undefined, MEMBER + "x", "11111111-1111-4111-8111-11111111111"]) {
    assert.equal(isUuid(waarde), false);
  }
});

// ── Inlogopties ──────────────────────────────────────────────────────────

test("zonder apparaatcookie is het altijd alleen wachtwoord, en de database wordt niet eens gevraagd", async () => {
  assert.deepEqual(await leesLoginOpties(MEMBER), { pinAvailable: false, pinLocked: false, pinNeedsMfa: false });
  assert.deepEqual(aanroepen(), []);
});

test("met apparaatcookie: de database beslist, met de hash en niet het token", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  fakeBarLogin().rpc.bar_login_options = () => ({
    data: [{ pin_available: true, pin_locked: false, pin_needs_mfa: false }],
  });
  assert.deepEqual(await leesLoginOpties(MEMBER), { pinAvailable: true, pinLocked: false, pinNeedsMfa: false });
  const call = eigen()[0];
  assert.equal(call.fn, "bar_login_options");
  assert.equal(call.args.p_device_token_hash, await hashApparaatToken(OUD_TOKEN));
  assert.notEqual(call.args.p_device_token_hash, OUD_TOKEN);
});

test("een geblokkeerde PIN komt als vlag terug", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  fakeBarLogin().rpc.bar_login_options = () => ({
    data: [{ pin_available: false, pin_locked: true, pin_needs_mfa: false }],
  });
  assert.deepEqual(await leesLoginOpties(MEMBER), { pinAvailable: false, pinLocked: true, pinNeedsMfa: false });
});

test("een beheerder zonder tweede factor: pin_needs_mfa komt als vlag terug (ADR 0017)", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  fakeBarLogin().rpc.bar_login_options = () => ({
    data: [{ pin_available: false, pin_locked: false, pin_needs_mfa: true }],
  });
  assert.deepEqual(await leesLoginOpties(MEMBER), { pinAvailable: false, pinLocked: false, pinNeedsMfa: true });
});

test("een cookie dat niet van ons formaat is, telt als geen cookie", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, "geknoei");
  assert.deepEqual(await leesLoginOpties(MEMBER), { pinAvailable: false, pinLocked: false, pinNeedsMfa: false });
  assert.deepEqual(aanroepen(), []);
});

// ── Wachtwoordlogin ──────────────────────────────────────────────────────

test("wachtwoordlogin: sessie, apparaat vertrouwd, sessie geregistreerd, cookie gezet", async () => {
  const result = await loginMetWachtwoord(MEMBER, "geheim", IP);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(fakeBarLogin().signInCalls, [{ email: "tom@example.nl", password: "geheim" }]);
  assert.deepEqual(aanroepen(), ["record_bar_password_login", "register_bar_session_server"]);

  const registratie = eigen()[1];
  assert.deepEqual(registratie.args, {
    p_auth_session_id: SESSIE_ID,
    p_member_id: MEMBER,
    p_device_id: DEVICE,
  });

  const cookie = fakeBarLogin().cookieSets.at(-1);
  assert.equal(cookie?.name, APPARAAT_COOKIE_NAAM);
  assert.match(String(cookie?.value), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(cookie?.options.httpOnly, true);
  assert.equal(cookie?.options.sameSite, "strict");
  // De database kreeg de hash van het uitgegeven token, nooit het token zelf.
  assert.equal(
    eigen()[0].args.p_device_token_hash,
    await hashApparaatToken(String(cookie?.value))
  );
  assert.deepEqual(fakeBarLogin().signOuts, []);
});

test("een bestaand apparaatcookie wordt hergebruikt en ververst", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  assert.deepEqual(await loginMetWachtwoord(MEMBER, "geheim", IP), { ok: true });
  assert.equal(eigen()[0].args.p_device_token_hash, await hashApparaatToken(OUD_TOKEN));
  assert.equal(fakeBarLogin().cookieSets.at(-1)?.value, OUD_TOKEN);
});

test("een ingetrokken apparaat (afgemeld) krijgt een nieuw cookie", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  let aantal = 0;
  fakeBarLogin().rpc.record_bar_password_login = () => ({ data: aantal++ === 0 ? null : DEVICE });
  assert.deepEqual(await loginMetWachtwoord(MEMBER, "geheim", IP), { ok: true });
  const hashes = eigen().filter((c) => c.fn === "record_bar_password_login");
  assert.equal(hashes.length, 2);
  assert.notEqual(hashes[0].args.p_device_token_hash, hashes[1].args.p_device_token_hash);
  assert.notEqual(fakeBarLogin().cookieSets.at(-1)?.value, OUD_TOKEN);
});

test("een fout wachtwoord: invalid_credentials, geen apparaat, geen registratie, geen cookie", async () => {
  fakeBarLogin().signIn.error = { message: "Invalid login credentials", code: "invalid_credentials", status: 400 };
  assert.deepEqual(await stubConsole(() => loginMetWachtwoord(MEMBER, "fout", IP)), {
    ok: false,
    code: "invalid_credentials",
  });
  assert.deepEqual(aanroepen(), []);
  assert.deepEqual(fakeBarLogin().cookieSets, []);
});

test("te veel pogingen bij Supabase Auth: rate_limited", async () => {
  fakeBarLogin().signIn.error = { message: "Request rate limit reached", status: 429 };
  assert.deepEqual(await stubConsole(() => loginMetWachtwoord(MEMBER, "x", IP)), {
    ok: false,
    code: "rate_limited",
  });
});

test("een andere Auth-fout: unknown", async () => {
  fakeBarLogin().signIn.error = { message: "kapot", status: 500 };
  assert.deepEqual(await stubConsole(() => loginMetWachtwoord(MEMBER, "x", IP)), {
    ok: false,
    code: "unknown",
  });
});

test("een gearchiveerd lid, of zonder bar-rol: not_allowed, en er wordt niet ingelogd", async () => {
  for (const member of [
    { id: MEMBER, role: "bardienst", archived: true, auth_user_id: "u1" },
    { id: MEMBER, role: "lid", archived: false, auth_user_id: "u1" },
    null,
  ]) {
    fakeBarLogin().member = member;
    assert.deepEqual(await loginMetWachtwoord(MEMBER, "x", IP), { ok: false, code: "not_allowed" });
  }
  assert.deepEqual(fakeBarLogin().signInCalls, []);
});

test("een lid zonder account: no_account", async () => {
  fakeBarLogin().member = { id: MEMBER, role: "bardienst", archived: false, auth_user_id: null };
  assert.deepEqual(await loginMetWachtwoord(MEMBER, "x", IP), { ok: false, code: "no_account" });
  assert.deepEqual(fakeBarLogin().signInCalls, []);
});

test("mislukt registreren laat geen sessie achter: alleen deze sessie wordt lokaal gesloten", async () => {
  fakeBarLogin().rpc.register_bar_session_server = () => ({ error: { message: "kapot" } });
  assert.deepEqual(await stubConsole(() => loginMetWachtwoord(MEMBER, "geheim", IP)), {
    ok: false,
    code: "unknown",
  });
  assert.deepEqual(fakeBarLogin().signOuts, [{ scope: "local" }]);
  assert.deepEqual(fakeBarLogin().cookieSets, []);
});

test("registreren geweigerd omdat het lid intussen niet meer mag: not_allowed en sessie gesloten", async () => {
  fakeBarLogin().rpc.register_bar_session_server = () => ({ error: { message: "not_allowed" } });
  assert.deepEqual(await loginMetWachtwoord(MEMBER, "geheim", IP), { ok: false, code: "not_allowed" });
  assert.deepEqual(fakeBarLogin().signOuts, [{ scope: "local" }]);
});

test("een access token zonder session_id kan niet geregistreerd worden: unknown en sessie gesloten", async () => {
  fakeBarLogin().signIn.accessToken = jwt({ sub: "u1" });
  assert.deepEqual(await stubConsole(() => loginMetWachtwoord(MEMBER, "geheim", IP)), {
    ok: false,
    code: "unknown",
  });
  assert.equal(aanroepen().includes("register_bar_session_server"), false);
  assert.deepEqual(fakeBarLogin().signOuts, [{ scope: "local" }]);
});

test("het apparaat kan niet vertrouwd worden: unknown en sessie gesloten", async () => {
  fakeBarLogin().rpc.record_bar_password_login = () => ({ error: { message: "kapot" } });
  assert.deepEqual(await stubConsole(() => loginMetWachtwoord(MEMBER, "geheim", IP)), {
    ok: false,
    code: "unknown",
  });
  assert.deepEqual(fakeBarLogin().signOuts, [{ scope: "local" }]);
});

// ── PIN-login ────────────────────────────────────────────────────────────

test("PIN-login zonder apparaatcookie: pin_not_available, zonder de database te vragen", async () => {
  assert.deepEqual(await loginMetPin(MEMBER, "1234", IP), { ok: false, code: "pin_not_available" });
  assert.deepEqual(aanroepen(), []);
});

test("PIN-login: verify_bar_pin, sessie zonder wachtwoord, registreren, cookie ververst", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  assert.deepEqual(await loginMetPin(MEMBER, "1234", IP), { ok: true });
  assert.deepEqual(aanroepen(), ["verify_bar_pin", "register_bar_session_server"]);
  assert.deepEqual(eigen()[0].args, {
    p_device_token_hash: await hashApparaatToken(OUD_TOKEN),
    p_member_id: MEMBER,
    p_pin: "1234",
  });
  assert.deepEqual(eigen()[1].args, {
    p_auth_session_id: SESSIE_ID,
    p_member_id: MEMBER,
    p_device_id: DEVICE,
  });
  assert.equal(fakeBarLogin().cookieSets.at(-1)?.value, OUD_TOKEN);
  // Geen wachtwoord nodig: er is geen signInWithPassword.
  assert.deepEqual(fakeBarLogin().signInCalls, []);
});

for (const [resultCode, verwacht] of [
  ["not_allowed", "not_allowed"],
  ["no_account", "no_account"],
  ["pin_not_available", "pin_not_available"],
  ["pin_locked", "pin_locked"],
  ["pin_needs_mfa", "pin_needs_mfa"],
  ["iets_nieuws", "unknown"],
] as const) {
  test(`PIN-login: verify_bar_pin ${resultCode} → ${verwacht}, geen sessie, geen cookie`, async () => {
    fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
    fakeBarLogin().rpc.verify_bar_pin = () => ({ data: [{ result_code: resultCode }] });
    const result = await loginMetPin(MEMBER, "1234", IP);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, verwacht);
    assert.deepEqual(aanroepen(), ["verify_bar_pin"]);
    assert.deepEqual(fakeBarLogin().cookieSets, []);
  });
}

test("PIN-login: een foute PIN geeft de resterende pogingen mee", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  fakeBarLogin().rpc.verify_bar_pin = () => ({ data: [{ result_code: "invalid_pin", attempts_left: 3 }] });
  assert.deepEqual(await loginMetPin(MEMBER, "0000", IP), { ok: false, code: "invalid_pin", attemptsLeft: 3 });
  assert.deepEqual(aanroepen(), ["verify_bar_pin"]);
});

test("PIN-login: een PIN die geen vier cijfers is, gaat niet naar de database (en telt niet mee)", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  for (const pin of ["", "123", "12345", "abcd", "12 4"]) {
    assert.deepEqual(await loginMetPin(MEMBER, pin, IP), { ok: false, code: "invalid_pin" });
  }
  assert.deepEqual(aanroepen(), []);
});

test("PIN-login: mislukt sessie aanmaken of registreren sluit de nieuwe sessie lokaal", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  fakeBarLogin().otp.error = { message: "kapot" };
  assert.deepEqual(await stubConsole(() => loginMetPin(MEMBER, "1234", IP)), { ok: false, code: "unknown" });
  assert.deepEqual(fakeBarLogin().signOuts, [{ scope: "local" }]);
  assert.deepEqual(fakeBarLogin().cookieSets, []);

  resetFakeBarLogin();
  const state = fakeBarLogin();
  state.cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  state.otp.accessToken = jwt({ session_id: SESSIE_ID });
  state.rpc.login_throttle_allowed = () => ({ data: true });
  state.rpc.verify_bar_pin = () => ({
    data: [{ result_code: "ok", member_auth_user_id: "u1", trusted_device_id: DEVICE }],
  });
  state.rpc.register_bar_session_server = () => ({ error: { message: "kapot" } });
  assert.deepEqual(await stubConsole(() => loginMetPin(MEMBER, "1234", IP)), { ok: false, code: "unknown" });
  assert.deepEqual(state.signOuts, [{ scope: "local" }]);
});

test("PIN-login zonder magic-link-token: unknown, geen registratie", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  fakeBarLogin().link.token = null;
  assert.deepEqual(await stubConsole(() => loginMetPin(MEMBER, "1234", IP)), { ok: false, code: "unknown" });
  assert.equal(aanroepen().includes("register_bar_session_server"), false);
});

// ── Wachtwoord vergeten ──────────────────────────────────────────────────

test("wachtwoord vergeten stuurt de herstelflow naar het adres van het lid", async () => {
  await stuurHerstellink(MEMBER, "https://bar.example.nl", IP);
  assert.deepEqual(fakeBarLogin().resets, [
    { email: "tom@example.nl", redirectTo: "https://bar.example.nl/beheer/wachtwoord-herstellen" },
  ]);
});

test("wachtwoord vergeten is neutraal: geen mail voor een lid zonder account, een gearchiveerd lid of zonder adres, en het gooit niet", async () => {
  for (const member of [
    { id: MEMBER, role: "bardienst", archived: false, auth_user_id: null },
    { id: MEMBER, role: "bardienst", archived: true, auth_user_id: "u1" },
    null,
  ]) {
    fakeBarLogin().member = member;
    await stuurHerstellink(MEMBER, "https://bar.example.nl", IP);
  }
  fakeBarLogin().member = { id: MEMBER, role: "bardienst", archived: false, auth_user_id: "u1" };
  fakeBarLogin().email = null;
  await stuurHerstellink(MEMBER, "https://bar.example.nl", IP);
  assert.deepEqual(fakeBarLogin().resets, []);
});

// ── Eigen limiet (docs/features/login-rate-limit.md, ADR 0017) ───────────

test("wachtwoordlogin: eerst wachtwoord_ip en wachtwoord_lid, met het IP en het lid als sleutel", async () => {
  assert.deepEqual(await loginMetWachtwoord(MEMBER, "geheim", IP), { ok: true });
  assert.deepEqual(limiet(), [`allowed:wachtwoord_ip:${IP}`, `allowed:wachtwoord_lid:${MEMBER}`]);
});

for (const bucket of ["wachtwoord_ip", "wachtwoord_lid"]) {
  test(`wachtwoordlogin: ${bucket} vol → rate_limited, zonder Supabase Auth of database`, async () => {
    vol(bucket);
    assert.deepEqual(await loginMetWachtwoord(MEMBER, "geheim", IP), { ok: false, code: "rate_limited" });
    assert.deepEqual(fakeBarLogin().signInCalls, []);
    assert.deepEqual(aanroepen(), []);
    assert.equal(limiet().some((c) => c.startsWith("record:")), false);
  });
}

test("wachtwoordlogin: een fout wachtwoord telt in wachtwoord_ip en wachtwoord_lid", async () => {
  fakeBarLogin().signIn.error = { message: "Invalid login credentials", code: "invalid_credentials", status: 400 };
  await loginMetWachtwoord(MEMBER, "fout", IP);
  assert.deepEqual(limiet().filter((c) => c.startsWith("record:")), [
    `record:wachtwoord_ip:${IP}`,
    `record:wachtwoord_lid:${MEMBER}`,
  ]);
});

test("wachtwoordlogin: een geslaagde login of een andere fout telt niet", async () => {
  await loginMetWachtwoord(MEMBER, "geheim", IP);
  fakeBarLogin().signIn.error = { message: "Request rate limit reached", status: 429 };
  await stubConsole(() => loginMetWachtwoord(MEMBER, "x", IP));
  fakeBarLogin().signIn.error = { message: "kapot", status: 500 };
  await stubConsole(() => loginMetWachtwoord(MEMBER, "x", IP));
  assert.equal(limiet().some((c) => c.startsWith("record:")), false);
});

test("wachtwoordlogin: kan de limiet niet gelezen worden, dan geen login (gooit)", async () => {
  fakeBarLogin().rpc.login_throttle_allowed = () => ({ error: { message: "kapot" } });
  await assert.rejects(() => loginMetWachtwoord(MEMBER, "geheim", IP));
  assert.deepEqual(fakeBarLogin().signInCalls, []);
});

test("PIN-login: pin_ip vol → rate_limited, zonder verify_bar_pin", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  vol("pin_ip");
  assert.deepEqual(await loginMetPin(MEMBER, "1234", IP), { ok: false, code: "rate_limited" });
  assert.deepEqual(aanroepen(), []);
  assert.deepEqual(limiet(), [`allowed:pin_ip:${IP}`]);
});

test("PIN-login: alleen invalid_pin telt in pin_ip", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  fakeBarLogin().rpc.verify_bar_pin = () => ({ data: [{ result_code: "invalid_pin", attempts_left: 3 }] });
  await loginMetPin(MEMBER, "0000", IP);
  assert.deepEqual(limiet(), [`allowed:pin_ip:${IP}`, `record:pin_ip:${IP}`]);

  for (const code of ["pin_locked", "pin_not_available", "pin_needs_mfa"]) {
    resetFakeBarLogin();
    fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
    fakeBarLogin().rpc.login_throttle_allowed = () => ({ data: true });
    fakeBarLogin().rpc.verify_bar_pin = () => ({ data: [{ result_code: code }] });
    await loginMetPin(MEMBER, "0000", IP);
    assert.deepEqual(limiet(), [`allowed:pin_ip:${IP}`], code);
  }
});

test("PIN-login: een geslaagde login telt niet, en zonder apparaatcookie wordt de limiet niet gevraagd", async () => {
  await loginMetPin(MEMBER, "1234", IP);
  assert.deepEqual(limiet(), []);
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  assert.deepEqual(await loginMetPin(MEMBER, "1234", IP), { ok: true });
  assert.deepEqual(limiet(), [`allowed:pin_ip:${IP}`]);
});

test("wachtwoord vergeten: drie buckets gecontroleerd en geteld, dan de mail", async () => {
  assert.deepEqual(await stuurHerstellink(MEMBER, "https://bar.example.nl", IP), { ok: true, limited: false });
  assert.deepEqual(limiet(), [
    `allowed:vergeten_lid:${MEMBER}`,
    `allowed:vergeten_ip:${IP}`,
    "allowed:vergeten_totaal:*",
    `record:vergeten_lid:${MEMBER}`,
    `record:vergeten_ip:${IP}`,
    "record:vergeten_totaal:*",
  ]);
  assert.equal(fakeBarLogin().resets.length, 1);
});

for (const bucket of ["vergeten_lid", "vergeten_ip", "vergeten_totaal"]) {
  test(`wachtwoord vergeten: ${bucket} vol → geen mail, limited`, async () => {
    vol(bucket);
    assert.deepEqual(await stuurHerstellink(MEMBER, "https://bar.example.nl", IP), { ok: true, limited: true });
    assert.deepEqual(fakeBarLogin().resets, []);
    assert.equal(limiet().some((c) => c.startsWith("record:")), false);
  });
}

test("wachtwoord vergeten: ook een lid zonder account telt als aanvraag (de teller gaat over aanvragen)", async () => {
  fakeBarLogin().member = { id: MEMBER, role: "bardienst", archived: false, auth_user_id: null };
  assert.deepEqual(await stuurHerstellink(MEMBER, "https://bar.example.nl", IP), { ok: true, limited: false });
  assert.equal(limiet().filter((c) => c.startsWith("record:")).length, 3);
  assert.deepEqual(fakeBarLogin().resets, []);
});

// ── Aanvullend (Tester, ADR 0017): neutraal, telling en fouten van de limiet ─

test("wachtwoord vergeten: het antwoord is voor elk lid hetzelfde, ook als de mail of de limiet faalt", async () => {
  const neutraal = { ok: true, limited: false };
  const uitkomsten: unknown[] = [];
  for (const member of [
    { id: MEMBER, role: "bardienst", archived: false, auth_user_id: "u1" },
    { id: MEMBER, role: "bardienst", archived: false, auth_user_id: null },
    { id: MEMBER, role: "bardienst", archived: true, auth_user_id: "u1" },
    { id: MEMBER, role: "lid", archived: false, auth_user_id: "u1" },
    null,
  ]) {
    resetFakeBarLogin();
    fakeBarLogin().rpc.login_throttle_allowed = () => ({ data: true });
    fakeBarLogin().member = member;
    uitkomsten.push(await stuurHerstellink(MEMBER, "https://bar.example.nl", IP));
  }
  // De limiet kan niet gelezen worden: geen mail, geen throw, zelfde antwoord.
  resetFakeBarLogin();
  fakeBarLogin().rpc.login_throttle_allowed = () => ({ error: { message: "kapot" } });
  uitkomsten.push(await stubConsole(() => stuurHerstellink(MEMBER, "https://bar.example.nl", IP)));
  assert.deepEqual(fakeBarLogin().resets, []);
  for (const uitkomst of uitkomsten) assert.deepEqual(uitkomst, neutraal);
});

test("PIN-login: kan pin_ip niet gelezen worden, dan geen poging op de PIN (gooit)", async () => {
  fakeBarLogin().cookies.set(APPARAAT_COOKIE_NAAM, OUD_TOKEN);
  fakeBarLogin().rpc.login_throttle_allowed = () => ({ error: { message: "kapot" } });
  await assert.rejects(() => loginMetPin(MEMBER, "1234", IP));
  assert.deepEqual(aanroepen(), []);
  assert.deepEqual(fakeBarLogin().cookieSets, []);
});

test("wachtwoordlogin: not_allowed en no_account tellen niet mee in de limiet", async () => {
  for (const member of [
    { id: MEMBER, role: "lid", archived: false, auth_user_id: "u1" },
    { id: MEMBER, role: "bardienst", archived: false, auth_user_id: null },
  ]) {
    fakeBarLogin().member = member;
    await loginMetWachtwoord(MEMBER, "x", IP);
  }
  assert.equal(limiet().some((c) => c.startsWith("record:")), false);
});

test("wachtwoordlogin: een lege limietsleutel wordt niet gebruikt (het IP komt altijd mee)", async () => {
  fakeBarLogin().signIn.error = { code: "invalid_credentials", message: "Invalid login credentials", status: 400 };
  await loginMetWachtwoord(MEMBER, "fout", IP);
  for (const c of fakeBarLogin().rpcCalls.filter((c) => isThrottle(c.fn))) {
    assert.equal(typeof c.args.p_key, "string");
    assert.notEqual(c.args.p_key, "");
  }
});

// BUG (gemeld, niet opgelost): isUuid accepteert hoofdletters, en de
// per-lid-sleutels (`wachtwoord_lid`, `vergeten_lid`) zijn het ruwe memberId.
// Dezelfde uuid in andere hoofdletters is voor de database hetzelfde lid,
// maar een andere limietsleutel: zo omzeil je de rem per lid. `todo`: deze
// test draait en toont de fout, maar maakt de suite niet rood.
test(
  "de sleutel per lid is dezelfde voor een memberId in hoofdletters (wachtwoord_lid, vergeten_lid)",
  { todo: "BUG: sleutel per lid is hoofdlettergevoelig, limiet per lid te omzeilen" },
  async () => {
    const klein = "abcdef12-3456-4789-8abc-def012345678";
    const hoofdletters = klein.toUpperCase();
    assert.ok(isUuid(hoofdletters), "stap: de route laat een uuid in hoofdletters door");
    await loginMetWachtwoord(hoofdletters, "geheim", IP);
    await stuurHerstellink(hoofdletters, "https://bar.example.nl", IP);
    const sleutels = limiet()
      .filter((c) => c.includes("_lid:"))
      .map((c) => c.split(":").slice(2).join(":"));
    assert.equal(sleutels.length, 3);
    for (const sleutel of sleutels) assert.equal(sleutel, klein);
  }
);
