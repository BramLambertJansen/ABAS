import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  USER,
  alertOf,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
} from "./helpers/supabaseMock";

/**
 * Bestelling terugdraaien in beheer (docs/features/bestelling-terugdraaien.md
 * → Beheer): Leden → lid beheren → "Bestelling terugdraaien". Zonder echte
 * database, zelfde aanpak als e2e/ledenbeheer-invite.spec.ts — de RPC
 * reverse_order_as_admin zelf (bedrag, autorisatie, weigergronden) is
 * supabase/tests/reverse_order.test.sql's werk. Wat dit wél toetst: dat de
 * client alleen order-id + reden meestuurt (nooit een bedrag, CLAUDE.md →
 * "Geld beweegt alleen via RPC"), dat er zonder reden niets verstuurd kan
 * worden, hoe een foutcode wordt getoond, en WCAG-AA van de overlay.
 */

const LID = {
  id: "00000000-0000-4000-8000-0000000000bb",
  name: "Anna de Vries",
  role: "lid",
  balance_cents: 1240,
  archived: false,
  auth_user_id: null,
  has_pin: false,
  email: null,
  invited_at: null,
};

const ORDER_OPEN = "00000000-0000-4000-8000-0000000000c1";
const ORDER_REVERSED = "00000000-0000-4000-8000-0000000000c2";

const ORDERS = [
  {
    id: ORDER_OPEN,
    created_at: "2026-09-20T21:42:00Z",
    total_cents: 750,
    order_lines: [{ qty: 3 }],
    order_reversals: null,
  },
  {
    id: ORDER_REVERSED,
    created_at: "2026-09-19T20:10:00Z",
    total_cents: 250,
    order_lines: [{ qty: 1 }],
    order_reversals: { order_id: ORDER_REVERSED },
  },
];

async function mockBeheerder(page: Page, reverse: [number, unknown]) {
  const reverseCalls: Array<Record<string, unknown>> = [];

  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const isBeheerder = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    const row = isBeheerder ? { name: "Femke Bos", role: "beheerder", has_pin: false } : null;
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  });
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) => json(route, 200, [LID]));
  // Sinds dienst-per-sessie registreert de keuze "Beheer" de sessie (ADR 0016).
  await mockBarSessie(page);
  await page.route(/\/rest\/v1\/orders(\?|$)/, (route) => {
    const url = route.request().url();
    return json(route, 200, url.includes(`member_id=eq.${LID.id}`) ? ORDERS : []);
  });
  await page.route(/\/rest\/v1\/rpc\/reverse_order_as_admin(\?|$)/, (route) => {
    reverseCalls.push(route.request().postDataJSON());
    return json(route, reverse[0], reverse[1]);
  });

  return reverseCalls;
}

async function openBestellingen(page: Page) {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: "Leden" }).click();
  await page.getByRole("button", { name: LID.name }).click();
  await page.getByRole("button", { name: /^Bestelling terugdraaien/ }).click();
  const dialog = page.getByRole("dialog", { name: "Bestelling terugdraaien" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("teruggedraaid", { exact: true })).toBeVisible();
  return dialog;
}

test("terugdraaien in beheer: alleen order-id en reden gaan mee, met bevestiging", async ({
  page,
}) => {
  const calls = await mockBeheerder(page, [
    200,
    { order_id: ORDER_OPEN, refunded_cents: 750, reason: "verkeerd lid getikt" },
  ]);
  const dialog = await openBestellingen(page);

  // Rij openen zonder reden: bevestigen kan nog niet.
  await dialog.getByRole("button", { name: /terugdraaien →/ }).click();
  await expect(dialog.getByText("Vul eerst een reden in.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "terugdraaien", exact: true })).toBeDisabled();

  await dialog.getByLabel("Reden").fill("verkeerd lid getikt");
  await expect(
    dialog.getByText("Terugdraaien zet € 7,50 terug op het saldo van Anna de Vries.")
  ).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

  await dialog.getByRole("button", { name: "terugdraaien", exact: true }).click();

  await expect(dialog.getByText("Bestelling teruggedraaid · € 7,50")).toBeVisible();
  expect(calls).toEqual([{ p_order_id: ORDER_OPEN, p_reason: "verkeerd lid getikt" }]);
});

test("terugdraaien in beheer: already_reversed → vaste melding", async ({ page }) => {
  await mockBeheerder(page, [
    400,
    { code: "P0001", message: "already_reversed", details: null, hint: null },
  ]);
  const dialog = await openBestellingen(page);

  await dialog.getByLabel("Reden").fill("dubbel getikt");
  await dialog.getByRole("button", { name: /terugdraaien →/ }).click();
  await dialog.getByRole("button", { name: "terugdraaien", exact: true }).click();

  await expect(alertOf(page)).toHaveText("deze bestelling is al teruggedraaid");
});
