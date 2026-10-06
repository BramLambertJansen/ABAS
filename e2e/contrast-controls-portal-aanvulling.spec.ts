import { test, expect, type Page, type Route } from "@playwright/test";
import { USER, fakeSession, json, portalLoginMetWachtwoord } from "./helpers/supabaseMock";

/**
 * T12 (#132), aanvulling van de tester: wat contrast-controls-portal.spec.ts
 * niet raakt. PortalLogin blijft smal (max-w-sm), de profiel-sheet past op
 * 320px, een zichtbare focusring op de portalknoppen, en grote tekst (de
 * browser-tekstgrootte op 200%) zonder horizontale overflow. Supabase via
 * `page.route()`.
 */

async function openPortal(page: Page, naam = "Mock Lid") {
  const objectOrList = (route: Route, row: unknown) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => objectOrList(route, null));
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const own = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    return objectOrList(route, own ? { name: naam, role: "lid", archived: false, has_pin: false, balance_cents: 1500 } : null);
  });
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, (route) => json(route, 200, []));
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("heading", { name: /^Hoi / })).toBeVisible({ timeout: 15_000 });
}

async function geenHorizontaleScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const uitsteekers = await page.evaluate((w) =>
    [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > w + 0.5)
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 80)} -> ${Math.round(e.getBoundingClientRect().right)}`),
    clientWidth
  );
  expect(scrollWidth, uitsteekers.join("\n")).toBeLessThanOrEqual(clientWidth);
}

test.describe("1280px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("PortalLogin blijft max-w-sm (384px), niet verbreed naar 560px", async ({ page }) => {
    await page.goto("/portal");
    const knop = page.locator("button[type=submit]").first();
    await expect(knop).toBeVisible();
    const b = (await knop.boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(384);
  });
});

test.describe("320px", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("een profiel-sheet past binnen het scherm en zit onderaan", async ({ page }) => {
    await openPortal(page, "Alexandra Wilhelmina van der Meulen-Schuurmans");
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByRole("button", { name: /Naam/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const b = (await dialog.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(320.5);
    expect(b.y + b.height).toBeLessThanOrEqual(640.5);
    await geenHorizontaleScroll(page);
  });
});

test.describe("focus en tekstgrootte (390px)", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("Uitloggen toont bij Tab een 2px accent-focusring met 2px afstand", async ({ page }) => {
    await openPortal(page);
    const knop = page.getByRole("button", { name: "Uitloggen" });
    await knop.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(knop).toBeFocused();
    const stijl = await knop.evaluate((el) => {
      const s = getComputedStyle(el);
      return { w: s.outlineWidth, st: s.outlineStyle, c: s.outlineColor, o: s.outlineOffset };
    });
    expect(stijl.st).toBe("solid");
    expect(stijl.w).toBe("2px");
    expect(stijl.o).toBe("2px");
    expect(stijl.c).toBe("rgb(238, 90, 36)");
  });

  // BEKENDE BEVINDING (geen T12-regressie, ook op main): bij 200% tekst steekt de
  // tabbalk (`h-10 flex-1`-knoppen in PortalDashboard) 25px buiten 390px. Zet
  // om naar `test(` zodra dat is opgelost.
  test.fixme("tekstgrootte 200%: geen horizontale overflow, Uitloggen blijft bereikbaar", async ({ page }) => {
    await openPortal(page, "Alexandra Wilhelmina van der Meulen-Schuurmans");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await geenHorizontaleScroll(page);
    const knop = page.getByRole("button", { name: "Uitloggen" });
    await knop.scrollIntoViewIfNeeded();
    await expect(knop).toBeVisible();
    const b = (await knop.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390.5);
  });
});
