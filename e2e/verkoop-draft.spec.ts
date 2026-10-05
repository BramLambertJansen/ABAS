import { test, expect, type Page } from "@playwright/test";
import { USER, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

// UI-contract tegen veranderlijke query-antwoorden. De bestaande live
// geldtests bewaken apart dat place_order bedrag en attributie bepaalt.
async function verkoop(page: Page) {
  const shift = { id: "shift-1", startedAt: new Date().toISOString(), startedByName: "Femke Bos", activityTypeName: "Training" };
  const state = {
    products: [
      { id: "pils", name: "Pils", category: "Bier", price_cents: 250 },
      { id: "water", name: "Water", category: "Fris", price_cents: 100 },
    ],
    members: [
      { id: "payer", name: "Betalend lid", balance_cents: 2500 },
      { id: "other", name: "Ander lid", balance_cents: 2500 },
    ],
    crew: ["Femke Bos"],
    orders: [] as Record<string, unknown>[],
    productReads: 0,
  };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
  const session = await mockBarSessie(page, { shift });
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    if (new URL(route.request().url()).searchParams.has("auth_user_id")) {
      return json(route, 200, { name: "Femke Bos", role: "beheerder" });
    }
    return json(route, 200, state.members);
  });
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) => {
    state.productReads++;
    return json(route, 200, state.products);
  });
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) => json(route, 200,
    state.crew.map((name) => ({ member_id: name, added_at: new Date().toISOString(), members: { name } }))));
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) => json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 }));
  await page.route(/\/rest\/v1\/activity_types(\?|$)/, (route) => json(route, 200, [{ id: "training", name: "Training" }]));
  await page.route(/\/rest\/v1\/rpc\/place_order_once(\?|$)/, (route) => {
    state.orders.push(route.request().postDataJSON());
    return json(route, 200, { total_cents: 500 });
  });
  await page.route(/\/rest\/v1\/rpc\/end_shift(\?|$)/, (route) => {
    session.dienstGesloten = true;
    return json(route, 200, null);
  });
  await page.route(/\/rest\/v1\/rpc\/start_shift(\?|$)/, (route) => {
    shift.id = "shift-2";
    session.dienstGesloten = false;
    return json(route, 200, null);
  });
  await loginMetWachtwoord(page, USER.email, "password");
  await page.getByRole("button", { name: /^Bar/ }).click();
  await expect(page.getByRole("heading", { name: "Bar", exact: true })).toBeVisible();
  await page.getByLabel("Zoek lid").fill("Betalend");
  await page.getByRole("option", { name: /Betalend lid/ }).click();
  await page.getByLabel("Zoek product", { exact: true }).fill("Pils");
  await page.getByRole("button", { name: /^Pils/ }).click();
  await page.getByRole("button", { name: "Eén Pils meer" }).click();
  return { state, shift, session };
}

async function heenEnTerug(page: Page) {
  await page.getByRole("tab", { name: "Dienst", exact: true }).click();
  await page.getByRole("tab", { name: "Verkoop", exact: true }).click();
  await expect(page.getByLabel("Zoek product", { exact: true })).toBeVisible();
}

const checkout = (page: Page) => page.getByRole("button", { name: /Tik afrekenen/ });

test("twee tabwissels bewaren lid, regels, aantallen en weergave; afrekening wist de draft", async ({ page }) => {
  const { state } = await verkoop(page);
  await page.getByRole("button", { name: "lijst", exact: true }).click();
  await heenEnTerug(page);
  await heenEnTerug(page);
  await expect(page.getByLabel("Zoek product", { exact: true })).toHaveValue("Pils");
  await expect(page.getByRole("button", { name: "lijst", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("2 stuks", { exact: true })).toBeVisible();
  await expect(checkout(page)).toBeEnabled();
  expect(state.productReads).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: "/tmp/abas-t03-draft.png" });
  await checkout(page).click();
  const dialog = page.getByRole("dialog", { name: "Afrekenen bij Betalend lid" });
  await expect(dialog.getByText("2× Pils")).toBeVisible();
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click();
  await expect(page.getByText("nog niets getikt", { exact: true })).toBeVisible();
  expect(state.orders).toEqual([{
    p_shift_id: "shift-1", p_member_id: "payer",
    p_lines: [{ product_id: "pils", qty: 2 }], p_served_by: "Femke Bos",
  }]);
  await heenEnTerug(page);
  await expect(page.getByLabel("Zoek lid")).toBeVisible();
  await expect(page.getByText("nog niets getikt", { exact: true })).toBeVisible();
});

test("verse prijzen, saldo en crew gelden voor de bewaarde draft en bevestiging", async ({ page }) => {
  const { state } = await verkoop(page);
  await page.getByRole("tab", { name: "Dienst", exact: true }).click();
  state.products[0].price_cents = 300;
  state.members[0].balance_cents = 100;
  state.crew = [];
  await page.getByRole("tab", { name: "Verkoop", exact: true }).click();
  await expect(page.getByText("€ 3,00 p/st", { exact: true })).toBeVisible();
  await expect(checkout(page)).toContainText("6,00");
  await expect(checkout(page)).toBeDisabled();
  await expect(page.getByText(/Onvoldoende saldo/)).toContainText("5,00 tekort");
  await expect(page.getByText(/Afrekenen bij een lege bezetting/)).toBeVisible();
  state.members[0].balance_cents = 2000;
  state.crew = ["Sanne Bakker", "Andere collega"];
  await heenEnTerug(page);
  await expect(checkout(page)).toBeEnabled();
  await checkout(page).click();
  const dialog = page.getByRole("dialog", { name: "Afrekenen bij Betalend lid" });
  await expect(dialog.getByText(/saldo.*20,00/)).toBeVisible();
  await expect(dialog.getByText("€ 6,00", { exact: true })).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "ja, afrekenen" })).toBeDisabled();
  await dialog.getByRole("button", { name: /Sanne Bakker/ }).click();
  await expect(dialog.getByRole("button", { name: "ja, afrekenen" })).toBeEnabled();
});

test("archivering houdt product herkenbaar/verwijderbaar en blokkeert een verdwenen lid", async ({ page }) => {
  const { state } = await verkoop(page);
  state.products = state.products.filter((p) => p.id !== "pils");
  await heenEnTerug(page);
  await expect(page.getByRole("button", { name: "Verwijder Pils uit het mandje" })).toBeVisible();
  await expect(page.getByText("€ 2,50 p/st", { exact: true })).toBeVisible();
  await expect(page.getByText(/een product in je mandje is niet meer beschikbaar/)).toBeVisible();
  await expect(checkout(page)).toBeDisabled();
  await page.getByRole("button", { name: "Verwijder Pils uit het mandje" }).click();
  await page.getByLabel("Zoek product", { exact: true }).fill("Water");
  await page.getByRole("button", { name: /^Water/ }).click();
  state.members = state.members.filter((m) => m.id !== "payer");
  await heenEnTerug(page);
  await expect(page.getByText(/dit lid bestaat niet meer of is gearchiveerd/)).toBeVisible();
  await expect(checkout(page)).toBeDisabled();
  expect(state.orders).toHaveLength(0);
});

test("lidwisselveiligheid en nog niet afgeronde ledenzoekterm overleven tabwissels", async ({ page }) => {
  await verkoop(page);
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await page.getByLabel("Zoek lid").fill("Betalend");
  await heenEnTerug(page);
  await expect(page.getByLabel("Zoek lid")).toHaveValue("Betalend");
  // De lijst staat na een tabwissel gesloten tot de eerste toets of ArrowDown (T07).
  await page.getByLabel("Zoek lid").press("ArrowDown");
  await page.getByRole("option", { name: /Betalend lid/ }).click();
  await expect(page.getByText("2 stuks", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await heenEnTerug(page);
  await page.getByLabel("Zoek lid").fill("Ander");
  await page.getByRole("option", { name: /Ander lid/ }).click();
  // Een ander lid met een gevuld mandje vraagt eerst een bevestiging (T07).
  await page.getByRole("button", { name: "Wissen en kiezen" }).click();
  await expect(page.getByText("nog niets getikt", { exact: true })).toBeVisible();
});

test("afsluiten en een nieuwe dienst krijgen geen oude draft", async ({ page }) => {
  await verkoop(page);
  await page.getByRole("tab", { name: "Dienst", exact: true }).click();
  await page.getByRole("button", { name: "Dienst afsluiten", exact: true }).click();
  await page.getByRole("dialog", { name: "Dienst afsluiten" }).getByRole("button", { name: "dienst afsluiten", exact: true }).click();
  await page.getByRole("combobox", { name: "Activiteit" }).click();
  await page.getByRole("option", { name: "Training", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bar", exact: true })).toBeVisible();
  await expect(page.getByLabel("Zoek lid")).toHaveValue("");
  await expect(page.getByLabel("Zoek product", { exact: true })).toHaveValue("");
  await expect(page.getByText("nog niets getikt", { exact: true })).toBeVisible();
});

test("laden en leesfouten geven geen afrekening op bewaarde snapshots", async ({ page }) => {
  const { state } = await verkoop(page);
  await page.getByRole("tab", { name: "Dienst", exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/rest\/v1\/products(\?|$)/, async (route) => {
    await held;
    return json(route, 500, { message: "private backend detail" });
  });
  await page.getByRole("tab", { name: "Verkoop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Verwijder Pils uit het mandje" })).toBeVisible();
  await expect(checkout(page)).toBeDisabled();
  release();
  await expect(page.getByText(/Kan het assortiment niet laden/).first()).toBeVisible();
  await expect(checkout(page)).toBeDisabled();
  expect(state.orders).toHaveLength(0);
});

test("een open of lopende afrekening kan niet via de rail worden onderbroken", async ({ page }) => {
  await verkoop(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/rest\/v1\/rpc\/place_order_once(\?|$)/, async (route) => {
    await held;
    return json(route, 200, { total_cents: 500 });
  });
  await expect(checkout(page)).toBeEnabled();
  await checkout(page).click();
  const dialog = page.getByRole("dialog", { name: "Afrekenen bij Betalend lid" });
  const dienst = page.getByRole("tab", { name: "Dienst", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dienst.evaluate((b) => !!b.closest("[inert]"))).toBe(true);
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click();
  await page.keyboard.press("Escape");
  // Echte muisklik op de plek van de rail: de inert-achtergrond vangt hem niet
  // op de knop, en de lopende afrekening blijft staan.
  const box = await dienst.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "bezig…" })).toBeDisabled();
  release();
  await expect(dialog).toHaveCount(0);
  expect(await dienst.evaluate((b) => !!b.closest("[inert]"))).toBe(false);
  await heenEnTerug(page);
  await expect(page.getByText("nog niets getikt", { exact: true })).toBeVisible();
});
