import { execSync } from "node:child_process";

/**
 * Live-backend-bouwstenen voor e2e-specs die de lokale Supabase-stack
 * (`supabase start`, gevuld met supabase/seed.sql) rechtstreeks nodig
 * hebben: de API-URL en de lokale `SERVICE_ROLE_KEY` uit `supabase status`.
 * Alleen in testhelpers, nooit in app-code (ADR 0006). Uit
 * e2e/portal-login.spec.ts getild toen e2e/portal-profiel.spec.ts de tweede
 * gebruiker werd.
 */

let cachedStatus: { apiUrl: string; serviceRoleKey: string } | null = null;

export function supabaseStatus(): { apiUrl: string; serviceRoleKey: string } {
  if (cachedStatus) return cachedStatus;
  let raw: string;
  try {
    raw = execSync("supabase status -o json", { encoding: "utf8" });
  } catch {
    // Lokaal (buiten CI) staat de CLI niet altijd los van npm op het PATH —
    // zelfde fallback als de rest van deze repo's tooling.
    raw = execSync("npx supabase status -o json", { encoding: "utf8" });
  }
  const parsed = JSON.parse(raw) as { API_URL: string; SERVICE_ROLE_KEY: string };
  cachedStatus = { apiUrl: parsed.API_URL, serviceRoleKey: parsed.SERVICE_ROLE_KEY };
  return cachedStatus;
}

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
}

/** Zet het wachtwoord van een bestaand account terug via de Admin API —
 *  teardown voor tests die het wachtwoord van een eigen fixture wijzigen,
 *  zodat een tweede run op dezelfde lokale stack (zonder `db reset`) weer
 *  met het seed-wachtwoord kan inloggen. */
async function zoekUserId(email: string): Promise<string> {
  const { apiUrl, serviceRoleKey } = supabaseStatus();
  const headers = adminHeaders(serviceRoleKey);
  let userId: string | null = null;
  for (let pageNo = 1; pageNo <= 10 && !userId; pageNo++) {
    const res = await fetch(`${apiUrl}/auth/v1/admin/users?page=${pageNo}&per_page=100`, { headers });
    if (!res.ok) throw new Error(`admin/users mislukt (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { users: Array<{ id: string; email?: string }> };
    userId = body.users.find((u) => u.email === email)?.id ?? null;
    if (body.users.length < 100) break;
  }
  if (!userId) throw new Error(`geen auth-account gevonden voor ${email}`);
  return userId;
}

export async function adminSetPassword(email: string, password: string): Promise<void> {
  const { apiUrl, serviceRoleKey } = supabaseStatus();
  const headers = adminHeaders(serviceRoleKey);
  const userId = await zoekUserId(email);

  const res = await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`wachtwoord terugzetten mislukt (${res.status}): ${await res.text()}`);
}

/** Verwijdert alle MFA-factoren van een account via de Admin API — opzet en
 *  teardown voor de test die in de portal tweestapsverificatie instelt
 *  (docs/features/beheer-tweede-factor.md), zodat een herhaling (retry of
 *  tweede run op dezelfde stack) weer met "Uit" begint. Zelfde weg als Bram
 *  bij een verloren telefoon neemt (het dashboard). */
export async function adminVerwijderFactoren(email: string): Promise<void> {
  const { apiUrl, serviceRoleKey } = supabaseStatus();
  const headers = adminHeaders(serviceRoleKey);
  const userId = await zoekUserId(email);
  const res = await fetch(`${apiUrl}/auth/v1/admin/users/${userId}/factors`, { headers });
  if (!res.ok) throw new Error(`factoren lezen mislukt (${res.status}): ${await res.text()}`);
  const factoren = (await res.json()) as Array<{ id: string }>;
  for (const factor of factoren ?? []) {
    const del = await fetch(`${apiUrl}/auth/v1/admin/users/${userId}/factors/${factor.id}`, {
      method: "DELETE",
      headers,
    });
    if (!del.ok) throw new Error(`factor verwijderen mislukt (${del.status}): ${await del.text()}`);
  }
}
