import { test, expect, type Page } from "@playwright/test";
import { scanAxe } from "./helpers/scanAxe";
import { alertOf, json } from "./helpers/supabaseMock";

/**
 * Gearchiveerd lid, of geen bar-rol meer, tussen het laden van de namenlijst
 * en de login (docs/features/dienst-per-sessie.md → Randgevallen en Teksten →
 * Gearchiveerd lid): de login geeft `not_allowed`, de app gaat terug naar de
 * namenlijst en ververst die, en de goedgekeurde tekst blijft daar staan. Voor
 * het PIN- en het wachtwoordpad.
 *
 * Zonder echte database: de server-only Route Handlers onder `/inloggen/`
 * worden via `page.route()` gemockt. Wat `not_allowed` server-side oplevert,
 * is gedekt door supabase/tests/verify_bar_pin.test.sql en
 * test/barLogin.test.ts.
 */

const TEKST = "je kunt niet op de bar inloggen — vraag een beheerder";

const LID = { id: "00000000-0000-4000-8000-0000000000d1", name: "Joris de Vries" };
const ANDER = { id: "00000000-0000-4000-8000-0000000000d2", name: "Sanne Smit" };

async function mockInloggen(page: Page, opties: { pin: boolean }) {
  const namenAanvragen: number[] = [];
  // Zonder sessie: alles onder /auth/v1 en /rest/v1 leeg of "niet ingelogd".
  await page.route(/\/auth\/v1\//, (route) => json(route, 401, { code: "no_session", msg: "geen sessie" }));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, { session: null }));

  // Eerste keer met het lid, daarna (na de verversing) zonder.
  await page.route(/\/inloggen\/namen(\?|$)/, (route) => {
    namenAanvragen.push(Date.now());
    const namen = namenAanvragen.length === 1 ? [LID, ANDER] : [ANDER];
    return json(route, 200, { ok: true, namen });
  });
  await page.route(/\/inloggen\/opties(\?|$)/, (route) =>
    json(route, 200, { ok: true, pinAvailable: opties.pin, pinLocked: false })
  );
  await page.route(/\/inloggen\/pin(\?|$)/, (route) => json(route, 200, { ok: false, code: "not_allowed" }));
  await page.route(/\/inloggen\/wachtwoord(\?|$)/, (route) =>
    json(route, 200, { ok: false, code: "not_allowed" })
  );
  return namenAanvragen;
}

async function kiesLid(page: Page) {
  await page.goto("/");
  const knop = page.getByRole("button", { name: new RegExp(`^${LID.name}\\b`) });
  await knop.waitFor({ state: "visible", timeout: 15_000 });
  await knop.click();
}

async function verwachtMeldingBijNamenlijst(page: Page, namenAanvragen: number[]) {
  // Terug op de namenlijst, ververst: het lid staat er niet meer in.
  await expect(page.getByRole("button", { name: new RegExp(`^${ANDER.name}\\b`) })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: new RegExp(`^${LID.name}\\b`) })).toHaveCount(0);
  expect(namenAanvragen.length).toBeGreaterThanOrEqual(2);
  // De goedgekeurde tekst staat bij de namenlijst.
  await expect(alertOf(page).filter({ hasText: TEKST })).toBeVisible();

  // Muis weg van de knoppen vóór de scan (hover-kleuren).
  await page.mouse.move(0, 0);
  await scanAxe(page);
}

test("PIN-pad: not_allowed toont de tekst bij de verversde namenlijst", async ({ page }) => {
  const namenAanvragen = await mockInloggen(page, { pin: true });
  await kiesLid(page);

  await expect(page.getByText("Voer je pincode in")).toBeVisible({ timeout: 15_000 });
  for (const cijfer of ["1", "2", "3", "4"]) {
    await page.getByRole("button", { name: `Cijfer ${cijfer}`, exact: true }).click();
  }

  await verwachtMeldingBijNamenlijst(page, namenAanvragen);
});

test("wachtwoordpad: not_allowed toont de tekst bij de verversde namenlijst", async ({ page }) => {
  const namenAanvragen = await mockInloggen(page, { pin: false });
  await kiesLid(page);

  const veld = page.locator('input[type="password"]');
  await veld.waitFor({ state: "visible", timeout: 15_000 });
  await veld.fill("geheim-wachtwoord");
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();

  await verwachtMeldingBijNamenlijst(page, namenAanvragen);
});

test("de melding verdwijnt zodra je een andere naam kiest", async ({ page }) => {
  await mockInloggen(page, { pin: false });
  await kiesLid(page);

  const veld = page.locator('input[type="password"]');
  await veld.waitFor({ state: "visible", timeout: 15_000 });
  await veld.fill("geheim-wachtwoord");
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(alertOf(page).filter({ hasText: TEKST })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: new RegExp(`^${ANDER.name}\\b`) }).click();
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(TEKST)).toHaveCount(0);
});
