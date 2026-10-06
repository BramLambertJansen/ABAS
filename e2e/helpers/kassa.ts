import { expect, type Page, type Route } from "@playwright/test";
import { USER, json, loginMetWachtwoord, mockBarSessie } from "./supabaseMock";
import { BAR_SHIFT, TOM, mockBarBasis } from "./barBasis";

/**
 * De bar-kassa met gemockte Supabase (Verkoop-tab, een eigen dienst met Tom
 * als bezetting, Anna als lid), gedeeld door de pending-specs voor Afrekenen
 * en Opwaarderen. Verplaatst uit e2e/opslaan-sluiten-pending-aanvulling.spec.ts
 * (#140), zonder gedragswijziging; `openKassa` heet nu `mockKassa`.
 */

export type Geld = (route: Route, n: number) => Promise<unknown> | unknown;

export async function mockKassa(page: Page, geld: { place_order?: Geld; top_up?: Geld }) {
  const calls = { place_order: 0, top_up: 0 };
  const startedAt = new Date().toISOString();
  await mockBarBasis(page, startedAt);
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
  // Resultaatcontrole leest een fictieve ontbrekende receipt; zij boekt niets.
  await page.route(/\/rest\/v1\/rpc\/inspect_money_request(\?|$)/, (route) => json(route, 200, { status: "missing" }));
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
