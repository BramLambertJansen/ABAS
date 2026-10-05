import { test, expect, type Page, type Route } from "@playwright/test";
import {
  USER,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
  portalLoginMetWachtwoord,
} from "./helpers/supabaseMock";

/**
 * Aanvulling op e2e/dialogen-tabs-landmarks.spec.ts (#125) met de negatieve
 * gevallen uit docs/features/dialogen-tabs-landmarks.md → Teststrategie die
 * daar alleen indirect gedekt waren: exact welk element de focus krijgt bij
 * Tab/Shift+Tab vanaf de container, het eerste en het laatste element; het
 * focusin-vangnet; een geblokkeerde sluitpoging tijdens een geldmutatie
 * (geen tweede request, geen focusverlies, geen melding zonder poging);
 * tabs met één tabstop bij manuele activatie; toetsen die een tablist niet
 * mag afhandelen (modifiers, pijlen in het panel, andere as); en de
 * bardienst-variant van de beheertabs. Zonder live backend (Supabase via
 * `page.route()`).
 */

// ── Hulpfuncties ──────────────────────────────────────────────────────────

/** Indexen binnen de lijst met bereikbare elementen van de dialoog. */
async function dialogFocusState(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const list = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])'
      )
    ).filter((el) => el.getAttribute("tabindex") !== "-1" && el.getClientRects().length > 0);
    const active = document.activeElement as HTMLElement | null;
    return {
      count: list.length,
      index: active ? list.indexOf(active) : -1,
      onContainer: active === dialog,
      inDialog: !!active && dialog.contains(active),
    };
  });
}

/** Dialoog net open: de focus staat op de container. Tab en Shift+Tab moeten
 *  dan exact op het eerste respectievelijk laatste element landen, en de
 *  randen moeten wrappen (niet de dialoog uit). */
async function expectExacteFocusvolgorde(page: Page) {
  const start = await dialogFocusState(page);
  expect(start.onContainer).toBe(true);
  expect(start.count).toBeGreaterThan(1);

  await page.keyboard.press("Shift+Tab");
  expect((await dialogFocusState(page)).index).toBe(start.count - 1);

  await page.keyboard.press("Tab"); // laatste → eerste (wrap)
  expect((await dialogFocusState(page)).index).toBe(0);

  await page.keyboard.press("Shift+Tab"); // eerste → laatste (wrap)
  expect((await dialogFocusState(page)).index).toBe(start.count - 1);

  // Terug op de container: Tab gaat naar het eerste element.
  await page.evaluate(() => (document.querySelector('[role="dialog"]') as HTMLElement).focus());
  await page.keyboard.press("Tab");
  expect((await dialogFocusState(page)).index).toBe(0);
}

async function tabstops(page: Page, tablistName: string) {
  return page.getByRole("tablist", { name: tablistName }).evaluate((list) =>
    Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).map((tab) => ({
      name: tab.textContent?.trim() ?? "",
      tabindex: tab.getAttribute("tabindex"),
      selected: tab.getAttribute("aria-selected") === "true",
    }))
  );
}

async function expectEenTabstop(page: Page, tablistName: string, naam: string) {
  const state = await tabstops(page, tablistName);
  expect(state.filter((t) => t.tabindex === "0").map((t) => t.name)).toEqual([naam]);
  expect(state.filter((t) => t.tabindex === "-1")).toHaveLength(state.length - 1);
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

async function openPortal(page: Page) {
  await mockPortal(page);
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await expect(page.getByRole("tab", { name: "Saldo" })).toBeVisible({ timeout: 15_000 });
}

test.describe("portal (negatief)", () => {
  test("sheet: Tab/Shift+Tab vanaf container, eerste en laatste element landen exact en wrappen", async ({ page }) => {
    await openPortal(page);
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();
    await expect(page.getByRole("dialog", { name: "Wachtwoord wijzigen" })).toBeVisible();
    await expectExacteFocusvolgorde(page);
  });

  test("sheet: focusin-vangnet haalt de focus terug als de achtergrond toch focus krijgt", async ({ page }) => {
    await openPortal(page);
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();
    await expect(page.getByRole("dialog", { name: "Wachtwoord wijzigen" })).toBeVisible();

    // Zonder `inert` zou dit de focus buiten de dialoog zetten (schermlezer,
    // programmatisch): het vangnet moet hem terugtrekken.
    await page.evaluate(() => {
      document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
      (document.querySelector('[role="tab"]') as HTMLElement).focus();
    });
    await expect.poll(() => dialogFocusState(page).then((s) => s.inDialog)).toBe(true);
  });

  test("sheet: de tabs achter de dialoog zijn inert en niet met het toetsenbord te bereiken", async ({ page }) => {
    await openPortal(page);
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();
    await expect(page.getByRole("dialog", { name: "Wachtwoord wijzigen" })).toBeVisible();
    for (const naam of ["Saldo", "Transacties", "Account"]) {
      expect(await page.getByRole("tab", { name: naam }).evaluate((el) => !!el.closest("[inert]"))).toBe(true);
    }
    // Tab-rondje door de hele dialoog: de focus raakt nooit een tab.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).not.toBe("tab");
      expect((await dialogFocusState(page)).inDialog).toBe(true);
    }
  });

  test("tabs: bij manuele activatie volgt de ene tabstop de focus en valt hij terug op de selectie", async ({ page }) => {
    await openPortal(page);
    const saldo = page.getByRole("tab", { name: "Saldo" });
    await saldo.focus();
    await expectEenTabstop(page, "Portaal-navigatie", "Saldo");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Transacties" })).toBeFocused();
    // Nog steeds precies één tabstop, nu de gefocuste; selectie ongewijzigd.
    await expectEenTabstop(page, "Portaal-navigatie", "Transacties");
    await expect(saldo).toHaveAttribute("aria-selected", "true");

    // Tab uit de tablist: het panel in. Shift+Tab terug komt op de
    // geselecteerde tab uit, niet op de eerder gefocuste.
    await page.keyboard.press("Tab");
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="tabpanel"]')))
      .toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(saldo).toBeFocused();
    await expectEenTabstop(page, "Portaal-navigatie", "Saldo");
  });

  test("tabs: modifiers laten de tablist met rust, ook Alt+Pijl (browser terug)", async ({ page }) => {
    await openPortal(page);
    const saldo = page.getByRole("tab", { name: "Saldo" });
    await saldo.focus();
    for (const combo of ["Alt+ArrowRight", "Control+ArrowRight", "Meta+ArrowRight", "Alt+End", "Control+Home"]) {
      await page.keyboard.press(combo);
      await expect(saldo).toBeFocused();
    }
    await expectEenTabstop(page, "Portaal-navigatie", "Saldo");
  });

  test("tabs: toetsen worden niet afgehandeld vanuit het panel", async ({ page }) => {
    await openPortal(page);
    await page.getByRole("tab", { name: "Account" }).click();
    const knop = page.getByRole("tabpanel").getByRole("button").first();
    await knop.focus();
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      await page.keyboard.press(key);
      await expect(knop).toBeFocused();
    }
    await expect(page.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
  });

  test("tabs: aria-controls staat alleen op de actieve tab en wijst naar het panel dat naar de tab terugwijst", async ({
    page,
  }) => {
    await openPortal(page);
    const relaties = await page.getByRole("tablist", { name: "Portaal-navigatie" }).evaluate((list) =>
      Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).map((tab) => {
        const controls = tab.getAttribute("aria-controls");
        const panel = controls ? document.getElementById(controls) : null;
        return {
          selected: tab.getAttribute("aria-selected") === "true",
          controls,
          panelRole: panel?.getAttribute("role") ?? null,
          labelledBy: panel?.getAttribute("aria-labelledby") ?? null,
          tabId: tab.id,
        };
      })
    );
    for (const r of relaties) {
      if (r.selected) {
        expect(r.panelRole).toBe("tabpanel");
        expect(r.labelledBy).toBe(r.tabId);
      } else {
        expect(r.controls).toBeNull();
      }
    }
    // Eén panel in de DOM, geen verweesde panels van inactieve tabs.
    await expect(page.locator('[role="tabpanel"]')).toHaveCount(1);
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

async function mockBeheer(
  page: Page,
  opties: { rol?: "beheerder" | "bardienst"; reverseDelay?: Promise<void> } = {}
) {
  const rol = opties.rol ?? "beheerder";
  const reverseCalls: unknown[] = [];
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const own = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    const row = own ? { name: "Femke Bos", role: rol, has_pin: false } : null;
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  });
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) => json(route, 200, [LID]));
  await mockBarSessie(page, { rol });
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
    reverseCalls.push(route.request().postDataJSON());
    await opties.reverseDelay;
    return json(route, 200, { order_id: ORDER_OPEN, refunded_cents: 750, reason: "test" });
  });
  return reverseCalls;
}

async function openBeheer(page: Page) {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await expect(page.getByRole("tab", { name: "Assortiment" })).toBeVisible({ timeout: 15_000 });
}

test.describe("beheer (negatief)", () => {
  test("Lid beheren: Tab/Shift+Tab vanaf container, eerste en laatste element landen exact en wrappen", async ({
    page,
  }) => {
    await mockBeheer(page);
    await openBeheer(page);
    await page.getByRole("tab", { name: "Leden" }).click();
    await page.getByRole("button", { name: LID.name }).click();
    await expect(page.getByRole("dialog", { name: "Lid beheren" })).toBeVisible();
    await expectExacteFocusvolgorde(page);
  });

  test("tabs: Home/End en de andere as laten de selectie ongemoeid (manueel)", async ({ page }) => {
    await mockBeheer(page);
    await openBeheer(page);
    const assortiment = page.getByRole("tab", { name: "Assortiment" });
    await assortiment.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(assortiment).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Logboek" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(assortiment).toBeFocused();
    await expect(assortiment).toHaveAttribute("aria-selected", "true");
    // Alleen de geselecteerde tab is selected, ondanks al het lopen.
    expect((await tabstops(page, "Beheer-navigatie")).filter((t) => t.selected)).toHaveLength(1);
  });

  test("geldmutatie: geblokkeerde sluitpogingen sturen geen tweede request en verplaatsen de focus niet", async ({
    page,
  }) => {
    let vrijgeven!: () => void;
    const vertraging = new Promise<void>((resolve) => {
      vrijgeven = resolve;
    });
    const calls = await mockBeheer(page, { reverseDelay: vertraging });
    await openBeheer(page);
    await page.getByRole("tab", { name: "Leden" }).click();
    await page.getByRole("button", { name: LID.name }).click();
    await page.getByRole("button", { name: /^Bestelling terugdraaien/ }).click();
    const dialog = page.getByRole("dialog", { name: "Bestelling terugdraaien" });
    const status = dialog.locator('p[role="status"]');
    // Geen melding zolang er niets geblokkeerd is: de regio is gemount maar leeg.
    await expect(status).toHaveCount(1);
    await expect(status).toHaveText("");

    await dialog.getByRole("button", { name: /terugdraaien →/ }).click();
    await dialog.getByLabel("Reden").fill("test");
    await dialog.getByRole("button", { name: "terugdraaien", exact: true }).click();
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => calls.length).toBe(1);

    // De eigen sluitknop is disabled (consument volgt het contract).
    await expect(dialog.getByRole("button", { name: "Sluiten" })).toBeDisabled();

    // De bezig-knop werd disabled: de focus staat op de dialoogcontainer.
    await expect(dialog).toBeFocused();
    const voor = await page.evaluate(() => document.activeElement?.tagName);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 5);
    }
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(voor);
    expect(calls).toHaveLength(1); // niet opnieuw verstuurd door een sluitpoging
    expect(calls[0]).not.toHaveProperty("total_cents");

    vrijgeven();
    await expect(dialog.getByText("Bestelling teruggedraaid · € 7,50")).toBeVisible();
    await expect(dialog).not.toHaveAttribute("aria-busy", "true");
    // Na de blokkade is de melding weer leeg en sluiten werkt.
    await expect(status).toHaveText("");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(calls).toHaveLength(1);
  });
});

// ── Bar (DienstTabs) ──────────────────────────────────────────────────────

const SHIFT_ID = "00000000-0000-4000-8000-0000000000d1";
const TOM = { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom Willems" };
const ANNA = { id: "00000000-0000-4000-8000-0000000000d3", name: "Anna de Vries" };

async function openBar(page: Page, placeOrderDelay?: Promise<void>) {
  const orderCalls: unknown[] = [];
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
    orderCalls.push(route.request().postDataJSON());
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
  return orderCalls;
}

async function openAfrekenen(page: Page) {
  await page.getByRole("button", { name: /^Pils,/ }).click();
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("option", { name: /Anna de Vries/ }).click();
  await page.getByRole("button", { name: "Tik afrekenen" }).click();
  const dialog = page.getByRole("dialog", { name: /^Afrekenen bij/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("bar (negatief)", () => {
  test("Afrekenen: Tab/Shift+Tab vanaf container, eerste en laatste element landen exact en wrappen", async ({
    page,
  }) => {
    await openBar(page);
    await openAfrekenen(page);
    await expectExacteFocusvolgorde(page);
  });

  test("Afrekenen pending: één request, annuleren disabled, geen melding vóór een poging, focus blijft", async ({
    page,
  }) => {
    let vrijgeven!: () => void;
    const vertraging = new Promise<void>((resolve) => {
      vrijgeven = resolve;
    });
    const calls = await openBar(page, vertraging);
    const dialog = await openAfrekenen(page);
    const status = dialog.locator('p[role="status"]');
    await expect(status).toHaveText("");

    await dialog.getByRole("button", { name: "ja, afrekenen" }).click();
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => calls.length).toBe(1);
    await expect(dialog.getByRole("button", { name: "annuleren" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "bezig…" })).toBeDisabled();
    // Pending zonder poging: nog geen melding (alleen een poging toont hem).
    await expect(status).toHaveText("");
    // Alleen de container blijft: geen bereikbare elementen, Tab blijft binnen.
    expect((await dialogFocusState(page)).count).toBe(0);
    for (const key of ["Tab", "Shift+Tab", "Tab"]) {
      await page.keyboard.press(key);
      expect((await dialogFocusState(page)).inDialog).toBe(true);
    }

    for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
    await expect(status).not.toHaveText("");
    await page.mouse.click(5, 5);
    // Een geforceerde klik op de disabled annuleerknop sluit evenmin.
    await dialog.getByRole("button", { name: "annuleren" }).click({ force: true });
    await expect(dialog).toBeVisible();
    expect((await dialogFocusState(page)).inDialog).toBe(true);
    expect(calls).toHaveLength(1);
    // Het bedrag komt niet van de client: geen total/amount in de payload.
    expect(JSON.stringify(calls[0])).not.toMatch(/total|cents|amount/i);

    vrijgeven();
    await expect(dialog).toHaveCount(0);
    expect(calls).toHaveLength(1);
    await expect(page.locator("[inert]")).toHaveCount(0);
  });

  test("rail: ArrowUp wrapt van Verkoop naar Dienst; de horizontale as en modifiers doen niets", async ({ page }) => {
    await openBar(page);
    const verkoop = page.getByRole("tab", { name: "Verkoop" });
    const dienst = page.getByRole("tab", { name: "Dienst" });
    await verkoop.focus();
    await page.keyboard.press("ArrowUp");
    await expect(dienst).toBeFocused();
    await expect(dienst).toHaveAttribute("aria-selected", "true");
    await expectEenTabstop(page, "Dienst-navigatie", "Dienst");

    await page.keyboard.press("Alt+ArrowUp");
    await page.keyboard.press("Control+ArrowDown");
    await expect(dienst).toBeFocused();
    await expect(dienst).toHaveAttribute("aria-selected", "true");
  });

  test("rail: Tab uit de rail bereikt main (na de Uitloggen-knop in de rail) en Shift+Tab komt terug op de geselecteerde tab", async ({
    page,
  }) => {
    await openBar(page);
    const verkoop = page.getByRole("tab", { name: "Verkoop" });
    await verkoop.focus();
    // De rail bevat na de tabs nog "Uitloggen", dus main is niet altijd de
    // eerstvolgende tabstop. Binnen drie Tab-drukken moet main bereikt zijn.
    let inMain = false;
    for (let i = 0; i < 3 && !inMain; i++) {
      await page.keyboard.press("Tab");
      inMain = await page.evaluate(() => !!document.activeElement?.closest("main"));
    }
    expect(inMain).toBe(true);
    // Terug naar de rail: de tablist heeft één tabstop, dus de geselecteerde tab.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      if (await page.evaluate(() => document.activeElement?.getAttribute("role") === "tab")) break;
    }
    await expect(verkoop).toBeFocused();
  });

  test("rail: pijlen vanuit de verkoopinhoud wisselen geen tab", async ({ page }) => {
    await openBar(page);
    const pils = page.getByRole("button", { name: /^Pils,/ });
    await pils.focus();
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      await page.keyboard.press(key);
      await expect(page.getByRole("tab", { name: "Verkoop" })).toHaveAttribute("aria-selected", "true");
    }
    await expect(page.getByRole("tab", { name: "Dienst" })).toHaveAttribute("aria-selected", "false");
  });
});
