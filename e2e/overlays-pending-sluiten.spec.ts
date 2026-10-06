import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  USER,
  bodyIsNiet,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
} from "./helpers/supabaseMock";
import {
  domeinFout,
  expectGeblokkeerdTijdensPending,
  expectSluitbaarNaPending,
  vertraagRpc,
} from "./helpers/pendingOverlay";
import { mockKassa, openOpwaarderen } from "./helpers/kassa";
import { DIENST_ID, ORDER_ID, mockBarDienst } from "./helpers/barDienst";

/**
 * Pending-E2E voor de overige `closeBlocked`-overlays (#140, vervolg op #125;
 * docs/features/pending-e2e-overlays.md): Opwaarderen (alleen wat de
 * bestaande tests in opslaan-sluiten-pending-aanvulling.spec.ts niet dekken),
 * Dienst afsluiten (eigen en beheerder), Overnemen, Afmelden en de bar-
 * Terugdraaien-overlay. Afrekenen en de beheer-terugdraaiflow zijn al gedekt
 * in dialogen-tabs-landmarks-negatief.spec.ts.
 *
 * Per overlay twee tests: geslaagd (a, b, c en daarna sluit de dialoog zelf)
 * en mislukt (a, b, c en daarna d: foutregel, weer sluitbaar). De assertiereeks
 * zelf staat in e2e/helpers/pendingOverlay.ts. De vertraging zit in de route,
 * niet in `page.clock`. Zonder echte database: Supabase via `page.route()`.
 *
 * Wat dit niet toetst: de 30 s-poll van de bar-sessie tijdens pending (spec →
 * Productbevindingen 2), Safari/touch/schermlezer, en de RPC's zelf (pgTAP).
 */

const FOUT_OVERIG = "er ging iets mis, probeer het opnieuw";
const DIENST_AL_DICHT = "deze dienst is al afgesloten";

async function openBarEigenDienst(page: Page) {
  const sessie = await mockBarDienst(page, { bestelling: { id: ORDER_ID, totalCents: 750 } });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("tab", { name: "Verkoop" }).waitFor({ state: "visible", timeout: 15_000 });
  return sessie;
}

// ── Opwaarderen (alleen de delta) ─────────────────────────────────────────

test.describe("Opwaarderen", () => {
  test("geslaagd: geblokkeerd tijdens pending, één top_up_once zonder berekend bedrag, daarna sluit de dialoog", async ({
    page,
  }) => {
    // mockKassa logt ook in en wacht op de Verkoop-tab.
    await mockKassa(page, {});
    const rpc = await vertraagRpc(page, "top_up_once", (route) => json(route, 200, { amount_cents: 500 }));
    const dialog = await openOpwaarderen(page);

    await expectGeblokkeerdTijdensPending(page, dialog, {
      bevestig: dialog.getByRole("button", { name: "boeken", exact: true }),
      bevestigPending: dialog.getByRole("button", { name: "bezig…" }),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });
    // Alleen id's en het ingetypte opwaardeerbedrag, geen totaal of saldo.
    const payload = rpc.payloads[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ["p_amount_cents", "p_member_id", "p_method", "p_request_id", "p_served_by", "p_shift_id"].sort()
    );
    expect(payload.p_amount_cents).toBe(500);

    rpc.vast.laatDoor();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[inert]")).toHaveCount(0);
    expect(rpc.aanroepen()).toBe(1);
  });

  test("mislukt (invalid_amount): foutregel, dialoog blijft open en is weer sluitbaar", async ({ page }) => {
    // mockKassa logt ook in en wacht op de Verkoop-tab.
    await mockKassa(page, {});
    const rpc = await vertraagRpc(page, "top_up_once", (route) => domeinFout(route, "invalid_amount"));
    const dialog = await openOpwaarderen(page);

    await expectGeblokkeerdTijdensPending(page, dialog, {
      bevestig: dialog.getByRole("button", { name: "boeken", exact: true }),
      bevestigPending: dialog.getByRole("button", { name: "bezig…" }),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });

    rpc.vast.laatDoor();
    await expect(dialog.locator('[role="alert"]').filter({ hasText: "vul een geldig bedrag in" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "annuleren" })).toBeEnabled();
    await expectSluitbaarNaPending(page, dialog);
    expect(rpc.aanroepen()).toBe(1);
  });
});

// ── Dienst afsluiten ──────────────────────────────────────────────────────

async function openDienstAfsluitenEigen(page: Page) {
  await page.getByRole("tab", { name: "Dienst" }).click();
  await page.getByRole("button", { name: "Dienst afsluiten", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dienst afsluiten" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function afsluitKnoppen(dialog: Locator) {
  return {
    bevestig: dialog.getByRole("button", { name: "dienst afsluiten", exact: true }),
    bevestigPending: dialog.getByRole("button", { name: "bezig…" }),
  };
}

test.describe("Dienst afsluiten (eigen dienst, end_shift)", () => {
  test("geslaagd: geblokkeerd tijdens pending, één end_shift, daarna sluit de dialoog en eindigt de dienst", async ({
    page,
  }) => {
    const sessie = await openBarEigenDienst(page);
    const rpc = await vertraagRpc(page, "end_shift", (route) => {
      sessie.sluitDienst();
      return json(route, 200, null);
    });
    const dialog = await openDienstAfsluitenEigen(page);

    await expectGeblokkeerdTijdensPending(page, dialog, {
      ...afsluitKnoppen(dialog),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });

    rpc.vast.laatDoor();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Verkoop" })).toHaveCount(0, { timeout: 15_000 });
    expect(rpc.payloads).toEqual([{ p_shift_id: DIENST_ID }]);
  });

  test("mislukt (500 zonder code): foutregel, annuleren weer enabled, Escape sluit", async ({ page }) => {
    await openBarEigenDienst(page);
    const rpc = await vertraagRpc(page, "end_shift", (route) => json(route, 500, { message: "boom" }));
    const dialog = await openDienstAfsluitenEigen(page);

    await expectGeblokkeerdTijdensPending(page, dialog, {
      ...afsluitKnoppen(dialog),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });

    rpc.vast.laatDoor();
    await expect(dialog.locator('[role="alert"]').filter({ hasText: FOUT_OVERIG })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "annuleren" })).toBeEnabled();
    await expectSluitbaarNaPending(page, dialog);
    expect(rpc.aanroepen()).toBe(1);
  });
});

async function openElders(page: Page) {
  await mockBarDienst(page, {
    rol: "beheerder",
    otherShift: {
      id: DIENST_ID,
      startedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      startedByName: "Tom Willems",
      activityTypeName: "Training",
      orphan: false,
      inBezetting: false,
    },
  });
  // `my_bar_state` telt mee: Overnemen en Afmelden verversen de toestand.
  const toestandLezingen = { n: 0 };
  await page.route(/\/rest\/v1\/rpc\/my_bar_state(\?|$)/, (route) => {
    toestandLezingen.n++;
    return route.fallback();
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("heading", { name: "Er loopt al een dienst" }).waitFor({ state: "visible", timeout: 15_000 });
  return toestandLezingen;
}

test.describe("Dienst afsluiten (beheerder, admin_end_shift)", () => {
  test("mislukt (shift_not_open) en daarna geslaagd, elk met één aanroep", async ({ page }) => {
    await openElders(page);
    const afsluiten = page.getByRole("button", { name: "Afsluiten", exact: true });

    // Pad 1: de dienst blijkt al gesloten.
    const mislukt = await vertraagRpc(page, "admin_end_shift", (route) => domeinFout(route, "shift_not_open"));
    await afsluiten.click();
    const dialog = page.getByRole("dialog", { name: "Dienst afsluiten" });
    await expect(dialog).toBeVisible();
    await expectGeblokkeerdTijdensPending(page, dialog, {
      ...afsluitKnoppen(dialog),
      aanroepen: mislukt.aanroepen,
      vast: mislukt.vast,
    });
    mislukt.vast.laatDoor();
    await expect(dialog.locator('[role="alert"]').filter({ hasText: DIENST_AL_DICHT })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "annuleren" })).toBeEnabled();
    await expectSluitbaarNaPending(page, dialog);
    expect(mislukt.aanroepen()).toBe(1);

    // Pad 2: slaagt, de dialoog sluit zelf.
    const geslaagd = await vertraagRpc(page, "admin_end_shift", (route) => json(route, 200, null));
    await afsluiten.click();
    await expect(dialog).toBeVisible();
    await expectGeblokkeerdTijdensPending(page, dialog, {
      ...afsluitKnoppen(dialog),
      aanroepen: geslaagd.aanroepen,
      vast: geslaagd.vast,
    });
    geslaagd.vast.laatDoor();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[inert]")).toHaveCount(0);
    expect(geslaagd.payloads).toEqual([{ p_shift_id: DIENST_ID }]);
    expect(mislukt.aanroepen()).toBe(1);
  });
});

// ── Overnemen ─────────────────────────────────────────────────────────────

async function openOvernemen(page: Page) {
  const lezingen = await openElders(page);
  await page.getByRole("button", { name: "Overnemen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dienst overnemen?" });
  await expect(dialog).toBeVisible();
  return { dialog, lezingen };
}

test.describe("Overnemen (admin_take_over_shift)", () => {
  // Geen "bezig…"-label op deze knop (spec → vraag 5): de test leunt op
  // aria-busy, disabled en focus, niet op een tekst.
  test("geslaagd: geblokkeerd tijdens pending, één aanroep, daarna sluit de dialoog met de toast", async ({ page }) => {
    const { dialog } = await openOvernemen(page);
    const rpc = await vertraagRpc(page, "admin_take_over_shift", (route) => json(route, 200, null));

    await expectGeblokkeerdTijdensPending(page, dialog, {
      bevestig: dialog.getByRole("button", { name: "Overnemen", exact: true }),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });

    rpc.vast.laatDoor();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Dienst overgenomen" })).toBeVisible();
    expect(rpc.payloads).toEqual([{ p_shift_id: DIENST_ID }]);
  });

  test("mislukt (shift_not_open): foutregel blijft ondanks het verversen, weer sluitbaar", async ({ page }) => {
    const { dialog, lezingen } = await openOvernemen(page);
    const rpc = await vertraagRpc(page, "admin_take_over_shift", (route) => domeinFout(route, "shift_not_open"));
    const voor = lezingen.n;

    await expectGeblokkeerdTijdensPending(page, dialog, {
      bevestig: dialog.getByRole("button", { name: "Overnemen", exact: true }),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });

    rpc.vast.laatDoor();
    // `sessie.ververs()` na de fout: de toestand wordt opnieuw gelezen, maar
    // de mock blijft de dienst leveren, dus de dialoog verdwijnt niet.
    await expect.poll(() => lezingen.n).toBeGreaterThan(voor);
    await expect(dialog.locator('[role="alert"]').filter({ hasText: DIENST_AL_DICHT })).toBeVisible();
    await expectSluitbaarNaPending(page, dialog);
    expect(rpc.aanroepen()).toBe(1);
  });
});

// ── Afmelden ──────────────────────────────────────────────────────────────

const EVA_SESSIE = "00000000-0000-4000-8000-0000000000f9";

async function openAfmelden(page: Page) {
  const nu = new Date().toISOString();
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, bodyIsNiet(route) ? null : []));
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const isBeheerder = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    const row = isBeheerder ? { name: "Femke Bos", role: "beheerder", has_pin: false } : null;
    return json(route, 200, bodyIsNiet(route) ? row : row ? [row] : []);
  });
  // Beheerder in modus beheer: de keuze "Beheer" registreert de sessie.
  await mockBarSessie(page, {
    admin: {
      sessions: [
        { id: "00000000-0000-4000-8000-0000000000f1", memberName: "Femke Bos", mode: "beheer", startedAt: nu, lastActivityAt: nu, shiftId: null, isOwn: true },
        { id: EVA_SESSIE, memberName: "Eva Smit", mode: "bar", startedAt: nu, lastActivityAt: nu, shiftId: null, isOwn: false },
      ],
    },
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: "Diensten" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Afmelden: Eva Smit" }).click();
  const dialog = page.getByRole("dialog", { name: "Apparaat afmelden?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("Afmelden (admin_end_bar_session)", () => {
  // Net als Overnemen geen "bezig…"-label (spec → vraag 5).
  test("geslaagd: geblokkeerd tijdens pending, één aanroep, daarna sluit de dialoog en blijft de toast", async ({
    page,
  }) => {
    const dialog = await openAfmelden(page);
    const rpc = await vertraagRpc(page, "admin_end_bar_session", (route) =>
      route.fulfill({ status: 204, body: "" })
    );

    await expectGeblokkeerdTijdensPending(page, dialog, {
      bevestig: dialog.getByRole("button", { name: "Afmelden", exact: true }),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });

    rpc.vast.laatDoor();
    await expect(dialog).toHaveCount(0);
    // `sessie.ververs()` loopt ook na een succes: de toast blijft staan.
    const toast = page.getByRole("status").filter({ hasText: "Apparaat afgemeld" });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(500);
    await expect(toast).toBeVisible();
    expect(rpc.payloads).toEqual([{ p_bar_session_id: EVA_SESSIE }]);
  });

  test("mislukt (target_session_ended): foutregel, dialoog blijft open en is weer sluitbaar", async ({ page }) => {
    const dialog = await openAfmelden(page);
    const rpc = await vertraagRpc(page, "admin_end_bar_session", (route) =>
      domeinFout(route, "target_session_ended")
    );

    await expectGeblokkeerdTijdensPending(page, dialog, {
      bevestig: dialog.getByRole("button", { name: "Afmelden", exact: true }),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });

    rpc.vast.laatDoor();
    // `target_session_ended` is een bekende code zonder eigen tekst: foutOverig.
    await expect(dialog.locator('[role="alert"]').filter({ hasText: FOUT_OVERIG })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Annuleren" })).toBeEnabled();
    await expectSluitbaarNaPending(page, dialog);
    expect(rpc.aanroepen()).toBe(1);
  });
});

// ── Bar-TerugdraaienOverlay ───────────────────────────────────────────────

async function openTerugdraaien(page: Page) {
  await openBarEigenDienst(page);
  await page.getByRole("tab", { name: "Dienst" }).click();
  await page.getByRole("button", { name: /^Bestelling terugdraaien: Anna de Vries/ }).click();
  const dialog = page.getByRole("dialog", { name: "Bestelling terugdraaien" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reden").fill("verkeerd lid getikt");
  return dialog;
}

test.describe("Terugdraaien op de bar (reverse_order_at_bar)", () => {
  test("geslaagd: geblokkeerd tijdens pending, één aanroep zonder bedrag, daarna sluit de dialoog met de toast", async ({
    page,
  }) => {
    const dialog = await openTerugdraaien(page);
    const rpc = await vertraagRpc(page, "reverse_order_at_bar", (route) =>
      json(route, 200, { refunded_cents: 750 })
    );

    await expectGeblokkeerdTijdensPending(page, dialog, {
      bevestig: dialog.getByRole("button", { name: "terugdraaien", exact: true }),
      bevestigPending: dialog.getByRole("button", { name: "bezig…" }),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });
    // Alleen order-id, dienst-id, reden en wie terugdraait; het bedrag komt van de server.
    const payload = rpc.payloads[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["p_order_id", "p_reason", "p_reversed_by", "p_shift_id"]);
    expect(payload.p_order_id).toBe(ORDER_ID);
    expect(payload.p_reason).toBe("verkeerd lid getikt");

    rpc.vast.laatDoor();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Bestelling teruggedraaid · € 7,50" })).toBeVisible();
    expect(rpc.aanroepen()).toBe(1);
  });

  test("mislukt (already_reversed): vaste melding, dialoog blijft open en is weer sluitbaar", async ({ page }) => {
    const dialog = await openTerugdraaien(page);
    const rpc = await vertraagRpc(page, "reverse_order_at_bar", (route) => domeinFout(route, "already_reversed"));

    await expectGeblokkeerdTijdensPending(page, dialog, {
      bevestig: dialog.getByRole("button", { name: "terugdraaien", exact: true }),
      bevestigPending: dialog.getByRole("button", { name: "bezig…" }),
      aanroepen: rpc.aanroepen,
      vast: rpc.vast,
    });

    rpc.vast.laatDoor();
    await expect(
      dialog.locator('[role="alert"]').filter({ hasText: "deze bestelling is al teruggedraaid" })
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "annuleren" })).toBeEnabled();
    await expectSluitbaarNaPending(page, dialog);
    expect(rpc.aanroepen()).toBe(1);
  });
});
