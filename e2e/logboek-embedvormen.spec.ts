import { test, expect, type Page } from "@playwright/test";
import {
  USER,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
} from "./helpers/supabaseMock";

/**
 * Tester-aanvulling op PR #166 (T10, #130): PostgREST levert een
 * een-op-een-embed soms als object en soms als array, en een embed die RLS
 * verbergt als null. useLogboek moet alle vormen aankunnen zonder crash en
 * zonder verzonnen gegevens. Gemockt: dit bewijst de embedsyntax zelf niet.
 */

async function mock(page: Page, orders: unknown[], reversals: unknown[]) {
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00Z"));
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
  await page.route(/\/rest\/v1\/orders(\?|$)/, (route) => json(route, 200, orders));
  await page.route(/\/rest\/v1\/top_ups(\?|$)/, (route) => json(route, 200, []));
  await page.route(/\/rest\/v1\/order_reversals(\?|$)/, (route) => json(route, 200, reversals));
  await mockBarSessie(page);
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: "Logboek" }).click();
  await expect(page.getByRole("heading", { name: "Logboek", level: 1 })).toBeVisible();
}

test("embeds als array, als null (RLS): geen crash, geen verzonnen verkoper", async ({
  page,
}) => {
  await mock(
    page,
    [
      {
        id: "o1",
        created_at: "2026-09-29T12:00:00Z",
        total_cents: 350,
        served_by: "tom",
        member: { name: "Anna de Vries" },
        server: { name: "Tom Willems" },
        order_lines: [{ qty: 2, products: null }],
        // Array-vorm van de order_reversals-embed.
        order_reversals: [{ order_id: "o1" }],
      },
    ],
    [
      {
        order_id: "o1",
        created_at: "2026-09-29T13:00:00Z",
        reason: "fout",
        via: "beheer",
        refunded_cents: 350,
        reversed_by: "femke",
        reverser: [{ name: "Femke Bos" }],
        order: [
          {
            id: "o1",
            created_at: "2026-09-29T12:00:00Z",
            member: [{ name: "Anna de Vries" }],
            order_lines: [{ qty: 2, products: null }],
          },
        ],
      },
      {
        // Oorspronkelijke bestelling onzichtbaar (embed null), reverser ontbreekt.
        order_id: "o9",
        created_at: "2026-09-28T09:00:00Z",
        reason: "oud",
        via: "bar",
        refunded_cents: 100,
        reversed_by: "x",
        reverser: null,
        order: null,
      },
    ]
  );

  const rijen = page.locator("section li");
  await expect(rijen).toHaveCount(3);
  const eerste = rijen.nth(0);
  await expect(eerste).toContainText("Bestelling teruggedraaid");
  await expect(eerste).toContainText("door Femke Bos via beheer");
  await expect(eerste).toContainText("Bestelling van dinsdag 29 september 14:00 · Anna de Vries");
  // Verkoop met array-embed telt als teruggedraaid, als tekst.
  await expect(rijen.nth(1)).toContainText("Teruggedraaid");
  // Onzichtbare order: geen verwijzing, wel de rij.
  const derde = rijen.nth(2);
  await expect(derde).toContainText("door onbekend via bar");
  await expect(derde).not.toContainText("Bestelling van");
  await expect(derde).not.toContainText(/·\s*$/);
});
