import type { Page } from "@playwright/test";
import { json, mockBarSessie, type BarSessieMock, type BarSessieMockOpties } from "./supabaseMock";
import { ANNA, BAR_SHIFT, TOM, mockBarBasis } from "./barBasis";

/**
 * De bar met een eigen of elders lopende dienst, met gemockte Supabase, voor
 * de pending-specs van Dienst afsluiten, Overnemen en Terugdraaien (#140).
 * Zelfde mocks als de lokale `openBar`-kopieën in dienst-hervatten,
 * dienst-te-lang-open en dialogen-tabs-landmarks-negatief (die in #140 niet
 * zijn herschreven). Logt niet in: de aanroeper doet `loginMetWachtwoord` en
 * wacht op het scherm dat hij verwacht.
 */

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

  await mockBarBasis(page, startedAt, () => !gesloten);
  if (opties.bestelling) {
    const { id, totalCents } = opties.bestelling;
    // De vorm die `useShiftLedger` leest; `order_reversals: []` = niet teruggedraaid.
    await page.route(/\/rest\/v1\/orders(\?|$)/, (route) =>
      json(route, 200, [
        {
          id,
          created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          total_cents: totalCents,
          served_by: TOM.id,
          member: { name: ANNA.name },
          server: { name: TOM.name },
          order_lines: [{ qty: 3, products: { name: "Pils" } }],
          order_reversals: [],
        },
      ])
    );
  }

  const sessie = await mockBarSessie(page, {
    naam: rol === "beheerder" ? "Femke Bos" : TOM.name,
    rol,
    voorgeregistreerd: "bar",
    bevestigd: true,
    ...(opties.otherShift
      ? { otherShift: opties.otherShift }
      : {
          shift: {
            id: BAR_SHIFT,
            startedAt,
            startedByName: TOM.name,
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
