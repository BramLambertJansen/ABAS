import { test, expect, type Page } from "@playwright/test";
import { USER, fakeSession, json } from "./helpers/supabaseMock";
import { koppelTablet } from "./helpers/tabletKoppelen";

/**
 * De melding "Dienst staat nog open" (docs/features/dienst-te-lang-open.md →
 * Testgevallen → Functionele e2e): de vier gedragingen die in React-state
 * zitten en dus niet unit-testbaar zijn (de pure beslissing zelf staat in
 * test/dienstTeLangOpen.test.ts).
 *
 * De koppeling is echt (koppelTablet, BAR_DEVICE_SECRET, zie
 * e2e/tablet-koppelen.spec.ts); daarna mockt elke test de REST-lezingen van
 * de browser via `page.route()`, zelfde aanpak als
 * e2e/bestelling-terugdraaien.spec.ts. Zo bepaalt de test zelf `started_at`,
 * en raakt hij de ene gedeelde open dienst van de echte database niet — die
 * is van het `describe.serial`-block in e2e/a11y.spec.ts, dat parallel aan
 * dit bestand kan draaien. De browserklok loopt via `page.clock`, zodat een
 * uur snooze in een seconde voorbij is.
 */

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const SHIFT_ID = "00000000-0000-4000-8000-0000000000d1";
const TOM = { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom Willems" };
const ANNA = { id: "00000000-0000-4000-8000-0000000000d3", name: "Anna de Vries" };

/** Een sessie die voor de verschoven browserklok niet verlopen is: de
 *  auto-refresh van auth-js vuurt bij elke klokspong, en mag dan geen
 *  refresh-lus beginnen. */
function longLivedSession() {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  return { ...fakeSession(), expires_in: exp - Math.floor(Date.now() / 1000), expires_at: exp };
}

async function mockBar(page: Page, startedAt: string) {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, longLivedSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(route, 200, {
      id: SHIFT_ID,
      started_at: startedAt,
      members: { name: TOM.name },
      activity_types: { name: "Training" },
    })
  );
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) =>
    json(route, 200, [
      { member_id: TOM.id, added_at: startedAt, members: { name: TOM.name } },
    ])
  );
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) =>
    json(route, 200, [
      { id: "00000000-0000-4000-8000-0000000000e1", name: "Pils", category: "Bier", price_cents: 250 },
    ])
  );
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) =>
    json(route, 200, [{ id: ANNA.id, name: ANNA.name, balance_cents: 1240 }])
  );
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
}

/** Koppelt, zet de mocks met een dienst die `openForMs` geleden startte, en
 *  opent `/` op de Verkoop-tab. De klok is vóór de eerste navigatie
 *  geïnstalleerd en loopt tot een `fastForward` gewoon mee. */
async function openBar(page: Page, openForMs: number) {
  await page.clock.install();
  await koppelTablet(page);
  await mockBar(page, new Date(Date.now() - openForMs).toISOString());
  await page.goto("/");
  await page
    .getByRole("tab", { name: "Verkoop" })
    .waitFor({ state: "visible", timeout: 15_000 });
}

function melding(page: Page) {
  return page.getByRole("dialog", { name: "Dienst staat nog open" });
}

/** Geen melding, ook niet na een korte wachttijd: een render na de tick
 *  mag niet net na de assertie alsnog binnenkomen. */
async function expectNoMelding(page: Page) {
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("uitstellen: de melding wacht tot Afrekenen dicht is, en komt dan meteen (besluit 7)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS - 3 * MINUTE_MS);

  await page.getByRole("button", { name: /^Pils,/ }).click();
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("button", { name: /Anna de Vries/ }).click();
  await page.getByRole("button", { name: "Tik afrekenen" }).click();
  const afrekenen = page.getByRole("dialog", { name: /^Afrekenen bij/ });
  await expect(afrekenen).toBeVisible();

  await page.clock.fastForward("05:00");

  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(afrekenen).toBeVisible();

  await afrekenen.getByRole("button", { name: "annuleren" }).click();

  await expect(melding(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("annuleren in het afsluitoverzicht telt als 'Nog bezig' (besluit 8)", async ({ page }) => {
  await openBar(page, 6 * HOUR_MS + 5 * MINUTE_MS);

  await expect(melding(page)).toBeVisible();
  await melding(page).getByRole("button", { name: "Dienst afsluiten" }).click();

  const afsluiten = page.getByRole("dialog", { name: "Dienst afsluiten" });
  await expect(afsluiten).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await afsluiten.getByRole("button", { name: "annuleren" }).click();
  await expectNoMelding(page);

  await page.clock.fastForward("59:00");
  await expectNoMelding(page);

  await page.clock.fastForward("01:00");
  await expect(melding(page)).toBeVisible();
});

test("Escape telt als 'Nog bezig' (besluit 10)", async ({ page }) => {
  await openBar(page, 6 * HOUR_MS + 5 * MINUTE_MS);

  await expect(melding(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expectNoMelding(page);

  await page.clock.fastForward("59:00");
  await expectNoMelding(page);

  await page.clock.fastForward("01:00");
  await expect(melding(page)).toBeVisible();
});

test("de melding verschijnt over de Verkoop-tab heen en laat het mandje staan (besluit 4)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS - 3 * MINUTE_MS);

  await page.getByRole("button", { name: /^Pils,/ }).click();
  const mandjeregel = page.getByRole("button", { name: "Verwijder Pils uit het mandje" });
  await expect(mandjeregel).toBeVisible();

  await page.clock.fastForward("05:00");

  await expect(melding(page)).toBeVisible();
  await expect(melding(page)).toHaveAccessibleDescription(
    "Deze dienst staat al 6 uur open. Klopt dat?"
  );
  await expect(page.getByRole("tab", { name: "Verkoop" })).toHaveAttribute("aria-selected", "true");

  await melding(page).getByRole("button", { name: "Nog bezig" }).click();

  await expect(melding(page)).toBeHidden();
  await expect(mandjeregel).toBeVisible();
});
