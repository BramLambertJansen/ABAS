import type { Page } from "@playwright/test";
import {
  USER,
  bodyIsNiet,
  fakeSession,
  json,
  mockBarSessie,
  type BarSessieMock,
  type BarSessieMockOpties,
} from "./supabaseMock";

/**
 * De bar met een eigen of elders lopende dienst, met gemockte Supabase, voor
 * de pending-specs van Dienst afsluiten, Overnemen en Terugdraaien (#140).
 * Zelfde mocks als de lokale `openBar`-kopieën in dienst-hervatten,
 * dienst-te-lang-open en dialogen-tabs-landmarks-negatief (die in #140 niet
 * zijn herschreven). Logt niet in: de aanroeper doet `loginMetWachtwoord` en
 * wacht op het scherm dat hij verwacht.
 */

export const DIENST_ID = "00000000-0000-4000-8000-0000000000d1";
export const DIENST_TOM = { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom Willems" };
export const DIENST_ANNA = { id: "00000000-0000-4000-8000-0000000000d3", name: "Anna de Vries" };
export const ORDER_ID = "00000000-0000-4000-8000-0000000000c1";

export type BarDienstOpties = {
  rol?: "bardienst" | "beheerder";
  /** Een open dienst elders in plaats van een eigen dienst. */
  otherShift?: NonNullable<BarSessieMockOpties["otherShift"]>;
  /** Een bestelling in de transactielijst van de eigen dienst (de ⤺-knop). */
  bestelling?: { id: string; totalCents: number };
};

export async function mockBarDienst(
  page: Page,
  opties: BarDienstOpties = {}
): Promise<BarSessieMock & { sluitDienst: () => void }> {
  const rol = opties.rol ?? "bardienst";
  const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  let gesloten = false;

  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, bodyIsNiet(route) ? null : []));
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(
      route,
      200,
      gesloten
        ? null
        : {
            id: DIENST_ID,
            started_at: startedAt,
            members: { name: DIENST_TOM.name },
            activity_types: { name: "Training" },
          }
    )
  );
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) =>
    json(route, 200, [{ member_id: DIENST_TOM.id, added_at: startedAt, members: { name: DIENST_TOM.name } }])
  );
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) =>
    json(route, 200, [
      { id: "00000000-0000-4000-8000-0000000000e1", name: "Pils", category: "Bier", price_cents: 250 },
    ])
  );
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) =>
    json(route, 200, [{ id: DIENST_ANNA.id, name: DIENST_ANNA.name, balance_cents: 1240 }])
  );
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
  if (opties.bestelling) {
    const { id, totalCents } = opties.bestelling;
    // De vorm die `useShiftLedger` leest; `order_reversals: []` = niet teruggedraaid.
    await page.route(/\/rest\/v1\/orders(\?|$)/, (route) =>
      json(route, 200, [
        {
          id,
          created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          total_cents: totalCents,
          served_by: DIENST_TOM.id,
          member: { name: DIENST_ANNA.name },
          server: { name: DIENST_TOM.name },
          order_lines: [{ qty: 3, products: { name: "Pils" } }],
          order_reversals: [],
        },
      ])
    );
  }

  const sessie = await mockBarSessie(page, {
    naam: rol === "beheerder" ? "Femke Bos" : DIENST_TOM.name,
    rol,
    voorgeregistreerd: "bar",
    bevestigd: true,
    ...(opties.otherShift
      ? { otherShift: opties.otherShift }
      : {
          shift: {
            id: DIENST_ID,
            startedAt,
            startedByName: DIENST_TOM.name,
            activityTypeName: "Training",
          },
        }),
  });
  return Object.assign(sessie, {
    sluitDienst() {
      gesloten = true;
      sessie.dienstGesloten = true;
    },
  });
}
