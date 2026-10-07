import { test, expect, type Page } from "@playwright/test";
import { USER, fakeSession, json, loginMetWachtwoord, portalLoginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

const SHIFT = "00000000-0000-4000-8000-0000000000d1";
const MEMBER = "00000000-0000-4000-8000-0000000000d2";
const PRODUCT = "00000000-0000-4000-8000-0000000000d3";

async function mockAuth(page: Page) {
  await page.route(/\/auth\/v1\/token(\?|$)/, route => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, route => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, route => json(route, 200,
    route.request().headers().accept?.includes("vnd.pgrst.object") ? null : []));
}

async function openBar(page: Page) {
  await mockAuth(page);
  const data = { balance: 1240, price: 250, membersError: false };
  const startedAt = new Date().toISOString();
  await page.route(/\/rest\/v1\/products(\?|$)/, route => json(route, 200,
    [{ id: PRODUCT, name: "Pils", category: "Bier", price_cents: data.price }]));
  await page.route(/\/rest\/v1\/members(\?|$)/, route => data.membersError
    ? json(route, 500, { message: "testfout" })
    : json(route, 200, [{ id: MEMBER, name: "Anna de Vries", balance_cents: data.balance }]));
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, route => json(route, 200,
    [{ member_id: MEMBER, added_at: startedAt, members: { name: "Anna de Vries" } }]));
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, route => json(route, 200,
    { negative_limit_cents: 0, low_balance_threshold_cents: 1000 }));
  await mockBarSessie(page, {
    naam: "Tom Willems", rol: "bardienst", voorgeregistreerd: "bar", bevestigd: true,
    shift: { id: SHIFT, startedAt, startedByName: "Tom Willems", activityTypeName: "Repetitie" },
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("tab", { name: "Verkoop" })).toBeVisible();
  return data;
}

async function fillCart(page: Page) {
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("button", { name: /^Anna de Vries/ }).click();
  await expect(page.getByText("Voeg een product toe om af te rekenen.")).toBeVisible();
  await page.getByRole("button", { name: /^Pils,/ }).click();
  await page.getByRole("button", { name: /^Pils,/ }).click();
  await expect(page.getByRole("button", { name: /Tik afrekenen/ })).toBeEnabled();
}

test("mandje en lid blijven bij tabwissel; prijs en saldo worden ververst", async ({ page }, testInfo) => {
  const data = await openBar(page);
  await expect(page.getByText("Kies eerst een lid om af te rekenen.")).toBeVisible();
  await fillCart(page);
  await page.getByRole("tab", { name: "Dienst", exact: true }).click();
  data.balance = 100;
  data.price = 300;
  await page.getByRole("tab", { name: "Verkoop" }).click();
  await expect(page.getByText("Anna de Vries", { exact: true })).toBeVisible();
  await expect(page.getByText("2 stuks")).toBeVisible();
  await expect(page.getByRole("button", { name: /Tik afrekenen.*6,00/ })).toBeDisabled();
  await expect(page.getByText("Waardeer het saldo op om af te rekenen.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("bar-bewaard.png") });
});

test("opnieuw proberen na laadfout behoudt de bestelling", async ({ page }) => {
  const data = await openBar(page);
  await fillCart(page);
  await page.getByRole("tab", { name: "Dienst", exact: true }).click();
  data.membersError = true;
  await page.getByRole("tab", { name: "Verkoop" }).click();
  await expect(page.getByRole("button", { name: /Tik afrekenen/ })).toBeDisabled();
  await expect(page.getByText("Leden konden niet worden geladen. Probeer het opnieuw.")).toBeVisible();
  data.membersError = false;
  await page.getByRole("button", { name: "Opnieuw proberen", exact: true }).click();
  await expect(page.getByRole("button", { name: /Tik afrekenen.*5,00/ })).toBeEnabled();
  await expect(page.getByText("2 stuks")).toBeVisible();
});

test("recente transacties tonen dezelfde terugdraaiing als de volledige lijst", async ({ page }, testInfo) => {
  await mockAuth(page);
  await page.route(/\/rest\/v1\/members(\?|$)/, route => json(route, 200,
    { id: MEMBER, name: "Anna de Vries", role: "lid", archived: false, balance_cents: 1240 }));
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, route => json(route, 200,
    { negative_limit_cents: 0, low_balance_threshold_cents: 1000 }));
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, route => json(route, 200, [{
    id: "order-1", kind: "bestelling", created_at: "2020-01-15T12:00:00Z", amount_cents: 500,
    method: null, server_name: "Tom", reversed: true, reversal_reason: "Verkeerd lid",
    reversed_via: "bar", reversed_by_name: "Tom",
  }]));
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("heading", { name: "RECENTE TRANSACTIES" })).toBeVisible();
  const row = page.getByRole("tabpanel").getByRole("listitem");
  await expect(row).toContainText("teruggedraaid");
  await expect(row.getByText("Bestelling", { exact: true })).toHaveCSS("text-decoration-line", "line-through");
  const preview = (await row.textContent())!;
  await page.screenshot({ path: testInfo.outputPath("portal-recent.png") });
  await page.getByRole("tab", { name: "Transacties", exact: true }).click();
  await expect(row).toHaveText(preview);
});
