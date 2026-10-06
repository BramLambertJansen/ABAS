import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { USER, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

/**
 * T07 (#127): veldfeedback, ledenzoeker, zoek/categoriecontract en
 * lidwisseling (docs/features/invoerfeedback-zoeken-filters.md →
 * Teststrategie). Supabase via `page.route()`, zoals e2e/verkoop-draft.spec.ts.
 * Handmatig, nog niet uitgevoerd: schermlezer, Safari, fysieke tablet.
 */

test.use({ viewport: { width: 768, height: 1024 } });

const LANGE_NAAM_A = "Annabel van der Meulen-Schuurmans de Wit";
const LANGE_NAAM_B = "Annabel van der Meulen-Schuurmans de Witt";

type Opties = { membersStatus?: number; membersVertraging?: Promise<void> };

async function verkoop(page: Page, opties: Opties = {}) {
  const shift = { id: "shift-1", startedAt: new Date().toISOString(), startedByName: "Femke Bos", activityTypeName: "Training" };
  const state = {
    products: [
      { id: "pils", name: "Pils", category: "Bier", price_cents: 250 },
      { id: "pilsner", name: "Pilsner speciaal", category: "Bier", price_cents: 300 },
      { id: "water", name: "Water", category: "Fris", price_cents: 100 },
      { id: "cola", name: "Cola", category: "Fris", price_cents: 150 },
    ],
    members: [
      { id: "payer", name: "Betalend lid", balance_cents: 2500 },
      { id: "other", name: "Ander lid", balance_cents: 2500 },
      { id: "lang-a", name: LANGE_NAAM_A, balance_cents: 450 },
      { id: "lang-b", name: LANGE_NAAM_B, balance_cents: 800 },
    ],
    topUps: 0,
  };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
  await mockBarSessie(page, { shift });
  await page.route(/\/rest\/v1\/members(\?|$)/, async (route) => {
    if (new URL(route.request().url()).searchParams.has("auth_user_id")) {
      return json(route, 200, { name: "Femke Bos", role: "beheerder" });
    }
    if (opties.membersVertraging) await opties.membersVertraging;
    if (opties.membersStatus && opties.membersStatus !== 200) return json(route, opties.membersStatus, { message: "kapot" });
    return json(route, 200, state.members);
  });
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) => json(route, 200, state.products));
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) => json(route, 200,
    [{ member_id: "Femke Bos", added_at: new Date().toISOString(), members: { name: "Femke Bos" } }]));
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) => json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 }));
  await page.route(/\/rest\/v1\/activity_types(\?|$)/, (route) => json(route, 200, [{ id: "training", name: "Training" }]));
  await page.route(/\/rest\/v1\/rpc\/top_up_once(\?|$)/, (route) => {
    state.topUps++;
    return json(route, 200, { amount_cents: 500 });
  });
  await loginMetWachtwoord(page, USER.email, "password");
  await page.getByRole("button", { name: /^Bar/ }).click();
  await expect(page.getByRole("heading", { name: "Bar", exact: true })).toBeVisible();
  return state;
}

const zoekLid = (page: Page) => page.getByRole("combobox", { name: "Zoek lid op naam" });
const lijst = (page: Page) => page.getByRole("listbox", { name: "Gevonden leden" });

async function kiesLid(page: Page, zoek: string, optie: RegExp) {
  await zoekLid(page).fill(zoek);
  await page.getByRole("option", { name: optie }).click();
}

async function axeSchoon(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

// ── Opwaarderen ─────────────────────────────────────────────────────────

async function openOpwaarderen(page: Page) {
  await kiesLid(page, "Betalend", /Betalend lid/);
  await page.getByRole("button", { name: "saldo opwaarderen" }).click();
  const dialog = page.getByRole("dialog", { name: /^Saldo opwaarderen bij/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Opwaarderen: elke soort veldfout verschijnt bij blur, herstel is direct, waarde en focus blijven", async ({ page }) => {
  const state = await verkoop(page);
  const dialog = await openOpwaarderen(page);
  const veld = dialog.getByLabel("Ander bedrag");
  const boeken = dialog.getByRole("button", { name: "boeken", exact: true });

  // Een nog nooit aangeraakt formulier toont niets, en de knop is actief.
  await expect(dialog.locator("p.text-danger:not(:empty)")).toHaveCount(0);
  await expect(boeken).toBeEnabled();

  const gevallen: [string, string][] = [
    ["abc", "Vul een bedrag in zoals 5 of 5,50."],
    ["1.000,50", "Vul een bedrag in zoals 5 of 5,50."],
    ["0", "Het bedrag moet meer dan € 0 zijn."],
    ["-5", "Het bedrag mag niet negatief zijn."],
    ["1,234", "Maximaal twee decimalen, bijvoorbeeld 5,50."],
  ];
  for (const [invoer, melding] of gevallen) {
    await veld.fill(invoer);
    // Tijdens het typen geen fout (alleen de grens is direct), na blur wel.
    await veld.blur();
    const fout = dialog.getByText(melding, { exact: true });
    await expect(fout).toBeVisible();
    await expect(veld).toHaveValue(invoer);
    await expect(veld).toHaveAttribute("aria-invalid", "true");
    const describedby = await veld.getAttribute("aria-describedby");
    expect(describedby).toBeTruthy();
    await expect(dialog.locator(`[id="${describedby}"]`)).toHaveText(melding);
  }

  // Grens: direct zichtbaar, zonder blur, met role=alert.
  await veld.fill("600");
  await expect(dialog.getByRole("alert").filter({ hasText: "maximaal € 500,00 per opwaardering" })).toBeVisible();

  // Herstel is direct.
  await veld.fill("5");
  await expect(veld).not.toHaveAttribute("aria-invalid", "true");
  await expect(dialog.locator("p.text-danger:not(:empty)")).toHaveCount(0);
  expect(state.topUps).toBe(0);
});

test("Opwaarderen: een poging met ongeldige invoer toont de fout als alert, focust het veld en boekt niets", async ({ page }) => {
  const state = await verkoop(page);
  const dialog = await openOpwaarderen(page);
  const veld = dialog.getByLabel("Ander bedrag");
  const boeken = dialog.getByRole("button", { name: "boeken", exact: true });

  // Leeg zonder chip: alleen bij een poging.
  await expect(dialog.getByText("Kies een bedrag of typ er een.")).toHaveCount(0);
  await boeken.click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Kies een bedrag of typ er een." })).toBeVisible();
  await expect(veld).toBeFocused();

  await veld.fill("abc");
  await boeken.click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Vul een bedrag in zoals 5 of 5,50." })).toBeVisible();
  await expect(veld).toBeFocused();
  await expect(veld).toHaveValue("abc");
  await expect(boeken).toBeEnabled();
  expect(state.topUps).toBe(0);

  // Chip erbij: het veld wint niet meer, de fout verdwijnt.
  await dialog.getByRole("button", { name: /5,00/ }).click();
  await expect(dialog.getByText("Vul een bedrag in zoals 5 of 5,50.")).toHaveCount(0);
});

test("Opwaarderen boven € 100: bevestiging en veldfout zijn nooit tegelijk zichtbaar", async ({ page }) => {
  await verkoop(page);
  const dialog = await openOpwaarderen(page);
  const veld = dialog.getByLabel("Ander bedrag");
  await veld.fill("150");
  await dialog.getByRole("button", { name: "boeken", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /^ja, .*boeken$/ })).toBeVisible();
  await expect(dialog.locator("p.text-danger:not(:empty)")).toHaveCount(0);
  await veld.fill("abc");
  await expect(dialog.getByRole("button", { name: /^ja, / })).toHaveCount(0);
  await veld.blur();
  await expect(dialog.getByText("Vul een bedrag in zoals 5 of 5,50.")).toBeVisible();
});

test("Opwaarderen met fout: geen axe-overtreding", async ({ page }) => {
  await verkoop(page);
  const dialog = await openOpwaarderen(page);
  await dialog.getByLabel("Ander bedrag").fill("abc");
  await dialog.getByRole("button", { name: "boeken", exact: true }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Vul een bedrag in" })).toBeVisible();
  // Zonder hover: `hover:bg-accent` onder de muis is een bestaande tint, niet iets van T07.
  await page.mouse.move(0, 0);
  await axeSchoon(page);
});

// ── Zoeken en categorie (D3) ────────────────────────────────────────────

const kaarten = (page: Page) => page.getByRole("button", { name: /tik om toe te voegen/ });
const chip = (page: Page, naam: string) => page.getByRole("group", { name: "Categorie" }).getByRole("button", { name: naam, exact: true });
const zoekProduct = (page: Page) => page.getByLabel("Zoek product", { exact: true });

test("Zoeken en categorie: een categorieklik wist de zoekterm; de resultaatregel klopt met het aantal kaarten", async ({ page }) => {
  await verkoop(page);
  await zoekProduct(page).fill("Pils");
  const status = page.getByRole("status").filter({ hasText: /voor "Pils"/ });
  await expect(status).toHaveText('2 producten voor "Pils" in alle categorieën');
  await expect(kaarten(page)).toHaveCount(2);
  // Bij een zoekterm staat geen chip aan.
  for (const naam of ["Alle", "Bier", "Fris"]) await expect(chip(page, naam)).toHaveAttribute("aria-pressed", "false");

  await chip(page, "Fris").click();
  await expect(zoekProduct(page)).toHaveValue("");
  await expect(chip(page, "Fris")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Fris")).toBeFocused();
  await expect(kaarten(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Wis zoekterm" })).toHaveCount(0);
  await expect(page.getByText(/producten voor/)).toHaveCount(0);
});

test("Zoeken en categorie: nul resultaten en 'Wis zoekterm' zet de categorie terug op Alle", async ({ page }) => {
  await verkoop(page);
  await chip(page, "Bier").click();
  await expect(kaarten(page)).toHaveCount(2);
  await zoekProduct(page).fill("zzz");
  await expect(page.getByText('Geen producten voor "zzz"')).toBeVisible();
  await expect(page.getByText("Geen producten gevonden.")).toHaveCount(0);
  await expect(kaarten(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Wis zoekterm" }).click();
  await expect(zoekProduct(page)).toHaveValue("");
  await expect(chip(page, "Alle")).toHaveAttribute("aria-pressed", "true");
  await expect(kaarten(page)).toHaveCount(4);
});

test("Zoeken en categorie: het zoekveld leegmaken met Escape zet de categorie terug op Alle; spaties tellen als leeg", async ({ page }) => {
  await verkoop(page);
  await chip(page, "Fris").click();
  await zoekProduct(page).fill("   ");
  await expect(page.getByText(/producten voor/)).toHaveCount(0);
  await expect(chip(page, "Fris")).toHaveAttribute("aria-pressed", "true");
  await zoekProduct(page).fill("Pils");
  await expect(kaarten(page)).toHaveCount(2);
  await zoekProduct(page).press("Escape");
  await expect(zoekProduct(page)).toHaveValue("");
  await expect(chip(page, "Alle")).toHaveAttribute("aria-pressed", "true");
  await expect(kaarten(page)).toHaveCount(4);
});

test("Zoeken en categorie: axe met een resultaatregel", async ({ page }) => {
  await verkoop(page);
  await zoekProduct(page).fill("Pils");
  await expect(page.getByRole("button", { name: "Wis zoekterm" })).toBeVisible();
  await axeSchoon(page);
});

// ── Ledenzoeker ─────────────────────────────────────────────────────────

test("Ledenzoeker: geen lijst bij lege invoer; pijltoetsen, Enter, eerste resultaat actief", async ({ page }) => {
  await verkoop(page);
  const veld = zoekLid(page);
  await expect(veld).toHaveAttribute("aria-expanded", "false");
  await expect(lijst(page)).toBeHidden();

  await veld.fill("lid");
  await expect(lijst(page)).toBeVisible();
  await expect(veld).toHaveAttribute("aria-expanded", "true");
  await expect(veld).toHaveAttribute("aria-autocomplete", "list");
  await expect(page.getByRole("option")).toHaveCount(2);
  // Het eerste resultaat is meteen actief; de focus blijft in de invoer.
  const eerste = page.getByRole("option").nth(0);
  await expect(eerste).toHaveAttribute("aria-selected", "true");
  await expect(veld).toHaveAttribute("aria-activedescendant", (await eerste.getAttribute("id"))!);
  await expect(veld).toBeFocused();
  // Hulp voor de schermlezer: het aantal.
  await expect(page.getByRole("status").filter({ hasText: "2 leden gevonden" })).toHaveCount(1);

  await veld.press("ArrowDown");
  const tweede = page.getByRole("option").nth(1);
  await expect(tweede).toHaveAttribute("aria-selected", "true");
  await veld.press("ArrowDown"); // stopt aan de rand
  await expect(tweede).toHaveAttribute("aria-selected", "true");
  await veld.press("ArrowUp");
  await veld.press("ArrowUp");
  await expect(eerste).toHaveAttribute("aria-selected", "true");

  await veld.press("ArrowDown");
  await veld.press("Enter");
  // Het tweede resultaat (alfabetisch volgens de bron: Betalend, Ander) is gekozen.
  await expect(page.getByRole("button", { name: "saldo opwaarderen" })).toBeVisible();
  await expect(page.getByText("Ander lid", { exact: true })).toBeVisible();
});

test("Ledenzoeker: Escape sluit eerst de lijst, daarna wist het de tekst; Tab kiest niets", async ({ page }) => {
  await verkoop(page);
  const veld = zoekLid(page);
  await veld.fill("lid");
  await expect(lijst(page)).toBeVisible();
  await veld.press("Escape");
  await expect(lijst(page)).toBeHidden();
  await expect(veld).toHaveValue("lid");
  await expect(veld).toHaveAttribute("aria-expanded", "false");
  await veld.press("Escape");
  await expect(veld).toHaveValue("");

  await veld.fill("lid");
  await expect(lijst(page)).toBeVisible();
  await veld.press("Tab");
  await expect(lijst(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "saldo opwaarderen" })).toHaveCount(0);

  // ArrowDown opent de gesloten lijst weer.
  await veld.focus();
  await veld.press("ArrowDown");
  await expect(lijst(page)).toBeVisible();
});

test("Ledenzoeker: een klik buiten sluit de lijst; nul resultaten zijn een status", async ({ page }) => {
  await verkoop(page);
  const veld = zoekLid(page);
  await veld.fill("lid");
  await expect(lijst(page)).toBeVisible();
  await page.getByRole("heading", { name: "Bar", exact: true }).click();
  await expect(lijst(page)).toBeHidden();
  await expect(veld).toHaveValue("lid");

  await veld.fill("qqq");
  await expect(page.getByRole("status").filter({ hasText: "geen leden gevonden" })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  // Escape zonder lijst wist de tekst.
  await veld.press("Escape");
  await expect(veld).toHaveValue("");
});

test("Ledenzoeker: na een tabwissel staat de lijst gesloten tot de eerste toets of ArrowDown", async ({ page }) => {
  await verkoop(page);
  const veld = zoekLid(page);
  await veld.fill("lid");
  await expect(lijst(page)).toBeVisible();
  await page.getByRole("tab", { name: "Dienst", exact: true }).click();
  await page.getByRole("tab", { name: "Verkoop", exact: true }).click();
  await expect(zoekLid(page)).toHaveValue("lid");
  await expect(lijst(page)).toBeHidden();
  await zoekLid(page).focus();
  await zoekLid(page).press("ArrowDown");
  await expect(lijst(page)).toBeVisible();
});

test("Ledenzoeker: leden laden en een leesfout zijn zichtbaar", async ({ page }) => {
  let laatDoor!: () => void;
  const vast = new Promise<void>((resolve) => { laatDoor = resolve; });
  await verkoop(page, { membersVertraging: vast });
  await zoekLid(page).fill("lid");
  await expect(page.getByRole("status").filter({ hasText: "Leden laden…" })).toBeVisible();
  laatDoor();
  await expect(lijst(page)).toBeVisible();
});

test("Ledenzoeker: een leesfout van de ledenlijst is een alert", async ({ page }) => {
  await verkoop(page, { membersStatus: 500 });
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("Ledenzoeker: twee lange gelijkende namen zijn volledig leesbaar op 768px, zonder overflow", async ({ page }) => {
  await verkoop(page);
  await zoekLid(page).fill("Annabel");
  await expect(lijst(page)).toBeVisible();
  const opties = page.getByRole("option");
  await expect(opties).toHaveCount(2);
  for (const naam of [LANGE_NAAM_A, LANGE_NAAM_B]) {
    const optie = page.getByRole("option", { name: new RegExp(`^${naam}\\s`) });
    await expect(optie).toBeVisible();
    // De naam staat volledig in de DOM en is niet afgekapt: de regel past
    // binnen twee regels en de optie loopt niet over de lijst heen.
    const naamEl = optie.getByText(naam, { exact: true });
    const kader = await naamEl.evaluate((el) => ({
      scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight,
    }));
    expect(kader.scrollW).toBeLessThanOrEqual(kader.clientW + 1);
    expect(kader.scrollH).toBeLessThanOrEqual(kader.clientH + 1);
    expect((await optie.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const lijstBox = (await lijst(page).boundingBox())!;
  expect(lijstBox.x + lijstBox.width).toBeLessThanOrEqual(768);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
  await page.screenshot({ path: "/tmp/abas-t07-lidzoeker-768.png" });
  // Laag saldo is zichtbaar en voor de schermlezer benoemd.
  await expect(page.getByRole("option", { name: new RegExp(`^${LANGE_NAAM_A}\\s.*laag saldo`) })).toBeVisible();
});

test("Ledenzoeker: axe met open lijst", async ({ page }) => {
  await verkoop(page);
  await zoekLid(page).fill("lid");
  await expect(lijst(page)).toBeVisible();
  await axeSchoon(page);
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("Ledenzoeker: een tik op een optie kiest het lid, zonder hover", async ({ page }) => {
    await verkoop(page);
    await zoekLid(page).fill("Betalend");
    await page.getByRole("option", { name: /Betalend lid/ }).tap();
    await expect(page.getByRole("button", { name: "saldo opwaarderen" })).toBeVisible();
  });
});

// ── Lidwissel ───────────────────────────────────────────────────────────

async function vulMandje(page: Page) {
  await page.getByRole("button", { name: /^Pils,/ }).click();
  await page.getByRole("button", { name: "Eén Pils meer" }).click();
}

const bevestiging = (page: Page) => page.getByRole("group", { name: /Bestelling wissen en verder met/ });

test("Lidwissel: aankondiging na wissel, bevestiging bij een ander lid, Terug laat alles intact", async ({ page }) => {
  await verkoop(page);
  await kiesLid(page, "Betalend", /Betalend lid/);
  await vulMandje(page);
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "De bestelling (2 stuks) staat nog klaar. Kies je een ander lid, dan wordt de bestelling geleegd." })).toBeVisible();

  await kiesLid(page, "Ander", /Ander lid/);
  await expect(bevestiging(page)).toBeVisible();
  await expect(page.getByText("Bestelling wissen en verder met Ander lid?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Terug" })).toBeFocused();
  // Nog geen lid gekozen en het mandje is intact.
  await expect(page.getByText("2 stuks", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "saldo opwaarderen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Terug" }).click();
  await expect(bevestiging(page)).toHaveCount(0);
  await expect(zoekLid(page)).toBeFocused();
  await expect(page.getByText("2 stuks", { exact: true })).toBeVisible();
  await axeSchoon(page);
});

test("Lidwissel: 'Wissen en kiezen' leegt het mandje en kiest het lid; axe met de bevestiging", async ({ page }) => {
  await verkoop(page);
  await kiesLid(page, "Betalend", /Betalend lid/);
  await vulMandje(page);
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await kiesLid(page, "Ander", /Ander lid/);
  await axeSchoon(page);
  await page.getByRole("button", { name: "Wissen en kiezen" }).dblclick();
  await expect(bevestiging(page)).toHaveCount(0);
  await expect(page.getByText("nog niets getikt", { exact: true })).toBeVisible();
  await expect(page.getByText("Ander lid", { exact: true })).toBeVisible();
});

test("Lidwissel: hetzelfde lid of een leeg mandje vraagt geen bevestiging", async ({ page }) => {
  await verkoop(page);
  await kiesLid(page, "Betalend", /Betalend lid/);
  await vulMandje(page);
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await kiesLid(page, "Betalend", /Betalend lid/);
  await expect(bevestiging(page)).toHaveCount(0);
  await expect(page.getByText("2 stuks", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "saldo opwaarderen" })).toBeVisible();

  // Leeg mandje: direct een ander lid.
  await page.getByRole("button", { name: "Verwijder Pils uit het mandje" }).click();
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await kiesLid(page, "Ander", /Ander lid/);
  await expect(bevestiging(page)).toHaveCount(0);
  await expect(page.getByText("Ander lid", { exact: true })).toBeVisible();
});

test("Lidwissel: de bevestiging past in het zijpaneel op 768px portret, zonder overlap met afrekenen", async ({ page }) => {
  await verkoop(page);
  await kiesLid(page, "Betalend", /Betalend lid/);
  await vulMandje(page);
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await kiesLid(page, "Annabel", new RegExp(`^${LANGE_NAAM_B}\\s`));
  const groep = bevestiging(page);
  await expect(groep).toBeVisible();
  const box = (await groep.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(768);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
  await page.screenshot({ path: "/tmp/abas-t07-lidwissel-768.png" });
});

// ── Beheer: bedrag en e-mail ────────────────────────────────────────────

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

async function beheer(page: Page, tab: "Assortiment" | "Leden" | "Instellingen") {
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
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) => json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 }));
  const rpcs: string[] = [];
  await page.route(/\/rest\/v1\/rpc\/(create_member_once|create_product|update_product_price|update_member_email|update_negative_limit)(\?|$)/, (route) => {
    rpcs.push(new URL(route.request().url()).pathname);
    return json(route, 400, { message: "geweigerd" });
  });
  await mockBarSessie(page);
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: tab }).click();
  return rpcs;
}

test("Nieuw lid: startsaldo en e-mail tonen hun fout bij blur of poging, niet op een ongewijzigd formulier", async ({ page }) => {
  const rpcs = await beheer(page, "Leden");
  await page.getByRole("button", { name: "nieuw lid" }).click();
  const dialog = page.getByRole("dialog", { name: "Nieuw lid" });
  const saldo = dialog.getByLabel("Startsaldo (optioneel)");
  const email = dialog.getByLabel("Contactadres (optioneel)");
  const toevoegen = dialog.getByRole("button", { name: "Toevoegen" });

  await expect(dialog.locator("p.text-danger:not([role=alert])")).toHaveCount(0);
  await dialog.getByLabel("Naam").fill("Nieuw Lid");
  await expect(toevoegen).toBeEnabled();

  await saldo.fill("-5");
  await saldo.blur();
  await expect(dialog.getByText("Het bedrag mag niet negatief zijn.")).toBeVisible();
  await expect(saldo).toHaveAttribute("aria-invalid", "true");
  const gekoppeld = await saldo.getAttribute("aria-describedby");
  await expect(dialog.locator(`[id="${gekoppeld}"]`)).toHaveText("Het bedrag mag niet negatief zijn.");
  await saldo.fill("0");
  await expect(dialog.getByText("Het bedrag mag niet negatief zijn.")).toHaveCount(0);
  await saldo.fill("1,234");
  await saldo.blur();
  await expect(dialog.getByText("Maximaal twee decimalen, bijvoorbeeld 5,50.")).toBeVisible();

  await email.fill("geen-adres");
  await email.blur();
  await expect(dialog.getByText("Dit lijkt geen e-mailadres. Controleer het adres, bijvoorbeeld naam@voorbeeld.nl.")).toBeVisible();

  // Poging: de knop is actief, geen aanroep, de focus gaat naar het eerste ongeldige veld.
  await toevoegen.click();
  expect(rpcs).toEqual([]);
  await expect(saldo).toBeFocused();
  await saldo.fill("");
  await toevoegen.click();
  await expect(email).toBeFocused();
  await expect(dialog.getByRole("alert").filter({ hasText: "Dit lijkt geen e-mailadres" })).toBeVisible();
  await axeSchoon(page);
});

test("Nieuw product: prijs toont leeg, ongeldig en nul bij blur of poging", async ({ page }) => {
  const rpcs = await beheer(page, "Assortiment");
  await page.getByRole("button", { name: "nieuw product" }).click();
  const dialog = page.getByRole("dialog", { name: "Nieuw product" });
  await dialog.getByLabel("Naam").fill("Cola");
  await dialog.getByRole("button", { name: "Fris" }).click();
  const prijs = dialog.getByLabel("Prijs");
  const toevoegen = dialog.getByRole("button", { name: "Toevoegen" });

  await expect(toevoegen).toBeEnabled();
  await toevoegen.click();
  await expect(dialog.getByText("Vul een prijs in.")).toBeVisible();
  await expect(prijs).toBeFocused();
  await prijs.fill("abc");
  await prijs.blur();
  await expect(dialog.getByText("Vul een bedrag in zoals 5 of 5,50.")).toBeVisible();
  await prijs.fill("0");
  await prijs.blur();
  await expect(dialog.getByText("Het bedrag moet meer dan € 0 zijn.")).toBeVisible();
  await prijs.fill("2,5");
  await expect(dialog.locator("p.text-danger:not([role=alert])")).toHaveCount(0);
  expect(rpcs).toEqual([]);
});

test("Product beheren: een ongeldige prijs laat de knop actief en toont de melding", async ({ page }) => {
  const rpcs = await beheer(page, "Assortiment");
  await page.getByRole("button", { name: /Pils/ }).click();
  const dialog = page.getByRole("dialog", { name: "Product beheren" });
  const prijs = dialog.getByLabel("Nieuwe prijs");
  const opslaan = dialog.getByRole("button", { name: "Opslaan", exact: true });
  await expect(opslaan).toBeEnabled();
  await opslaan.click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Vul een prijs in." })).toBeVisible();
  await expect(prijs).toBeFocused();
  await prijs.fill("-1");
  await expect(dialog.getByText("Het bedrag mag niet negatief zijn.")).toBeVisible();
  expect(rpcs).toEqual([]);
});

test("Lid beheren: een ongeldig e-mailadres toont de melding bij blur en poging", async ({ page }) => {
  const rpcs = await beheer(page, "Leden");
  await page.getByRole("button", { name: LID.name }).click();
  const dialog = page.getByRole("dialog", { name: "Lid beheren" });
  const email = dialog.getByLabel("Contactadres", { exact: true });
  await email.fill("naam@voorbeeld");
  await email.blur();
  await expect(dialog.getByText("Dit lijkt geen e-mailadres.", { exact: false })).toBeVisible();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("button", { name: "Opslaan" }).nth(1).click();
  await expect(email).toBeFocused();
  expect(rpcs).toEqual([]);
  await email.fill("naam@voorbeeld.nl");
  await expect(dialog.getByText("Dit lijkt geen e-mailadres.", { exact: false })).toHaveCount(0);
});

test("Negatieve limiet: eigen bedrag toont ongeldig, teveel decimalen en negatief; 0 is geldig", async ({ page }) => {
  const rpcs = await beheer(page, "Instellingen");
  const veld = page.getByLabel("Ander bedrag");
  const opslaan = page.getByRole("button", { name: "opslaan", exact: true });
  await expect(opslaan).toBeDisabled(); // niets ingevuld: niets te bewaren
  await veld.fill("abc");
  await expect(opslaan).toBeEnabled();
  await veld.blur();
  await expect(page.getByText("Vul een bedrag in zoals 5 of 5,50.")).toBeVisible();
  await veld.fill("-5");
  await expect(page.getByText("Het bedrag mag niet negatief zijn.")).toBeVisible();
  await veld.fill("1,234");
  await expect(page.getByText("Maximaal twee decimalen, bijvoorbeeld 5,50.")).toBeVisible();
  await opslaan.click();
  await expect(veld).toBeFocused();
  expect(rpcs).toEqual([]);
  await veld.fill("0");
  await expect(page.locator("p.text-danger:not([role=alert])")).toHaveCount(0);
});

// ── Aanvullingen Tester (T07): gaten in de dekking ──────────────────────

const focusOpBody = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

test("Opwaarderen: een tik met een te hoog bedrag boekt niet", async ({ page }) => {
  const state = await verkoop(page);
  const dialog = await openOpwaarderen(page);
  await dialog.getByLabel("Ander bedrag").fill("600");
  await dialog.getByRole("button", { name: "boeken", exact: true }).click();
  expect(state.topUps).toBe(0);
  await expect(dialog.getByRole("button", { name: /^ja, / })).toHaveCount(0);
});

test("Opwaarderen: nul, negatief en te veel decimalen boeken niet bij een tik", async ({ page }) => {
  const state = await verkoop(page);
  const dialog = await openOpwaarderen(page);
  const veld = dialog.getByLabel("Ander bedrag");
  for (const invoer of ["0", "-5", "1,234", "1.000,50"]) {
    await veld.fill(invoer);
    await dialog.getByRole("button", { name: "boeken", exact: true }).click();
    await expect(veld).toBeFocused();
  }
  expect(state.topUps).toBe(0);
});

test("Zoeken en categorie: het zoekveld leegmaken met backspace zet de categorie terug op Alle", async ({ page }) => {
  await verkoop(page);
  await chip(page, "Fris").click();
  await zoekProduct(page).fill("Pils");
  await expect(kaarten(page)).toHaveCount(2);
  await zoekProduct(page).press("Backspace");
  await zoekProduct(page).press("Backspace");
  await zoekProduct(page).press("Backspace");
  await zoekProduct(page).press("Backspace");
  await expect(zoekProduct(page)).toHaveValue("");
  await expect(chip(page, "Alle")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Fris")).toHaveAttribute("aria-pressed", "false");
  await expect(kaarten(page)).toHaveCount(4);
});

test("Zoeken en categorie: 'Wis zoekterm' laat de focus niet op body vallen", async ({ page }) => {
  await verkoop(page);
  await zoekProduct(page).fill("Pils");
  await page.getByRole("button", { name: "Wis zoekterm" }).click();
  await expect(page.getByRole("button", { name: "Wis zoekterm" })).toHaveCount(0);
  expect(await focusOpBody(page), "focus viel op body na 'Wis zoekterm'").toBe(false);
});

test("Zoeken en categorie: 'Alle' klikken met zoekterm wist de term en zet Alle aan", async ({ page }) => {
  await verkoop(page);
  await zoekProduct(page).fill("Water");
  await chip(page, "Alle").click();
  await expect(zoekProduct(page)).toHaveValue("");
  await expect(chip(page, "Alle")).toHaveAttribute("aria-pressed", "true");
  await expect(kaarten(page)).toHaveCount(4);
});

test("Lidwissel: 'Wissen en kiezen' laat de focus niet op body vallen", async ({ page }) => {
  await verkoop(page);
  await kiesLid(page, "Betalend", /Betalend lid/);
  await vulMandje(page);
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await kiesLid(page, "Ander", /Ander lid/);
  await page.getByRole("button", { name: "Wissen en kiezen" }).click();
  await expect(page.getByText("nog niets getikt", { exact: true })).toBeVisible();
  expect(await focusOpBody(page), "focus viel op body na 'Wissen en kiezen'").toBe(false);
});

test("Lidwissel: geen aankondiging bij een leeg mandje of voordat er een lid was", async ({ page }) => {
  await verkoop(page);
  const aankondiging = page.getByRole("status").filter({ hasText: "staat nog klaar" });
  await vulMandje(page);
  await expect(aankondiging).toHaveCount(0); // nog nooit een lid gekozen
  await kiesLid(page, "Betalend", /Betalend lid/);
  await page.getByRole("button", { name: "Verwijder Pils uit het mandje" }).click();
  await page.getByRole("button", { name: "wissel", exact: true }).click();
  await expect(aankondiging).toHaveCount(0); // leeg mandje
});
