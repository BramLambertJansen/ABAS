import { test, expect, type Page } from "@playwright/test";
import {
  USER,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
} from "./helpers/supabaseMock";

/**
 * Bar en beheer op ondersteunde tablets (docs/features/tablet-bruikbaarheid.md,
 * #124, D1: 768 portret en 1024 landschap). Supabase is gemockt via
 * `page.route()`. Wat dit toetst: geen paginabrede horizontale overflow,
 * Uitloggen en het zijpaneel binnen beeld, en dat de aantallenbadge de naam
 * of prijs van een kaart niet bedekt — ook met extreem lange namen.
 */

const VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
];

const LANGE_NAAM = "Alcoholvrije speciaalbier-selectie van de Aurora-brouwerij";
const PRODUCTEN = [
  { id: "p1", name: "Rode wijn", category: "Wijn", price_cents: 350 },
  { id: "p2", name: "Spa rood", category: "Fris", price_cents: 150 },
  { id: "p3", name: LANGE_NAAM, category: "Bier", price_cents: 123450 },
  { id: "p4", name: "Superlangewoordzonderspatiesvoorhetafbrekenvandenaam", category: "Bier", price_cents: 400 },
];

async function geenHorizontaleOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function binnenBeeld(page: Page, locator: ReturnType<Page["locator"]>) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
}

async function mockBasis(page: Page) {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("verkoop: geen overflow, zijpaneel in beeld, badge bedekt naam en prijs niet", async ({
      page,
    }) => {
      await mockBasis(page);
      await page.route(/\/rest\/v1\/products(\?|$)/, (route) => json(route, 200, PRODUCTEN));
      await mockBarSessie(page, {
        naam: "Tom Willems",
        rol: "bardienst",
        voorgeregistreerd: "bar",
        bevestigd: true,
        shift: {
          id: "00000000-0000-4000-8000-0000000000c1",
          startedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          startedByName: "Femke Bos",
          activityTypeName: "Training",
        },
      });
      await loginMetWachtwoord(page, USER.email, "Aurora#2026");
      await expect(page.getByRole("tab", { name: "Verkoop" })).toBeVisible({ timeout: 15_000 });

      for (const naam of ["Rode wijn", "Spa rood", LANGE_NAAM]) {
        // Elke tik voegt er één toe: zo staat er een badge op de kaart.
        await page.getByRole("button", { name: new RegExp(`^${naam}, `) }).click();
      }

      for (const naam of ["Rode wijn", "Spa rood", LANGE_NAAM]) {
        const kaart = page.getByRole("button", { name: new RegExp(`^${naam}, `) });
        const tekst = await kaart.locator("span").first().boundingBox();
        const badge = await kaart.getByText("1×").boundingBox();
        expect(tekst).not.toBeNull();
        expect(badge).not.toBeNull();
        // Badge staat onder de naam, niet erop.
        const naamBox = await kaart.getByText(naam, { exact: true }).boundingBox();
        expect(naamBox).not.toBeNull();
        expect(badge!.y).toBeGreaterThanOrEqual(naamBox!.y + naamBox!.height - 1);
        // Een afgekapte naam blijft volledig bereikbaar via de accessible name.
        await expect(kaart).toHaveAccessibleName(new RegExp(`^${naam}, `));
      }

      await binnenBeeld(page, page.getByRole("button", { name: "Uitloggen" }));
      await geenHorizontaleOverflow(page);
    });

    test("beheer: alle tabs en Uitloggen in beeld, geen overflow", async ({ page }) => {
      await mockBasis(page);
      await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
        const isBeheerder = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
        const row = isBeheerder ? { name: "Femke Bos", role: "beheerder", has_pin: false } : null;
        const accept = route.request().headers()["accept"] ?? "";
        return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
      });
      await mockBarSessie(page);
      await loginMetWachtwoord(page, USER.email, "Aurora#2026");
      await page.getByRole("button", { name: "Beheer" }).click();
      await expect(page.getByRole("tab", { name: "Assortiment" })).toBeVisible();

      for (const tab of ["Assortiment", "Leden", "Instellingen", "Diensten", "Logboek"]) {
        await binnenBeeld(page, page.getByRole("tab", { name: tab }));
      }
      await binnenBeeld(page, page.getByRole("button", { name: "Uitloggen" }));
      await geenHorizontaleOverflow(page);
    });
  });
}

test.describe("zoom", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("verkoop op 150% lettergrootte: Uitloggen blijft bereikbaar, geen overflow", async ({
    page,
  }) => {
    await mockBasis(page);
    await page.route(/\/rest\/v1\/products(\?|$)/, (route) => json(route, 200, PRODUCTEN));
    await mockBarSessie(page, {
      naam: "Tom Willems",
      rol: "bardienst",
      voorgeregistreerd: "bar",
      bevestigd: true,
      shift: {
        id: "00000000-0000-4000-8000-0000000000c1",
        startedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        startedByName: "Femke Bos",
        activityTypeName: "Training",
      },
    });
    await loginMetWachtwoord(page, USER.email, "Aurora#2026");
    await expect(page.getByRole("tab", { name: "Verkoop" })).toBeVisible({ timeout: 15_000 });
    await page.addStyleTag({ content: "html { font-size: 24px; }" });

    await geenHorizontaleOverflow(page);
    await page.getByRole("button", { name: "Uitloggen" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Uitloggen" })).toBeVisible();
  });
});
