// kit: generiek
import { readFileSync } from "node:fs";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { scanAxe } from "./helpers/scanAxe";

/**
 * Het ontwerpsysteem als pagina (docs/features/ontwerpsysteem.md → Playwright):
 * een screenshot per `[data-systeem]`-sectie, een gegenereerde hover- en
 * focusstaat per sectie, en een axe-scan van de hele pagina. Generiek: geen
 * component- of tokennamen; route, viewport, wachtwoord en drempel staan in
 * scripts/kit/systeem.lokaal.json. De drempel zelf staat in playwright.config.ts.
 *
 * Baselines komen uit de workflow `screenshots-bijwerken`, niet van een
 * lokale machine.
 */
const cfg = JSON.parse(readFileSync("scripts/kit/systeem.lokaal.json", "utf8")) as {
  route: string;
  viewport: { width: number; height: number };
  testWachtwoord: string;
  vensterRoute?: string;
  vensters?: Record<string, { componenten: string[]; breedte: number; hoogte: number; eigenLandmark?: boolean }>;
  interactiesPad?: string;
};

test.use({
  viewport: cfg.viewport,
  httpCredentials: { username: "systeem", password: cfg.testWachtwoord },
});

const SECTIE = "[data-systeem]";
const BRUIKBARE_KNOP = 'button:not([disabled]):not([aria-disabled="true"])';
const FOCUSBAAR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

async function openPagina(page: Page) {
  await page.goto(cfg.route);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(SECTIE).first()).toBeVisible();
}

async function sectieIds(page: Page): Promise<string[]> {
  return page.locator(SECTIE).evaluateAll((els) => els.map((el) => el.getAttribute("data-systeem") ?? ""));
}

function sectie(page: Page, id: string): Locator {
  return page.locator(`[data-systeem="${id}"]`);
}

/** Wacht op fonts, dan de screenshot; soft, zodat één afwijkende sectie de rest niet verbergt. */
async function schermafdruk(page: Page, el: Locator, naam: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect.soft(el, naam).toHaveScreenshot(naam);
}

test("de pagina heeft secties met unieke id's en elk een h2", async ({ page }) => {
  await openPagina(page);
  const ids = await sectieIds(page);
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.every((id) => id !== "")).toBe(true);
  expect(new Set(ids).size, `dubbele data-systeem-id's: ${ids.join(", ")}`).toBe(ids.length);
  for (const id of ids) {
    await expect(sectie(page, id).locator("h2").first(), `sectie ${id} mist een h2`).toBeVisible();
  }
});

test("één main en één h1", async ({ page }) => {
  await openPagina(page);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("screenshot per sectie", async ({ page }) => {
  test.setTimeout(180_000);
  await openPagina(page);
  const ids = await sectieIds(page);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    await schermafdruk(page, sectie(page, id), `${id}.png`);
  }
});

test("hover: per sectie met een bruikbare knop een screenshot na hover op de eerste", async ({ page }) => {
  test.setTimeout(180_000);
  await openPagina(page);
  for (const id of await sectieIds(page)) {
    const knop = sectie(page, id).locator(BRUIKBARE_KNOP).first();
    if ((await knop.count()) === 0) continue;
    await knop.scrollIntoViewIfNeeded();
    await knop.hover();
    await schermafdruk(page, sectie(page, id), `${id}-hover.png`);
    await page.mouse.move(0, 0);
  }
});

test("focus: per sectie met een focusbaar element een screenshot na Tab (focus-visible)", async ({ page }) => {
  test.setTimeout(180_000);
  await openPagina(page);
  for (const id of await sectieIds(page)) {
    const eerste = sectie(page, id).locator(FOCUSBAAR).first();
    if ((await eerste.count()) === 0) continue;
    // Echt toetsenbord: terug naar het vorige focusbare element en dan Tab,
    // zodat de focusring via :focus-visible verschijnt.
    await eerste.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(eerste, `sectie ${id}: eerste focusbare element kreeg geen focus-visible`).toBeFocused();
    expect(await eerste.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    await schermafdruk(page, sectie(page, id), `${id}-focus.png`);
    await eerste.blur();
  }
});

test("axe: de hele pagina heeft 0 violations (WCAG 2.2 AA)", async ({ page }) => {
  await openPagina(page);
  await scanAxe(page);
});

test("zonder inloggegevens geeft de pagina 401", async ({ playwright, baseURL }) => {
  // Expliciet undefined: de test-runner geeft anders de httpCredentials van test.use door.
  const zonder = await playwright.request.newContext({ baseURL, httpCredentials: undefined });
  try {
    const antwoord = await zonder.get(cfg.route);
    expect(antwoord.status()).toBe(401);
  } finally {
    await zonder.dispose();
  }
});

test("met een fout wachtwoord geeft de pagina 401", async ({ playwright, baseURL }) => {
  const fout = await playwright.request.newContext({
    baseURL,
    httpCredentials: { username: "systeem", password: `${cfg.testWachtwoord}-fout` },
  });
  try {
    expect((await fout.get(cfg.route)).status()).toBe(401);
  } finally {
    await fout.dispose();
  }
});

// --- Losse vensters (docs/features/ontwerpsysteem-uitzonderingen.md → Vensters) ---
// Eén test per venster uit de config: viewport, één main en één h1, axe en een
// screenshot van de viewport. Geen hover- of focus-screenshots per venster.

const VENSTERS = Object.entries(cfg.vensters ?? {});
const vensterUrl = (id: string) => `${cfg.vensterRoute}/${id}`;

async function openVenster(page: Page, id: string) {
  const v = cfg.vensters?.[id];
  if (!v) throw new Error(`venster "${id}" staat niet in systeem.lokaal.json → vensters`);
  await page.setViewportSize({ width: v.breedte, height: v.hoogte });
  const antwoord = await page.goto(vensterUrl(id));
  expect(antwoord?.status(), `venster ${id}: ${vensterUrl(id)} gaf geen 200`).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

for (const [id] of VENSTERS) {
  test(`venster ${id}: één main en één h1, axe en screenshot`, async ({ page }) => {
    await openVenster(page, id);
    await expect(page.locator("main"), `venster ${id}: niet precies één main`).toHaveCount(1);
    await expect(page.locator("h1"), `venster ${id}: niet precies één h1`).toHaveCount(1);
    await scanAxe(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`venster-${id}.png`);
  });
}

if (VENSTERS.length > 0) {
  test("zonder inloggegevens geeft de vensterroute 401", async ({ playwright, baseURL }) => {
    const zonder = await playwright.request.newContext({ baseURL, httpCredentials: undefined });
    try {
      expect((await zonder.get(vensterUrl(VENSTERS[0]![0]))).status()).toBe(401);
    } finally {
      await zonder.dispose();
    }
  });

  test("een onbekend venster-id geeft 404", async ({ playwright, baseURL }) => {
    let onbekend = "onbekend-venster";
    while (cfg.vensters && Object.hasOwn(cfg.vensters, onbekend)) onbekend += "-x";
    const met = await playwright.request.newContext({
      baseURL,
      httpCredentials: { username: "systeem", password: cfg.testWachtwoord },
    });
    try {
      expect((await met.get(vensterUrl(onbekend))).status()).toBe(404);
    } finally {
      await met.dispose();
    }
  });
}

// --- Interacties (docs/features/ontwerpsysteem-uitzonderingen.md → Interacties) ---
// Generieke runner: de stappen staan in het bestand op `interactiesPad`; de
// vorm controleert check:catalogus (I1–I7). Eén test per interactie, elke
// stap 5 s, geen soft-asserts en geen retries in de runner.

type Doelwit = { rol?: string; naam?: string; label?: string; tekst?: string };
type Stap = {
  klik?: Doelwit;
  keer?: number;
  typ?: string;
  in?: Doelwit;
  toets?: string;
  verwacht?: Doelwit;
  staat?: "zichtbaar" | "uitgeschakeld";
};
type Interactie = { naam: string; sectie?: string; venster?: string; stappen: Stap[] };

const STAP_TIMEOUT = 5_000;
const INTERACTIES: Interactie[] = cfg.interactiesPad
  ? (JSON.parse(readFileSync(cfg.interactiesPad, "utf8")) as { interacties: Interactie[] }).interacties
  : [];

function zoek(bereik: Locator, d: Doelwit): Locator {
  if (d.rol !== undefined) {
    const rol = d.rol as Parameters<Locator["getByRole"]>[0];
    return d.naam !== undefined ? bereik.getByRole(rol, { name: d.naam, exact: true }) : bereik.getByRole(rol);
  }
  if (d.label !== undefined) return bereik.getByLabel(d.label, { exact: true });
  return bereik.getByText(d.tekst ?? "", { exact: true });
}

function actieVan(stap: Stap): string {
  return (["klik", "typ", "toets", "verwacht"] as const).find((a) => Object.hasOwn(stap, a)) ?? "?";
}

async function voerUit(page: Page, bereik: Locator, stap: Stap) {
  if (stap.klik) {
    const doel = zoek(bereik, stap.klik);
    for (let i = 0; i < (stap.keer ?? 1); i++) await doel.click({ timeout: STAP_TIMEOUT });
  } else if (stap.typ !== undefined) {
    await zoek(bereik, stap.in ?? {}).fill(stap.typ, { timeout: STAP_TIMEOUT });
  } else if (stap.toets !== undefined) {
    for (let i = 0; i < (stap.keer ?? 1); i++) await page.keyboard.press(stap.toets);
  } else if (stap.verwacht) {
    const doel = zoek(bereik, stap.verwacht);
    if (stap.staat === "uitgeschakeld") await expect(doel).toBeDisabled({ timeout: STAP_TIMEOUT });
    else await expect(doel).toBeVisible({ timeout: STAP_TIMEOUT });
  }
}

for (const interactie of INTERACTIES) {
  const doel = interactie.sectie !== undefined ? `sectie ${interactie.sectie}` : `venster ${interactie.venster}`;
  test(`interactie ${doel}/${interactie.naam}`, async ({ page }) => {
    let bereik: Locator;
    if (interactie.sectie !== undefined) {
      await openPagina(page);
      bereik = sectie(page, interactie.sectie);
      if ((await bereik.count()) === 0) {
        throw new Error(`interactie ${interactie.naam}: sectie "${interactie.sectie}" staat niet op ${cfg.route}`);
      }
    } else {
      await openVenster(page, interactie.venster ?? "");
      bereik = page.locator(":root");
    }

    for (const [index, stap] of interactie.stappen.entries()) {
      try {
        await voerUit(page, bereik, stap);
      } catch (fout) {
        const melding = fout instanceof Error ? fout.message : String(fout);
        throw new Error(`interactie ${interactie.naam}, stap ${index + 1} (${actieVan(stap)}): ${melding}`, { cause: fout });
      }
    }

    await page.evaluate(() => document.fonts.ready);
    if (interactie.sectie !== undefined) {
      await expect(bereik).toHaveScreenshot(`${interactie.sectie}-${interactie.naam}.png`);
    } else {
      await expect(page).toHaveScreenshot(`venster-${interactie.venster}-${interactie.naam}.png`);
    }
  });
}
