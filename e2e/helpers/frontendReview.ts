import type { Page, Route } from "@playwright/test";
import { USER, fakeSession, json, mockBarSessie, loginMetWachtwoord, portalLoginMetWachtwoord } from "./supabaseMock";

export const REVIEW_MEMBER = { id: "00000000-0000-4000-8000-000000000022", name: "Joris de Vries", role: "lid", balance_cents: 1500, archived: false, has_pin: false, has_account: false, email: null, invited_at: null };
export const REVIEW_PRODUCT = { id: "00000000-0000-4000-8000-000000000021", name: "Pils", category: "Bier", price_cents: 250, archived: false, image_url: null };
export const REVIEW_PRODUCTS = [REVIEW_PRODUCT, { ...REVIEW_PRODUCT, id: "00000000-0000-4000-8000-000000000023", name: "Alcoholvrij speciaalbier van de Aurora-brouwerij", category: "Fris", price_cents: 450 }];
export const REVIEW_SHIFT = "00000000-0000-4000-8000-000000000041";

/** Synthetic data only; unmocked external browser requests cannot reach production. */
export async function reviewFixture(page: Page, mode: "portal" | "admin" | "bar") {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort("blockedbyclient");
  });
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, route.request().headers().accept?.includes("vnd.pgrst.object") ? null : []));
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) => json(route, 200, { id: 1, negative_limit_cents: 0, low_balance_threshold_cents: 1000 }));
  if (mode !== "portal") await mockBarSessie(page, mode === "bar" ? {
    voorgeregistreerd: "bar", bevestigd: true,
    shift: { id: REVIEW_SHIFT, startedAt: new Date(Date.now() - 20 * 60_000).toISOString(), startedByName: "Femke Bos", activityTypeName: "Repetitie" },
  } : {});
  const state: { profileError: boolean; profileCalls: number; profileReply?: (route: Route) => Promise<void> } = { profileError: false, profileCalls: 0 };
  await page.route(/\/rest\/v1\/members(\?|$)/, async (route) => {
    const own = route.request().url().includes("auth_user_id=eq.");
    if (own) {
      state.profileCalls++;
      if (state.profileReply) return state.profileReply(route);
      if (state.profileError) return json(route, 500, { message: "fixture read error" });
    }
    const row = own ? { name: "Femke Bos", role: "beheerder", archived: false, has_pin: false, balance_cents: 1500 } : REVIEW_MEMBER;
    return json(route, 200, route.request().headers().accept?.includes("vnd.pgrst.object") ? row : [row]);
  });
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) => json(route, 200, REVIEW_PRODUCTS));
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) => json(route, 200, [{ member_id: REVIEW_MEMBER.id, members: { id: REVIEW_MEMBER.id, name: REVIEW_MEMBER.name } }]));
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) => json(route, 200, [REVIEW_MEMBER]));
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, (route) => json(route, 200, [{ id: "00000000-0000-4000-8000-000000000051", kind: "bestelling", amount_cents: 450, created_at: new Date().toISOString(), activity_type_name: "Repetitie", served_by_name: "Femke Bos", reversed: false }]));
  await page.route(/\/rest\/v1\/order_lines(\?|$)/, (route) => json(route, 200, [{ order_id: "00000000-0000-4000-8000-000000000051", qty: 1, products: { name: REVIEW_PRODUCTS[1].name } }]));
  if (mode === "portal") await portalLoginMetWachtwoord(page, USER.email, "fixture-password");
  else {
    await loginMetWachtwoord(page, USER.email, "fixture-password");
    if (mode === "admin") await page.getByRole("button", { name: /^Beheer / }).click();
  }
  await page.getByRole("tab", { name: mode === "portal" ? "Account" : mode === "bar" ? "Verkoop" : "Assortiment", exact: true }).waitFor({ state: "visible" });
  return state;
}
