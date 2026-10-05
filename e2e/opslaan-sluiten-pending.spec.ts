import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  USER,
  alertOf,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
} from "./helpers/supabaseMock";

/**
 * #126 (T06): opslaan, sluiten en gelijktijdige acties voorspelbaar. Zonder
 * echte database, zelfde aanpak als e2e/ledenbeheer-invite.spec.ts: Supabase via
 * `page.route()`. Een RPC wordt met opzet vastgehouden (`houdVast`) zodat
 * "pending" deterministisch is. Wat dit níét toetst: de 30 seconden time-out
 * (zie de aanvulling-spec en de unit-test voor de waarde), Safari/touch/schermlezer (handmatig,
 * Tester), en echte dubbele boeking (geen idempotentie, apart ticket).
 */

const LID = {
  id: "00000000-0000-4000-8000-0000000000aa",
  name: "Joris de Vries",
  role: "lid",
  balance_cents: 1250,
  archived: false,
  auth_user_id: null,
  has_pin: false,
  email: null,
  invited_at: null,
};
const PRODUCT = { id: "p1", name: "Pils", category: "Bier", price_cents: 250, archived: false };

const MELDING = "Even wachten, de actie wordt nog verwerkt.";
const ONBEKEND = "De uitkomst is onbekend. Controleer eerst het saldo of de transacties voordat je opnieuw probeert.";

test("Nieuw lid: verloren antwoord blijft na herladen met dezelfde sleutel herstelbaar", async ({ page }) => {
  await mockBeheerder(page);
  const keys: string[] = [];
  await page.route(/\/rest\/v1\/rpc\/create_member_once(\?|$)/, async (route) => {
    keys.push(route.request().postDataJSON().p_request_id);
    if (keys.length === 1) return route.abort("failed");
    return json(route, 200, LID);
  });
  await naarBeheer(page, "Leden");
  await page.getByRole("button", { name: /nieuw lid/i }).click();
  const dialog = page.getByRole("dialog", { name: "Nieuw lid" });
  await dialog.getByLabel("Naam", { exact: true }).fill("Joris de Vries");
  await dialog.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await expect(dialog.getByText(ONBEKEND)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Eerdere nieuw lid veilig afronden" }).click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/i);
  expect(keys[1]).toBe(keys[0]);
  await expect(page.getByRole("button", { name: "Eerdere nieuw lid veilig afronden" })).toHaveCount(0);
});

/** Houdt een RPC-antwoord vast tot `laatDoor()`; telt de aanroepen. */
function houdVast() {
  let release!: () => void;
  const poort = new Promise<void>((resolve) => (release = resolve));
  return { poort, laatDoor: release, aanroepen: 0 };
}

async function mockBeheerder(page: Page) {
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
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) => json(route, 200, [PRODUCT]));
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) => json(route, 200, [LID]));
  await mockBarSessie(page);
}

async function naarBeheer(page: Page, tab: "Assortiment" | "Leden") {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: tab }).click();
}

async function openProduct(page: Page) {
  await naarBeheer(page, "Assortiment");
  await page.getByRole("button", { name: /Pils/ }).click();
  const dialog = page.getByRole("dialog", { name: "Product beheren" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openLid(page: Page) {
  await naarBeheer(page, "Leden");
  await page.getByRole("button", { name: LID.name }).click();
  const dialog = page.getByRole("dialog", { name: "Lid beheren" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Escape en een tik op de backdrop (linksboven, buiten de dialoog). */
async function probeerTeSluiten(page: Page) {
  await page.keyboard.press("Escape");
  await page.mouse.click(3, 3);
}

test("Product beheren: prijs opslaan blokkeert Escape, backdrop en Sluiten; veld en knop bevroren", async ({ page }) => {
  await mockBeheerder(page);
  const vast = houdVast();
  await page.route(/\/rest\/v1\/rpc\/update_product_price(\?|$)/, async (route) => {
    vast.aanroepen++;
    await vast.poort;
    return json(route, 200, { ...PRODUCT, price_cents: 275 });
  });
  const dialog = await openProduct(page);

  await dialog.getByLabel("Nieuwe prijs").fill("2,75");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();

  await probeerTeSluiten(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: MELDING })).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByLabel("Nieuwe prijs")).toHaveAttribute("readonly", "");
  await expect(dialog.getByRole("button", { name: "Opslaan…" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Sluiten" })).toBeDisabled();
  // De andere sectie is disabled mét uitleg, en er is maar één aanroep.
  await expect(dialog.getByRole("button", { name: /Uit assortiment halen/ })).toBeDisabled();
  await expect(dialog.getByText("wacht tot de lopende wijziging klaar is").first()).toBeVisible();
  // Focus nooit op body.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

  vast.laatDoor();
  await expect(dialog).not.toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByText("€ 2,75").first()).toBeVisible();
  expect(vast.aanroepen).toBe(1);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

  // Geen onopgeslagen invoer meer (veld is geleegd): Escape sluit zonder vraag.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Product beheren: a11y-scan in pending-toestand", async ({ page }) => {
  await mockBeheerder(page);
  const vast = houdVast();
  await page.route(/\/rest\/v1\/rpc\/update_product_price(\?|$)/, async (route) => {
    await vast.poort;
    return json(route, 200, { ...PRODUCT, price_cents: 275 });
  });
  const dialog = await openProduct(page);
  await dialog.getByLabel("Nieuwe prijs").fill("2,75");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  const resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(resultaat.violations).toEqual([]);
  vast.laatDoor();
});

test("Lid beheren: lopende naamwijziging serialiseert de andere acties (één aanroep)", async ({ page }) => {
  await mockBeheerder(page);
  const naam = houdVast();
  let overig = 0;
  await page.route(/\/rest\/v1\/rpc\/update_member_name(\?|$)/, async (route) => {
    naam.aanroepen++;
    await naam.poort;
    return json(route, 200, { ...LID, name: "Joris de Jong" });
  });
  await page.route(/\/rest\/v1\/rpc\/(set_member_role|set_member_archived|update_member_email)(\?|$)/, (route) => {
    overig++;
    return json(route, 200, LID);
  });
  const dialog = await openLid(page);

  await dialog.getByLabel("Naam", { exact: true }).fill("Joris de Jong");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).first().click();
  await probeerTeSluiten(page);

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByLabel("Naam", { exact: true })).toHaveAttribute("readonly", "");
  await expect(dialog.getByRole("button", { name: /Lid archiveren/ })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Sluiten" })).toBeDisabled();
  await expect(dialog.getByText("wacht tot de lopende wijziging klaar is").first()).toBeVisible();

  naam.laatDoor();
  await expect(dialog.getByRole("button", { name: /Lid archiveren/ })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Sluiten" })).toBeEnabled();
  expect(naam.aanroepen).toBe(1);
  expect(overig).toBe(0);
});

test("Lid beheren: de fout van de ene actie wordt niet verdrongen door een andere", async ({ page }) => {
  await mockBeheerder(page);
  await page.route(/\/rest\/v1\/rpc\/update_member_name(\?|$)/, (route) =>
    json(route, 400, { message: "invalid_name" })
  );
  await page.route(/\/rest\/v1\/rpc\/set_member_archived(\?|$)/, (route) =>
    json(route, 200, { ...LID, archived: true })
  );
  const dialog = await openLid(page);

  await dialog.getByLabel("Naam", { exact: true }).fill("Jori");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).first().click();
  await expect(alertOf(page)).toHaveText("vul een naam in");

  await dialog.getByRole("button", { name: /Lid archiveren/ }).click();
  await expect(dialog.getByRole("button", { name: /Lid terugzetten/ })).toBeVisible();
  // De naamfout staat er nog, naast zijn eigen sectie.
  await expect(alertOf(page)).toHaveText("vul een naam in");
  // Het lokale lid is niet overschreven: de naam in het veld blijft wat de gebruiker typte.
  await expect(dialog.getByLabel("Naam", { exact: true })).toHaveValue("Jori");
});

test("Nieuw product: Escape en backdrop vragen om bevestiging, Annuleren niet", async ({ page }) => {
  await mockBeheerder(page);
  await naarBeheer(page, "Assortiment");
  await page.getByRole("button", { name: /nieuw product/i }).click();
  const dialog = page.getByRole("dialog", { name: "Nieuw product" });
  await expect(dialog).toBeVisible();

  // Onaangeroerd formulier: geen vraag.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /nieuw product/i }).click();
  await dialog.getByLabel("Naam").fill("Cola");
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("Niet-opgeslagen wijziging weggooien?")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Terug" })).toBeFocused();

  // Nogmaals Escape = terug, de invoer blijft staan.
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("Niet-opgeslagen wijziging weggooien?")).toHaveCount(0);
  await expect(dialog.getByLabel("Naam")).toHaveValue("Cola");

  await page.mouse.click(3, 3);
  await expect(dialog.getByText("Niet-opgeslagen wijziging weggooien?")).toBeVisible();
  await dialog.getByRole("button", { name: "Terug" }).click();
  await expect(dialog).toBeVisible();

  await page.mouse.click(3, 3);
  await dialog.getByRole("button", { name: "Weggooien" }).click();
  await expect(dialog).toHaveCount(0);

  // De bewuste Annuleren-knop gooit zonder vraag weg.
  await page.getByRole("button", { name: /nieuw product/i }).click();
  await dialog.getByLabel("Naam").fill("Cola");
  await dialog.getByRole("button", { name: "Annuleren" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Nieuw lid: afgebroken create_member toont de controletekst, geen 'probeer opnieuw', geen tweede request", async ({ page }) => {
  await mockBeheerder(page);
  let aanroepen = 0;
  await page.route(/\/rest\/v1\/rpc\/create_member_once(\?|$)/, (route) => {
    aanroepen++;
    return route.abort("failed");
  });
  await naarBeheer(page, "Leden");
  await page.getByRole("button", { name: /nieuw lid/i }).click();
  const dialog = page.getByRole("dialog", { name: "Nieuw lid" });
  await dialog.getByLabel("Naam").fill("Pieter");
  await dialog.getByLabel("Startsaldo (optioneel)").fill("10");
  await dialog.getByRole("button", { name: "Toevoegen" }).click();

  await expect(alertOf(page)).toHaveText(ONBEKEND);
  await expect(page.getByText("probeer het opnieuw")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Toevoegen" })).toBeDisabled();
  // Geen automatische retry.
  await page.waitForTimeout(1000);
  expect(aanroepen).toBe(1);

  // Pas na een bewuste controle kan opnieuw.
  await dialog.getByRole("button", { name: "Ik heb gecontroleerd" }).click();
  await expect(dialog.getByRole("button", { name: "Toevoegen" })).toBeEnabled();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test("Nieuw lid: geen time-out voor geld: na 30 s blijft de dialoog geblokkeerd", async ({ page }) => {
  await page.clock.install();
  await mockBeheerder(page);
  let laatDoor!: () => void;
  const poort = new Promise<void>((resolve) => (laatDoor = resolve));
  let aanroepen = 0;
  await page.route(/\/rest\/v1\/rpc\/create_member_once(\?|$)/, async (route) => {
    aanroepen++;
    await poort;
    return route.abort("failed");
  });
  await naarBeheer(page, "Leden");
  await page.getByRole("button", { name: /nieuw lid/i }).click();
  const dialog = page.getByRole("dialog", { name: "Nieuw lid" });
  await dialog.getByLabel("Naam").fill("Pieter");
  await dialog.getByLabel("Startsaldo (optioneel)").fill("10");
  await dialog.getByRole("button", { name: "Toevoegen" }).click();
  await expect.poll(() => aanroepen).toBe(1);

  for (const ms of [29_000, 1_500, 60_000]) {
    await page.clock.fastForward(ms);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Annuleren" })).toBeDisabled();
    await expect(dialog.getByText(ONBEKEND)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Ik heb gecontroleerd" })).toHaveCount(0);
  }
  expect(aanroepen).toBe(1);

  // Pas na een echte fout verschijnt de onbekende uitkomst.
  laatDoor();
  await expect(alertOf(page)).toHaveText(ONBEKEND);
  await expect(dialog.getByRole("button", { name: "Ik heb gecontroleerd" })).toBeEnabled();
});
