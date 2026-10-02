import { test, expect, type Page, type Route } from "@playwright/test";
import {
  USER,
  alertOf,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
  portalLoginMetWachtwoord,
} from "./helpers/supabaseMock";

/**
 * Aanvulling op e2e/opslaan-sluiten-pending.spec.ts (#126, T06): de gaten die
 * daar open bleven. Bezetting, de portal-sheets (naam, wachtwoord, pincode),
 * de onbekende-uitkomst-flow bij Afrekenen en Opwaarderen, en de time-out van
 * 30 seconden (alleen zonder geld; geldoverlays hebben geen time-out). Zonder echte database: Supabase via `page.route()`, de time-out
 * met `page.clock` (fastForward) tegen een met opzet hangend verzoek.
 *
 * Wat dit níét toetst: Safari/touch/schermlezer (handmatig) en echte dubbele
 * boeking (geen idempotentie, apart ticket; de UI claimt dat ook niet).
 */

const MELDING = "Even wachten, de actie wordt nog verwerkt.";
const ONBEKEND_GELD =
  "De uitkomst is onbekend. Controleer eerst het saldo of de transacties voordat je opnieuw probeert.";
const ONBEKEND_BEHEER =
  "De uitkomst is onbekend. Controleer eerst de actuele gegevens voordat je opnieuw probeert.";
const WEGGOOIEN = "Niet-opgeslagen wijziging weggooien?";

function houdVast() {
  let release!: () => void;
  const poort = new Promise<void>((resolve) => (release = resolve));
  return { poort, laatDoor: release };
}

const bodyIsNiet = (route: Route) => {
  const accept = route.request().headers()["accept"] ?? "";
  return accept.includes("vnd.pgrst.object");
};

async function geenFocusOpBody(page: Page) {
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
}

// ── Bezetting ─────────────────────────────────────────────────────────────

const SHIFT = "00000000-0000-4000-8000-0000000000a1";
const STAFF = [
  { id: "tom", name: "Tom Willems", role: "bardienst", archived: false, has_pin: false },
  { id: "eva", name: "Eva Smit", role: "bardienst", archived: false, has_pin: false },
];

async function openBezetting(page: Page, add: (route: Route) => Promise<unknown> | unknown) {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, bodyIsNiet(route) ? null : []));
  await mockBarSessie(page, {
    shift: { id: SHIFT, startedAt: new Date().toISOString(), startedByName: "Femke Bos", activityTypeName: "Training" },
  });
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has("auth_user_id")) return json(route, 200, { name: "Femke Bos", role: "beheerder" });
    return json(route, 200, STAFF);
  });
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) =>
    json(route, 200, [{ member_id: "tom", added_at: new Date().toISOString(), members: { name: "Tom Willems" } }])
  );
  await page.route(/\/rest\/v1\/rpc\/(add|remove)_shift_member(\?|$)/, add);
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: /^Bar/ }).click();
  await page.getByRole("tab", { name: "Dienst" }).click();
  await page.getByRole("button", { name: "Bezetting wijzigen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bezetting van deze dienst" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Bezetting: toevoegen blokkeert Escape, backdrop en Klaar; andere rijen disabled; één aanroep", async ({ page }) => {
  const vast = houdVast();
  let aanroepen = 0;
  const dialog = await openBezetting(page, async (route) => {
    aanroepen++;
    await vast.poort;
    return json(route, 200, null);
  });

  await dialog.getByRole("button", { name: /^Eva Smit,/ }).click();
  await page.keyboard.press("Escape");
  await page.mouse.click(3, 3);

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByRole("status").filter({ hasText: MELDING })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Klaar", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /^Tom Willems,/ })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /^Eva Smit,/ })).toBeDisabled();
  // Een geforceerde klik op een disabled rij of op Klaar doet niets.
  await dialog.getByRole("button", { name: /^Tom Willems,/ }).click({ force: true });
  await dialog.getByRole("button", { name: "Klaar", exact: true }).click({ force: true });
  await expect(dialog).toBeVisible();
  await geenFocusOpBody(page);
  expect(aanroepen).toBe(1);

  vast.laatDoor();
  await expect(dialog).not.toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByRole("button", { name: "Klaar", exact: true })).toBeEnabled();
  await geenFocusOpBody(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(aanroepen).toBe(1);
});

test("Bezetting: na 30 s zonder antwoord valt de blokkade, onbekende uitkomst, geen tweede aanroep", async ({ page }) => {
  await page.clock.install();
  const vast = houdVast();
  let aanroepen = 0;
  const dialog = await openBezetting(page, async (route) => {
    aanroepen++;
    await vast.poort;
    return json(route, 200, null);
  });

  await dialog.getByRole("button", { name: /^Eva Smit,/ }).click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");

  // Net vóór de grens: nog geblokkeerd.
  await page.clock.fastForward(29_000);
  await expect(dialog.getByRole("button", { name: "Klaar", exact: true })).toBeDisabled();
  await expect(alertOf(page).filter({ hasText: ONBEKEND_BEHEER })).toHaveCount(0);

  await page.clock.fastForward(1_500);
  await expect(alertOf(page).filter({ hasText: ONBEKEND_BEHEER })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Klaar", exact: true })).toBeEnabled();
  await expect(dialog).not.toHaveAttribute("aria-busy", "true");
  // Geen 'probeer opnieuw' en geen automatische retry.
  await page.clock.fastForward(60_000);
  expect(aanroepen).toBe(1);
  await expect(page.getByText("probeer het opnieuw")).toHaveCount(0);

  // Sluiten kan nu.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  vast.laatDoor();
});

// ── Portal-sheets ─────────────────────────────────────────────────────────

type Profiel = { name: string; role: "lid" | "bardienst"; archived: boolean; has_pin: boolean };
const LID: Profiel = { name: "Mock Lid", role: "lid", archived: false, has_pin: false };
const BARDIENST: Profiel = { name: "Mock Bardienst", role: "bardienst", archived: false, has_pin: false };

async function mockPortal(
  page: Page,
  profiel: Profiel,
  handlers: {
    updateOwnName?: (route: Route) => Promise<unknown> | unknown;
    setOwnPin?: (route: Route) => Promise<unknown> | unknown;
    updateUser?: (route: Route) => Promise<unknown> | unknown;
  }
) {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, bodyIsNiet(route) ? null : []));
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const own = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    const row = own ? { ...profiel, balance_cents: 1500 } : null;
    return json(route, 200, bodyIsNiet(route) ? row : row ? [row] : []);
  });
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, (route) => json(route, 200, []));
  if (handlers.updateOwnName) await page.route(/\/rest\/v1\/rpc\/update_own_name(\?|$)/, handlers.updateOwnName);
  if (handlers.setOwnPin) await page.route(/\/rest\/v1\/rpc\/set_own_pin(\?|$)/, handlers.setOwnPin);
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => {
    if (route.request().method() === "GET") return json(route, 200, USER);
    if (route.request().method() !== "PUT") return route.fallback();
    return handlers.updateUser ? handlers.updateUser(route) : json(route, 200, USER);
  });
}

async function openAccount(page: Page) {
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("tab", { name: "Account" }).click({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Wachtwoord wijzigen/ })).toBeVisible();
}

async function openNaamSheet(page: Page) {
  await openAccount(page);
  await page.getByRole("button", { name: /^Naam wijzigen/ }).click();
  const dialog = page.getByRole("dialog", { name: "Naam wijzigen" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Portal Naam wijzigen: pending blokkeert sluiten, bevriest het veld, Enter-herhaling geeft één aanroep", async ({ page }) => {
  const vast = houdVast();
  let aanroepen = 0;
  await mockPortal(page, LID, {
    updateOwnName: async (route) => {
      aanroepen++;
      await vast.poort;
      return json(route, 200, { ...LID, name: "Mock Nieuw" });
    },
  });
  const dialog = await openNaamSheet(page);

  const veld = dialog.getByLabel("Volledige naam");
  await veld.fill("Mock Nieuw");
  await veld.press("Enter");
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(veld).toHaveAttribute("readonly", "");
  await expect(dialog.getByRole("button", { name: "Opslaan…" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Annuleer" })).toBeDisabled();

  // Enter-herhaling en een tweede klik tijdens pending.
  await veld.press("Enter");
  await veld.press("Enter");
  await dialog.getByRole("button", { name: "Opslaan…" }).click({ force: true });

  await page.keyboard.press("Escape");
  await page.mouse.click(3, 3);
  await dialog.getByRole("button", { name: "Annuleer" }).click({ force: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: MELDING })).toBeVisible();
  await geenFocusOpBody(page);
  expect(aanroepen).toBe(1);

  vast.laatDoor();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Naam bijgewerkt" })).toBeVisible();
  expect(aanroepen).toBe(1);
});

test("Portal Naam wijzigen: onopgeslagen vraagt bij Escape/backdrop, niet bij ongewijzigd of Annuleer", async ({ page }) => {
  await mockPortal(page, LID, {});
  const dialog = await openNaamSheet(page);

  // Onaangeroerd: Escape sluit zonder vraag.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /^Naam wijzigen/ }).click();
  await dialog.getByLabel("Volledige naam").fill("Iets anders");
  await page.keyboard.press("Escape");
  await expect(dialog.getByText(WEGGOOIEN)).toBeVisible();
  await dialog.getByRole("button", { name: "Terug" }).click();
  await expect(dialog.getByLabel("Volledige naam")).toHaveValue("Iets anders");
  await page.mouse.click(3, 3);
  await expect(dialog.getByText(WEGGOOIEN)).toBeVisible();
  await dialog.getByRole("button", { name: "Weggooien" }).click();
  await expect(dialog).toHaveCount(0);

  // Terug naar de oude waarde telt niet als onopgeslagen; bewuste Annuleer gooit zonder vraag weg.
  await page.getByRole("button", { name: /^Naam wijzigen/ }).click();
  await dialog.getByLabel("Volledige naam").fill("Iets anders");
  await dialog.getByRole("button", { name: "Annuleer" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Portal Naam wijzigen: na 30 s valt de blokkade, onbekende uitkomst, geen automatische tweede aanroep", async ({ page }) => {
  await page.clock.install();
  const vast = houdVast();
  let aanroepen = 0;
  await mockPortal(page, LID, {
    updateOwnName: async (route) => {
      aanroepen++;
      await vast.poort;
      return json(route, 200, { ...LID, name: "Mock Nieuw" });
    },
  });
  const dialog = await openNaamSheet(page);
  await dialog.getByLabel("Volledige naam").fill("Mock Nieuw");
  await dialog.getByRole("button", { name: "Opslaan" }).click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");

  await page.clock.fastForward(29_000);
  await expect(dialog.getByRole("button", { name: "Annuleer" })).toBeDisabled();

  await page.clock.fastForward(1_500);
  await expect(alertOf(page).filter({ hasText: ONBEKEND_BEHEER })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Annuleer" })).toBeEnabled();
  await page.clock.fastForward(60_000);
  expect(aanroepen).toBe(1);
  await expect(page.getByText("probeer het opnieuw")).toHaveCount(0);
  vast.laatDoor();
});

test("Portal Wachtwoord wijzigen: pending blokkeert sluiten en bevriest de velden; één aanroep", async ({ page }) => {
  const vast = houdVast();
  let aanroepen = 0;
  await mockPortal(page, LID, {
    updateUser: async (route) => {
      aanroepen++;
      await vast.poort;
      return json(route, 200, USER);
    },
  });
  await openAccount(page);
  await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();
  const dialog = page.getByRole("dialog", { name: "Wachtwoord wijzigen" });
  await dialog.getByLabel("Nieuw wachtwoord").fill("Aurora#2026");
  await dialog.getByLabel("Herhaal wachtwoord").fill("Aurora#2026");
  await dialog.getByRole("button", { name: "Wijzigen" }).click();

  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByLabel("Nieuw wachtwoord")).toHaveAttribute("readonly", "");
  await expect(dialog.getByLabel("Herhaal wachtwoord")).toHaveAttribute("readonly", "");
  await expect(dialog.getByRole("button", { name: "Annuleer" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Opslaan…" }).click({ force: true });
  await page.keyboard.press("Escape");
  await page.mouse.click(3, 3);
  await expect(dialog).toBeVisible();
  await geenFocusOpBody(page);
  expect(aanroepen).toBe(1);

  vast.laatDoor();
  await expect(dialog).toHaveCount(0);
  expect(aanroepen).toBe(1);
});

test("Portal Pincode: pending blokkeert sluiten en toetsen; één aanroep; onopgeslagen cijfers vragen bevestiging", async ({ page }) => {
  const vast = houdVast();
  let aanroepen = 0;
  await mockPortal(page, BARDIENST, {
    setOwnPin: async (route) => {
      aanroepen++;
      await vast.poort;
      return json(route, 200, { ...BARDIENST, has_pin: true, pin_hash: null });
    },
  });
  await openAccount(page);
  await page.getByRole("button", { name: /^Pincode voor de bar-tablet/ }).click();
  const kies = page.getByRole("dialog", { name: "Pincode instellen" });

  // Half ingetoetst = onopgeslagen: Escape vraagt eerst.
  await kies.getByRole("button", { name: "Cijfer 1" }).click();
  await page.keyboard.press("Escape");
  await expect(kies.getByText(WEGGOOIEN)).toBeVisible();
  await kies.getByRole("button", { name: "Terug" }).click();

  for (const cijfer of ["2", "3", "4"]) await kies.getByRole("button", { name: `Cijfer ${cijfer}` }).click();
  const herhaal = page.getByRole("dialog", { name: "Pincode herhalen" });
  for (const cijfer of ["1", "2", "3", "4"]) await herhaal.getByRole("button", { name: `Cijfer ${cijfer}` }).click();

  await expect(herhaal).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await page.mouse.click(3, 3);
  await expect(herhaal).toBeVisible();
  // Geen bevestigingsvraag tijdens pending: alleen de blokkademelding.
  await expect(herhaal.getByText(WEGGOOIEN)).toHaveCount(0);
  await expect(herhaal.getByRole("status").filter({ hasText: MELDING })).toBeVisible();
  // Toetsen tijdens pending doen niets (geen tweede aanroep).
  for (const cijfer of ["1", "2", "3", "4"]) {
    await herhaal.getByRole("button", { name: `Cijfer ${cijfer}` }).click({ force: true });
  }
  await geenFocusOpBody(page);
  expect(aanroepen).toBe(1);

  vast.laatDoor();
  await expect(herhaal).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Pincode ingesteld" })).toBeVisible();
  expect(aanroepen).toBe(1);
});

// ── Afrekenen en Opwaarderen: onbekende uitkomst en time-out ─────────────

const ANNA = { id: "00000000-0000-4000-8000-0000000000d3", name: "Anna de Vries" };
const TOM = { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom Willems" };
const BAR_SHIFT = "00000000-0000-4000-8000-0000000000d1";

type Geld = (route: Route, n: number) => Promise<unknown> | unknown;

async function openKassa(page: Page, geld: { place_order?: Geld; top_up?: Geld }) {
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
    await page.route(new RegExp(`/rest/v1/rpc/${rpc}(\\?|$)`), (route) => {
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

async function kiesLid(page: Page) {
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("option", { name: /Anna de Vries/ }).click();
}

async function openAfrekenen(page: Page) {
  await page.getByRole("button", { name: /^Pils,/ }).click();
  await kiesLid(page);
  await page.getByRole("button", { name: "Tik afrekenen" }).click();
  const dialog = page.getByRole("dialog", { name: /^Afrekenen bij/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openOpwaarderen(page: Page) {
  await kiesLid(page);
  await page.getByRole("button", { name: /opwaarderen/i }).click();
  const dialog = page.getByRole("dialog", { name: /^Saldo opwaarderen bij/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Ander bedrag").fill("5");
  return dialog;
}

test("Afrekenen: afgebroken place_order toont de controletekst, geen 'probeer opnieuw', geen retry, pas na 'Ik heb gecontroleerd' opnieuw", async ({ page }) => {
  const calls = await openKassa(page, { place_order: (route) => route.abort("failed") });
  const dialog = await openAfrekenen(page);
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click();

  await expect(alertOf(page).filter({ hasText: ONBEKEND_GELD })).toBeVisible();
  await expect(page.getByText(/probeer het opnieuw/i)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "ja, afrekenen" })).toBeDisabled();
  // Een geforceerde klik op de disabled knop verstuurt niets; geen automatische retry.
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click({ force: true });
  await page.waitForTimeout(1500);
  expect(calls.place_order).toBe(1);
  // De sluitblokkade is weg: de gebruiker zit niet vast.
  await expect(dialog.getByRole("button", { name: "annuleren" })).toBeEnabled();

  await dialog.getByRole("button", { name: "Ik heb gecontroleerd" }).click();
  await expect(dialog.getByRole("button", { name: "ja, afrekenen" })).toBeEnabled();
  expect(calls.place_order).toBe(1);
});

test("Afrekenen: focus blijft na 'Ik heb gecontroleerd' in de dialoog", async ({ page }) => {
  await openKassa(page, { place_order: (route) => route.abort("failed") });
  const dialog = await openAfrekenen(page);
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click();
  await dialog.getByRole("button", { name: "Ik heb gecontroleerd" }).click();
  await expect(dialog.getByRole("button", { name: "ja, afrekenen" })).toBeEnabled();
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
});

test("Afrekenen: een domeinfout (insufficient_balance) is géén onbekende uitkomst en vraagt geen controle", async ({ page }) => {
  const calls = await openKassa(page, {
    place_order: (route) => json(route, 400, { code: "P0001", message: "insufficient_balance", details: null, hint: null }),
  });
  const dialog = await openAfrekenen(page);
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click();
  await expect.poll(() => calls.place_order).toBe(1);
  await expect(dialog.getByText(ONBEKEND_GELD)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Ik heb gecontroleerd" })).toHaveCount(0);
});

test("Afrekenen: geen time-out voor geld: na 30 s blijft de dialoog geblokkeerd, geen onbekende uitkomst, één request", async ({ page }) => {
  await page.clock.install();
  const vast = houdVast();
  const calls = await openKassa(page, {
    place_order: async (route) => {
      await vast.poort;
      return json(route, 200, { total_cents: 250 });
    },
  });
  const dialog = await openAfrekenen(page);
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");

  for (const ms of [29_000, 1_500, 60_000]) {
    await page.clock.fastForward(ms);
    await expect(dialog.getByRole("button", { name: "annuleren" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(ONBEKEND_GELD)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Ik heb gecontroleerd" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "bezig…" })).toBeDisabled();
  }
  expect(calls.place_order).toBe(1);

  // Het late antwoord rondt de bestelling gewoon af.
  vast.laatDoor();
  await expect(dialog).toHaveCount(0);
  expect(calls.place_order).toBe(1);
});

test("Afrekenen: hangend verzoek faalt pas na 30 s: dan pas onbekende uitkomst, controle vereist, geen tweede request", async ({ page }) => {
  await page.clock.install();
  const vast = houdVast();
  const calls = await openKassa(page, {
    place_order: async (route) => {
      await vast.poort;
      return route.abort("failed");
    },
  });
  const dialog = await openAfrekenen(page);
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click();
  await page.clock.fastForward(31_000);
  await expect(dialog.getByRole("button", { name: "Ik heb gecontroleerd" })).toHaveCount(0);

  vast.laatDoor();
  await expect(alertOf(page).filter({ hasText: ONBEKEND_GELD })).toBeVisible();
  const controle = dialog.getByRole("button", { name: "Ik heb gecontroleerd" });
  await expect(controle).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "annuleren" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "ja, afrekenen" })).toBeDisabled();
  await dialog.getByRole("button", { name: "ja, afrekenen" }).click({ force: true });
  await page.waitForTimeout(500);
  expect(calls.place_order).toBe(1);

  await controle.click();
  await expect(dialog.getByRole("button", { name: "ja, afrekenen" })).toBeEnabled();
});

test("Opwaarderen: afgebroken top_up toont de controletekst, geen 'probeer opnieuw', geen retry, pas na controle opnieuw", async ({ page }) => {
  const calls = await openKassa(page, { top_up: (route) => route.abort("failed") });
  const dialog = await openOpwaarderen(page);
  await dialog.getByRole("button", { name: "boeken", exact: true }).click();

  await expect(alertOf(page).filter({ hasText: ONBEKEND_GELD })).toBeVisible();
  await expect(page.getByText(/probeer het opnieuw/i)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "boeken", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "boeken", exact: true }).click({ force: true });
  await page.waitForTimeout(1500);
  expect(calls.top_up).toBe(1);
  await expect(dialog.getByRole("button", { name: "annuleren" })).toBeEnabled();

  await dialog.getByRole("button", { name: "Ik heb gecontroleerd" }).click();
  await expect(dialog.getByRole("button", { name: "boeken", exact: true })).toBeEnabled();
  expect(calls.top_up).toBe(1);
});

test("Opwaarderen: focus blijft na 'Ik heb gecontroleerd' in de dialoog", async ({ page }) => {
  await openKassa(page, { top_up: (route) => route.abort("failed") });
  const dialog = await openOpwaarderen(page);
  await dialog.getByRole("button", { name: "boeken", exact: true }).click();
  await dialog.getByRole("button", { name: "Ik heb gecontroleerd" }).click();
  await expect(dialog.getByRole("button", { name: "boeken", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
});

test("Opwaarderen: geen time-out voor geld: pending blokkeert sluiten, na 30 s nog steeds, één aanroep", async ({ page }) => {
  await page.clock.install();
  const vast = houdVast();
  const calls = await openKassa(page, {
    top_up: async (route) => {
      await vast.poort;
      return json(route, 200, { amount_cents: 500 });
    },
  });
  const dialog = await openOpwaarderen(page);
  await dialog.getByRole("button", { name: "boeken", exact: true }).click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await dialog.getByRole("button", { name: "bezig…" }).click({ force: true });

  for (const ms of [29_000, 1_500, 60_000]) {
    await page.clock.fastForward(ms);
    await page.keyboard.press("Escape");
    await page.mouse.click(3, 3);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "annuleren" })).toBeDisabled();
    await expect(dialog.getByText(ONBEKEND_GELD)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Ik heb gecontroleerd" })).toHaveCount(0);
  }
  expect(calls.top_up).toBe(1);
  vast.laatDoor();
  await expect(dialog).toHaveCount(0);
});

test("Opwaarderen: hangend verzoek faalt pas na 30 s: dan pas onbekende uitkomst, controle vereist, geen tweede request", async ({ page }) => {
  await page.clock.install();
  const vast = houdVast();
  const calls = await openKassa(page, {
    top_up: async (route) => {
      await vast.poort;
      return route.abort("failed");
    },
  });
  const dialog = await openOpwaarderen(page);
  await dialog.getByRole("button", { name: "boeken", exact: true }).click();
  await page.clock.fastForward(31_000);
  await expect(dialog.getByRole("button", { name: "Ik heb gecontroleerd" })).toHaveCount(0);

  vast.laatDoor();
  await expect(alertOf(page).filter({ hasText: ONBEKEND_GELD })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Ik heb gecontroleerd" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "boeken", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "boeken", exact: true }).click({ force: true });
  await page.waitForTimeout(500);
  expect(calls.top_up).toBe(1);
});
