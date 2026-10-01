import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRateLimitedMessage } from "@/lib/authErrors";
import {
  APPARAAT_COOKIE_NAAM,
  apparaatCookieOpties,
  hashApparaatToken,
  isGeldigApparaatToken,
  nieuwApparaatToken,
  sessionIdUitAccessToken,
} from "@/lib/apparaat";
import {
  pinResultaatNaarFout,
  type BarLoginOpties,
  type BarNaam,
  type PinLoginResultaat,
  type VergetenResultaat,
  type WachtwoordLoginResultaat,
} from "@/lib/barLoginTypes";

/**
 * De server-only loginflow van de bar (docs/features/dienst-per-sessie.md →
 * Inloggen op de bar, ADR 0016 → Beslissing 6): namenlijst, inlogopties,
 * wachtwoordlogin, PIN-login en wachtwoord vergeten. Uitsluitend aangeroepen
 * vanuit de Route Handlers onder src/app/(bar)/inloggen/, nooit vanuit een
 * `"use client"`-bestand: dit importeert de service-role-client
 * (src/lib/supabase/admin.ts, ADR 0006), die RLS omzeilt.
 *
 * Nieuw ten opzichte van ADR 0006: de aanroeper heeft nog geen sessie. De
 * databasekant loopt daarom via functies die alleen voor `service_role`
 * uitvoerbaar zijn (verify_bar_pin, record_bar_password_login,
 * register_bar_session_server, bar_login_options; 0028), en de sessie wordt
 * hier server-side aangemaakt (`@supabase/ssr`, de cookies gaan mee met de
 * response) en geregistreerd vóór de browser de tokens krijgt.
 *
 * Elke `.from()/.rpc()/.auth.admin.*`-aanroep leeft hier, onder src/lib/: de
 * routes zelf doen dat niet (check:policy).
 *
 * Sinds ADR 0017 heeft de login een eigen limiet vóór Supabase Auth
 * (docs/features/login-rate-limit.md): per IP-adres van de gebruiker (de
 * route geeft het door, `clientIp`) en per lid, via de service_role-functies
 * `login_throttle_reserve`/`login_throttle_release` (0036, besloten 5). Een
 * poging wordt vóór de aanroep naar Supabase atomair gereserveerd, en weer
 * vrijgegeven als de uitkomst niet telt: wachtwoord en PIN tellen alleen
 * foute pogingen, "wachtwoord vergeten" telt elke aanvraag.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

type AdminClient = ReturnType<typeof createAdminClient>;

// ── Eigen limiet (ADR 0017 → Beslissing 3) ───────────────────────────────

type ThrottleBucket =
  | "wachtwoord_ip"
  | "pin_ip"
  | "wachtwoord_lid"
  | "vergeten_lid"
  | "vergeten_ip"
  | "vergeten_totaal";

type Reservering = { toegestaan: boolean; ids: number[] };

/**
 * Controleert en reserveert in één databasetransactie een poging in alle
 * opgegeven buckets (`login_throttle_reserve`, 0036): een lock per bucket en
 * sleutel, dan tellen, en bij ruimte meteen een rij per bucket. Gelijktijdige
 * pogingen staan zo achter elkaar, en bij een limiet van 5 komen er hooguit 5
 * door. Is een bucket vol, dan `toegestaan: false` en is er niets
 * geschreven. De limieten staan vast in de database. Een fout gooit: liever
 * geen login dan een login zonder rem.
 */
async function reserveer(
  admin: AdminClient,
  paren: readonly (readonly [ThrottleBucket, string])[]
): Promise<Reservering> {
  const { data, error } = await admin.rpc("login_throttle_reserve", {
    p_buckets: paren.map(([bucket]) => bucket),
    p_keys: paren.map(([, sleutel]) => sleutel),
  });
  if (error) throw error;
  const rij = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: unknown; reservation_ids?: unknown }
    | null
    | undefined;
  const ids = Array.isArray(rij?.reservation_ids) ? (rij.reservation_ids as number[]) : [];
  return { toegestaan: rij?.allowed === true, ids };
}

/** Een reservering vrijgeven: de uitkomst telt niet als foute poging.
 *  Mislukt dat, dan alleen loggen: de rij telt dan mee tot ze uit het
 *  venster valt, en de gebruiker krijgt de uitkomst van zijn eigen poging. */
async function geefVrij(admin: AdminClient, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { error } = await admin.rpc("login_throttle_release", { p_reservation_ids: ids });
    if (error) console.error("barLogin: reservering vrijgeven mislukt:", error.message);
  } catch (err) {
    console.error("barLogin: reservering vrijgeven mislukt:", err);
  }
}

type LidUitkomst =
  | { ok: true; authUserId: string }
  | { ok: false; code: "not_allowed" | "no_account" };

/** Niet gearchiveerd, bar-rol en een gekoppeld account; anders `not_allowed`
 *  of `no_account` (spec → Inloggen op de bar, punt 3). */
async function zoekLid(admin: AdminClient, memberId: string): Promise<LidUitkomst> {
  const { data, error } = await admin
    .from("members")
    .select("id, role, archived, auth_user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.archived || (data.role !== "bardienst" && data.role !== "beheerder")) {
    return { ok: false, code: "not_allowed" };
  }
  if (!data.auth_user_id) return { ok: false, code: "no_account" };
  return { ok: true, authUserId: data.auth_user_id as string };
}

/** Het e-mailadres van het account, opgezocht op de server: je typt op de
 *  bar geen e-mailadres. */
async function zoekEmail(admin: AdminClient, authUserId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error) throw error;
  return data.user?.email ?? null;
}

// ── Apparaatcookie ───────────────────────────────────────────────────────

async function leesApparaatToken(): Promise<string | null> {
  const waarde = (await cookies()).get(APPARAAT_COOKIE_NAAM)?.value;
  return isGeldigApparaatToken(waarde) ? waarde : null;
}

async function zetApparaatCookie(token: string): Promise<void> {
  // `Secure` alleen op https: lokaal en in CI draait de app op
  // http://127.0.0.1 (zelfde regel als het oude koppelcookie).
  const secure = process.env.NODE_ENV === "production";
  (await cookies()).set(APPARAAT_COOKIE_NAAM, token, apparaatCookieOpties(secure));
}

// ── Namenlijst en inlogopties ────────────────────────────────────────────

/**
 * Alle niet-gearchiveerde leden met rol bardienst of beheerder, op naam. Géén
 * filter op `has_pin`, en geen e-mail, saldo of PIN-gegevens: de lijst is
 * openbaar (besloten, vraag 5). Sinds ADR 0017 ook zonder rol: alleen `id` en
 * `name` (docs/features/login-rate-limit.md → Namenlijst zonder rol). Het
 * filter op rol blijft hier, server-side.
 */
export async function leesNamenlijst(): Promise<BarNaam[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("members")
    .select("id, name")
    .in("role", ["bardienst", "beheerder"])
    .eq("archived", false)
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { id: string; name: string }[]).map(({ id, name }) => ({ id, name }));
}

/**
 * Wat er voor deze naam kan: PIN alleen op een vertrouwd apparaat, met een
 * PIN en zonder lockout. Zonder apparaatcookie is het antwoord altijd
 * "alleen wachtwoord": iemand buiten een vertrouwd apparaat leert niet of
 * een lid een PIN heeft.
 */
export async function leesLoginOpties(memberId: string): Promise<BarLoginOpties> {
  const token = await leesApparaatToken();
  if (!token) return { pinAvailable: false, pinLocked: false, pinNeedsMfa: false };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("bar_login_options", {
    p_device_token_hash: await hashApparaatToken(token),
    p_member_id: memberId,
  });
  if (error) throw error;
  const rij = Array.isArray(data) ? data[0] : data;
  return {
    pinAvailable: rij?.pin_available === true,
    pinLocked: rij?.pin_locked === true,
    pinNeedsMfa: rij?.pin_needs_mfa === true,
  };
}

// ── Sessie aanmaken en registreren ───────────────────────────────────────

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Een net aangemaakte sessie weer sluiten als registreren mislukt: alleen
 *  deze sessie (`local`), nooit de andere apparaten van dit lid. */
async function sluitNieuweSessie(supabase: ServerClient): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    console.error("barLogin: nieuwe sessie sluiten mislukt:", err);
  }
}

/** Registreert de sessie als bar-sessie (altijd modus bar, dus een PIN-sessie
 *  komt nooit in beheer). `null` bij succes, anders de foutcode. */
async function registreerSessie(
  admin: AdminClient,
  accessToken: string | undefined,
  memberId: string,
  deviceId: string | null
): Promise<"not_allowed" | "no_account" | "unknown" | null> {
  const sessionId = sessionIdUitAccessToken(accessToken);
  if (!sessionId) return "unknown";
  const { error } = await admin.rpc("register_bar_session_server", {
    p_auth_session_id: sessionId,
    p_member_id: memberId,
    p_device_id: deviceId,
  });
  if (!error) return null;
  if (error.message === "not_allowed" || error.message === "no_account") return error.message;
  console.error("barLogin: register_bar_session_server mislukt:", error.message);
  return "unknown";
}

function isRateLimit(error: { status?: number; code?: string; message?: string }): boolean {
  return (
    error.status === 429 ||
    error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit" ||
    isRateLimitedMessage(error.message)
  );
}

// ── Inloggen met wachtwoord ──────────────────────────────────────────────

/**
 * Wachtwoordlogin vanaf de namenlijst (spec → Inloggen op de bar, punt 3).
 * Zoekt het e-mailadres op, logt server-side in (de sessie landt in de
 * cookies), maakt het apparaat vertrouwd voor de PIN, heft een PIN-blokkade
 * op en registreert de sessie in modus bar.
 *
 * Eerst de eigen limiet: één reservering in `wachtwoord_ip` en
 * `wachtwoord_lid` samen. Is een van beide vol, dan `rate_limited` zonder
 * aanroep naar Supabase Auth. Alleen een fout wachtwoord
 * (`invalid_credentials`) houdt de reservering; elke andere uitkomst, ook een
 * uitzondering, geeft haar weer vrij (besloten 5).
 */
export async function loginMetWachtwoord(
  memberIdRuw: string,
  wachtwoord: string,
  ip: string
): Promise<WachtwoordLoginResultaat> {
  // Kleine letters: dezelfde uuid in andere hoofdletters is voor de database
  // hetzelfde lid, en mag dus geen nieuwe limietsleutel (wachtwoord_lid) zijn.
  const memberId = memberIdRuw.toLowerCase();
  const admin = createAdminClient();
  const reservering = await reserveer(admin, [
    ["wachtwoord_ip", ip],
    ["wachtwoord_lid", memberId],
  ]);
  if (!reservering.toegestaan) return { ok: false, code: "rate_limited" };

  let uitkomst: WachtwoordLoginResultaat | undefined;
  try {
    uitkomst = await wachtwoordPoging(admin, memberId, wachtwoord);
    return uitkomst;
  } finally {
    if (!(uitkomst?.ok === false && uitkomst.code === "invalid_credentials")) {
      await geefVrij(admin, reservering.ids);
    }
  }
}

/** De wachtwoordlogin zelf, na de reservering. */
async function wachtwoordPoging(
  admin: AdminClient,
  memberId: string,
  wachtwoord: string
): Promise<WachtwoordLoginResultaat> {
  const lid = await zoekLid(admin, memberId);
  if (!lid.ok) return { ok: false, code: lid.code };

  const email = await zoekEmail(admin, lid.authUserId);
  if (!email) return { ok: false, code: "no_account" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord });
  if (error || !data.session) {
    if (error && isRateLimit(error)) return { ok: false, code: "rate_limited" };
    const normalized = (error?.message ?? "").toLowerCase();
    if (error?.code === "invalid_credentials" || normalized.includes("invalid login credentials")) {
      return { ok: false, code: "invalid_credentials" };
    }
    console.error("barLogin: signInWithPassword mislukt:", error?.code, error?.status);
    return { ok: false, code: "unknown" };
  }

  // Het apparaat vertrouwen. Een ingetrokken apparaat (afgemeld) blijft voor
  // altijd ingetrokken: dan geeft de RPC null terug en krijgt dit apparaat een
  // nieuw cookie.
  let token = await leesApparaatToken();
  let deviceId: string | null = null;
  try {
    for (let poging = 0; poging < 2 && deviceId === null; poging++) {
      if (!token || poging === 1) token = nieuwApparaatToken();
      const { data: id, error: deviceError } = await admin.rpc("record_bar_password_login", {
        p_device_token_hash: await hashApparaatToken(token),
        p_member_id: memberId,
      });
      if (deviceError) throw deviceError;
      deviceId = typeof id === "string" ? id : null;
    }
  } catch (err) {
    console.error("barLogin: apparaat vertrouwen mislukt:", err);
    await sluitNieuweSessie(supabase);
    return { ok: false, code: "unknown" };
  }
  if (deviceId === null || !token) {
    await sluitNieuweSessie(supabase);
    return { ok: false, code: "unknown" };
  }

  const fout = await registreerSessie(admin, data.session.access_token, memberId, deviceId);
  if (fout) {
    await sluitNieuweSessie(supabase);
    return { ok: false, code: fout };
  }

  await zetApparaatCookie(token);
  return { ok: true };
}

// ── Inloggen met PIN ─────────────────────────────────────────────────────

/**
 * PIN-login (spec → Inloggen op de bar, punt 4): alleen op een vertrouwd
 * apparaat, met lockout en een hogere kostenfactor (verify_bar_pin). Bij
 * succes een sessie voor het account van het lid zonder wachtwoord:
 * `generateLink({ type: 'magiclink' })` verstuurt geen mail, en direct daarna
 * `verifyOtp({ token_hash })` met de server-client (ADR 0008-patroon).
 *
 * Vóór `verify_bar_pin` de eigen limiet per IP: een reservering in `pin_ip`.
 * Is die vol, dan `rate_limited` zonder poging op de lockout per lid. Alleen
 * `invalid_pin` uit `verify_bar_pin` houdt de reservering; `pin_locked`,
 * `pin_not_available`, `pin_needs_mfa`, een geslaagde login, een fout en een
 * uitzondering geven haar weer vrij (besloten 5).
 */
export async function loginMetPin(memberId: string, pin: string, ip: string): Promise<PinLoginResultaat> {
  const token = await leesApparaatToken();
  if (!token) return { ok: false, code: "pin_not_available" };
  if (!/^[0-9]{4}$/.test(pin)) return { ok: false, code: "invalid_pin" };

  const admin = createAdminClient();
  const reservering = await reserveer(admin, [["pin_ip", ip]]);
  if (!reservering.toegestaan) return { ok: false, code: "rate_limited" };

  let telt = false;
  try {
    const uitkomst = await pinPoging(admin, token, memberId, pin);
    telt = uitkomst.telt;
    return uitkomst.resultaat;
  } finally {
    if (!telt) await geefVrij(admin, reservering.ids);
  }
}

/** De PIN-login zelf, na de reservering. `telt` alleen bij een foute PIN
 *  volgens `verify_bar_pin` (`invalid_pin`). */
async function pinPoging(
  admin: AdminClient,
  token: string,
  memberId: string,
  pin: string
): Promise<{ resultaat: PinLoginResultaat; telt: boolean }> {
  const telNiet = (r: PinLoginResultaat) => ({ resultaat: r, telt: false });
  const { data, error } = await admin.rpc("verify_bar_pin", {
    p_device_token_hash: await hashApparaatToken(token),
    p_member_id: memberId,
    p_pin: pin,
  });
  if (error) {
    console.error("barLogin: verify_bar_pin mislukt:", error.message);
    return telNiet({ ok: false, code: "unknown" });
  }
  const rij = Array.isArray(data) ? data[0] : data;
  if (!rij || rij.result_code !== "ok") {
    const attemptsLeft = typeof rij?.attempts_left === "number" ? rij.attempts_left : undefined;
    return {
      resultaat: { ok: false, code: pinResultaatNaarFout(rij?.result_code), attemptsLeft },
      telt: rij?.result_code === "invalid_pin",
    };
  }

  const supabase = await createClient();
  try {
    const email = await zoekEmail(admin, rij.member_auth_user_id as string);
    if (!email) return telNiet({ ok: false, code: "no_account" });
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw linkError ?? new Error("generateLink gaf geen token");
    const { data: sessie, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (otpError || !sessie.session) throw otpError ?? new Error("verifyOtp gaf geen sessie");

    const fout = await registreerSessie(
      admin,
      sessie.session.access_token,
      memberId,
      (rij.trusted_device_id as string | null) ?? null
    );
    if (fout) {
      await sluitNieuweSessie(supabase);
      return telNiet({ ok: false, code: fout });
    }
  } catch (err) {
    console.error("barLogin: sessie voor PIN-login aanmaken mislukt:", err);
    await sluitNieuweSessie(supabase);
    return telNiet({ ok: false, code: "unknown" });
  }

  // Elke login verlengt het vertrouwen van het apparaat (30 dagen).
  await zetApparaatCookie(token);
  return telNiet({ ok: true });
}

// ── Wachtwoord vergeten ──────────────────────────────────────────────────

/**
 * Start de bestaande herstelflow (docs/features/wachtwoord-vergeten.md, ADR
 * 0008) naar het adres van dit lid. Het antwoord is altijd neutraal (ADR
 * 0013): ook een lid zonder account of een onbekend id geeft hetzelfde,
 * en fouten worden alleen gelogd.
 *
 * Eerst de eigen limiet: één reservering in `vergeten_lid`, `vergeten_ip` en
 * `vergeten_totaal`. Is er een vol, dan geen mail en `limited: true`. Anders
 * telt de aanvraag in alle drie (de reservering wordt nooit vrijgegeven), ook voor een lid zonder account: de teller gaat over
 * aanvragen, niet over accounts.
 */
export async function stuurHerstellink(
  memberIdRuw: string,
  origin: string,
  ip: string
): Promise<VergetenResultaat> {
  // Zie loginMetWachtwoord: één limietsleutel (vergeten_lid) per lid.
  const memberId = memberIdRuw.toLowerCase();
  try {
    const admin = createAdminClient();
    // De reservering blijft staan: hier telt elke aanvraag (geen release).
    const reservering = await reserveer(admin, [
      ["vergeten_lid", memberId],
      ["vergeten_ip", ip],
      ["vergeten_totaal", "*"],
    ]);
    if (!reservering.toegestaan) return { ok: true, limited: true };

    const lid = await zoekLid(admin, memberId);
    if (!lid.ok) return { ok: true, limited: false };
    const email = await zoekEmail(admin, lid.authUserId);
    if (!email) return { ok: true, limited: false };
    const { error } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/beheer/wachtwoord-herstellen`,
    });
    if (error) console.error("barLogin: herstellink versturen mislukt:", error.code, error.status);
  } catch (err) {
    console.error("barLogin: wachtwoord vergeten mislukt:", err);
  }
  return { ok: true, limited: false };
}
