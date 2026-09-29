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
export async function adminSetPassword(email: string, password: string): Promise<void> {
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

  const res = await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`wachtwoord terugzetten mislukt (${res.status}): ${await res.text()}`);
}
