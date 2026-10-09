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
 * docs/features/logboek-chronologisch-reikwijdte.md (T10, #130) →
 * Teststrategie. Zonder live backend (Supabase via `page.route()`): vaste
 * fixtures en een vaste klok (`page.clock`), zodat dagkoppen en jaartallen
 * deterministisch zijn. Dit bewijst NIET dat de geneste embeds van de
 * `order_reversals`-select in PostgREST kloppen: dat is een handmatige check
 * tegen de lokale seed (spec → "Echte database").
 */

const NU = "2026-10-05T10:00:00Z";

type Modus = "ok" | 500;

type Mock = {
  orders: unknown[];
  topUps: unknown[];
  reversals: unknown[];
  reversalsModus: Modus;
  /** De `limit`-queryparameter van elke Logboek-select, per tabel. */
  limits: Record<string, string | null>;
};

const LID_ID = "00000000-0000-4000-8000-0000000000bb";

function order(id: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    created_at: createdAt,
    total_cents: 350,
    served_by: "tom",
    member: { name: "Anna de Vries" },
    server: { name: "Tom Willems" },
    order_lines: [{ qty: 1, products: { name: "Pils" } }],
    order_reversals: null,
    ...extra,
  };
}

function topUp(id: string, createdAt: string) {
  return {
    id,
    created_at: createdAt,
    amount_cents: 2500,
    method: "cash",
    served_by: "tom",
    member: { name: "Jan Smit" },
    server: { name: "Tom Willems" },
  };
}

function reversal(orderId: string, createdAt: string, originalCreatedAt: string) {
  return {
    order_id: orderId,
    created_at: createdAt,
    reason: "verkeerd lid getikt",
    via: "bar",
    refunded_cents: 350,
    reversed_by: "sanne",
    reverser: { name: "Sanne Bakker" },
    order: {
      id: orderId,
      created_at: originalCreatedAt,
      member: { name: "Jan Smit" },
      order_lines: [{ qty: 1, products: { name: "Cola" } }],
    },
  };
}

async function mockBeheer(page: Page, init: Partial<Mock> = {}): Promise<Mock> {
  const m: Mock = {
    orders: [],
    topUps: [],
    reversals: [],
    reversalsModus: "ok",
    limits: {},
    ...init,
  };
  await page.clock.setFixedTime(new Date(NU));
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
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) =>
    json(route, 200, [
      {
        id: LID_ID,
        name: "Anna de Vries",
        role: "lid",
        balance_cents: 1240,
        archived: false,
        auth_user_id: null,
        has_pin: false,
        email: null,
        invited_at: null,
      },
    ])
  );
  await page.route(/\/rest\/v1\/orders(\?|$)/, (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("member_id")) {
      m.limits["orders:lid"] = url.searchParams.get("limit");
      return json(route, 200, m.orders);
    }
    m.limits.orders = url.searchParams.get("limit");
    return json(route, 200, m.orders);
  });
  await page.route(/\/rest\/v1\/top_ups(\?|$)/, (route) => {
    m.limits.top_ups = new URL(route.request().url()).searchParams.get("limit");
    return json(route, 200, m.topUps);
  });
  await page.route(/\/rest\/v1\/order_reversals(\?|$)/, (route) => {
    m.limits.order_reversals = new URL(route.request().url()).searchParams.get("limit");
    if (m.reversalsModus === 500) {
      return json(route, 500, { code: "PGRST301", message: "kapot", details: null, hint: null });
    }
    return json(route, 200, m.reversals);
  });
  await mockBarSessie(page);
  return m;
}

async function openLogboek(page: Page) {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: "Logboek" }).click();
  await expect(page.getByRole("heading", { name: "Logboek", level: 1 })).toBeVisible();
}

async function axeSchoon(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

const REGELS = "section li";

test.describe("Logboek: chronologisch en eerlijk over de reikwijdte", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("dagkoppen over meerdere dagen en jaren, tijd per rij in Amsterdamse tijd", async ({ page }) => {
    await mockBeheer(page, {
      orders: [
        order("o1", "2026-09-29T12:00:00Z"),
        // 31 dec 23:30Z = 1 januari 00:30 in Amsterdam, huidig jaar: geen jaartal.
        order("o2", "2025-12-31T23:30:00Z"),
        order("o3", "2025-06-10T12:00:00Z"),
      ],
    });
    await openLogboek(page);

    const koppen = page.getByRole("heading", { level: 2 });
    await expect(koppen).toHaveText([
      "dinsdag 29 september",
      "donderdag 1 januari",
      "dinsdag 10 juni 2025",
    ]);
    const eerste = page.getByRole("region", { name: "dinsdag 29 september" });
    await expect(eerste.getByRole("listitem")).toContainText("14:00");
    const tweede = page.getByRole("region", { name: "donderdag 1 januari" });
    await expect(tweede.getByRole("listitem")).toContainText("00:30");
    await expect(page.getByText("3 handelingen")).toBeVisible();
    await expect(
      page.getByText("Verkopen, opwaarderingen en terugdraaiingen van alle diensten.")
    ).toBeVisible();
    await expect(page.getByText("Alleen de meest recente 200")).toHaveCount(0);
  });

  test("terugdraaiing van een zeer oude bestelling staat op de terugdraaidatum, met reden, terugdraaier en verwijzing", async ({
    page,
  }) => {
    // De oude bestelling zit bewust niet in `orders`.
    await mockBeheer(page, {
      orders: [order("o1", "2026-09-29T12:00:00Z")],
      reversals: [reversal("oud", "2026-09-30T08:00:00Z", "2025-03-03T09:00:00Z")],
    });
    await openLogboek(page);

    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "woensdag 30 september",
      "dinsdag 29 september",
    ]);
    const rij = page.getByRole("listitem").filter({ hasText: "Bestelling teruggedraaid" });
    await expect(rij).toHaveCount(1);
    await expect(rij).toContainText("10:00");
    await expect(rij).toContainText("verkeerd lid getikt");
    await expect(rij).toContainText("door Sanne Bakker via bar");
    await expect(rij).toContainText("teruggeboekt");
    await expect(rij).toContainText("Bestelling van maandag 3 maart 2025 10:00 · Jan Smit");
    // De actor is de terugdraaier, nooit de verkoper van de bestelling.
    await expect(rij.locator('[title="Sanne Bakker"]')).toHaveCount(1);
    await expect(rij.locator('[title="Tom Willems"]')).toHaveCount(0);
    await expect(rij.locator(".sr-only")).toHaveText(/door Sanne Bakker/);
    await expect(rij).not.toContainText("Tom Willems");
  });

  test("verkoop en terugdraaiing zijn twee rijen; de verkoop toont 'Teruggedraaid' als tekst", async ({ page }) => {
    await mockBeheer(page, {
      orders: [order("o1", "2026-09-29T12:00:00Z", { order_reversals: { order_id: "o1" } })],
      reversals: [reversal("o1", "2026-09-29T13:00:00Z", "2026-09-29T12:00:00Z")],
    });
    await openLogboek(page);

    await expect(page.locator(REGELS)).toHaveCount(2);
    await expect(page.getByText("2 handelingen")).toBeVisible();
    const verkoop = page.getByRole("listitem").filter({ hasText: "Bestelling op saldo" });
    await expect(verkoop).toContainText("Teruggedraaid");
    // Reversal bovenaan (later tijdstip), de verkoop eronder.
    await expect(page.locator(REGELS).first()).toContainText("Bestelling teruggedraaid");
  });

  const maak = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      order(`o${i}`, new Date(Date.UTC(2026, 8, 1) + (n - i) * 3_600_000).toISOString())
    );

  test("201 gebeurtenissen: melding 'meest recente 200' en 200 rijen", async ({ page }) => {
    const m = await mockBeheer(page, { orders: maak(201) });
    await openLogboek(page);

    await expect(page.locator(REGELS)).toHaveCount(200);
    await expect(
      page.getByText("Alleen de meest recente 200 handelingen. Zoeken en filteren werkt alleen binnen die 200.")
    ).toBeVisible();
    await expect(page.getByText("meest recente 200 handelingen", { exact: true })).toBeVisible();
    // Elke bron haalt er één extra op, zodat `beperkt` exact is.
    expect(m.limits).toMatchObject({ orders: "201", top_ups: "201", order_reversals: "201" });
  });

  test("exact 200 gebeurtenissen: alles getoond, geen melding", async ({ page }) => {
    await mockBeheer(page, { orders: maak(200) });
    await openLogboek(page);
    await expect(page.locator(REGELS)).toHaveCount(200);
    await expect(page.getByText("200 handelingen", { exact: true })).toBeVisible();
    await expect(page.getByText("Alleen de meest recente 200")).toHaveCount(0);
  });

  test("Aandacht + zoekterm; Assortiment en Leden zijn eerlijk, zonder 'elke handeling in de app'", async ({ page }) => {
    await mockBeheer(page, {
      orders: [order("o1", "2026-09-29T12:00:00Z")],
      topUps: [topUp("t1", "2026-09-29T11:00:00Z")],
      reversals: [reversal("o2", "2026-09-30T08:00:00Z", "2026-09-28T09:00:00Z")],
    });
    await openLogboek(page);
    await expect(page.locator(REGELS)).toHaveCount(3);

    await page.getByRole("button", { name: "Aandacht" }).click();
    await expect(page.locator(REGELS)).toHaveCount(1);
    await expect(page.getByText("1 van 3 handelingen")).toBeVisible();

    const zoek = page.getByRole("searchbox", { name: /Zoek op naam/ });
    await zoek.fill("sanne");
    await expect(page.locator(REGELS)).toHaveCount(1);
    await zoek.fill("onbestaand");
    await expect(page.getByText("Niets gevonden", { exact: true })).toBeVisible();
    await zoek.fill("");

    await page.getByRole("button", { name: "Assortiment" }).click();
    await expect(page.getByText("Nog niet geregistreerd")).toBeVisible();
    await expect(
      page.getByText("Wijzigingen aan het assortiment worden nog niet in het logboek vastgelegd.")
    ).toBeVisible();
    await page.getByRole("button", { name: "Leden", exact: true }).click();
    await expect(
      page.getByText("Wijzigingen aan leden worden nog niet in het logboek vastgelegd.")
    ).toBeVisible();
    await expect(page.getByText("elke handeling in de app")).toHaveCount(0);
  });

  test("opwaardering toont 'contant', nooit 'cash'", async ({ page }) => {
    await mockBeheer(page, { topUps: [topUp("t1", "2026-09-29T11:00:00Z")] });
    await openLogboek(page);
    const rij = page.getByRole("listitem").filter({ hasText: "Saldo opgewaardeerd" });
    await expect(rij).toContainText("contant");
    await expect(page.getByText("cash")).toHaveCount(0);
  });

  test("leeg Logboek: eerlijke lege staat", async ({ page }) => {
    await mockBeheer(page);
    await openLogboek(page);
    await expect(page.getByText("Nog niets vastgelegd")).toBeVisible();
    await expect(
      page.getByText(
        "Verkopen, opwaarderingen en terugdraaiingen komen hier te staan, met naam en tijd erbij."
      )
    ).toBeVisible();
  });

  test("een mislukte order_reversals-bron geeft de leesfout met herstel, nooit een onvolledige lijst", async ({
    page,
  }) => {
    const m = await mockBeheer(page, {
      orders: [order("o1", "2026-09-29T12:00:00Z")],
      reversalsModus: 500,
    });
    await openLogboek(page);
    await expect(alertOf(page).filter({ hasText: "Kan het logboek niet laden." })).toBeVisible();
    await expect(page.locator(REGELS)).toHaveCount(0);
    m.reversalsModus = "ok";
    await page.getByRole("button", { name: /Opnieuw proberen/ }).click();
    await expect(page.locator(REGELS)).toHaveCount(1);
  });

  test("a11y: dagkoppen en terugdraairij hebben geen WCAG2A/AA-schendingen", async ({ page }) => {
    await mockBeheer(page, {
      orders: [
        order("o1", "2026-09-29T12:00:00Z", { order_reversals: { order_id: "o1" } }),
        order("o3", "2025-06-10T12:00:00Z"),
      ],
      topUps: [topUp("t1", "2026-09-29T11:00:00Z")],
      reversals: [reversal("o1", "2026-09-29T13:00:00Z", "2026-09-29T12:00:00Z")],
    });
    await openLogboek(page);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);
    await axeSchoon(page);
    await page.getByRole("button", { name: "Assortiment" }).click();
    await expect(page.getByText("Nog niet geregistreerd")).toBeVisible();
    await axeSchoon(page);
  });
});

test.describe("Beheer: bestellingen van een lid (terugdraaien)", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  async function openOverlay(page: Page, aantal: number) {
    await mockBeheer(page, {
      orders: Array.from({ length: aantal }, (_, i) => ({
        id: `m${i}`,
        created_at: new Date(Date.UTC(2026, 8, 1) + (aantal - i) * 3_600_000).toISOString(),
        total_cents: 350,
        order_lines: [{ qty: 1 }],
        order_reversals: null,
      })),
    });
    await loginMetWachtwoord(page, USER.email, "Aurora#2026");
    await page.getByRole("button", { name: "Beheer" }).click();
    await page.getByRole("tab", { name: "Leden" }).click();
    await page.getByRole("button", { name: "Anna de Vries" }).click();
    await page.getByRole("button", { name: /^Bestelling terugdraaien/ }).click();
    const dialog = page.getByRole("dialog", { name: "Bestelling terugdraaien" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("51 bestellingen: 50 rijen en de melding over oudere bestellingen", async ({ page }) => {
    const dialog = await openOverlay(page, 51);
    await expect(dialog.getByRole("button", { name: /terugdraaien →/ })).toHaveCount(50);
    await expect(
      dialog.getByText(
        "Alleen de laatste 50 bestellingen van Anna de Vries staan hier. Oudere bestellingen zijn niet te zien in beheer."
      )
    ).toBeVisible();
  });

  test("50 bestellingen: geen melding", async ({ page }) => {
    const dialog = await openOverlay(page, 50);
    await expect(dialog.getByRole("button", { name: /terugdraaien →/ })).toHaveCount(50);
    await expect(dialog.getByText(/Alleen de laatste 50/)).toHaveCount(0);
  });
});
