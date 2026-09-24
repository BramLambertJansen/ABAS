import type { Page, Route } from "@playwright/test";

/**
 * Gedeelde bouwstenen voor e2e-specs die Supabase mocken via `page.route()`
 * in plaats van een echte stack te gebruiken. De browser-client
 * (src/lib/supabase/client.ts) praat rechtstreeks met
 * `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/...` en `/rest/v1/...`, dus het pad
 * matcht welke host dat ook is.
 *
 * Foutbodies volgen API-versie 2024-01-01 (`code` + `msg`), met de header
 * waaraan auth-js die versie herkent — zonder die header leest auth-js
 * `code` niet.
 */
export const SUPABASE_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "x-supabase-api-version, content-range",
  "content-type": "application/json",
  "x-supabase-api-version": "2024-01-01",
};

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "femke.bos@aurora.local",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

export function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ sub: USER.id, aud: "authenticated", role: "authenticated", exp, email: USER.email }),
    "nep-handtekening",
  ].join(".");
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "nep-refresh-token",
    user: USER,
  };
}

export function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, headers: SUPABASE_HEADERS, body: JSON.stringify(body) });
}

/** De eigen `role="alert"` van het scherm — niet Next.js' route-announcer. */
export function alertOf(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/**
 * Vult het /beheer-inlogformulier in met de methode Wachtwoord en klikt
 * "Inloggen". Wat daarna gebeurt (echte of gemockte login, modus-keuze) is
 * aan de aanroeper.
 *
 * De "Wachtwoord"-radio is `sr-only`; de omhullende <label> is het echte,
 * zichtbare klikdoel. CSS-locators i.p.v. getByLabel("Wachtwoord"): het
 * wachtwoordveld en de inlogmethode-radio delen die toegankelijke naam.
 */
export async function loginMetWachtwoord(page: Page, email: string, password: string) {
  await page.goto("/beheer");
  const emailVeld = page.locator('input[type="email"]');
  await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('label:has(input[value="password"])').click();
  await emailVeld.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Inloggen" }).click();
}
