import { test, expect, type Page } from "@playwright/test";
import { scanAxe } from "./helpers/scanAxe";
import { USER, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

// UI-regressies, met queryfilters die de fixture daadwerkelijk toepast.
// RPC-autorisatie en geldattributie worden afzonderlijk live getest.
const SHIFT = "00000000-0000-4000-8000-0000000000a1";
const STAFF = [
  { id: "pin", name: "Met PIN", role: "bardienst", archived: false, has_pin: true },
  { id: "no-pin", name: "Zonder PIN", role: "beheerder", archived: false, has_pin: false },
  { id: "archived", name: "Gearchiveerde collega", role: "bardienst", archived: true, has_pin: true },
  { id: "changed-role", name: "Collega nu lid", role: "lid", archived: false, has_pin: false },
  { id: "ordinary", name: "Gewoon lid", role: "lid", archived: false, has_pin: false },
];

async function mockCrew(page: Page, crew = ["pin", "archived", "changed-role"]) {
  const state = {
    crew, staff: STAFF.map((member) => ({ ...member })), candidatesError: false,
    mutations: [] as Array<{ rpc: string; member: string }>,
    money: [] as Array<{ rpc: string; body: Record<string, unknown> }>,
  };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
  await mockBarSessie(page, {
    shift: { id: SHIFT, startedAt: new Date().toISOString(), startedByName: "Femke Bos", activityTypeName: "Training" },
  });
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has("auth_user_id")) return json(route, 200, { name: "Femke Bos", role: "beheerder" });
    if (params.get("select")?.includes("balance_cents")) return json(route, 200, [{ id: "payer", name: "Betalend lid", balance_cents: 2500 }]);
    // 500 is geen automatisch herhaalde GET; 503 test SDK-backoff in plaats
    // van het fout-/herstelgedrag van de overlay.
    if (state.candidatesError) return json(route, 500, { message: "private backend detail" });
    return json(route, 200, state.staff.filter((member) =>
      (!params.has("role") || params.get("role")!.includes(member.role)) &&
      (!params.has("archived") || String(member.archived) === params.get("archived")!.replace("eq.", "")) &&
      (!params.has("has_pin") || String(member.has_pin) === params.get("has_pin")!.replace("eq.", ""))
    ));
  });
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) => json(route, 200, state.crew.map((id) => ({
    member_id: id, added_at: new Date().toISOString(), members: { name: state.staff.find((m) => m.id === id)!.name },
  }))));
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) => json(route, 200, [{ id: "product", name: "Pils", category: "Bier", price_cents: 250 }]));
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) => json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 }));
  await page.route(/\/rest\/v1\/rpc\/(place_order_once|top_up_once)(\?|$)/, (route) => {
    const rpc = new URL(route.request().url()).pathname.split("/").at(-1)!;
    state.money.push({ rpc, body: route.request().postDataJSON() });
    return json(route, 200, rpc === "place_order_once" ? { total_cents: 250 } : { amount_cents: 500 });
  });
  await page.route(/\/rest\/v1\/rpc\/(add|remove)_shift_member(\?|$)/, (route) => {
    const rpc = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const body = route.request().postDataJSON() as { p_shift_id: string; p_member_id: string };
    expect(body.p_shift_id).toBe(SHIFT);
    state.mutations.push({ rpc, member: body.p_member_id });
    state.crew = rpc === "add_shift_member" ? [...state.crew, body.p_member_id] : state.crew.filter((id) => id !== body.p_member_id);
    return json(route, 200, null);
  });
  await loginMetWachtwoord(page, USER.email, "password");
  await page.getByRole("button", { name: /^Bar/ }).click();
  await page.getByRole("tab", { name: "Dienst" }).click();
  return state;
}

async function openCrew(page: Page) {
  await page.getByRole("button", { name: "Bezetting wijzigen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bezetting van deze dienst" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("bezetting zonder PIN, bestaande ongeschikte crew, zoeken en verwijderen", async ({ page }) => {
  const state = await mockCrew(page);
  const dialog = await openCrew(page);
  const noPin = dialog.getByRole("button", { name: /^Zonder PIN,/ });
  await expect(noPin).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: /^Gewoon lid/ })).toHaveCount(0);
  await expect(dialog.getByText("Niet meer beschikbaar om toe te voegen. Afmelden kan wel.")).toHaveCount(2);

  await noPin.click();
  await expect(noPin).toHaveAttribute("aria-pressed", "true");
  // Een PIN uitzetten verandert de kandidatenlijst niet.
  await dialog.getByRole("button", { name: "Klaar", exact: true }).click();
  state.staff[0].has_pin = false;
  try {
    const reopened = await openCrew(page);
    await expect(reopened.getByRole("button", { name: /^Met PIN,/ })).toHaveAttribute("aria-pressed", "true");
    await reopened.getByRole("button", { name: /^Gearchiveerde collega,/ }).click();
    await expect(reopened.getByRole("button", { name: /^Gearchiveerde collega/ })).toHaveCount(0);
    await reopened.getByRole("button", { name: /^Collega nu lid,/ }).click();
    await expect(reopened.getByRole("button", { name: /^Collega nu lid/ })).toHaveCount(0);
    await reopened.getByLabel("Zoek medewerker").fill("niemand");
    await expect(reopened.getByText("Geen medewerkers gevonden.")).toBeVisible();
    await reopened.getByLabel("Zoek medewerker").fill("zonder");
    await reopened.getByRole("button", { name: /^Zonder PIN,/ }).click();
    await expect(reopened.getByRole("button", { name: /^Zonder PIN,/ })).toHaveAttribute("aria-pressed", "false");
  } finally { state.staff[0].has_pin = true; }
  expect(state.mutations).toEqual([
    { rpc: "add_shift_member", member: "no-pin" },
    { rpc: "remove_shift_member", member: "archived" },
    { rpc: "remove_shift_member", member: "changed-role" },
    { rpc: "remove_shift_member", member: "no-pin" },
  ]);
});

for (const crew of [["no-pin"], ["pin", "no-pin"]]) {
  test(`afrekenen en opwaarderen met ${crew.length} uitvoerder(s), inclusief zonder PIN`, async ({ page }) => {
    const state = await mockCrew(page, crew);
    await page.getByRole("tab", { name: "Verkoop" }).click();
    await page.getByRole("button", { name: /^Pils,/ }).click();
    await page.getByLabel("Zoek lid op naam").fill("Betalend");
    await page.getByRole("option", { name: /Betalend lid/ }).click();
    await page.getByRole("button", { name: "Tik afrekenen" }).click();
    const checkout = page.getByRole("dialog", { name: /^Afrekenen bij/ });
    if (crew.length > 1) {
      await expect(checkout.getByRole("button", { name: "ja, afrekenen" })).toBeDisabled();
      await checkout.getByRole("button", { name: "Zonder PIN", exact: true }).click();
    } else {
      await expect(checkout.getByRole("group", { name: /Wie geeft uit/ })).toHaveCount(0);
    }
    await checkout.getByRole("button", { name: "ja, afrekenen" }).click();
    await expect(checkout).toBeHidden();
    await page.getByLabel("Zoek lid op naam").fill("Betalend");
    await page.getByRole("option", { name: /Betalend lid/ }).click();
    await page.getByRole("button", { name: /opwaarderen/i }).click();
    const topup = page.getByRole("dialog", { name: /^Saldo opwaarderen bij/ });
    await topup.getByLabel("Ander bedrag").fill("5");
    if (crew.length > 1) {
      await expect(topup.getByRole("button", { name: "boeken", exact: true })).toBeDisabled();
      await topup.getByRole("button", { name: "Zonder PIN", exact: true }).click();
    }
    await topup.getByRole("button", { name: "boeken", exact: true }).click();
    await expect(topup).toBeHidden();
    expect(state.money).toEqual([
      { rpc: "place_order_once", body: { p_request_id: expect.stringMatching(/^[a-f0-9-]{36}$/i), p_shift_id: SHIFT, p_member_id: "payer", p_lines: [{ product_id: "product", qty: 1 }], p_served_by: "no-pin" } },
      { rpc: "top_up_once", body: { p_request_id: expect.stringMatching(/^[a-f0-9-]{36}$/i), p_shift_id: SHIFT, p_member_id: "payer", p_amount_cents: 500, p_method: "cash", p_served_by: "no-pin" } },
    ]);
  });
}

test("een fout bij kandidaten verbergt bestaande crew niet en kan worden hersteld", async ({ page }) => {
  const state = await mockCrew(page);
  state.candidatesError = true;
  const dialog = await openCrew(page);
  await expect(dialog.getByText(/Kan de bardienst-lijst niet laden/)).toBeVisible();
  await expect(dialog.getByText("private backend detail")).toHaveCount(0);
  await dialog.getByRole("button", { name: /^Collega nu lid,/ }).click();
  await expect(dialog.getByRole("button", { name: /^Collega nu lid/ })).toHaveCount(0);
  state.candidatesError = false;
  await dialog.getByRole("button", { name: "Bardienst-lijst opnieuw laden" }).click();
  await expect(dialog.getByRole("button", { name: /^Zonder PIN,/ })).toBeVisible();
  await scanAxe(page);
});

test("kandidaten blijven uitgeschakeld totdat de bestaande crew bekend is", async ({ page }) => {
  await mockCrew(page, []);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, async (route) => {
    await held;
    return json(route, 200, [{ member_id: "no-pin", added_at: new Date().toISOString(), members: { name: "Zonder PIN" } }]);
  });
  await page.getByRole("tab", { name: "Verkoop" }).click();
  await page.getByRole("button", { name: /^Bezetting:/ }).click();
  const dialog = page.getByRole("dialog", { name: "Bezetting van deze dienst" });
  const noPin = dialog.getByRole("button", { name: /^Zonder PIN,/ });
  await expect(noPin).toBeDisabled();
  release();
  await expect(noPin).toBeEnabled();
  await expect(noPin).toHaveAttribute("aria-pressed", "true");
});
