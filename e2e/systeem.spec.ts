// kit: generiek
import { readFileSync } from "node:fs";
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Het ontwerpsysteem als pagina (docs/features/ontwerpsysteem.md → Playwright):
 * een screenshot per `[data-systeem]`-sectie, een gegenereerde hover- en
 * focusstaat per sectie, en een axe-scan van de hele pagina. Generiek: geen
 * component- of tokennamen; route, viewport, wachtwoord en drempel staan in
 * scripts/kit/systeem.lokaal.json. De drempel zelf staat in playwright.config.ts.
 *
 * Baselines komen uit de workflow `screenshots-bijwerken`, niet van een
 * lokale machine.
 */
const cfg = JSON.parse(readFileSync("scripts/kit/systeem.lokaal.json", "utf8")) as {
  route: string;
  viewport: { width: number; height: number };
  testWachtwoord: string;
};

test.use({
  viewport: cfg.viewport,
  httpCredentials: { username: "systeem", password: cfg.testWachtwoord },
});

const SECTIE = "[data-systeem]";
const BRUIKBARE_KNOP = 'button:not([disabled]):not([aria-disabled="true"])';
const FOCUSBAAR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

async function openPagina(page: Page) {
  await page.goto(cfg.route);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(SECTIE).first()).toBeVisible();
}

async function sectieIds(page: Page): Promise<string[]> {
  return page.locator(SECTIE).evaluateAll((els) => els.map((el) => el.getAttribute("data-systeem") ?? ""));
}

function sectie(page: Page, id: string): Locator {
  return page.locator(`[data-systeem="${id}"]`);
}

/** Wacht op fonts, dan de screenshot; soft, zodat één afwijkende sectie de rest niet verbergt. */
async function schermafdruk(page: Page, el: Locator, naam: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect.soft(el, naam).toHaveScreenshot(naam);
}

test("de pagina heeft secties met unieke id's en elk een h2", async ({ page }) => {
  await openPagina(page);
  const ids = await sectieIds(page);
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.every((id) => id !== "")).toBe(true);
  expect(new Set(ids).size, `dubbele data-systeem-id's: ${ids.join(", ")}`).toBe(ids.length);
  for (const id of ids) {
    await expect(sectie(page, id).locator("h2").first(), `sectie ${id} mist een h2`).toBeVisible();
  }
});

test("één main en één h1", async ({ page }) => {
  await openPagina(page);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("screenshot per sectie", async ({ page }) => {
  test.setTimeout(180_000);
  await openPagina(page);
  const ids = await sectieIds(page);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    await schermafdruk(page, sectie(page, id), `${id}.png`);
  }
});

test("hover: per sectie met een bruikbare knop een screenshot na hover op de eerste", async ({ page }) => {
  test.setTimeout(180_000);
  await openPagina(page);
  for (const id of await sectieIds(page)) {
    const knop = sectie(page, id).locator(BRUIKBARE_KNOP).first();
    if ((await knop.count()) === 0) continue;
    await knop.scrollIntoViewIfNeeded();
    await knop.hover();
    await schermafdruk(page, sectie(page, id), `${id}-hover.png`);
    await page.mouse.move(0, 0);
  }
});

test("focus: per sectie met een focusbaar element een screenshot na Tab (focus-visible)", async ({ page }) => {
  test.setTimeout(180_000);
  await openPagina(page);
  for (const id of await sectieIds(page)) {
    const eerste = sectie(page, id).locator(FOCUSBAAR).first();
    if ((await eerste.count()) === 0) continue;
    // Echt toetsenbord: terug naar het vorige focusbare element en dan Tab,
    // zodat de focusring via :focus-visible verschijnt.
    await eerste.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(eerste, `sectie ${id}: eerste focusbare element kreeg geen focus-visible`).toBeFocused();
    expect(await eerste.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    await schermafdruk(page, sectie(page, id), `${id}-focus.png`);
    await eerste.blur();
  }
});

test("axe: de hele pagina heeft 0 violations (WCAG 2.2 AA)", async ({ page }) => {
  await openPagina(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test("zonder inloggegevens geeft de pagina 401", async ({ playwright, baseURL }) => {
  // Expliciet undefined: de test-runner geeft anders de httpCredentials van test.use door.
  const zonder = await playwright.request.newContext({ baseURL, httpCredentials: undefined });
  try {
    const antwoord = await zonder.get(cfg.route);
    expect(antwoord.status()).toBe(401);
  } finally {
    await zonder.dispose();
  }
});

test("met een fout wachtwoord geeft de pagina 401", async ({ playwright, baseURL }) => {
  const fout = await playwright.request.newContext({
    baseURL,
    httpCredentials: { username: "systeem", password: `${cfg.testWachtwoord}-fout` },
  });
  try {
    expect((await fout.get(cfg.route)).status()).toBe(401);
  } finally {
    await fout.dispose();
  }
});
