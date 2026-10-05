import { test, expect, type Page, type Route } from "@playwright/test";
import {
  USER,
  alertOf,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
  portalLoginMetWachtwoord,
} from "./helpers/supabaseMock";

/**
 * Aanvulling van de Tester op e2e/leesfouten-herstel.spec.ts (T08, #128):
 * grensgevallen van de 30 s-drempel met een bevroren klok (29 s / 31 s),
 * geen polling, het "Bijgewerkt om"-label onder een andere browser-tijdzone,
 * de mislukte verversing op Transacties (status, geen alert, filter blijft),
 * de "Log opnieuw in"-tekst bij een ontbrekende members-rij, en de bar:
 * fase `fout` zonder uitlogknop of e-mailingang, en fail-closed (na een
 * fout staat er geen oude data op het scherm).
 */

const OUD = [
  {
    id: "a1",
    kind: "opwaardering",
    created_at: "2026-09-24T12:00:00Z",
    amount_cents: 1000,
    method: "cash",
    server_name: "Tom Willems",
    reversed: false,
    reversal_reason: null,
    reversed_via: null,
    reversed_by_name: null,
  },
  {
    id: "a2",
    kind: "bestelling",
    created_at: "2026-09-23T12:00:00Z",
    amount_cents: 250,
    method: null,
    server_name: "Tom Willems",
    reversed: false,
    reversal_reason: null,
    reversed_via: null,
    reversed_by_name: null,
  },
];

type Staat = {
  saldo: number;
  balanceModus: "ok" | 500 | "geenRij";
  txModus: "ok" | 500;
  n: { balance: number; tx: number; settings: number };
};

async function mockPortal(page: Page): Promise<Staat> {
  const staat: Staat = { saldo: 1500, balanceModus: "ok", txModus: "ok", n: { balance: 0, tx: 0, settings: 0 } };
  const objectOrList = (route: Route, row: unknown) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : [row]);
  };
  const stuk = (route: Route) => json(route, 500, { code: "PGRST301", message: "kapot", details: null, hint: null });
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const url = decodeURIComponent(route.request().url());
    if (!url.includes(`auth_user_id=eq.${USER.id}`)) return objectOrList(route, null);
    if (url.includes("balance_cents")) {
      staat.n.balance++;
      if (staat.balanceModus === 500) return stuk(route);
      if (staat.balanceModus === "geenRij") return objectOrList(route, null);
      return objectOrList(route, { name: "Mock Lid", balance_cents: staat.saldo });
    }
    return objectOrList(route, { name: "Mock Lid", role: "lid", archived: false, has_pin: false });
  });
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) => {
    staat.n.settings++;
    return objectOrList(route, { low_balance_threshold_cents: 1000 });
  });
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, (route) => {
    staat.n.tx++;
    return staat.txModus === 500 ? stuk(route) : json(route, 200, OUD);
  });
  await page.route(/\/rest\/v1\/order_lines(\?|$)/, (route) => json(route, 200, []));
  return staat;
}

async function openPortal(page: Page, staat: Staat) {
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("heading", { name: "Hoi Mock" })).toBeVisible({ timeout: 15_000 });
  void staat;
}

const stuurVisibilitychange = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
const verversKnop = (page: Page) => page.getByRole("button", { name: /^Verversen/ });
const rustig = (page: Page) => page.waitForTimeout(400);

test.describe("portal: 30 s-drempel met bevroren klok", () => {
  test("terugkeer na 29 s ververst niet, na 31 s wel; geen polling in tien minuten", async ({ page }) => {
    await page.clock.install();
    const staat = await mockPortal(page);
    await openPortal(page, staat);
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("15,00");

    // Klok bevriezen en een lezing doen op het bevroren moment: vanaf nu is de
    // leeftijd van de gegevens exact te sturen.
    await page.clock.pauseAt(new Date(Date.now() + 5_000));
    await verversKnop(page).click();
    await expect(page.getByText(/^Bijgewerkt om \d{2}:\d{2}$/)).toBeVisible();
    await expect.poll(() => staat.n.balance).toBe(2);
    await rustig(page);
    const basis = { ...staat.n };

    await page.clock.fastForward(29_000);
    staat.saldo = 2500;
    await stuurVisibilitychange(page);
    await rustig(page);
    expect(staat.n).toEqual(basis);
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("15,00");

    await page.clock.fastForward(2_000); // 31 s oud
    await stuurVisibilitychange(page);
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("25,00");
    expect(staat.n).toEqual({ balance: basis.balance + 1, tx: basis.tx + 1, settings: basis.settings + 1 });

    // Geen polling: tien minuten klok zonder gebeurtenis geeft geen enkele lezing.
    const na = { ...staat.n };
    await page.clock.runFor(10 * 60_000);
    await rustig(page);
    expect(staat.n).toEqual(na);
  });
});

for (const timezoneId of ["Pacific/Auckland", "America/Los_Angeles"]) {
  test.describe(`portal: Bijgewerkt om onder browser-tijdzone ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("het label volgt Europe/Amsterdam, niet de zone van het apparaat", async ({ page }) => {
      // 10:05 UTC is 12:05 in Amsterdam (zomertijd); Auckland en Los Angeles wijken af.
      await page.clock.install({ time: new Date("2026-07-01T10:05:00Z") });
      const staat = await mockPortal(page);
      await openPortal(page, staat);
      await expect(page.getByText(/^Bijgewerkt om \d{2}:\d{2}$/)).toBeVisible();
      const label = (await page.getByText(/^Bijgewerkt om \d{2}:\d{2}$/).textContent()) ?? "";
      expect(label).toMatch(/^Bijgewerkt om 12:0[5-9]$/);
    });
  });
}

test.describe("portal: overige leesfoutgevallen", () => {
  test("Transacties: een mislukte verversing laat de lijst en het filter staan, role=status en geen alert", async ({ page }) => {
    await page.clock.install();
    const staat = await mockPortal(page);
    await openPortal(page, staat);
    await page.getByRole("tab", { name: "Transacties" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Uitgaven" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(1);

    staat.txModus = 500;
    await verversKnop(page).click();
    const melding = page.getByRole("status").filter({ hasText: "Verversen mislukt." });
    await expect(melding).toContainText("serverkant");
    await expect(melding).toContainText("Je ziet de gegevens van");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Uitgaven" })).toHaveAttribute("aria-pressed", "true");
    await expect(alertOf(page).filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(verversKnop(page)).toBeFocused();
  });

  test("Saldo: geen members-rij voor het saldo geeft 'Log opnieuw in', geen verbindingstekst", async ({ page }) => {
    await page.clock.install();
    const staat = await mockPortal(page);
    staat.balanceModus = "geenRij";
    await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
    const fout = alertOf(page).filter({ hasText: "Kan het saldo niet laden." });
    await expect(fout).toContainText("Log opnieuw in.", { timeout: 15_000 });
    await expect(fout).not.toContainText("Controleer de verbinding");
    await expect(page.getByText("Je ziet de gegevens van")).toHaveCount(0);
  });
});

// ── Bar ──────────────────────────────────────────────────────────────────

test.describe("bar: fase fout en fail-closed", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  async function faseFout(page: Page, focusEis: boolean) {
    let stuk = false;
    await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
    await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
    await mockBarSessie(page, { shift: null });
    await page.route(/\/rest\/v1\/members(\?|$)/, (route) =>
      json(route, 200, new URL(route.request().url()).searchParams.has("auth_user_id") ? { name: "Femke Bos", role: "beheerder" } : [])
    );
    await page.route(/\/rest\/v1\/rpc\/my_bar_state(\?|$)/, (route) =>
      stuk ? json(route, 500, { code: "PGRST301", message: "kapot", details: null, hint: null }) : route.fallback()
    );
    await loginMetWachtwoord(page, USER.email, "password");
    const barKnop = page.getByRole("button", { name: /^Bar/ });
    await expect(barKnop).toBeVisible({ timeout: 15_000 });
    stuk = true;
    await barKnop.click();

    await expect(alertOf(page).filter({ hasText: /\S/ })).toBeVisible({ timeout: 15_000 });
    const retry = page.getByRole("button", { name: /^Opnieuw proberen/ });
    await expect(retry).toBeVisible();
    await expect(page.getByRole("button", { name: /uitloggen/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /uitloggen|Inloggen met e-mail/i })).toHaveCount(0);
    await expect(page.getByText(/uitloggen/i)).toHaveCount(0);

    await retry.click();
    await expect(retry).toBeVisible(); // nog steeds stuk: de knop blijft
    stuk = false;
    await retry.click();
    await expect(alertOf(page).filter({ hasText: /\S/ })).toHaveCount(0);
    if (focusEis) {
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    }
  }

  test("fase fout (my_bar_state mislukt): foutregel en 'Opnieuw proberen', GEEN uitlogknop en geen e-mailingang; retry herstelt", async ({ page }) => {
    await faseFout(page, false);
  });

  // BEKENDE BUG (T08-review): BarApp fase `fout` gebruikt een eigen knop zonder
  // focusherstel; na een geslaagde retry staat de focus op body (spec besluit 9,
  // "focus nooit op body"). Zodra dit is opgelost faalt `test.fail` en moet het
  // een gewone test worden.
  test.fail("fase fout: na een geslaagde retry staat de focus niet op body", async ({ page }) => {
    await faseFout(page, true);
  });

  test("fail-closed: na een leesfout staat er geen assortiment of boekingenlijst op het scherm", async ({ page }) => {
    await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
    await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
    await mockBarSessie(page, {
      shift: { id: "shift-1", startedAt: new Date().toISOString(), startedByName: "Femke Bos", activityTypeName: "Training" },
    });
    const kapot = (route: Route) =>
      json(route, 500, { code: "PGRST301", message: "kapot", details: null, hint: null });
    await page.route(/\/rest\/v1\/members(\?|$)/, (route) =>
      new URL(route.request().url()).searchParams.has("auth_user_id")
        ? json(route, 200, { name: "Femke Bos", role: "beheerder" })
        : json(route, 200, [{ id: "payer", name: "Betalend lid", balance_cents: 2500 }])
    );
    await page.route(/\/rest\/v1\/products(\?|$)/, kapot);
    await page.route(/\/rest\/v1\/orders(\?|$)/, kapot);
    await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) =>
      json(route, 200, [{ member_id: "m1", added_at: new Date().toISOString(), members: { name: "Femke Bos" } }])
    );
    await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
      json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
    );
    await loginMetWachtwoord(page, USER.email, "password");
    await page.getByRole("button", { name: /^Bar/ }).click();

    await expect(alertOf(page).filter({ hasText: "Kan het assortiment niet laden." })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Pils/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Tik afrekenen/ })).toBeDisabled();

    await page.getByRole("tab", { name: "Dienst", exact: true }).click();
    const lijst = page.getByRole("group", { name: "Boekingen" });
    await expect(lijst.locator('[role="alert"]').first()).toContainText("Kan de boekingen van deze dienst niet laden.");
    await expect(lijst.getByRole("listitem")).toHaveCount(0);
  });
});
