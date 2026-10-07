import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { USER, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

/**
 * Productafbeeldingen in Product beheren (docs/features/productafbeeldingen.md
 * → Schermflow en Tests). Zonder echte database, zelfde aanpak als
 * e2e/opslaan-sluiten-pending.spec.ts: Supabase en de server-actie
 * (`/beheer/productafbeelding`) via `page.route()`, een verzoek met opzet
 * vastgehouden (`houdVast`) zodat "pending" deterministisch is.
 *
 * Wat dit níét toetst: de echte route met multipart en Storage-API (spec →
 * Tests, "Handmatig of e2e"); de volgorde in de server-actie staat in
 * test/productImage.test.ts, de database in supabase/tests/.
 */

const PRODUCT_ID = "00000000-0000-4000-8000-0000000000b1";
const PAD = `products/${PRODUCT_ID}/11111111-1111-4111-8111-111111111111.webp`;
const NIEUW_PAD = `products/${PRODUCT_ID}/22222222-2222-4222-8222-222222222222.webp`;
const PRODUCT = { id: PRODUCT_ID, name: "Pils", category: "Bier", price_cents: 250, archived: false };
const ROUTE = /\/beheer\/productafbeelding(\?|$)/;

// 1 × 1 PNG: genoeg voor de bestandskiezer en voor een `<img>` die laadt.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
const BESTAND = { name: "pils.png", mimeType: "image/png", buffer: PNG };
const WACHT = "wacht tot de lopende wijziging klaar is";
const MELDING = "Even wachten, de actie wordt nog verwerkt.";

function houdVast() {
  let release!: () => void;
  const poort = new Promise<void>((resolve) => (release = resolve));
  return { poort, laatDoor: release, aanroepen: 0 };
}

async function mockBeheerder(page: Page, product: Record<string, unknown> = PRODUCT) {
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
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) => json(route, 200, [product]));
  // De publieke URL van de bucket: een echt plaatje, zodat `<img>` laadt.
  await page.route(/\/storage\/v1\/object\/public\/product-images\//, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG })
  );
  await mockBarSessie(page);
}

async function openProduct(page: Page) {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: "Assortiment" }).click();
  await page.getByRole("button", { name: /Pils/ }).click();
  const dialog = page.getByRole("dialog", { name: "Product beheren" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function kiesBestand(dialog: ReturnType<Page["getByRole"]>, bestand = BESTAND) {
  return dialog.locator('input[type="file"]').setInputFiles(bestand);
}

async function focusNietOpBody(page: Page) {
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
}

function antwoord(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("zonder afbeelding: kop met lege staat, het blok staat boven de prijs, a11y-scan", async ({ page }) => {
  await mockBeheerder(page);
  const dialog = await openProduct(page);

  await expect(dialog.getByRole("button", { name: "Afbeelding kiezen" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Verwijderen" })).toHaveCount(0);
  // De knop staat in de groep "Afbeelding", met de toegestane types als beschrijving.
  // exact: sinds #183 omsluit de OpslaanSectie "Productafbeelding" deze groep.
  const groep = dialog.getByRole("group", { name: "Afbeelding", exact: true });
  await expect(groep).toHaveAccessibleDescription("JPG, PNG of WebP, maximaal 4 MB");
  await expect(groep.getByRole("button", { name: "Afbeelding kiezen" })).toBeVisible();
  await expect(dialog.getByRole("img")).toHaveCount(0);
  await expect(dialog.getByText("JPG, PNG of WebP, maximaal 4 MB")).toBeVisible();

  // Besluit 14: het afbeeldingsblok komt vóór de prijs en het archiefblok.
  const kiezen = await dialog.getByRole("button", { name: "Afbeelding kiezen" }).boundingBox();
  const prijs = await dialog.getByLabel("Nieuwe prijs").boundingBox();
  const archief = await dialog.getByRole("button", { name: /Uit assortiment halen/ }).boundingBox();
  expect(kiezen!.y).toBeLessThan(prijs!.y);
  expect(prijs!.y).toBeLessThan(archief!.y);

  const resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(resultaat.violations).toEqual([]);
});

test("met afbeelding: kop toont de afbeelding met alt, Vervangen en Verwijderen, a11y-scan", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  const dialog = await openProduct(page);

  await expect(dialog.getByRole("img", { name: "Afbeelding van Pils" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Vervangen" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Verwijderen" })).toBeVisible();
  // Een schermlezer hoort "Verwijderen" binnen de groep "Afbeelding", niet als
  // "product verwijderen".
  const groep = dialog.getByRole("group", { name: "Afbeelding" });
  await expect(groep.getByRole("button", { name: "Vervangen" })).toBeVisible();
  await expect(groep.getByRole("button", { name: "Verwijderen" })).toBeVisible();

  const resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(resultaat.violations).toEqual([]);
});

test("een vertraagde upload blokkeert sluiten en zet prijs en archief op disabled met uitleg", async ({ page }) => {
  await mockBeheerder(page);
  const vast = houdVast();
  await page.route(ROUTE, async (route) => {
    vast.aanroepen++;
    await vast.poort;
    return antwoord(route, { ok: true, imagePath: NIEUW_PAD });
  });
  const dialog = await openProduct(page);

  await kiesBestand(dialog);

  const bezig = dialog.getByRole("button", { name: "Bezig met uploaden…" });
  await expect(bezig).toBeDisabled();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await page.mouse.click(3, 3);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: MELDING })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sluiten" })).toBeDisabled();
  await expect(dialog.getByLabel("Nieuwe prijs")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Opslaan", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /Uit assortiment halen/ })).toBeDisabled();
  await expect(dialog.getByText(WACHT)).toHaveCount(2);
  await focusNietOpBody(page);

  const resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(resultaat.violations).toEqual([]);

  vast.laatDoor();
  await expect(dialog.getByRole("button", { name: "Vervangen" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Verwijderen" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Afbeelding van Pils" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sluiten" })).toBeEnabled();
  expect(vast.aanroepen).toBe(1);
  await expect(dialog.getByRole("button", { name: "Vervangen" })).toBeFocused();
});

test("een vertraagde prijswijziging zet de afbeeldingsknoppen op disabled", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  const vast = houdVast();
  await page.route(/\/rest\/v1\/rpc\/update_product_price(\?|$)/, async (route) => {
    await vast.poort;
    return json(route, 200, { ...PRODUCT, image_path: PAD, price_cents: 275 });
  });
  let uploads = 0;
  await page.route(ROUTE, (route) => {
    uploads++;
    return antwoord(route, { ok: true, imagePath: NIEUW_PAD });
  });
  const dialog = await openProduct(page);

  await dialog.getByLabel("Nieuwe prijs").fill("2,75");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();

  await expect(dialog.getByRole("button", { name: "Vervangen" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Verwijderen" })).toBeDisabled();
  await expect(dialog.getByText(WACHT)).toHaveCount(2);
  await focusNietOpBody(page);

  vast.laatDoor();
  await expect(dialog.getByRole("button", { name: "Vervangen" })).toBeEnabled();
  // De afbeelding is na de prijswijziging niet kwijt.
  await expect(dialog.getByRole("img", { name: "Afbeelding van Pils" })).toBeVisible();
  expect(uploads).toBe(0);
});

test("een fout van de upload blijft staan naast een fout van de prijs", async ({ page }) => {
  await mockBeheerder(page);
  await page.route(ROUTE, (route) => antwoord(route, { ok: false, errorCode: "unsupported_type" }));
  await page.route(/\/rest\/v1\/rpc\/update_product_price(\?|$)/, (route) =>
    json(route, 400, { message: "invalid_price" })
  );
  const dialog = await openProduct(page);

  await kiesBestand(dialog);
  const typeFout = dialog.getByRole("alert").filter({ hasText: "kies een JPG, PNG of WebP" });
  await expect(typeFout).toBeVisible();
  await focusNietOpBody(page);

  await dialog.getByLabel("Nieuwe prijs").fill("2,75");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "vul een geldige prijs in" })).toBeVisible();
  await expect(typeFout).toBeVisible();
  await focusNietOpBody(page);
});

test("verwijderen zonder bevestiging; de focus gaat naar Afbeelding kiezen", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  const vast = houdVast();
  await page.route(ROUTE, async (route) => {
    expect(route.request().method()).toBe("DELETE");
    await vast.poort;
    return antwoord(route, { ok: true, imagePath: null });
  });
  const dialog = await openProduct(page);

  await dialog.getByRole("button", { name: "Verwijderen" }).click();
  await expect(dialog.getByRole("button", { name: "Opslaan…" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Vervangen" })).toBeDisabled();

  vast.laatDoor();
  await expect(dialog.getByRole("button", { name: "Afbeelding kiezen" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Verwijderen" })).toHaveCount(0);
  await expect(dialog.getByRole("img")).toHaveCount(0);
});

test("voorcontrole: een GIF geeft een melding zonder upload; een nieuwe keuze wist die", async ({ page }) => {
  await mockBeheerder(page);
  let uploads = 0;
  await page.route(ROUTE, (route) => {
    uploads++;
    return antwoord(route, { ok: true, imagePath: NIEUW_PAD });
  });
  const dialog = await openProduct(page);

  await kiesBestand(dialog, { name: "pils.gif", mimeType: "image/gif", buffer: PNG });
  const fout = dialog.getByRole("alert").filter({ hasText: "kies een JPG, PNG of WebP" });
  await expect(fout).toBeVisible();
  expect(uploads).toBe(0);

  await kiesBestand(dialog);
  await expect(dialog.getByRole("button", { name: "Vervangen" })).toBeVisible();
  await expect(fout).toHaveCount(0);
  expect(uploads).toBe(1);
});

test("een 413 van het platform (geen JSON) wordt de melding met de grens", async ({ page }) => {
  await mockBeheerder(page);
  await page.route(ROUTE, (route) =>
    route.fulfill({ status: 413, contentType: "text/plain", body: "Request Entity Too Large" })
  );
  const dialog = await openProduct(page);

  await kiesBestand(dialog);
  await expect(dialog.getByRole("alert").filter({ hasText: "maximaal 4 MB" })).toBeVisible();
});

test("verkoop: galerij en lijst met en zonder afbeelding, decoratief, a11y-scan", async ({ page }) => {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) =>
    json(route, 200, [
      { id: PRODUCT_ID, name: "Pils", category: "Bier", price_cents: 250, image_path: PAD },
      { id: "00000000-0000-4000-8000-0000000000b2", name: "Spa rood", category: "Fris", price_cents: 150 },
    ])
  );
  await page.route(/\/storage\/v1\/object\/public\/product-images\//, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG })
  );
  await mockBarSessie(page, {
    naam: "Tom Willems",
    rol: "bardienst",
    voorgeregistreerd: "bar",
    bevestigd: true,
    shift: {
      id: "00000000-0000-4000-8000-0000000000c1",
      startedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      startedByName: "Femke Bos",
      activityTypeName: "Training",
    },
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("tab", { name: "Verkoop" })).toBeVisible({ timeout: 15_000 });

  const pils = page.getByRole("button", { name: /^Pils, / });
  // Decoratief: alt="", dus geen img in de toegankelijke boom en geen dubbele naam.
  await expect(pils.locator("img")).toHaveAttribute("alt", "");
  await expect(pils).toHaveAccessibleName(/^Pils, €\s2,50 — tik om toe te voegen$/);
  await expect(page.getByRole("button", { name: /^Spa rood, / }).locator("img")).toHaveCount(0);
  let resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(resultaat.violations).toEqual([]);

  await page.getByRole("button", { name: "lijst" }).click();
  await expect(page.getByRole("button", { name: /^Pils, / }).locator("img")).toHaveAttribute("alt", "");
  resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(resultaat.violations).toEqual([]);
});

// ── Negatieve aanvulling (Tester, PR #146) ───────────────────────────────
// Een mislukte actie in Product beheren mag de afbeelding niet laten
// verdwijnen: de overlay neemt na een fout niets over, en na succes alleen
// wat die actie wijzigde.

const OUD_SRC = /11111111-1111-4111-8111-111111111111\.webp$/;
const NIEUW_SRC = /22222222-2222-4222-8222-222222222222\.webp$/;

async function verwachtAfbeelding(dialog: ReturnType<Page["getByRole"]>, src: RegExp) {
  const img = dialog.getByRole("img", { name: "Afbeelding van Pils" });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", src);
  await expect(dialog.getByRole("button", { name: "Vervangen" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Verwijderen" })).toBeEnabled();
}

test("een mislukte prijswijziging (fout van de RPC) laat de afbeelding staan", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  await page.route(/\/rest\/v1\/rpc\/update_product_price(\?|$)/, (route) =>
    json(route, 400, { message: "invalid_price" })
  );
  const dialog = await openProduct(page);
  await verwachtAfbeelding(dialog, OUD_SRC);

  await dialog.getByLabel("Nieuwe prijs").fill("2,75");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "vul een geldige prijs in" })).toBeVisible();

  await verwachtAfbeelding(dialog, OUD_SRC);
  // De huidige prijs is ook niet veranderd.
  await expect(dialog.getByText(/^€\s2,50$/)).toBeVisible();
});

test("een mislukte prijswijziging (netwerkfout) laat de afbeelding staan", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  await page.route(/\/rest\/v1\/rpc\/update_product_price(\?|$)/, (route) => route.abort("failed"));
  const dialog = await openProduct(page);

  await dialog.getByLabel("Nieuwe prijs").fill("2,75");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "er ging iets mis" })).toBeVisible();

  await verwachtAfbeelding(dialog, OUD_SRC);
});

test("een mislukt archiveren laat de afbeelding staan", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  await page.route(/\/rest\/v1\/rpc\/set_product_archived(\?|$)/, (route) =>
    json(route, 400, { message: "product_not_found" })
  );
  const dialog = await openProduct(page);

  await dialog.getByRole("button", { name: /Uit assortiment halen/ }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "dit product bestaat niet meer" })).toBeVisible();

  await verwachtAfbeelding(dialog, OUD_SRC);
});

test("een mislukte vervanging laat de oude afbeelding staan", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  await page.route(ROUTE, (route) => antwoord(route, { ok: false, errorCode: "upload_failed" }));
  const dialog = await openProduct(page);

  await kiesBestand(dialog);
  await expect(dialog.getByRole("alert").filter({ hasText: "kon niet worden opgeslagen" })).toBeVisible();

  await verwachtAfbeelding(dialog, OUD_SRC);
  await focusNietOpBody(page);
});

test("een mislukte vervanging zonder JSON (500 van het platform) laat de oude afbeelding staan", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  await page.route(ROUTE, (route) =>
    route.fulfill({ status: 500, contentType: "text/html", body: "<h1>Internal Server Error</h1>" })
  );
  const dialog = await openProduct(page);

  await kiesBestand(dialog);
  await expect(dialog.getByRole("alert").filter({ hasText: "er ging iets mis" })).toBeVisible();

  await verwachtAfbeelding(dialog, OUD_SRC);
});

test("een mislukt weghalen laat de afbeelding staan", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  await page.route(ROUTE, (route) => {
    expect(route.request().method()).toBe("DELETE");
    return antwoord(route, { ok: false, errorCode: "product_not_found" });
  });
  const dialog = await openProduct(page);

  await dialog.getByRole("button", { name: "Verwijderen" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "dit product bestaat niet meer" })).toBeVisible();

  await verwachtAfbeelding(dialog, OUD_SRC);
  await focusNietOpBody(page);
});

test("een geslaagde prijswijziging na een upload houdt de nieuwe afbeelding", async ({ page }) => {
  await mockBeheerder(page, { ...PRODUCT, image_path: PAD });
  await page.route(ROUTE, (route) => antwoord(route, { ok: true, imagePath: NIEUW_PAD }));
  // De RPC geeft (hier bewust) nog het oude pad terug: de overlay neemt van
  // een prijswijziging alleen de prijs over.
  await page.route(/\/rest\/v1\/rpc\/update_product_price(\?|$)/, (route) =>
    json(route, 200, { ...PRODUCT, image_path: PAD, price_cents: 275 })
  );
  const dialog = await openProduct(page);

  await kiesBestand(dialog);
  await verwachtAfbeelding(dialog, NIEUW_SRC);

  await dialog.getByLabel("Nieuwe prijs").fill("2,75");
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(dialog.getByLabel("Nieuwe prijs")).toHaveValue("");

  await verwachtAfbeelding(dialog, NIEUW_SRC);
});
