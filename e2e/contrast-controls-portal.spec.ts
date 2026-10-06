import { test, expect, type Page, type Route } from "@playwright/test";
import { USER, fakeSession, json, portalLoginMetWachtwoord } from "./helpers/supabaseMock";

/**
 * T12 (#132), deel C/D: begrensde portalbreedte (560px gecentreerd), 44px
 * touchdoelen voor Uitloggen en "Alle transacties", en geen overflow op 320px
 * met het zelf gehoste Manrope. Supabase via `page.route()`.
 */

type Rij = {
  id: string;
  kind: "bestelling" | "opwaardering";
  created_at: string;
  amount_cents: number;
  method: string | null;
  server_name: string | null;
  reversed: boolean;
  reversal_reason: string | null;
  reversed_via: "bar" | "beheer" | null;
  reversed_by_name: string | null;
};

const BASIS: Rij = {
  id: "x",
  kind: "bestelling",
  created_at: "2026-09-20T12:00:00Z",
  amount_cents: 500,
  method: null,
  server_name: "Tom Willems",
  reversed: false,
  reversal_reason: null,
  reversed_via: null,
  reversed_by_name: null,
};
const RIJEN: Rij[] = [
  {
    ...BASIS,
    id: "r1",
    created_at: "2026-09-25T12:00:00Z",
    amount_cents: 150,
    reversed: true,
    reversal_reason: "verkeerd product getikt",
    reversed_via: "bar",
    reversed_by_name: "Sanne Bakker",
  },
  ...[2, 3, 4, 5, 6, 7].map((n) => ({ ...BASIS, id: `r${n}`, created_at: `2026-09-${25 - n}T12:00:00Z` })),
];

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
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, (route) => json(route, 200, RIJEN));
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("heading", { name: /^Hoi / })).toBeVisible({ timeout: 15_000 });
}

async function geenHorizontaleScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe("1280px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("dashboard: één gecentreerde kolom van hooguit 560px, niets steekt eruit", async ({ page }) => {
    await openPortal(page);
    const kolom = page.getByRole("main");
    const box = (await kolom.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(560);
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(1);
    for (const el of [
      page.locator("main > header"),
      page.getByRole("tablist", { name: "Portaal-navigatie" }),
      page.getByRole("button", { name: "Alle transacties" }),
    ]) {
      const b = (await el.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(box.x);
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    }
    await page.getByRole("tab", { name: "Account" }).click();
    const accountBox = (await page.getByRole("main").boundingBox())!;
    expect(accountBox.width).toBeLessThanOrEqual(560);
    await geenHorizontaleScroll(page);
  });

  test("een profiel-sheet is niet breder dan de kolom", async ({ page }) => {
    await openPortal(page);
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByRole("button", { name: /Naam/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(560);
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(1);
  });

  test("het herstelscherm en het ongeldige-linkscherm volgen dezelfde kolom", async ({ page }) => {
    await page.goto("/portal/wachtwoord-herstellen");
    const box = (await page.getByRole("main").boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(560);
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(1);
  });
});

for (const breedte of [390, 320]) {
  test.describe(`${breedte}px`, () => {
    test.use({ viewport: { width: breedte, height: 800 } });

    test("geen overflow, Uitloggen en 'Alle transacties' >= 44px en in beeld, reversalregel volledig", async ({ page }) => {
      await openPortal(page, "Alexandra Wilhelmina van der Meulen-Schuurmans");
      await geenHorizontaleScroll(page);
      for (const naam of ["Uitloggen", "Alle transacties"]) {
        const knop = page.getByRole("button", { name: naam });
        await expect(knop).toBeVisible();
        const b = (await knop.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(breedte + 0.5);
      }
      const row = page.getByRole("listitem").filter({ hasText: "Teruggedraaid" });
      await expect(row.getByText("Teruggedraaid", { exact: true })).toBeVisible();
      await expect(row.getByText("Door: Sanne Bakker", { exact: true })).toBeVisible();
      await expect(row.getByText("Reden: verkeerd product getikt", { exact: true })).toBeVisible();
      await page.getByRole("tab", { name: "Transacties" }).click();
      await geenHorizontaleScroll(page);
    });
  });
}

test("het font is Manrope en komt van onze eigen server", async ({ page }) => {
  const externe: string[] = [];
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) externe.push(r.url());
  });
  await page.goto("/portal");
  await page.evaluate(() => document.fonts.ready);
  const familie = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(familie.toLowerCase()).toContain("manrope");
  expect(
    await page.evaluate(() =>
      [...document.fonts].some((f) => f.family.toLowerCase().includes("manrope") && f.status === "loaded")
    )
  ).toBe(true);
  expect(externe).toEqual([]);
});
