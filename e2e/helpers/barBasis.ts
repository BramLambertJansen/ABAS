import type { Page } from "@playwright/test";
import { USER, bodyIsNiet, fakeSession, json } from "./supabaseMock";

/**
 * De gedeelde basismocks van een bar met een open dienst (login, lege
 * REST-lezingen, dienst, bezetting met Tom, Pils, Anna als lid, instellingen),
 * onder `mockKassa` (helpers/kassa.ts) en `mockBarDienst` (helpers/barDienst.ts).
 * Registreer `mockBarSessie` en de RPC-routes daarna.
 */

export const ANNA = { id: "00000000-0000-4000-8000-0000000000d3", name: "Anna de Vries" };
export const TOM = { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom Willems" };
export const BAR_SHIFT = "00000000-0000-4000-8000-0000000000d1";

export async function mockBarBasis(
  page: Page,
  startedAt: string,
  /** `false`: de dienst is gesloten, `shifts` levert dan `null`. */
  dienstOpen: () => boolean = () => true
) {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, bodyIsNiet(route) ? null : []));
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(
      route,
      200,
      dienstOpen()
        ? { id: BAR_SHIFT, started_at: startedAt, members: { name: TOM.name }, activity_types: { name: "Training" } }
        : null
    )
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
}
