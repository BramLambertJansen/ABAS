import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Gedeelde hulpjes voor de integratietests tegen de echte GoTrue van de
 * lokale stack (`supabase start`): account-koppeling.test.ts (ADR 0020) en
 * sessie-na-afmelden.test.ts (ADR 0022). Eén kopie (CLAUDE.md →
 * Componenten zijn herbruikbaar); geïmporteerd met expliciete
 * `.ts`-extensie, omdat Node's type-stripping geen extensieloze imports
 * oplost.
 *
 * Elk testbestand registreert zelf `after(opruimen)`; wat het aanmaakt,
 * zet het in `aangemaakteLeden` / `aangemaakteAccounts`.
 */

type Omgeving = { url: string; publishableKey: string; secretKey: string };

export function omgeving(): Omgeving {
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
export const admin: SupabaseClient = createClient(env.url, env.secretKey, clientOpties);

/** Een "gebruiker" met de publieke key, zoals de browser of een aanvaller. */
export function gebruiker(): SupabaseClient {
  return createClient(env.url, env.publishableKey, clientOpties);
}

/** Een client die alleen een vast access token meestuurt: geen eigen
 *  sessie, dus supabase-js ververst niets stil. Zo roept een overgebleven
 *  token PostgREST aan. */
export function metToken(accessToken: string): SupabaseClient {
  return createClient(env.url, env.publishableKey, {
    ...clientOpties,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// ── Opruimen ──────────────────────────────────────────────────────────────

export const aangemaakteLeden: string[] = [];
export const aangemaakteAccounts: string[] = [];

/** Voor `after(opruimen)` in elk testbestand. */
export async function opruimen(): Promise<void> {
  // Eerst de bar-sessies: bar_sessions.member_id verwijst zonder `on delete`
  // naar members. Geen scenario koppelt een bar-sessie aan een dienst.
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
}

// ── Adressen, wachtwoorden, tokens ───────────────────────────────────────

export function uniekAdres(voorvoegsel = "koppel"): string {
  return `${voorvoegsel}-${randomBytes(8).toString("hex")}@example.test`;
}

export function wachtwoord(): string {
  return `Ww-${randomBytes(12).toString("hex")}`;
}

export type TokenClaims = {
  amr?: Array<{ method?: string } | string>;
  session_id?: string;
  aal?: string;
};

/** De claims uit het ondertekende access token (niet geverifieerd: alleen
 *  om te lezen wat GoTrue uitgaf). */
export function tokenClaims(session: Session): TokenClaims {
  const payload = session.access_token.split(".")[1];
  assert.ok(payload, "access token heeft geen payload");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
}

export function sessieId(session: Session): string {
  const id = tokenClaims(session).session_id;
  assert.ok(id, "access token heeft geen session_id-claim");
  return id;
}

// ── TOTP (voor een aal2-sessie) ───────────────────────────────────────────

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
export function totpCode(geheim: string, nu: number = Date.now()): string {
  const teller = Buffer.alloc(8);
  teller.writeBigUInt64BE(BigInt(Math.floor(nu / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(geheim)).update(teller).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const getal = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return getal.toString().padStart(6, "0");
}
