import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  USER,
  fakeSession,
  json,
  portalLoginMetWachtwoord,
} from "./helpers/supabaseMock";

/**
 * docs/features/portaltransacties-consistent.md (T09, #129) → Teststrategie.
 * Zonder live backend (Supabase via `page.route()`), zodat de weergave met
 * vaste fixtures en vaste datums gecontroleerd wordt: teruggedraaide
 * bestelling op Saldo en Transacties, uitlegregel, "Alle transacties" met
 * focus op de tab, 320px/390px, en de vaste tijdzone Europe/Amsterdam.
 */

const UITLEG =
  "Een teruggedraaide bestelling is niet meer afgeschreven; het bedrag staat al terug op je saldo.";

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

function rij(id: string, overrides: Partial<Rij>): Rij {
  return {
    id,
    kind: "bestelling",
    created_at: "2026-09-20T12:00:00Z",
    amount_cents: 500,
    method: null,
    server_name: "Tom Willems",
    reversed: false,
    reversal_reason: null,
    reversed_via: null,
    reversed_by_name: null,
    ...overrides,
  };
}

const TERUGGEDRAAID = rij("r1", {
  created_at: "2026-09-25T12:00:00Z",
  amount_cents: 150,
  reversed: true,
  reversal_reason: "verkeerd product getikt",
  reversed_via: "bar",
  reversed_by_name: "Sanne Bakker",
});

/** Zeven rijen, nieuwste eerst; de teruggedraaide staat bovenaan en telt mee in de vijf. */
const ZEVEN: Rij[] = [
  TERUGGEDRAAID,
  rij("r2", { created_at: "2026-09-24T12:00:00Z", kind: "opwaardering", method: "cash", amount_cents: 1000 }),
  rij("r3", { created_at: "2026-09-23T12:00:00Z" }),
  rij("r4", { created_at: "2026-09-22T12:00:00Z" }),
  rij("r5", { created_at: "2026-09-21T12:00:00Z" }),
  rij("r6", { created_at: "2026-08-20T12:00:00Z" }),
  rij("r7", { created_at: "2026-08-19T12:00:00Z" }),
];

async function mockPortal(page: Page, transacties: Rij[]) {
  const objectOrList = (route: Route, row: unknown) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => objectOrList(route, null));
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const own = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    return objectOrList(
      route,
      own ? { name: "Mock Lid", role: "lid", archived: false, has_pin: false, balance_cents: 1500 } : null
    );
  });
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, (route) =>
    json(route, 200, transacties)
  );
}

async function openPortal(page: Page, transacties: Rij[]) {
  await mockPortal(page, transacties);
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("heading", { name: "Hoi Mock" })).toBeVisible({ timeout: 15_000 });
}

async function expectAxeSchoon(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function expectGeenHorizontaleScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Het bestelrij-item dat de reversal toont. */
const terugRij = (page: Page) => page.getByRole("listitem").filter({ hasText: "Teruggedraaid" });

async function expectTeruggedraaidRij(page: Page) {
  const row = terugRij(page);
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Teruggedraaid", { exact: true })).toBeVisible();
  await expect(row.getByText("Door: Sanne Bakker", { exact: true })).toBeVisible();
  await expect(row.getByText("Reden: verkeerd product getikt", { exact: true })).toBeVisible();
  // Bedrag zonder teken, doorgestreept.
  const bedrag = row.getByText(/1,50/);
  await expect(bedrag).toHaveText(/^€\s?1,50$/);
  await expect(bedrag).toHaveCSS("text-decoration-line", "line-through");
  // Het kanaal staat nergens.
  await expect(row).not.toContainText(/via|bar\b|beheer|TERUG\b/);
  await expect(page.getByText(UITLEG, { exact: true })).toBeVisible();
}

test.describe("portaltransacties consistent", () => {
  test("Saldo: 'Recente transacties' (5, teruggedraaide telt mee), identieke rij, uitlegregel, axe", async ({ page }) => {
    await openPortal(page, ZEVEN);
    await expect(page.getByRole("heading", { name: "RECENTE TRANSACTIES" })).toBeVisible();
    await expect(page.getByText("DEZE MAAND")).toHaveCount(0);
    await expect(page.getByRole("listitem")).toHaveCount(5);
    await expectTeruggedraaidRij(page);
    await expect(page.getByRole("button", { name: "Alle transacties" })).toBeVisible();
    await expectAxeSchoon(page);
  });

  test("Transacties: dezelfde rij, uitlegregel alleen bij zichtbare teruggedraaide (filter), axe", async ({ page }) => {
    await openPortal(page, ZEVEN);
    await page.getByRole("tab", { name: "Transacties" }).click();
    await expect(page.getByText("Einde van de lijst")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(7);
    await expectTeruggedraaidRij(page);
    await expectAxeSchoon(page);

    await page.getByRole("button", { name: "Opwaarderingen" }).click();
    await expect(page.getByText(UITLEG)).toHaveCount(0);
    await expect(page.getByText("Teruggedraaid")).toHaveCount(0);

    await page.getByRole("button", { name: "Uitgaven" }).click();
    await expect(page.getByText(UITLEG, { exact: true })).toBeVisible();
  });

  test("een lid dat zelf terugdraaide, en een beheer-terugdraaiing, zien dezelfde weergave", async ({ page }) => {
    await openPortal(page, [
      { ...TERUGGEDRAAID, reversed_via: "beheer", reversed_by_name: "Mock Lid" },
    ]);
    const row = terugRij(page);
    await expect(row.getByText("Door: Mock Lid", { exact: true })).toBeVisible();
    await expect(row).not.toContainText(/jij|beheer|via/i);
  });

  test("ontbrekende naam of reden: die regel vervalt, geen hangend scheidingsteken", async ({ page }) => {
    await openPortal(page, [{ ...TERUGGEDRAAID, reversed_by_name: null }]);
    const row = terugRij(page);
    await expect(row.getByText("Reden: verkeerd product getikt")).toBeVisible();
    await expect(row.getByText(/Door:/)).toHaveCount(0);
    await expect(row).not.toContainText(/onbekend|—|-\s*$/);
  });

  test("gewone bestelling en opwaardering: geen badge, geen Door/Reden, geen uitlegregel", async ({ page }) => {
    await openPortal(page, ZEVEN.slice(1));
    await expect(page.getByText("Teruggedraaid")).toHaveCount(0);
    await expect(page.getByText(/Door:|Reden:/)).toHaveCount(0);
    await expect(page.getByText(UITLEG)).toHaveCount(0);
  });

  test("'Alle transacties' opent het Transacties-tabblad met de focus op die tab", async ({ page }) => {
    await openPortal(page, ZEVEN);
    await page.getByRole("button", { name: "Alle transacties" }).click();
    const tab = page.getByRole("tab", { name: "Transacties" });
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toBeFocused();
    await expect(page.getByText("Einde van de lijst")).toBeVisible();
  });

  test("'Alle transacties' is bedienbaar met alleen het toetsenbord", async ({ page }) => {
    await openPortal(page, ZEVEN);
    await page.getByRole("button", { name: "Alle transacties" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "Transacties" })).toBeFocused();
  });

  test("lege historie: lege-staattekst, geen 'Alle transacties', geen uitlegregel", async ({ page }) => {
    await openPortal(page, []);
    await expect(page.getByText("Nog geen transacties")).toBeVisible();
    await expect(page.getByRole("button", { name: "Alle transacties" })).toHaveCount(0);
    await expect(page.getByText(UITLEG)).toHaveCount(0);
    await expectAxeSchoon(page);
    await page.getByRole("tab", { name: "Transacties" }).click();
    await expect(page.getByText("Nog geen transacties")).toBeVisible();
  });

  for (const breedte of [320, 390]) {
    test(`${breedte}px: status nooit afgekapt, bedrag op één regel, geen horizontale scroll`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: 800 });
      await openPortal(page, [
        {
          ...TERUGGEDRAAID,
          amount_cents: 123456789,
          reversal_reason: "x".repeat(200),
          reversed_by_name: "Wilhelmina Alexandra-Maria van Oranje-Nassau-Zonder-Spaties".repeat(2),
        },
        ...ZEVEN.slice(1, 3),
      ]);
      for (const tab of ["Saldo", "Transacties"]) {
        if (tab === "Transacties") await page.getByRole("tab", { name: tab }).click();
        const row = terugRij(page);
        await expect(row).toBeVisible();
        await expect(row.getByText("Teruggedraaid", { exact: true })).toBeVisible();
        await expect(row.getByText(/^Reden: x{200}$/)).toBeVisible();
        await expect(row.getByText(/^Door: Wilhelmina/)).toBeVisible();
        await expectGeenHorizontaleScroll(page);
        // Elke tekstregel van de rij valt binnen het scherm (niets afgekapt).
        const buiten = await row.evaluate((li) => {
          const vensterBreedte = document.documentElement.clientWidth;
          return Array.from(li.querySelectorAll("span")).filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > vensterBreedte + 0.5 || r.left < -0.5;
          }).length;
        });
        expect(buiten).toBe(0);
        // Het bedrag blijft op één regel.
        const bedrag = row.getByText(/^€\s?1\.234\.567,89$/);
        const hoogte = await bedrag.evaluate((el) => {
          const lh = parseFloat(getComputedStyle(el).lineHeight);
          return { h: el.getBoundingClientRect().height, lh };
        });
        expect(hoogte.h).toBeLessThanOrEqual(hoogte.lh + 1);
        await expectAxeSchoon(page);
      }
    });
  }

  test.describe("tijdzone Europe/Amsterdam, ook op een apparaat in een andere zone", () => {
    test.use({ timezoneId: "America/Los_Angeles" });

    test("30 sep 22:30 UTC staat onder 1 okt / Oktober 2026; 31 dec 23:30 UTC onder 1 jan / Januari 2027", async ({ page }) => {
      await openPortal(page, [
        rij("a", { created_at: "2026-12-31T23:30:00Z" }),
        rij("b", { created_at: "2026-12-31T22:30:00Z" }),
        rij("c", { created_at: "2026-09-30T22:30:00Z" }),
        rij("d", { created_at: "2026-09-30T21:30:00Z" }),
      ]);
      await page.getByRole("tab", { name: "Transacties" }).click();
      await expect(page.getByRole("region", { name: "Januari 2027" })).toContainText("1 jan");
      await expect(page.getByRole("region", { name: "December 2026" })).toContainText("31 dec");
      await expect(page.getByRole("region", { name: "Oktober 2026" })).toContainText("1 okt");
      await expect(page.getByRole("region", { name: "September 2026" })).toContainText("30 sep");
    });
  });
});
