import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { alertOf, json } from "./helpers/supabaseMock";

/**
 * De eigen limiet op de server-side bar-login en de namenlijst zonder rol
 * (docs/features/login-rate-limit.md, ADR 0017 → Beslissing 3).
 *
 * De UI-tests mocken de Route Handlers onder `/inloggen/` via `page.route()`
 * (zelfde aanpak als e2e/bar-inloggen-niet-toegestaan.spec.ts): in CI delen
 * alle verzoeken de IP-sleutel 'onbekend', dus echte foute pogingen zouden de
 * wachtwoordlogin voor de rest van de run blokkeren. De telling zelf (buckets,
 * vensters, grenzen) bewijzen supabase/tests/login_throttle.test.sql en
 * test/barLogin.test.ts.
 *
 * De laatste test leest de echte namenlijst (live backend): die geeft geen rol.
 */

const RATE_LIMIT_TEKST = "te veel foute pogingen — probeer het over een paar minuten opnieuw";

const ANNA = { id: "00000000-0000-4000-8000-0000000000a1", name: "Anna Jansen" };
const BRAM = { id: "00000000-0000-4000-8000-0000000000a2", name: "Bram de Wit" };

async function mockInloggen(page: Page, opties: { pin: boolean }) {
  const pogingen = { wachtwoord: 0, pin: 0 };
  await page.route(/\/auth\/v1\//, (route) => json(route, 401, { code: "no_session", msg: "geen sessie" }));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, { session: null }));
  await page.route(/\/inloggen\/namen(\?|$)/, (route) => json(route, 200, { ok: true, namen: [ANNA, BRAM] }));
  await page.route(/\/inloggen\/opties(\?|$)/, (route) =>
    json(route, 200, { ok: true, pinAvailable: opties.pin, pinLocked: false, pinNeedsMfa: false })
  );
  // Vijf foute pogingen per IP, daarna de eigen limiet (wat de server doet).
  await page.route(/\/inloggen\/wachtwoord(\?|$)/, (route) => {
    pogingen.wachtwoord += 1;
    return json(
      route,
      200,
      pogingen.wachtwoord <= 5 ? { ok: false, code: "invalid_credentials" } : { ok: false, code: "rate_limited" }
    );
  });
  await page.route(/\/inloggen\/pin(\?|$)/, (route) => {
    pogingen.pin += 1;
    return json(
      route,
      200,
      pogingen.pin <= 5
        ? { ok: false, code: "invalid_pin", attemptsLeft: 3 }
        : { ok: false, code: "rate_limited" }
    );
  });
  return pogingen;
}

async function kies(page: Page, naam: string) {
  const knop = page.getByRole("button", { name: naam, exact: true });
  await knop.waitFor({ state: "visible", timeout: 15_000 });
  await knop.click();
}

test("na 5 foute wachtwoorden: de tekst bij rate_limited", async ({ page }) => {
  const pogingen = await mockInloggen(page, { pin: false });
  await page.goto("/");
  await kies(page, ANNA.name);

  const veld = page.locator('input[type="password"]');
  await veld.waitFor({ state: "visible", timeout: 15_000 });
  for (let i = 1; i <= 5; i++) {
    await veld.fill(`fout-${i}`);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(alertOf(page).filter({ hasText: "onjuist wachtwoord" })).toBeVisible();
    await expect.poll(() => pogingen.wachtwoord).toBe(i);
  }
  await veld.fill("nog-een");
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(alertOf(page).filter({ hasText: RATE_LIMIT_TEKST })).toBeVisible();

  await page.mouse.move(0, 0);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test("na 5 foute PIN's, verdeeld over twee leden: dezelfde tekst", async ({ page }) => {
  const pogingen = await mockInloggen(page, { pin: true });
  await page.goto("/");

  async function pin(cijfers: string) {
    for (const cijfer of cijfers) {
      await page.getByRole("button", { name: `Cijfer ${cijfer}`, exact: true }).click();
    }
  }

  await kies(page, ANNA.name);
  await expect(page.getByText("Voer je pincode in")).toBeVisible({ timeout: 15_000 });
  for (let i = 1; i <= 3; i++) {
    await pin("0000");
    await expect.poll(() => pogingen.pin).toBe(i);
  }
  await page.getByRole("button", { name: "← andere naam" }).click();

  await kies(page, BRAM.name);
  await expect(page.getByText("Voer je pincode in")).toBeVisible({ timeout: 15_000 });
  for (let i = 4; i <= 5; i++) {
    await pin("0000");
    await expect.poll(() => pogingen.pin).toBe(i);
  }
  await pin("1111");
  await expect(alertOf(page).filter({ hasText: RATE_LIMIT_TEKST })).toBeVisible();
});

test("wachtwoord vergeten met de eigen limiet: de eigen tekst, niets over een account", async ({ page }) => {
  await mockInloggen(page, { pin: false });
  await page.route(/\/inloggen\/vergeten(\?|$)/, (route) => json(route, 200, { ok: true, limited: true }));
  await page.goto("/");
  await kies(page, ANNA.name);
  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await page.getByRole("button", { name: "Stuur herstellink" }).click();

  await expect(
    page.getByText(
      "Er is net al een herstellink aangevraagd. Kijk in je mail, of probeer het over een kwartier opnieuw."
    )
  ).toBeVisible();
  await expect(page.getByText(/Als er een account bij je naam hoort/)).toHaveCount(0);
});

test("de namenlijst toont geen rol: de knop heet alleen de naam", async ({ page }) => {
  await mockInloggen(page, { pin: false });
  await page.goto("/");
  await expect(page.getByRole("button", { name: ANNA.name, exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^(bardienst|beheerder)$/i)).toHaveCount(0);
});

test("live backend: GET /inloggen/namen geeft alleen id en naam, geen role", async ({ request }) => {
  const response = await request.get("/inloggen/namen");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { ok: boolean; namen: Record<string, unknown>[] };
  expect(body.ok).toBe(true);
  expect(body.namen.length).toBeGreaterThan(0);
  for (const naam of body.namen) {
    expect(Object.keys(naam).sort()).toEqual(["id", "name"]);
  }
});
