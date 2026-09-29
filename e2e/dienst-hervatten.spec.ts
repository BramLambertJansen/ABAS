import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { USER, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

/**
 * "Dienst hervatten" (docs/features/dienst-per-sessie.md → vraag 24 (ii)): een
 * bardienst in de bezetting van een wees-dienst pakt hem na opnieuw inloggen
 * weer op. Supabase is gemockt via `page.route()` (zelfde aanpak als
 * e2e/dienst-te-lang-open.spec.ts): de echte database heeft hooguit één open
 * dienst die van het `describe.serial`-blok in e2e/a11y.spec.ts is. De echte
 * RPC (`resume_orphan_shift`, 0030) is gedekt door
 * supabase/tests/resume_orphan_shift.test.sql.
 */

const SHIFT_ID = "00000000-0000-4000-8000-0000000000c1";
const TOM = "Tom Willems";
const STARTER = "Femke Bos";

async function mockRest(page: Page, startedAt: string) {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(route, 200, {
      id: SHIFT_ID,
      started_at: startedAt,
      members: { name: STARTER },
      activity_types: { name: "Training" },
    })
  );
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
}

async function openBar(page: Page, opties: { orphan: boolean; inBezetting: boolean }) {
  const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await mockRest(page, startedAt);
  const sessie = await mockBarSessie(page, {
    naam: TOM,
    rol: "bardienst",
    voorgeregistreerd: "bar",
    bevestigd: true,
    otherShift: {
      id: SHIFT_ID,
      startedAt,
      startedByName: STARTER,
      activityTypeName: "Training",
      ...opties,
    },
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page
    .getByRole("heading", { name: "Er loopt al een dienst" })
    .waitFor({ state: "visible", timeout: 15_000 });
  return sessie;
}

test("een bezettinglid ziet bij een wees-dienst uitleg en knop, en hervat", async ({ page }) => {
  const sessie = await openBar(page, { orphan: true, inBezetting: true });

  await expect(page.getByText(/Jij staat in de bezetting en kunt hem hervatten\.$/)).toBeVisible();
  await expect(page.getByText(/Er is geen apparaat meer ingelogd in deze dienst\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Overnemen", exact: true })).toHaveCount(0);
  const knop = page.getByRole("button", { name: "Dienst hervatten", exact: true });
  await expect(knop).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

  await knop.click();

  // De dienst is nu de eigen dienst van de sessie: het scherm "Er loopt al een
  // dienst" maakt plaats voor de dienst zelf.
  await expect(page.getByRole("tab", { name: "Verkoop" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Er loopt al een dienst" })).toHaveCount(0);
  expect(sessie.hervattingen).toEqual([SHIFT_ID]);
});

test("een bardienst buiten de bezetting ziet de oude regel en geen knop", async ({ page }) => {
  await openBar(page, { orphan: true, inBezetting: false });

  await expect(
    page.getByText("Alleen een beheerder kan deze dienst overnemen of afsluiten.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Dienst hervatten" })).toHaveCount(0);
  await expect(page.getByText(/kunt hem hervatten/)).toHaveCount(0);
});

test("een dienst met een actieve koppeling elders blijft onaantastbaar, ook voor een bezettinglid", async ({
  page,
}) => {
  await openBar(page, { orphan: false, inBezetting: true });

  await expect(
    page.getByText("Alleen een beheerder kan deze dienst overnemen of afsluiten.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Dienst hervatten" })).toHaveCount(0);
});
