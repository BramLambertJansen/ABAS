import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
 * docs/features/leesfouten-herstel-actuele-data.md (T08, #128) → Teststrategie.
 * Zonder live backend: Supabase en `/inloggen/namen` via `page.route()`, zodat
 * een leesfout, een trage lezing en een tweede lezing met ander saldo
 * afdwingbaar zijn. Negatieve gevallen (fout, herstel, geen dubbele
 * oproepen) eerst. De klok loopt via `page.clock` (30 s-drempel).
 *
 * Niet in deze spec (wacht op #115): de foutstaat van `usePortalSession` en
 * het `PortalShellHome`-deel (key, achtergrondlookup, getSession-catch).
 * Handmatig door de Tester: echte barboeking op client A en verversing op B,
 * vliegtuigmodus, Safari/Android.
 */

type Modus = "ok" | number | "netwerk";

async function antwoord(route: Route, modus: Modus, body: unknown) {
  if (modus === "netwerk") return route.abort("failed");
  if (modus === "ok") return json(route, 200, body);
  return json(route, modus, { code: "PGRST301", message: "kapot", details: null, hint: null });
}

async function axeSchoon(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

/** De focus staat nooit op `body` na een herstelstap. */
async function focusNietOpBody(page: Page) {
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
}

/** Alleen echte meldingen: sommige schermen hebben een lege `role=alert`-plek. */
const meldingen = (page: Page) => alertOf(page).filter({ hasText: /\S/ });
const alertIn = (scope: Locator) => scope.locator('[role="alert"]');

const retryKnop = (scope: Page | ReturnType<Page["getByRole"]>) =>
  scope.getByRole("button", { name: /^Opnieuw proberen/ });

// ── Portal ───────────────────────────────────────────────────────────────

type Rij = {
  id: string;
  kind: "bestelling" | "opwaardering";
  created_at: string;
  amount_cents: number;
  method: string | null;
  server_name: string | null;
  reversed: boolean;
  reversal_reason: string | null;
  reversed_via: "bar" | "beheer" | null;
  reversed_by_name: string | null;
};

function rij(id: string, overrides: Partial<Rij> = {}): Rij {
  return {
    id,
    kind: "bestelling",
    created_at: "2026-09-20T12:00:00Z",
    amount_cents: 500,
    method: null,
    server_name: "Tom Willems",
    reversed: false,
    reversal_reason: null,
    reversed_via: null,
    reversed_by_name: null,
    ...overrides,
  };
}

const OUD = [
  rij("a1", { created_at: "2026-09-24T12:00:00Z", kind: "opwaardering", method: "cash", amount_cents: 1000 }),
  rij("a2", { created_at: "2026-09-23T12:00:00Z", amount_cents: 250 }),
];
const NIEUW_RIJ = rij("a3", { created_at: "2026-09-25T12:00:00Z", amount_cents: 777 });

type PortalStaat = {
  saldo: number;
  rijen: Rij[];
  drempel: number;
  modus: { balance: Modus; tx: Modus; settings: Modus };
  /** Aantal lezingen per bron (de sessielookup telt niet mee). */
  n: { balance: number; tx: number; settings: number };
  poort: { balance: Promise<void> | null; tx: Promise<void> | null };
};

/** Houdt de antwoorden van `bron` vast tot de teruggegeven functie wordt aangeroepen. */
function houdVast(staat: PortalStaat, bron: "balance" | "tx"): () => void {
  let laatDoor!: () => void;
  staat.poort[bron] = new Promise<void>((resolve) => {
    laatDoor = () => {
      staat.poort[bron] = null;
      resolve();
    };
  });
  return laatDoor;
}

async function mockPortal(page: Page): Promise<PortalStaat> {
  const staat: PortalStaat = {
    saldo: 1500,
    rijen: [...OUD],
    drempel: 1000,
    modus: { balance: "ok", tx: "ok", settings: "ok" },
    n: { balance: 0, tx: 0, settings: 0 },
    poort: { balance: null, tx: null },
  };
  const objectOrList = (route: Route, modus: Modus, row: unknown) => {
    const accept = route.request().headers()["accept"] ?? "";
    return antwoord(route, modus, accept.includes("vnd.pgrst.object") ? row : [row]);
  };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
  await page.route(/\/rest\/v1\/members(\?|$)/, async (route) => {
    const url = decodeURIComponent(route.request().url());
    if (!url.includes(`auth_user_id=eq.${USER.id}`)) return objectOrList(route, "ok", null);
    if (url.includes("balance_cents")) {
      staat.n.balance++;
      if (staat.poort.balance) await staat.poort.balance;
      return objectOrList(route, staat.modus.balance, { name: "Mock Lid", balance_cents: staat.saldo });
    }
    // Sessielookup (usePortalSession): niet de te tellen lezing.
    return objectOrList(route, "ok", { name: "Mock Lid", role: "lid", archived: false, has_pin: false });
  });
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) => {
    staat.n.settings++;
    return objectOrList(route, staat.modus.settings, { low_balance_threshold_cents: staat.drempel });
  });
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, async (route) => {
    staat.n.tx++;
    if (staat.poort.tx) await staat.poort.tx;
    return antwoord(route, staat.modus.tx, staat.rijen);
  });
  await page.route(/\/rest\/v1\/order_lines(\?|$)/, (route) => json(route, 200, []));
  return staat;
}

async function openPortal(page: Page): Promise<PortalStaat> {
  await page.clock.install();
  const staat = await mockPortal(page);
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("heading", { name: "Hoi Mock" })).toBeVisible({ timeout: 15_000 });
  return staat;
}

async function openPortalGeladen(page: Page): Promise<PortalStaat> {
  const staat = await openPortal(page);
  await expect(page.getByRole("group", { name: "Saldo" })).toContainText("15,00");
  await expect(page.getByText(/^Bijgewerkt om \d{2}:\d{2}$/)).toBeVisible();
  return staat;
}

const stuurVisibilitychange = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
const verversKnop = (page: Page) => page.getByRole("button", { name: /^Verversen$|^Verversen/ });
const tijdVan = async (page: Page) =>
  ((await page.getByRole("status").filter({ hasText: /^Bijgewerkt om / }).textContent()) ?? "").replace(
    "Bijgewerkt om ",
    ""
  );
/** Genoeg wachttijd om te bewijzen dat er niets (meer) gebeurt. */
const rustig = (page: Page) => page.waitForTimeout(400);

test.describe("portal: leesfouten en herstel", () => {
  test("Saldo: serverfout toont de code, een mislukte retry houdt de focus op de knop, herstel zet de focus op het saldo", async ({ page }) => {
    const staat = await mockPortalZonderLogin(page);
    staat.modus.balance = 500;
    await loginPortal(page);
    const fout = alertOf(page).filter({ hasText: "Kan het saldo niet laden." });
    await expect(fout).toBeVisible({ timeout: 15_000 });
    await expect(fout).toContainText("serverkant");
    await expect(fout).toContainText("code PGRST301");
    await expect(fout).not.toContainText("Controleer de verbinding");
    await expect(page.getByRole("group", { name: "Saldo" })).toHaveCount(0);
    await axeSchoon(page);

    // Retry die weer mislukt: de focus blijft op de knop, geen automatische herhaling.
    const voor = staat.n.balance;
    const laatDoor = houdVast(staat, "balance");
    await retryKnop(page).click();
    await expect(retryKnop(page)).toHaveText("Opnieuw proberen…");
    await expect(retryKnop(page)).toHaveAttribute("aria-disabled", "true");
    await expect(retryKnop(page)).toBeFocused();
    laatDoor();
    await expect(retryKnop(page)).toHaveText("Opnieuw proberen");
    await expect(retryKnop(page)).toBeFocused();
    await rustig(page);
    expect(staat.n.balance).toBe(voor + 1);

    // Herstel: de knop verdwijnt, de focus gaat naar het saldo (nooit body).
    staat.modus.balance = "ok";
    await retryKnop(page).click();
    const saldo = page.getByRole("group", { name: "Saldo" });
    await expect(saldo).toContainText("15,00");
    await expect(saldo).toBeFocused();
    await focusNietOpBody(page);
    await expect(meldingen(page)).toHaveCount(0);
  });

  test("Saldo: een netwerkfout noemt de verbinding, niet de serverkant", async ({ page }) => {
    const staat = await mockPortalZonderLogin(page);
    staat.modus.balance = "netwerk";
    await loginPortal(page);
    const fout = alertOf(page).filter({ hasText: "Kan het saldo niet laden." });
    await expect(fout).toContainText("Controleer de verbinding.", { timeout: 15_000 });
    await expect(fout).not.toContainText("serverkant");
    await expect(page.getByText("Je ziet de gegevens van")).toHaveCount(0);
  });

  test("Saldo: transacties en instellingen falen apart, met een eigen 'Opnieuw proberen'; het saldo blijft staan", async ({ page }) => {
    const staat = await mockPortalZonderLogin(page);
    staat.modus.tx = 500;
    staat.modus.settings = 500;
    await loginPortal(page);
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("15,00", { timeout: 15_000 });
    const tx = page.getByRole("group", { name: "Recente transacties" });
    await expect(alertIn(tx)).toContainText("Kan de transacties niet laden.");
    await expect(alertOf(page).filter({ hasText: "Kan de instellingen niet laden." })).toBeVisible();
    await expect(retryKnop(page)).toHaveCount(2);
    await axeSchoon(page);

    const settingsVoor = staat.n.settings;
    const balanceVoor = staat.n.balance;
    staat.modus.tx = "ok";
    await retryKnop(tx).click();
    await expect(tx.getByRole("listitem")).toHaveCount(2);
    await expect(tx).toBeFocused();
    // Alleen die hook is opnieuw gelezen.
    expect(staat.n.settings).toBe(settingsVoor);
    expect(staat.n.balance).toBe(balanceVoor);
    await expect(alertOf(page).filter({ hasText: "Kan de instellingen niet laden." })).toBeVisible();

    staat.modus.settings = "ok";
    await retryKnop(page).click();
    await expect(meldingen(page)).toHaveCount(0);
    await focusNietOpBody(page);
  });

  test("Transacties-tab: een leesfout krijgt LeesFout; retry herstelt en laat het filter staan", async ({ page }) => {
    const staat = await mockPortalZonderLogin(page);
    await loginPortal(page);
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("15,00", { timeout: 15_000 });
    staat.modus.tx = "netwerk";
    await page.getByRole("tab", { name: "Transacties" }).click();
    await page.getByRole("button", { name: "Uitgaven" }).click();
    await expect(alertOf(page)).toContainText("Controleer de verbinding.");
    await expect(page.getByRole("status").filter({ hasText: /^Bijgewerkt om/ })).toHaveCount(0);
    staat.modus.tx = "ok";
    await retryKnop(page).click();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Uitgaven" })).toHaveAttribute("aria-pressed", "true");
    await focusNietOpBody(page);
    await expect(meldingen(page)).toHaveCount(0);
  });

  test("een mislukte verversing laat de gegevens staan, met een melding (status, geen alert) en het oude tijdstip", async ({ page }) => {
    const staat = await openPortalGeladen(page);
    const t0 = await tijdVan(page);
    await axeSchoon(page);

    await page.clock.fastForward(10 * 60_000);
    staat.modus.tx = 500;
    staat.modus.balance = 500;
    staat.saldo = 2000;
    await verversKnop(page).click();
    const melding = page.getByRole("status").filter({ hasText: "Verversen mislukt." });
    await expect(melding).toContainText(`Je ziet de gegevens van ${t0}.`);
    await expect(melding).toContainText("serverkant");
    // Saldo en lijst blijven op het oude, bekende stand; geen alert naast de data.
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("15,00");
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(meldingen(page)).toHaveCount(0);
    await expect(verversKnop(page)).toBeFocused();
    await axeSchoon(page);

    // Herstel zet het label op de nieuwe tijd en het nieuwe saldo.
    staat.modus.tx = "ok";
    staat.modus.balance = "ok";
    await verversKnop(page).click();
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("20,00");
    await expect(page.getByText(/^Bijgewerkt om \d{2}:\d{2}$/)).toBeVisible();
    expect(await tijdVan(page)).not.toBe(t0);
    await expect(page.getByText("Verversen mislukt.")).toHaveCount(0);
    await focusNietOpBody(page);
  });

  test("een mislukte verversing van de instellingen laat de laag-saldokaart op de laatst bekende drempel", async ({ page }) => {
    const staat = await mockPortal(page);
    staat.saldo = 500;
    await page.clock.install();
    await loginPortal(page);
    await expect(page.getByText("Saldo bijna op")).toBeVisible({ timeout: 15_000 });
    staat.modus.settings = 500;
    await verversKnop(page).click();
    await expect(page.getByText("Verversen mislukt.")).toBeVisible();
    await expect(page.getByText("Saldo bijna op")).toBeVisible();
  });
});

test.describe("portal: actuele data", () => {
  test("verouderde data: na visibilitychange (na 30 s) en na 'Verversen' staat het nieuwe saldo er, met een verse lijst", async ({ page }) => {
    const staat = await openPortalGeladen(page);
    expect(staat.n).toEqual({ balance: 1, tx: 1, settings: 1 });

    // De tweede lezing geeft een ander saldo en een extra rij.
    staat.saldo = 2500;
    staat.rijen = [NIEUW_RIJ, ...OUD];

    // Binnen 30 s: geen verversing.
    await stuurVisibilitychange(page);
    await rustig(page);
    expect(staat.n).toEqual({ balance: 1, tx: 1, settings: 1 });
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("15,00");

    // Na 30 s: wel, één request per bron.
    await page.clock.fastForward(31_000);
    await stuurVisibilitychange(page);
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("25,00");
    await expect(page.getByRole("listitem")).toHaveCount(3);
    await rustig(page);
    expect(staat.n).toEqual({ balance: 2, tx: 2, settings: 2 });

    // De knop ververst ook, ongeacht de drempel.
    staat.saldo = 3500;
    await verversKnop(page).click();
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("35,00");
    expect(staat.n).toEqual({ balance: 3, tx: 3, settings: 3 });
  });

  test("een verborgen tabblad ververst niet; terugkeer na een mislukte poging ververst ook binnen 30 s", async ({ page }) => {
    const staat = await openPortalGeladen(page);
    await page.clock.fastForward(60_000);
    await page.evaluate(() =>
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
    );
    await stuurVisibilitychange(page);
    await rustig(page);
    expect(staat.n.balance).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    });

    // Een mislukte verversing maakt een volgende terugkeer meteen ververs-waardig.
    staat.modus.balance = 500;
    await verversKnop(page).click();
    await expect(page.getByText("Verversen mislukt.")).toBeVisible();
    expect(staat.n.balance).toBe(2);
    staat.modus.balance = "ok";
    staat.saldo = 1800;
    await stuurVisibilitychange(page);
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("18,00");
    expect(staat.n.balance).toBe(3);
  });

  test("geen dubbele oproepen: knop, visibilitychange en online tijdens één lopende lezing geven één request per bron", async ({ page }) => {
    const staat = await openPortalGeladen(page);
    await page.clock.fastForward(31_000);
    const laatBalance = houdVast(staat, "balance");
    const laatTx = houdVast(staat, "tx");

    await verversKnop(page).click();
    await expect(page.getByText("Bezig met verversen…")).toBeVisible();
    await expect(verversKnop(page)).toHaveAttribute("aria-disabled", "true");
    await expect(verversKnop(page)).toBeFocused();
    await axeSchoon(page);

    await stuurVisibilitychange(page);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await verversKnop(page).click({ force: true });
    await rustig(page);
    expect(staat.n).toEqual({ balance: 2, tx: 2, settings: 2 });

    staat.saldo = 1700;
    laatBalance();
    laatTx();
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("17,00");
    await expect(verversKnop(page)).toHaveAttribute("aria-disabled", "false");
    await expect(verversKnop(page)).toBeFocused();
    expect(staat.n).toEqual({ balance: 2, tx: 2, settings: 2 });
  });

  test("verbindingherstel ververst, ook binnen 30 s", async ({ page, context }) => {
    const staat = await openPortalGeladen(page);
    staat.saldo = 3000;
    await context.setOffline(true);
    await context.setOffline(false);
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("30,00");
    expect(staat.n.balance).toBe(2);
  });

  test("Transacties: het filter blijft na verversen, een tabwissel leest altijd vers, het saldo volgt bij Saldo", async ({ page }) => {
    const staat = await openPortalGeladen(page);
    await page.getByRole("tab", { name: "Transacties" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(2);
    expect(staat.n.tx).toBe(2); // Saldo-mount plus Transacties-mount, binnen 30 s
    await page.getByRole("button", { name: "Uitgaven" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(1);

    staat.rijen = [NIEUW_RIJ, ...OUD];
    staat.saldo = 4000;
    await verversKnop(page).click();
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Uitgaven" })).toHaveAttribute("aria-pressed", "true");
    expect(staat.n.tx).toBe(3);
    expect(staat.n.balance).toBe(1); // het saldo is hier niet zichtbaar, dus niet gelezen
    await axeSchoon(page);

    await page.getByRole("tab", { name: "Saldo" }).click();
    await expect(page.getByRole("group", { name: "Saldo" })).toContainText("40,00");
    expect(staat.n.balance).toBe(2);
  });

  test("zonder sessie blijft het loginscherm: geen leesfout en geen 'niet gekoppeld'", async ({ page }) => {
    await page.route(/\/auth\/v1\//, (route) => json(route, 401, { code: "no_session", msg: "geen sessie" }));
    await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
    await page.goto("/portal");
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
    await expect(meldingen(page)).toHaveCount(0);
    await expect(retryKnop(page)).toHaveCount(0);
    await expect(page.getByText("niet gekoppeld")).toHaveCount(0);
  });
});

// Hulpfuncties voor de portal-tests die zelf het moment van inloggen bepalen.
async function mockPortalZonderLogin(page: Page): Promise<PortalStaat> {
  await page.clock.install();
  return mockPortal(page);
}
async function loginPortal(page: Page) {
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("heading", { name: "Hoi Mock" })).toBeVisible({ timeout: 15_000 });
}
// ── Bar ──────────────────────────────────────────────────────────────────

test.describe("bar: leesfouten en herstel", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("namenlijst 500: foutregel, 'Opnieuw proberen' en de e-mailingang naar /beheer zijn bereikbaar; retry herstelt", async ({ page }) => {
    let modus: Modus = 500;
    let aanvragen = 0;
    await page.route(/\/auth\/v1\//, (route) => json(route, 401, { code: "no_session", msg: "geen sessie" }));
    await page.route(/\/rest\/v1\//, (route) => json(route, 200, { session: null }));
    await page.route(/\/inloggen\/namen(\?|$)/, (route) => {
      aanvragen++;
      if (modus === "ok") {
        return json(route, 200, { ok: true, namen: [{ id: "n1", name: "Joris de Vries" }] });
      }
      return json(route, 500, { ok: false });
    });
    await page.goto("/");
    await expect(alertOf(page)).toContainText("Kan de namenlijst niet laden.", { timeout: 15_000 });
    const mail = page.getByRole("link", { name: "Inloggen met e-mail" });
    await expect(mail).toBeVisible();
    await expect(mail).toHaveAttribute("href", "/beheer");
    await axeSchoon(page);

    // Een mislukte retry houdt de focus op de knop; de e-mailingang blijft.
    await retryKnop(page).click();
    await expect(retryKnop(page)).toBeFocused();
    await expect(mail).toBeVisible();

    modus = "ok";
    await retryKnop(page).click();
    await expect(page.getByRole("button", { name: /^Joris de Vries\b/ })).toBeVisible();
    await expect(mail).toBeVisible();
    await expect(meldingen(page)).toHaveCount(0);
    await focusNietOpBody(page);
    expect(aanvragen).toBe(3);
  });

  test("namenlijst traag: ook tijdens laden is de e-mailingang er", async ({ page }) => {
    let laatDoor!: () => void;
    const vast = new Promise<void>((resolve) => { laatDoor = resolve; });
    await page.route(/\/auth\/v1\//, (route) => json(route, 401, { code: "no_session", msg: "geen sessie" }));
    await page.route(/\/rest\/v1\//, (route) => json(route, 200, { session: null }));
    await page.route(/\/inloggen\/namen(\?|$)/, async (route) => {
      await vast;
      return json(route, 200, { ok: true, namen: [{ id: "n1", name: "Joris de Vries" }] });
    });
    await page.goto("/");
    await expect(page.getByRole("status").filter({ hasText: "Bardienst-lijst laden…" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Inloggen met e-mail" })).toBeVisible();
    laatDoor();
    await expect(page.getByRole("button", { name: /^Joris de Vries\b/ })).toBeVisible();
  });
});

type BarModus = { products: Modus; members: Modus; shift_members: Modus; app_settings: Modus; orders: Modus; activity_types: Modus };

const PRODUCTEN = [
  { id: "pils", name: "Pils", category: "Bier", price_cents: 250 },
  { id: "water", name: "Water", category: "Fris", price_cents: 100 },
];
const LEDEN = [{ id: "payer", name: "Betalend lid", balance_cents: 2500 }];

async function mockBar(
  page: Page,
  opties: { zonderDienst?: boolean; modus?: Partial<BarModus> } = {}
) {
  const modus: BarModus = {
    products: "ok",
    members: "ok",
    shift_members: "ok",
    app_settings: "ok",
    orders: "ok",
    activity_types: "ok",
    ...opties.modus,
  };
  const n = { products: 0, members: 0, shift_members: 0, app_settings: 0, orders: 0, activity_types: 0 };
  const shift = { id: "shift-1", startedAt: new Date().toISOString(), startedByName: "Femke Bos", activityTypeName: "Training" };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
  await mockBarSessie(page, { shift: opties.zonderDienst ? null : shift });
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    if (new URL(route.request().url()).searchParams.has("auth_user_id")) {
      return json(route, 200, { name: "Femke Bos", role: "beheerder" });
    }
    n.members++;
    return antwoord(route, modus.members, LEDEN);
  });
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) => {
    n.products++;
    return antwoord(route, modus.products, PRODUCTEN);
  });
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) => {
    n.shift_members++;
    return antwoord(route, modus.shift_members, [
      { member_id: "m1", added_at: new Date().toISOString(), members: { name: "Femke Bos" } },
    ]);
  });
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) => {
    n.app_settings++;
    return antwoord(route, modus.app_settings, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 });
  });
  await page.route(/\/rest\/v1\/activity_types(\?|$)/, (route) => {
    n.activity_types++;
    return antwoord(route, modus.activity_types, [{ id: "training", name: "Training" }]);
  });
  await page.route(/\/rest\/v1\/orders(\?|$)/, (route) => {
    n.orders++;
    return antwoord(route, modus.orders, []);
  });
  await loginMetWachtwoord(page, USER.email, "password");
  await page.getByRole("button", { name: /^Bar/ }).click();
  return { modus, n };
}

test.describe("bar: Verkoop en andere leesschermen", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("Verkoop: assortiment faalt: foutregel met knop, mandje kan niet; retry herstelt en zet de focus op het assortiment", async ({ page }) => {
    const { modus } = await mockBar(page, { modus: { products: 500 } });
    const assortiment = alertOf(page).filter({ hasText: "Kan het assortiment niet laden." });
    await expect(assortiment).toBeVisible({ timeout: 15_000 });
    await expect(assortiment).toContainText("serverkant");
    await expect(page.getByRole("button", { name: /Tik afrekenen/ })).toBeDisabled();
    await axeSchoon(page);

    await retryKnop(page).click();
    await expect(retryKnop(page)).toBeFocused();
    modus.products = "ok";
    await retryKnop(page).click();
    await expect(page.getByRole("group", { name: "Assortiment" })).toBeFocused();
    await expect(page.getByRole("button", { name: /Pils/ }).first()).toBeVisible();
    await expect(alertOf(page).filter({ hasText: "assortiment" })).toHaveCount(0);
    await focusNietOpBody(page);
  });

  test("Verkoop: ledenlijst faalt: Afrekenen en Opwaarderen blijven geblokkeerd, het mandje blijft na de retry staan", async ({ page }) => {
    const { modus, n } = await mockBar(page, { modus: { members: 500 } });
    await expect(alertOf(page).filter({ hasText: "Kan de ledenlijst niet laden." })).toBeVisible({ timeout: 15_000 });
    // Het mandje vullen tijdens de storing.
    await page.getByRole("button", { name: /Pils/ }).first().click();
    await expect(page.getByText("1 stuks", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Tik afrekenen/ })).toBeDisabled();
    // Zonder ledenlijst is er geen lid te kiezen, dus ook geen opwaardeerknop.
    await expect(page.getByRole("button", { name: "saldo opwaarderen" })).toHaveCount(0);

    modus.members = "ok";
    const voor = n.products;
    await retryKnop(page).click();
    await expect(page.getByLabel("Zoek lid op naam")).toBeVisible();
    await expect(alertOf(page).filter({ hasText: "ledenlijst" })).toHaveCount(0);
    await focusNietOpBody(page);
    // Alleen de ledenlijst is opnieuw gelezen; het mandje is er nog.
    expect(n.products).toBe(voor);
    await expect(page.getByText("1 stuks", { exact: true })).toBeVisible();
    await page.getByLabel("Zoek lid op naam").fill("Betalend");
    await page.getByRole("option", { name: /Betalend lid/ }).click();
    await expect(page.getByRole("button", { name: /Tik afrekenen/ })).toBeEnabled();
  });

  test("Verkoop: bezetting en instellingen falen afzonderlijk, elk met een eigen herstelknop; Afrekenen en Opwaarderen blijven geblokkeerd", async ({ page }) => {
    const { modus } = await mockBar(page, { modus: { shift_members: 500, app_settings: 500 } });
    await expect(alertOf(page).filter({ hasText: "Kan de bezetting niet laden." })).toBeVisible({ timeout: 15_000 });
    await expect(alertOf(page).filter({ hasText: "Kan de instellingen niet laden." })).toBeVisible();
    await expect(retryKnop(page)).toHaveCount(2);
    // Met een gekozen lid en een gevuld mandje blijven Opwaarderen en Afrekenen toch geblokkeerd.
    await page.getByRole("button", { name: /Pils/ }).first().click();
    await page.getByLabel("Zoek lid op naam").fill("Betalend");
    await page.getByRole("option", { name: /Betalend lid/ }).click();
    await expect(page.getByRole("button", { name: "saldo opwaarderen" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Tik afrekenen/ })).toBeDisabled();

    modus.shift_members = "ok";
    await retryKnop(page).first().click();
    await expect(alertOf(page).filter({ hasText: "Kan de bezetting niet laden." })).toHaveCount(0);
    await expect(alertOf(page).filter({ hasText: "Kan de instellingen niet laden." })).toBeVisible();
    modus.app_settings = "ok";
    await retryKnop(page).click();
    await expect(alertOf(page).filter({ hasText: "Kan de instellingen niet laden." })).toHaveCount(0);
    await focusNietOpBody(page);
  });

  test("Dienst: de boekingenlijst heeft een eigen herstelknop; retry herstelt", async ({ page }) => {
    const { modus } = await mockBar(page);
    await page.getByRole("tab", { name: "Dienst", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dienst", exact: true })).toBeVisible();
    modus.orders = 500;
    await page.getByRole("tab", { name: "Verkoop", exact: true }).click();
    await page.getByRole("tab", { name: "Dienst", exact: true }).click();
    const lijst = page.getByRole("group", { name: "Boekingen" });
    await expect(alertIn(lijst).first()).toContainText("Kan de boekingen van deze dienst niet laden.");
    modus.orders = "ok";
    await retryKnop(lijst).click();
    await expect(alertIn(lijst)).toHaveCount(0);
    await expect(lijst).toBeFocused();
  });

  test("ActiviteitKeuze: activiteittypes falen: foutregel met knop in rail-stijl; retry herstelt zonder uitlogknop te vervangen", async ({ page }) => {
    const { modus } = await mockBar(page, { zonderDienst: true, modus: { activity_types: 500 } });
    await expect(alertOf(page).filter({ hasText: "Kan de activiteittypes niet laden." })).toBeVisible({ timeout: 15_000 });
    await axeSchoon(page);
    modus.activity_types = "ok";
    await retryKnop(page).click();
    await expect(page.getByRole("heading", { name: "Voor welke activiteit is deze dienst?" })).toBeFocused();
    await expect(meldingen(page)).toHaveCount(0);
  });
});

test.describe("beheer: leesfouten en herstel", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  async function beheer(page: Page, modus: Partial<Record<"leden" | "products" | "app_settings" | "activity_types" | "orders", Modus>>) {
    const m = { leden: "ok", products: "ok", app_settings: "ok", activity_types: "ok", orders: "ok", ...modus } as Record<string, Modus>;
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
    await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) =>
      antwoord(route, m.leden, [
        { id: "l1", name: "Joris de Vries", role: "lid", balance_cents: 1250, archived: false, auth_user_id: null, has_pin: false, email: null },
      ])
    );
    await page.route(/\/rest\/v1\/products(\?|$)/, (route) =>
      antwoord(route, m.products, [{ id: "p1", name: "Pils", category: "Bier", price_cents: 250, archived: false }])
    );
    await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
      antwoord(route, m.app_settings, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
    );
    await page.route(/\/rest\/v1\/activity_types(\?|$)/, (route) =>
      antwoord(route, m.activity_types, [{ id: "t1", name: "Training", archived: false }])
    );
    await page.route(/\/rest\/v1\/orders(\?|$)/, (route) => antwoord(route, m.orders, []));
    await mockBarSessie(page);
    await loginMetWachtwoord(page, USER.email, "Aurora#2026");
    await page.getByRole("button", { name: "Beheer" }).click();
    return m;
  }

  test("Leden: een leesfout heeft een herstelknop; retry toont de lijst en zet de focus op de kop", async ({ page }) => {
    const m = await beheer(page, { leden: 500 });
    await page.getByRole("tab", { name: "Leden" }).click();
    await expect(alertOf(page).filter({ hasText: "Kan de ledenlijst niet laden." })).toBeVisible();
    await axeSchoon(page);
    m.leden = "ok";
    await retryKnop(page).click();
    await expect(page.getByText("Joris de Vries")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Leden", exact: true })).toBeFocused();
  });

  test("Assortiment: een leesfout heeft een herstelknop; retry herstelt", async ({ page }) => {
    const m = await beheer(page, { products: 500 });
    await page.getByRole("tab", { name: "Assortiment" }).click();
    await expect(alertOf(page)).toContainText("serverkant");
    m.products = "ok";
    await retryKnop(page).click();
    await expect(page.getByText("Pils").first()).toBeVisible();
    await focusNietOpBody(page);
  });

  test("Instellingen: negatieve limiet en activiteitstypes falen afzonderlijk; elk herstelt met zijn eigen knop", async ({ page }) => {
    const m = await beheer(page, { app_settings: 500, activity_types: 500 });
    await page.getByRole("tab", { name: "Instellingen" }).click();
    await expect(retryKnop(page)).toHaveCount(2);
    m.app_settings = "ok";
    await retryKnop(page).first().click();
    await expect(page.getByRole("heading", { name: "Negatief saldo toestaan" })).toBeFocused();
    await expect(retryKnop(page)).toHaveCount(1);
    m.activity_types = "ok";
    await retryKnop(page).click();
    await expect(page.getByText("Training").first()).toBeVisible();
    await expect(meldingen(page)).toHaveCount(0);
  });

  test("Logboek: een leesfout heeft een herstelknop; retry herstelt", async ({ page }) => {
    const m = await beheer(page, { orders: 500 });
    await page.getByRole("tab", { name: "Logboek" }).click();
    await expect(alertOf(page).filter({ hasText: "Kan het logboek niet laden." })).toBeVisible();
    m.orders = "ok";
    await retryKnop(page).click();
    await expect(meldingen(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Logboek" })).toBeFocused();
  });
});
