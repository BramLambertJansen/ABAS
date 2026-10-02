import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  USER,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
  portalLoginMetWachtwoord,
} from "./helpers/supabaseMock";

/**
 * docs/features/dialogen-tabs-landmarks.md (#125) → Teststrategie → E2E:
 * assertions op actieve focus, achtergrond en tabs, niet alleen axe. Zonder
 * live backend (Supabase via `page.route()`), zelfde aanpak als
 * e2e/bestelling-terugdraaien.spec.ts en e2e/dienst-te-lang-open.spec.ts.
 *
 * Wat hier niet staat en bewust handmatig blijft (spec → "Handmatig
 * (Tester)"): Safari/iPadOS, touch en schermlezers. Dit bestand draait alleen
 * in Chromium en claimt dus niets over die omgevingen.
 */

const CLOSE_BLOCKED = "Even wachten, de actie wordt nog verwerkt.";

// ── Hulpfuncties ──────────────────────────────────────────────────────────

/** Ligt de actieve focus binnen de (enige) open dialoog? */
async function focusInDialog(page: Page) {
  return page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
}

async function expectFocusInDialog(page: Page) {
  await expect.poll(() => focusInDialog(page)).toBe(true);
}

/** Alle (zichtbare, bereikbare) focusbare elementen van de dialoog, in DOM-volgorde. */
async function focusTo(page: Page, which: "first" | "last") {
  await page.evaluate((w) => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const list = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])'
      )
    ).filter((el) => el.getAttribute("tabindex") !== "-1" && el.getClientRects().length > 0);
    (w === "first" ? list[0] : list[list.length - 1]).focus();
  }, which);
}

/** Tab en Shift+Tab, vanuit de container, het eerste en het laatste element. */
async function expectTrapHolds(page: Page) {
  // Direct na openen: de focus staat op de container zelf.
  await page.keyboard.press("Shift+Tab");
  await expectFocusInDialog(page);

  await focusTo(page, "last");
  await page.keyboard.press("Tab");
  await expectFocusInDialog(page);

  await focusTo(page, "first");
  await page.keyboard.press("Shift+Tab");
  await expectFocusInDialog(page);
}

async function expectBackgroundInert(page: Page, dialogName: string | RegExp) {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  // Elke sibling van een voorouder van de dialoog (tot body) is inert,
  // behalve scripts en de route-announcer.
  const inertSiblings = await page.evaluate(() => {
    const dialogEl = document.querySelector('[role="dialog"]') as HTMLElement;
    let node: HTMLElement | null = dialogEl;
    const result: { total: number; inert: number } = { total: 0, inert: 0 };
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node) continue;
        if (["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NEXT-ROUTE-ANNOUNCER"].includes(sibling.tagName)) continue;
        result.total += 1;
        if (sibling.hasAttribute("inert")) result.inert += 1;
      }
      node = parent;
    }
    return result;
  });
  expect(inertSiblings.total).toBeGreaterThan(0);
  expect(inertSiblings.inert).toBe(inertSiblings.total);
}

async function expectNoInert(page: Page) {
  await expect(page.locator("[inert]")).toHaveCount(0);
}

async function scrollLock(page: Page) {
  return page.evaluate(() => document.documentElement.style.overflow);
}

/** Open een dialoog-onafhankelijke axe-scan met de tags uit de spec. */
async function axeScan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "best-practice"])
    .disableRules(["color-contrast"]) // gemeten door e2e/a11y.spec.ts
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

/** Tabs: precies één tabstop, aria-controls alleen naar bestaande id's. */
async function expectTabContract(page: Page, tablistName: string, orientation: "horizontal" | "vertical") {
  const tablist = page.getByRole("tablist", { name: tablistName });
  await expect(tablist).toHaveAttribute("aria-orientation", orientation);
  const state = await tablist.evaluate((list) => {
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
    return tabs.map((tab) => {
      const controls = tab.getAttribute("aria-controls");
      return {
        selected: tab.getAttribute("aria-selected") === "true",
        tabindex: tab.getAttribute("tabindex"),
        controls,
        controlsExists: controls ? !!document.getElementById(controls) : null,
      };
    });
  });
  expect(state.filter((t) => t.tabindex === "0")).toHaveLength(1);
  expect(state.filter((t) => t.tabindex === "-1")).toHaveLength(state.length - 1);
  expect(state.filter((t) => t.selected)).toHaveLength(1);
  for (const tab of state) {
    if (tab.selected) {
      expect(tab.controls).toBeTruthy();
      expect(tab.controlsExists).toBe(true);
    } else {
      expect(tab.controls).toBeNull();
    }
  }
}

// ── Portal ────────────────────────────────────────────────────────────────

async function mockPortal(page: Page) {
  const objectOrList = (route: Route, row: unknown) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  };
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => objectOrList(route, null));
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const own = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    return objectOrList(
      route,
      own ? { name: "Mock Lid", role: "lid", archived: false, has_pin: false, balance_cents: 1500 } : null
    );
  });
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, (route) => json(route, 200, []));
}

test.describe("portal", () => {
  test("tabs: handmatige activatie, één tabstop, horizontale pijlen", async ({ page }) => {
    await mockPortal(page);
    await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
    const saldo = page.getByRole("tab", { name: "Saldo" });
    await expect(saldo).toBeVisible({ timeout: 15_000 });
    await expectTabContract(page, "Portaal-navigatie", "horizontal");

    await saldo.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Transacties" })).toBeFocused();
    // Handmatig: de focus verhuist, de selectie niet.
    await expect(saldo).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Account" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(saldo).toBeFocused(); // wrap-around
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Account" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(saldo).toBeFocused();

    // De andere as doet niets.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(saldo).toBeFocused();

    // Enter activeert; daarna is de geselecteerde tab de enige tabstop.
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    const account = page.getByRole("tab", { name: "Account" });
    await expect(account).toHaveAttribute("aria-selected", "true");
    await expectTabContract(page, "Portaal-navigatie", "horizontal");

    // Tab uit de tablist komt in het panel terecht.
    await page.keyboard.press("Tab");
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="tabpanel"]')))
      .toBe(true);
  });

  test("sheet: focusval, inert, scrolllock, sluiten en focus terug", async ({ page }) => {
    await mockPortal(page);
    await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
    await page.getByRole("tab", { name: "Account" }).click({ timeout: 15_000 });
    const trigger = page.getByRole("button", { name: /^Wachtwoord wijzigen/ });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Wachtwoord wijzigen" });
    await expect(dialog).toBeVisible();

    await expectTrapHolds(page);
    await expectBackgroundInert(page, "Wachtwoord wijzigen");
    expect(
      await page.getByRole("button", { name: "Uitloggen" }).evaluate((el) => !!el.closest("[inert]"))
    ).toBe(true);
    expect(await scrollLock(page)).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expectNoInert(page);
    expect(await scrollLock(page)).toBe("");
    await expect(page.getByRole("button", { name: "Uitloggen" })).toBeVisible();
  });

  test("sheet: backdrop sluit; met verdwenen trigger valt de focus op het tabpanel", async ({ page }) => {
    await mockPortal(page);
    await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
    await page.getByRole("tab", { name: "Account" }).click({ timeout: 15_000 });
    const trigger = page.getByRole("button", { name: /^Wachtwoord wijzigen/ });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Wachtwoord wijzigen" });
    await expect(dialog).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(dialog).toBeVisible();
    await trigger.evaluate((el) => el.setAttribute("disabled", ""));
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("role")))
      .toBe("tabpanel");
  });

  test("tabpanel zonder focusbare inhoud is zelf een tabstop", async ({ page }) => {
    await mockPortal(page);
    await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
    const saldo = page.getByRole("tab", { name: "Saldo" });
    await expect(saldo).toBeVisible({ timeout: 15_000 });
    const panel = page.getByRole("tabpanel");
    await expect(panel).toHaveAttribute("tabindex", "0");
    await saldo.focus();
    await page.keyboard.press("Tab");
    await expect(panel).toBeFocused();
    // Met focusbare inhoud (Account) is het panel zelf geen tabstop.
    await page.getByRole("tab", { name: "Account" }).click();
    await expect(page.getByRole("tabpanel")).not.toHaveAttribute("tabindex", /.*/);
  });

  test("sheet: later ingevoegde achtergrondnodes worden ook inert", async ({ page }) => {
    await mockPortal(page);
    await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
    await page.getByRole("tab", { name: "Account" }).click({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();
    const dialog = page.getByRole("dialog", { name: "Wachtwoord wijzigen" });
    await expect(dialog).toBeVisible();

    await page.evaluate(() => {
      const late = document.createElement("div");
      late.id = "laat-ingevoegd";
      late.innerHTML = '<button type="button">Laat</button>';
      document.body.appendChild(late);
      const inMain = document.createElement("button");
      inMain.id = "laat-in-main";
      inMain.textContent = "Laat in main";
      (document.querySelector("main") ?? document.body).appendChild(inMain);
    });
    await expect(page.locator("#laat-ingevoegd")).toHaveAttribute("inert", "");
    expect(await page.locator("#laat-in-main").evaluate((el) => !!el.closest("[inert]"))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expectNoInert(page);
  });
});

// ── Beheer (bar-shell, /beheer) ───────────────────────────────────────────

const LID = {
  id: "00000000-0000-4000-8000-0000000000bb",
  name: "Anna de Vries",
  role: "lid",
  balance_cents: 1240,
  archived: false,
  auth_user_id: null,
  has_pin: false,
  email: null,
  invited_at: null,
};
const ORDER_OPEN = "00000000-0000-4000-8000-0000000000c1";

async function mockBeheerder(page: Page, reverseDelay?: Promise<void>) {
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
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) => json(route, 200, [LID]));
  await mockBarSessie(page);
  await page.route(/\/rest\/v1\/orders(\?|$)/, (route) =>
    json(
      route,
      200,
      route.request().url().includes(`member_id=eq.${LID.id}`)
        ? [
            {
              id: ORDER_OPEN,
              created_at: "2026-09-20T21:42:00Z",
              total_cents: 750,
              order_lines: [{ qty: 3 }],
              order_reversals: null,
            },
          ]
        : []
    )
  );
  await page.route(/\/rest\/v1\/rpc\/reverse_order_as_admin(\?|$)/, async (route) => {
    await reverseDelay;
    return json(route, 200, { order_id: ORDER_OPEN, refunded_cents: 750, reason: "test" });
  });
}

async function openBeheer(page: Page) {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await expect(page.getByRole("tab", { name: "Assortiment" })).toBeVisible({ timeout: 15_000 });
}

test.describe("beheer", () => {
  test("tabs: vijf tabs voor de beheerder, handmatig, wrap-around", async ({ page }) => {
    await mockBeheerder(page);
    await openBeheer(page);
    await expectTabContract(page, "Beheer-navigatie", "horizontal");
    await expect(page.getByRole("tab")).toHaveCount(5);

    await page.getByRole("tab", { name: "Assortiment" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Logboek" })).toBeFocused(); // wrap
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Assortiment" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Instellingen" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "Assortiment" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press(" ");
    await expect(page.getByRole("tab", { name: "Instellingen" })).toHaveAttribute("aria-selected", "true");
    await expectTabContract(page, "Beheer-navigatie", "horizontal");
  });

  test("Lid beheren → Bestellingen: focus blijft in de dialoog, trigger blijft de ledenrij", async ({ page }) => {
    await mockBeheerder(page);
    await openBeheer(page);
    await page.getByRole("tab", { name: "Leden" }).click();
    const rij = page.getByRole("button", { name: LID.name });
    await rij.click();

    const beheren = page.getByRole("dialog", { name: "Lid beheren" });
    await expect(beheren).toBeVisible();
    await expectTrapHolds(page);
    await expectBackgroundInert(page, "Lid beheren");
    expect(await scrollLock(page)).toBe("hidden");
    await axeScan(page);

    await page.getByRole("button", { name: /^Bestelling terugdraaien/ }).click();
    const bestellingen = page.getByRole("dialog", { name: "Bestelling terugdraaien" });
    await expect(bestellingen).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expectFocusInDialog(page);
    await expectTrapHolds(page);
    // De achtergrond is niet heropend tijdens de overgang.
    await expectBackgroundInert(page, "Bestelling terugdraaien");
    expect(await scrollLock(page)).toBe("hidden");

    await bestellingen.getByRole("button", { name: "Sluiten" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoInert(page);
    expect(await scrollLock(page)).toBe("");
    await expect(rij).toBeFocused();
  });

  test("Lid beheren: Escape, backdrop en sluitknop sluiten identiek", async ({ page }) => {
    await mockBeheerder(page);
    await openBeheer(page);
    await page.getByRole("tab", { name: "Leden" }).click();
    const rij = page.getByRole("button", { name: LID.name });
    const dialog = page.getByRole("dialog", { name: "Lid beheren" });

    for (const sluit of [
      () => page.keyboard.press("Escape"),
      () => page.mouse.click(5, 5),
      () => dialog.getByRole("button", { name: /^(Sluiten|Klaar)$/ }).click(),
    ]) {
      await rij.click();
      await expect(dialog).toBeVisible();
      await sluit();
      await expect(dialog).toHaveCount(0);
      await expect(rij).toBeFocused();
    }
  });

  test("geldmutatie: sluiten is geblokkeerd tijdens pending, met statusmelding", async ({ page }) => {
    let vrijgeven!: () => void;
    const vertraging = new Promise<void>((resolve) => {
      vrijgeven = resolve;
    });
    await mockBeheerder(page, vertraging);
    await openBeheer(page);
    await page.getByRole("tab", { name: "Leden" }).click();
    await page.getByRole("button", { name: LID.name }).click();
    await page.getByRole("button", { name: /^Bestelling terugdraaien/ }).click();
    const dialog = page.getByRole("dialog", { name: "Bestelling terugdraaien" });
    await dialog.getByRole("button", { name: /terugdraaien →/ }).click();
    await dialog.getByLabel("Reden").fill("test");
    await dialog.getByRole("button", { name: "terugdraaien", exact: true }).click();

    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('p[role="status"]')).toHaveText(CLOSE_BLOCKED);
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    // De bezig-knop had de focus en is disabled geworden (de browser zet de
    // focus dan stil op body): Tab en Shift+Tab brengen hem terug in de dialoog.
    await page.keyboard.press("Tab");
    await expectFocusInDialog(page);
    await page.keyboard.press("Shift+Tab");
    await expectFocusInDialog(page);

    vrijgeven();
    await expect(dialog.getByText("Bestelling teruggedraaid · € 7,50")).toBeVisible();
    await expect(dialog).not.toHaveAttribute("aria-busy", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});

// ── Bar (DienstTabs) ──────────────────────────────────────────────────────

const SHIFT_ID = "00000000-0000-4000-8000-0000000000d1";
const TOM = { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom Willems" };
const ANNA = { id: "00000000-0000-4000-8000-0000000000d3", name: "Anna de Vries" };

async function openBar(page: Page, placeOrderDelay?: Promise<void>) {
  const startedAt = new Date().toISOString();
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(route, 200, {
      id: SHIFT_ID,
      started_at: startedAt,
      members: { name: TOM.name },
      activity_types: { name: "Training" },
    })
  );
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) =>
    json(route, 200, [{ member_id: TOM.id, added_at: startedAt, members: { name: TOM.name } }])
  );
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) =>
    json(route, 200, [
      { id: "00000000-0000-4000-8000-0000000000e1", name: "Pils", category: "Bier", price_cents: 250 },
    ])
  );
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) =>
    json(route, 200, [{ id: ANNA.id, name: ANNA.name, balance_cents: 1240 }])
  );
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
  await page.route(/\/rest\/v1\/rpc\/place_order(\?|$)/, async (route) => {
    await placeOrderDelay;
    return json(route, 200, { total_cents: 250 });
  });
  await mockBarSessie(page, {
    naam: TOM.name,
    rol: "bardienst",
    voorgeregistreerd: "bar",
    bevestigd: true,
    shift: { id: SHIFT_ID, startedAt, startedByName: TOM.name, activityTypeName: "Training" },
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("tab", { name: "Verkoop" }).waitFor({ state: "visible", timeout: 15_000 });
}

async function openAfrekenen(page: Page) {
  await page.getByRole("button", { name: /^Pils,/ }).click();
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("button", { name: /Anna de Vries/ }).click();
  const trigger = page.getByRole("button", { name: "Tik afrekenen" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /^Afrekenen bij/ });
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

test.describe("bar", () => {
  test("rail: verticale pijlen met automatische activatie, één tabstop", async ({ page }) => {
    await openBar(page);
    await expectTabContract(page, "Dienst-navigatie", "vertical");

    const verkoop = page.getByRole("tab", { name: "Verkoop" });
    const dienst = page.getByRole("tab", { name: "Dienst" });
    await verkoop.focus();
    // De andere as doet niets.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(verkoop).toBeFocused();
    await expect(verkoop).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowDown");
    await expect(dienst).toBeFocused();
    await expect(dienst).toHaveAttribute("aria-selected", "true"); // automatisch
    await expectTabContract(page, "Dienst-navigatie", "vertical");
    await page.keyboard.press("ArrowDown");
    await expect(verkoop).toBeFocused(); // wrap
    await page.keyboard.press("End");
    await expect(dienst).toBeFocused();
    await page.keyboard.press("Home");
    await expect(verkoop).toBeFocused();
    await expect(verkoop).toHaveAttribute("aria-selected", "true");
  });

  test("landmarks: precies één main en nav 'Bar', op Verkoop en Dienst, ook met open dialoog", async ({ page }) => {
    await openBar(page);

    for (const tab of ["Verkoop", "Dienst"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Bar" })).toBeVisible();
      // Het tabpanel zit in main, niet andersom.
      await expect(page.locator('main [role="tabpanel"]')).toHaveCount(1);
      await axeScan(page);
    }

    await page.getByRole("tab", { name: "Verkoop" }).click();
    await openAfrekenen(page);
    await axeScan(page);
  });

  test("Afrekenen: focusval, inert, scrolllock en focus terug op de trigger", async ({ page }) => {
    await openBar(page);
    const { trigger, dialog } = await openAfrekenen(page);

    await expectTrapHolds(page);
    await expectBackgroundInert(page, /^Afrekenen bij/);
    // Achter `inert`: niet bedienbaar en niet in de toegankelijkheidsboom.
    expect(await page.getByRole("tab", { name: "Dienst" }).evaluate((el) => !!el.closest("[inert]"))).toBe(true);
    expect(await scrollLock(page)).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expectNoInert(page);
    expect(await scrollLock(page)).toBe("");
    await expect(page.getByRole("tab", { name: "Dienst" })).toBeVisible();
  });

  test("Afrekenen: met verdwenen trigger valt de focus op het tabpanel", async ({ page }) => {
    await openBar(page);
    const { trigger, dialog } = await openAfrekenen(page);
    await trigger.evaluate((el) => el.setAttribute("disabled", ""));
    await dialog.getByRole("button", { name: "annuleren" }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("role")))
      .toBe("tabpanel");
  });

  test("Afrekenen pending: Escape, backdrop en focus blijven geblokkeerd, met statusmelding", async ({ page }) => {
    let vrijgeven!: () => void;
    const vertraging = new Promise<void>((resolve) => {
      vrijgeven = resolve;
    });
    await openBar(page, vertraging);
    const { dialog } = await openAfrekenen(page);

    await dialog.getByRole("button", { name: "ja, afrekenen" }).click();
    await expect(dialog.getByRole("button", { name: "bezig…" })).toBeDisabled();
    await expect(dialog).toHaveAttribute("aria-busy", "true");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('p[role="status"]')).toHaveText(CLOSE_BLOCKED);
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();

    // De bezig-knop had de focus en is disabled geworden: Tab en Shift+Tab
    // blijven in de dialoog.
    await page.keyboard.press("Tab");
    await expectFocusInDialog(page);
    await page.keyboard.press("Shift+Tab");
    await expectFocusInDialog(page);
    await page.keyboard.press("Shift+Tab");
    await expectFocusInDialog(page);

    vrijgeven();
    await expect(dialog).toHaveCount(0);
    await expectNoInert(page);
    expect(await scrollLock(page)).toBe("");
  });
});
