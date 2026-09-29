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
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

type AdminClient = ReturnType<typeof createAdminClient>;

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
 * openbaar (besloten, vraag 5).
 */
export async function leesNamenlijst(): Promise<BarNaam[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("members")
    .select("id, name, role")
    .in("role", ["bardienst", "beheerder"])
    .eq("archived", false)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BarNaam[];
}

/**
 * Wat er voor deze naam kan: PIN alleen op een vertrouwd apparaat, met een
 * PIN en zonder lockout. Zonder apparaatcookie is het antwoord altijd
 * "alleen wachtwoord": iemand buiten een vertrouwd apparaat leert niet of
 * een lid een PIN heeft.
 */
export async function leesLoginOpties(memberId: string): Promise<BarLoginOpties> {
  const token = await leesApparaatToken();
  if (!token) return { pinAvailable: false, pinLocked: false };
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
 */
export async function loginMetWachtwoord(
  memberId: string,
  wachtwoord: string
): Promise<WachtwoordLoginResultaat> {
  const admin = createAdminClient();
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
 */
export async function loginMetPin(memberId: string, pin: string): Promise<PinLoginResultaat> {
  const token = await leesApparaatToken();
  if (!token) return { ok: false, code: "pin_not_available" };
  if (!/^[0-9]{4}$/.test(pin)) return { ok: false, code: "invalid_pin" };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verify_bar_pin", {
    p_device_token_hash: await hashApparaatToken(token),
    p_member_id: memberId,
    p_pin: pin,
  });
  if (error) {
    console.error("barLogin: verify_bar_pin mislukt:", error.message);
    return { ok: false, code: "unknown" };
  }
  const rij = Array.isArray(data) ? data[0] : data;
  if (!rij || rij.result_code !== "ok") {
    const attemptsLeft = typeof rij?.attempts_left === "number" ? rij.attempts_left : undefined;
    return { ok: false, code: pinResultaatNaarFout(rij?.result_code), attemptsLeft };
  }

  const supabase = await createClient();
  try {
    const email = await zoekEmail(admin, rij.member_auth_user_id as string);
    if (!email) return { ok: false, code: "no_account" };
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
      return { ok: false, code: fout };
    }
  } catch (err) {
    console.error("barLogin: sessie voor PIN-login aanmaken mislukt:", err);
    await sluitNieuweSessie(supabase);
    return { ok: false, code: "unknown" };
  }

  // Elke login verlengt het vertrouwen van het apparaat (30 dagen).
  await zetApparaatCookie(token);
  return { ok: true };
}

// ── Wachtwoord vergeten ──────────────────────────────────────────────────

/**
 * Start de bestaande herstelflow (docs/features/wachtwoord-vergeten.md, ADR
 * 0008) naar het adres van dit lid. Het antwoord is altijd neutraal (ADR
 * 0013): ook een lid zonder account of een onbekend id geeft hetzelfde,
 * en fouten worden alleen gelogd.
 */
export async function stuurHerstellink(memberId: string, origin: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const lid = await zoekLid(admin, memberId);
    if (!lid.ok) return;
    const email = await zoekEmail(admin, lid.authUserId);
    if (!email) return;
    const { error } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/beheer/wachtwoord-herstellen`,
    });
    if (error) console.error("barLogin: herstellink versturen mislukt:", error.code, error.status);
  } catch (err) {
    console.error("barLogin: wachtwoord vergeten mislukt:", err);
  }
}
