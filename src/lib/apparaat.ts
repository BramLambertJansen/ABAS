/**
 * Het apparaatcookie `abas_apparaat` en de JWT-claim `session_id`
 * (docs/features/dienst-per-sessie.md → Begrippen, Inloggen op de bar; ADR
 * 0016 → Beslissing 7). Puur: alleen Web Crypto, geen Next.js of Supabase,
 * zodat `node --test` het rechtstreeks draait (test/apparaat.test.ts).
 *
 * Het cookie bestaat om de PIN-login aan een apparaat te binden (ADR 0016
 * → Beslissing 7) en voor niets anders: de dienst hangt aan de sessie, niet
 * aan het apparaat. Het token zelf staat nergens in de database, alleen zijn
 * SHA-256 (`bar_devices.token_hash`).
 */

export const APPARAAT_COOKIE_NAAM = "abas_apparaat";

/** Het vertrouwen geldt een maand en elke login verlengt het (besloten,
 *  vraag 27). Zelfde 30 dagen als in `bar_pin_state` (0028). */
export const APPARAAT_MAX_AGE_SECONDEN = 30 * 24 * 60 * 60;

/** 256 bit willekeurig, base64url zonder padding (43 tekens). */
export function nieuwApparaatToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** SHA-256 van het token, hexadecimaal: wat `bar_devices.token_hash` bevat. */
export async function hashApparaatToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Een token dat de server zelf kan hebben uitgegeven: alleen base64url,
 *  43 tekens. Alles anders is geen cookie van ons en wordt genegeerd. */
export function isGeldigApparaatToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** `HttpOnly` (geen script leest het), `SameSite=Strict`, `Secure` op https,
 *  overal geldig. Naam en opties op één plek, zodat login en verversing
 *  hetzelfde cookie zetten. */
export function apparaatCookieOpties(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: APPARAAT_MAX_AGE_SECONDEN,
  };
}

/**
 * De `session_id` uit een Supabase access token (het claim waar
 * `bar_sessions.auth_session_id` op steunt). Geen verificatie: de server
 * kreeg het token zojuist zelf van Supabase Auth, dit leest alleen het
 * claim. `null` bij alles wat er niet uitziet als een JWT met dat claim.
 */
export function sessionIdUitAccessToken(accessToken: string | null | undefined): string | null {
  if (typeof accessToken !== "string") return null;
  const delen = accessToken.split(".");
  const payloadDeel = delen[1];
  if (delen.length !== 3 || payloadDeel === undefined) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlNaarBytes(payloadDeel))) as {
      session_id?: unknown;
    };
    const id = payload.session_id;
    return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

function base64Url(bytes: Uint8Array): string {
  let binair = "";
  for (const byte of bytes) binair += String.fromCharCode(byte);
  return btoa(binair).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlNaarBytes(value: string): Uint8Array {
  const standaard = value.replace(/-/g, "+").replace(/_/g, "/");
  const gevuld = standaard + "=".repeat((4 - (standaard.length % 4)) % 4);
  const binair = atob(gevuld);
  return Uint8Array.from(binair, (char) => char.charCodeAt(0));
}
