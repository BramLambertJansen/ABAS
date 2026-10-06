import { expect, type Page, type Route } from "@playwright/test";
import { USER, bodyIsNiet, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./supabaseMock";

/**
 * De bar-kassa met gemockte Supabase (Verkoop-tab, een eigen dienst met Tom
 * als bezetting, Anna als lid), gedeeld door de pending-specs voor Afrekenen
 * en Opwaarderen. Verplaatst uit e2e/opslaan-sluiten-pending-aanvulling.spec.ts
 * (#140), zonder gedragswijziging; `openKassa` heet nu `mockKassa`.
 */

export const ANNA = { id: "00000000-0000-4000-8000-0000000000d3", name: "Anna de Vries" };
export const TOM = { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom Willems" };
export const BAR_SHIFT = "00000000-0000-4000-8000-0000000000d1";

export type Geld = (route: Route, n: number) => Promise<unknown> | unknown;

export async function mockKassa(page: Page, geld: { place_order?: Geld; top_up?: Geld }) {
  const calls = { place_order: 0, top_up: 0 };
  const startedAt = new Date().toISOString();
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, bodyIsNiet(route) ? null : []));
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(route, 200, { id: BAR_SHIFT, started_at: startedAt, members: { name: TOM.name }, activity_types: { name: "Training" } })
  );
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) =>
    json(route, 200, [{ member_id: TOM.id, added_at: startedAt, members: { name: TOM.name } }])
  );
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) =>
    json(route, 200, [{ id: "00000000-0000-4000-8000-0000000000e1", name: "Pils", category: "Bier", price_cents: 250 }])
  );
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) =>
    json(route, 200, [{ id: ANNA.id, name: ANNA.name, balance_cents: 1240 }])
  );
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
  for (const rpc of ["place_order", "top_up"] as const) {
    await page.route(new RegExp(`/rest/v1/rpc/${rpc}_once(\\?|$)`), (route) => {
      const n = calls[rpc]++;
      const handler = geld[rpc];
      if (handler) return handler(route, n);
      return json(route, 200, rpc === "place_order" ? { total_cents: 250 } : { amount_cents: 500 });
    });
  }
  await mockBarSessie(page, {
    naam: TOM.name,
    rol: "bardienst",
    voorgeregistreerd: "bar",
    bevestigd: true,
    shift: { id: BAR_SHIFT, startedAt, startedByName: TOM.name, activityTypeName: "Training" },
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("tab", { name: "Verkoop" }).waitFor({ state: "visible", timeout: 15_000 });
  return calls;
}

export async function kiesLid(page: Page) {
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("option", { name: /Anna de Vries/ }).click();
}

export async function openOpwaarderen(page: Page) {
  await kiesLid(page);
  await page.getByRole("button", { name: /opwaarderen/i }).click();
  const dialog = page.getByRole("dialog", { name: /^Saldo opwaarderen bij/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Ander bedrag").fill("5");
  return dialog;
}
