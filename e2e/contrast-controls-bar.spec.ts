import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { USER, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

/**
 * T12 (#132), deel A: witte tekst op een accentknop haalt 4,5:1 ook onder de
 * muis en ingedrukt. Supabase via `page.route()`. Anders dan e2e/a11y.spec.ts
 * (dat de muis bewust weg zet) staat de muis hier echt op de knop;
 * reducedMotion staat aan (playwright.config.ts), dus axe meet de eindkleur.
 */

test.use({ viewport: { width: 1024, height: 768 } });

const HOUR_MS = 60 * 60 * 1000;

async function openBar(page: Page, openForMs = 20 * 60 * 1000) {
  const startedAt = new Date(Date.now() - openForMs).toISOString();
  const shift = { id: "shift-1", startedAt, startedByName: "Femke Bos", activityTypeName: "Training" };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await mockBarSessie(page, { shift });
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(route, 200, { id: shift.id, started_at: startedAt, members: { name: "Femke Bos" }, activity_types: { name: "Training" } })
  );
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    if (new URL(route.request().url()).searchParams.has("auth_user_id")) {
      return json(route, 200, { name: "Femke Bos", role: "beheerder" });
    }
    return json(route, 200, [{ id: "payer", name: "Betalend lid", balance_cents: 2500 }]);
  });
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) =>
    json(route, 200, [{ id: "pils", name: "Pils", category: "Bier", price_cents: 250 }])
  );
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) =>
    json(route, 200, [{ member_id: "femke", added_at: startedAt, members: { name: "Femke Bos" } }])
  );
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
  await page.route(/\/rest\/v1\/activity_types(\?|$)/, (route) => json(route, 200, [{ id: "training", name: "Training" }]));
  await loginMetWachtwoord(page, USER.email, "password");
  await page.getByRole("button", { name: /^Bar/ }).click();
  await expect(page.getByRole("heading", { name: "Bar", exact: true })).toBeVisible();
}

async function axeSchoon(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

/** Echte hover, dan ingedrukt, beide gescand; de muisknop gaat weer los
 *  buiten de knop, zodat er geen klik volgt. */
async function scanHoverEnIngedrukt(page: Page, knop: Locator) {
  await expect(knop).toBeEnabled();
  await knop.hover();
  expect(await knop.evaluate((el) => el.matches(":hover"))).toBe(true);
  await axeSchoon(page);
  await page.mouse.down();
  await axeSchoon(page);
  await page.mouse.move(0, 0);
  await page.mouse.up();
}

async function kiesLid(page: Page) {
  await page.getByRole("combobox", { name: "Zoek lid op naam" }).fill("Betalend");
  await page.getByRole("option", { name: /Betalend lid/ }).click();
}

test("hover en ingedrukt: Afrekenen in het mandje en in de afrekenoverlay", async ({ page }) => {
  await openBar(page);
  await page.getByRole("button", { name: /^Pils,/ }).click();
  await kiesLid(page);
  const tik = page.getByRole("button", { name: "Tik afrekenen" });
  await scanHoverEnIngedrukt(page, tik);

  await tik.click();
  const dialog = page.getByRole("dialog", { name: /^Afrekenen bij/ });
  await expect(dialog).toBeVisible();
  await scanHoverEnIngedrukt(page, dialog.getByRole("button", { name: "ja, afrekenen" }));
});

test("hover en ingedrukt: Opwaarderen", async ({ page }) => {
  await openBar(page);
  await kiesLid(page);
  await page.getByRole("button", { name: "saldo opwaarderen" }).click();
  const dialog = page.getByRole("dialog", { name: /^Saldo opwaarderen bij/ });
  await expect(dialog).toBeVisible();
  await scanHoverEnIngedrukt(page, dialog.getByRole("button", { name: "boeken", exact: true }));
});

test("hover en ingedrukt: Bezetting (Klaar) en Dienst afsluiten", async ({ page }) => {
  await openBar(page);
  await page.getByRole("tab", { name: "Dienst" }).click();
  await page.getByRole("button", { name: "Bezetting wijzigen", exact: true }).click();
  const bezetting = page.getByRole("dialog", { name: "Bezetting van deze dienst" });
  await expect(bezetting).toBeVisible();
  await scanHoverEnIngedrukt(page, bezetting.getByRole("button", { name: "Klaar", exact: true }));
  await bezetting.getByRole("button", { name: "Klaar", exact: true }).click();

  await page.getByRole("button", { name: "Dienst afsluiten", exact: true }).click();
  const afsluiten = page.getByRole("dialog", { name: "Dienst afsluiten" });
  await expect(afsluiten).toBeVisible();
  await scanHoverEnIngedrukt(page, afsluiten.getByRole("button", { name: "dienst afsluiten" }));
});

test("hover en ingedrukt: DienstTeLangOpenMelding", async ({ page }) => {
  await openBar(page, 6 * HOUR_MS + 5 * 60 * 1000);
  const melding = page.getByRole("dialog", { name: "Dienst staat nog open" });
  await expect(melding).toBeVisible({ timeout: 15_000 });
  await scanHoverEnIngedrukt(page, melding.getByRole("button", { name: "Dienst afsluiten" }));
});

/** De outline van een element, zoals de browser hem rekent (niet de schaduw). */
const outline = (el: Element) => {
  const s = getComputedStyle(el);
  return { stijl: s.outlineStyle, breedte: s.outlineWidth, kleur: s.outlineColor };
};

const zichtbaar = (o: { stijl: string; breedte: string; kleur: string }) =>
  o.stijl !== "none" && o.breedte !== "0px" && o.kleur !== "rgba(0, 0, 0, 0)";

/** De globale :focus-visible-regel: 2px solid in een zichtbare (niet-transparante) kleur. */
async function verwachtGlobaleRing(el: Locator) {
  const o = await el.evaluate(outline);
  expect(zichtbaar(o)).toBe(true);
  expect(o.stijl).toBe("solid");
  expect(o.breedte).toBe("2px");
}

/** Tab tot het doel focus heeft (echte toetsenbordfocus, dus :focus-visible). */
async function tabNaar(page: Page, doel: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await doel.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("doel niet bereikt met Tab");
}

test("focus: invoerveld en knop tonen een focusring bij Tab", async ({ page }) => {
  await openBar(page);
  const zoek = page.getByRole("combobox", { name: "Zoek lid op naam" });
  expect(zichtbaar(await zoek.evaluate(outline))).toBe(false);
  await tabNaar(page, zoek);
  // LidZoeker heeft `focus-visible:outline-hidden` en een eigen ring (box-shadow): de globale
  // outline blijft bewust uit, anders staan er twee ringen.
  await expect(zoek).toBeFocused();
  expect(await zoek.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");

  await page.getByRole("button", { name: /^Pils,/ }).click();
  await kiesLid(page);
  const tik = page.getByRole("button", { name: "Tik afrekenen" });
  expect(zichtbaar(await tik.evaluate(outline))).toBe(false);
  await tabNaar(page, tik);
  await verwachtGlobaleRing(tik);
  await axeSchoon(page);
});

test("focus: een knop op het beheer-inlogscherm toont een focusring bij Tab", async ({ page }) => {
  await page.goto("/beheer");
  const knop = page.getByRole("button", { name: /^(Inloggen|Stuur inloglink)$/ });
  await knop.waitFor({ state: "visible", timeout: 15_000 });
  expect(zichtbaar(await knop.evaluate(outline))).toBe(false);
  await tabNaar(page, knop);
  await verwachtGlobaleRing(knop);
});

test("focus: een control met kale `outline-hidden` krijgt toch de globale ring; een eigen vervanging wint", async ({ page }) => {
  await page.goto("/beheer");
  await page.getByRole("button", { name: /^(Inloggen|Stuur inloglink)$/ }).waitFor({ state: "visible", timeout: 15_000 });
  // Klassen die in src voorkomen (dus door Tailwind gegenereerd): kaal
  // `outline-hidden` (TekstVeld) en `focus-visible:outline-hidden` (ZoekVeld met eigen ring).
  await page.evaluate(() => {
    const maak = (id: string, klassen: string) => {
      const i = document.createElement("input");
      i.id = id;
      i.setAttribute("aria-label", id);
      i.className = klassen;
      document.body.prepend(i);
    };
    maak("eigen-vervanging", "focus-visible:outline-hidden");
    maak("kaal-outline-none", "outline-hidden");
  });
  const kaal = page.locator("#kaal-outline-none");
  const eigen = page.locator("#eigen-vervanging");
  // `kaal` is het eerste element in de DOM (prepend), `eigen` het tweede.
  await page.keyboard.press("Tab");
  await expect(kaal).toBeFocused();
  await verwachtGlobaleRing(kaal);
  await page.keyboard.press("Tab");
  await expect(eigen).toBeFocused();
  expect(zichtbaar(await eigen.evaluate(outline))).toBe(false);
});
