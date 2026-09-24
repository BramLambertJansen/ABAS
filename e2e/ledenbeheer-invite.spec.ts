import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * #73 — de uitnodigingsfout `rate_limited` in LidBeherenOverlay toont de
 * gedeelde RATE_LIMITED_MESSAGE (src/lib/authErrors.ts). Zonder echte
 * database: dezelfde aanpak als e2e/wachtwoord-vergeten.spec.ts — de
 * browser praat rechtstreeks met `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/...`
 * en `/rest/v1/...`, en met de eigen route `/beheer/invite`; alle drie
 * worden hier via `page.route()` gemockt. Wat dit níét toetst: of
 * src/lib/inviteMember.ts een echte GoTrue-rate-limit ook daadwerkelijk als
 * `rate_limited` teruggeeft — dat is serverside en valt buiten de browser.
 *
 * De tekst staat hier bewust letterlijk en niet geïmporteerd: de test moet
 * rood worden als iemand de gedeelde tekst of de koppeling ernaar wijzigt.
 */

const RATE_LIMITED_TEXT = "te veel pogingen — probeer het over een paar minuten opnieuw";

const HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "x-supabase-api-version, content-range",
  "content-type": "application/json",
  "x-supabase-api-version": "2024-01-01",
};

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "femke.bos@aurora.local",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function fakeSession() {
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

const LID = {
  id: "00000000-0000-4000-8000-0000000000aa",
  name: "Joris de Vries",
  role: "bardienst",
  balance_cents: 1250,
  archived: false,
  auth_user_id: null,
  has_pin: false,
  email: "joris@aurora.local",
  invited_at: null,
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, headers: HEADERS, body: JSON.stringify(body) });
}

/** `invite` = [HTTP-status, body]. De echte route geeft een fout uit
 *  sendMemberInvite() met status 200 terug ({ ok: false, errorCode }); alleen
 *  een ongeldige aanvraag of een exception geeft 400/500. */
async function mockBeheerder(page: Page, invite: [number, unknown]) {
  const inviteCalls: Array<Record<string, unknown>> = [];

  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));

  // Alles onder /rest/v1 wat deze test niet specifiek nodig heeft: leeg.
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  // useBeheerSession: members-rij van de ingelogde beheerder.
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const row = { name: "Femke Bos", role: "beheerder", has_pin: false };
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : [row]);
  });
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) => json(route, 200, [LID]));

  await page.route(/\/beheer\/invite(\?|$)/, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    inviteCalls.push(route.request().postDataJSON());
    return json(route, invite[0], invite[1]);
  });

  return inviteCalls;
}

async function openLidBeheren(page: Page) {
  await page.goto("/beheer");
  const emailVeld = page.locator('input[type="email"]');
  await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
  await emailVeld.fill(USER.email);
  await page.locator('label:has(input[value="password"])').click();
  await page.locator('input[type="password"]').fill("Aurora#2026");
  await page.getByRole("button", { name: "Inloggen" }).click();

  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: "Leden" }).click();
  await page.getByRole("button", { name: LID.name }).click();
  await expect(page.getByRole("button", { name: "Invite versturen" })).toBeVisible();
}

function overlayAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

test("invite: rate_limited → de gedeelde 'te veel pogingen'-tekst (#73)", async ({ page }) => {
  const calls = await mockBeheerder(page, [200, { ok: false, errorCode: "rate_limited" }]);
  await openLidBeheren(page);

  await page.getByRole("button", { name: "Invite versturen" }).click();

  await expect(overlayAlert(page)).toHaveText(RATE_LIMITED_TEXT);
  expect(calls).toEqual([{ memberId: LID.id }]);
  // Mislukt: geen "uitgenodigd op …", knop blijft bruikbaar voor een nieuwe poging.
  await expect(page.getByText("nog niet uitgenodigd")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite versturen" })).toBeEnabled();
});

test("invite: andere fout (unknown) → géén 'te veel pogingen'-tekst", async ({ page }) => {
  await mockBeheerder(page, [500, { ok: false, errorCode: "iets_onbekends" }]);
  await openLidBeheren(page);

  await page.getByRole("button", { name: "Invite versturen" }).click();

  await expect(overlayAlert(page)).toHaveText("er ging iets mis, probeer het opnieuw");
  await expect(page.getByText("te veel pogingen")).toHaveCount(0);
});
