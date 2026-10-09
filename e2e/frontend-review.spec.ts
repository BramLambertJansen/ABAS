import { test, expect, type Page, type Locator } from "@playwright/test";
import { scanAxe } from "./helpers/scanAxe";
import { json } from "./helpers/supabaseMock";
import { reviewFixture, REVIEW_PRODUCT, REVIEW_MEMBER } from "./helpers/frontendReview";

async function inReach(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  // Intersect viewport AND every clipping ancestor; root scrollWidth alone misses R03.
  const visible = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
      if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
    }
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return { width: right - left, height: bottom - top, hit: !!hit && (hit === element || element.contains(hit)) };
  });
  expect(visible.width).toBeGreaterThan(20);
  expect(visible.height).toBeGreaterThan(20);
  expect(visible.hit).toBe(true);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}
async function openProduct(page: Page) {
  await reviewFixture(page, "admin");
  await page.getByRole("button", { name: /Pils/ }).click();
}

test.describe("feedback en focus", () => {
  test.use({ viewport: { width: 1024, height: 900 } });
  test("U01/U04: prijsopslag reset validatie, toont succes, nieuwe poging valideert weer", async ({ page }) => {
    await openProduct(page);
    let fail = false;
    await page.route(/\/rpc\/update_product_price(\?|$)/, (route) => json(route, fail ? 400 : 200, fail ? { code: "P0001", message: "invalid_price" } : { ...REVIEW_PRODUCT, price_cents: 275 }));
    const input = page.getByLabel("Nieuwe prijs");
    await input.fill("2,75");
    await expect(page.getByText("Niet opgeslagen", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Opslaan", exact: true }).click();
    await expect(page.getByText("Prijs opgeslagen", { exact: true })).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Vul een prijs in.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Opslaan", exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    fail = true;
    await input.fill("3,00");
    await page.getByRole("button", { name: "Opslaan", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /geldige prijs/ })).toBeVisible();
    await expect(input).toHaveValue("3,00");
    await expect(page.getByText("Prijs opgeslagen", { exact: true })).toHaveCount(0);
  });
  test("U03: retry bewaart knop tijdens laden/fout en verplaatst focus bij succes", async ({ page }) => {
    const state = await reviewFixture(page, "portal");
    state.profileError = true;
    await page.getByRole("tab", { name: "Account", exact: true }).click();
    const retry = page.getByRole("button", { name: "Opnieuw proberen", exact: true });
    await expect(retry).toBeVisible();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    state.profileReply = async (route) => { await gate; await json(route, 500, { message: "fixture read error" }); };
    await retry.click();
    const waiting = page.getByRole("button", { name: "Opnieuw proberen…", exact: true });
    await expect(waiting).toBeFocused();
    await expect(waiting).toHaveAttribute("aria-disabled", "true");
    const count = state.profileCalls;
    await waiting.click({ force: true }); // Exercise the handler guard despite aria-disabled.
    expect(state.profileCalls).toBe(count);
    release();
    await expect(retry).toBeFocused();
    state.profileReply = undefined;
    state.profileError = false;
    await retry.click();
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeFocused();
  });
  test("R02: gewone lidselectie houdt focus in mandje; wissel herstelt de zoeker", async ({ page }) => {
    await reviewFixture(page, "bar");
    const search = page.getByRole("combobox", { name: "Zoek lid" });
    await search.fill("Joris");
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(page.locator("p[tabindex='-1']", { hasText: REVIEW_MEMBER.name })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "saldo opwaarderen", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "wissel", exact: true }).click();
    await expect(search).toBeFocused();
  });
  for (const mode of ["portal", "admin"] as const) {
    test(`U02/C01: lege naam krijgt gekoppelde veldfeedback (${mode})`, async ({ page }) => {
      await reviewFixture(page, mode);
      if (mode === "portal") {
        await page.getByRole("tab", { name: "Account", exact: true }).click();
        await page.getByRole("button", { name: /^Naam wijzigen/ }).click();
      } else {
        await page.getByRole("tab", { name: "Leden", exact: true }).click();
        await page.getByRole("button", { name: /nieuw lid/i }).click();
      }
      const input = page.getByLabel(mode === "portal" ? "Volledige naam" : "Naam", { exact: true });
      await expect(page.getByText("Vul een naam in.", { exact: true })).toHaveCount(0);
      await input.fill("   ");
      await page.getByRole("button", { name: mode === "portal" ? "Opslaan" : "Toevoegen", exact: true }).click();
      await expect(input).toBeFocused();
      await expect(input).toHaveAttribute("aria-invalid", "true");
      const id = await input.getAttribute("aria-describedby");
      await expect(page.locator(`[id="${id}"]`)).toHaveText("Vul een naam in.");
      await input.fill("Nieuwe naam");
      await expect(input).not.toHaveAttribute("aria-invalid", "true");
    });
  }
  test("U02: bestaande lidnaam valideert lokaal en bewaart de bewerking", async ({ page }) => {
    await reviewFixture(page, "admin");
    await page.getByRole("tab", { name: "Leden", exact: true }).click();
    await page.getByRole("button", { name: /Joris de Vries/ }).click();
    const dialog = page.getByRole("dialog", { name: "Lid beheren" });
    const input = dialog.getByLabel("Naam", { exact: true });
    await input.fill("   ");
    await dialog.getByRole("group", { name: "Naam wijzigen" }).getByRole("button", { name: "Opslaan", exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText("Vul een naam in.", { exact: true })).toBeVisible();
    await input.fill("Joris Nieuw");
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("U06: één sluitpatroon voor gewijzigde formulieren", () => {
  test.use({ viewport: { width: 1024, height: 900 } });
  for (const form of ["product", "nieuw-product", "lid", "nieuw-lid", "naam", "wachtwoord", "pincode"] as const) {
    test(`${form}: Sluiten/Annuleren vraagt, Terug bewaart invoer en focus`, async ({ page }) => {
      const portal = ["naam", "wachtwoord", "pincode"].includes(form);
      await reviewFixture(page, portal ? "portal" : "admin");
      if (portal) {
        await page.getByRole("tab", { name: "Account", exact: true }).click();
        const trigger = form === "naam" ? /^Naam wijzigen/ : form === "wachtwoord" ? /^Wachtwoord wijzigen/ : /^Pincode voor de bar-tablet/;
        await page.getByRole("button", { name: trigger }).click();
      } else if (form === "lid" || form === "nieuw-lid") {
        await page.getByRole("tab", { name: "Leden", exact: true }).click();
        await page.getByRole("button", { name: form === "lid" ? /Joris de Vries/ : /nieuw lid/i }).click();
      } else await page.getByRole("button", { name: form === "product" ? /Pils/ : /nieuw product/i }).click();
      const dialog = page.getByRole("dialog");
      const field = form === "product" ? dialog.getByLabel("Nieuwe prijs") : form === "naam" ? dialog.getByLabel("Volledige naam") : form === "wachtwoord" ? dialog.getByLabel("Nieuw wachtwoord", { exact: true }) : dialog.getByLabel("Naam", { exact: true });
      if (form === "pincode") await dialog.getByRole("button", { name: "Cijfer 1" }).click();
      else await field.fill(form === "product" ? "3,55" : "Gewijzigde invoer");
      const close = dialog.getByRole("button", { name: form === "product" || form === "lid" ? "Sluiten" : "Annuleren", exact: true });
      await close.click();
      const question = dialog.getByText("Niet-opgeslagen wijziging weggooien?", { exact: true });
      await expect(question).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Terug", exact: true })).toBeFocused();
      for (const control of [close, dialog.getByRole("button", { name: "Terug", exact: true }), dialog.getByRole("button", { name: "Weggooien", exact: true })]) {
        await inReach(page, control);
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await close.click(); // Repeating an explicit close keeps the confirmation open.
      await expect(question).toBeVisible();
      await dialog.getByRole("button", { name: "Terug", exact: true }).click();
      await expect(close).toBeFocused();
      if (form !== "pincode") await expect(field).toHaveValue(form === "product" ? "3,55" : "Gewijzigde invoer");
      await close.click();
      await dialog.getByRole("button", { name: "Weggooien", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    });
  }
});

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test.describe(`portal ${viewport.width}`, () => {
    test.use({ viewport });
    test("R01: gewone en vergrote letters houden controls en bedragen uit elkaars tekst", async ({ page }) => {
      await reviewFixture(page, "portal");
      await page.getByRole("tab", { name: "Transacties", exact: true }).click();
      for (const enlarge of [false, true]) {
        if (enlarge) await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
        await noOverflow(page);
        for (const name of ["Saldo", "Transacties", "Account"]) await inReach(page, page.getByRole("tab", { name, exact: true }));
        for (const name of ["Verversen", "Alles", "Uitgaven", "Opwaarderingen"]) await inReach(page, page.getByRole("button", { name, exact: true }));
        const row = page.locator("li").filter({ hasText: "Bestelling" }).first();
        const text = await row.locator(":scope > div").boundingBox();
        const amount = await row.locator(":scope > span").boundingBox();
        expect(text).not.toBeNull(); expect(amount).not.toBeNull();
        expect(text!.x + text!.width <= amount!.x + 1 || text!.y + text!.height <= amount!.y + 1).toBe(true);
      }
    });
  });
}
for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 512, height: 384 }]) {
  test.describe(`kassa ${viewport.width}`, () => {
    test.use({ viewport });
    test("R03: producten zijn zichtbaar en bedienbaar; mandje blijft na tabwissel behouden", async ({ page }) => {
      await reviewFixture(page, "bar");
      const product = page.getByRole("button", { name: /^Pils, / });
      await inReach(page, product);
      await product.click();
      await expect(page.getByRole("button", { name: "Eén Pils meer", exact: true })).toBeVisible();
      const member = page.getByRole("combobox", { name: "Zoek lid" });
      await member.fill("Joris"); await member.press("ArrowDown"); await member.press("Enter");
      await inReach(page, page.getByRole("button", { name: /^Tik afrekenen/ }));
      await page.getByRole("tab", { name: "Dienst", exact: true }).click();
      await page.getByRole("tab", { name: "Verkoop", exact: true }).click();
      await expect(page.getByRole("button", { name: "Eén Pils meer", exact: true })).toBeVisible();
      await expect(page.locator("p[tabindex='-1']", { hasText: REVIEW_MEMBER.name })).toBeVisible();
      await noOverflow(page);
    });
  });
}

test.describe("financieel herstel", () => {
  test.use({ viewport: { width: 1024, height: 900 } });
  for (const operation of ["place_order", "top_up"] as const) {
    test(`U05: ${operation} receipt herstelt normale UI zonder extra boeking`, async ({ page }) => {
      await reviewFixture(page, "bar");
      await page.getByRole("button", { name: /^Pils, / }).click();
      const search = page.getByRole("combobox", { name: "Zoek lid" });
      await search.fill("Joris"); await search.press("ArrowDown"); await search.press("Enter");
      await page.getByRole("button", { name: operation === "place_order" ? /^Tik afrekenen/ : "saldo opwaarderen" }).click();
      const calls: Array<Record<string, unknown>> = [];
      await page.route(new RegExp(`/rpc/${operation}_once(\\?|$)`), (route) => { calls.push(route.request().postDataJSON()); return route.abort("failed"); });
      if (operation === "top_up") {
        await page.getByLabel("Ander bedrag").fill("25,00");
        await page.getByRole("button", { name: "boeken", exact: true }).click();
      } else await page.getByRole("button", { name: "ja, afrekenen", exact: true }).click();
      const check = page.getByRole("button", { name: "Resultaat controleren", exact: true });
      await expect(check).toBeVisible();
      expect(calls).toHaveLength(1);
      if (operation === "top_up") {
        await expect(page.getByLabel("Ander bedrag")).toHaveAttribute("readonly", "");
        await expect(page.getByRole("button", { name: "€ 10,00", exact: true })).toBeDisabled();
      }
      let inspections = 0;
      await page.route(/\/rpc\/inspect_money_request(\?|$)/, (route) => {
        const args = route.request().postDataJSON(); inspections++;
        expect(args.p_request_id).toBe(calls[0].p_request_id);
        expect(args.p_cancel).toBe(false);
        return json(route, 200, { status: "completed", result: operation === "top_up" ? { amount_cents: 2500, balance_cents: 4000 } : { order_id: "00000000-0000-4000-8000-000000000061", total_cents: 250, balance_cents: 1250 } });
      });
      await check.click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(inspections).toBe(1); expect(calls).toHaveLength(1);
      await expect(page.getByRole("button", { name: "Eén Pils meer", exact: true })).toHaveCount(operation === "place_order" ? 0 : 1);
    });
  }
  for (const outcome of ["completed", "cancelled", "missing", "complete"] as const) {
    test(`U05: nieuw-lidherstel ${outcome} blijft bij oorspronkelijke sleutel/invoer`, async ({ page }) => {
      await reviewFixture(page, "admin");
      await page.getByRole("tab", { name: "Leden", exact: true }).click();
      await page.getByRole("button", { name: /nieuw lid/i }).click();
      await page.getByLabel("Naam", { exact: true }).fill("Joris Voorbeeld");
      await page.getByLabel("Startsaldo (optioneel)").fill("25,00");
      const calls: Array<Record<string, unknown>> = [];
      await page.route(/\/rpc\/create_member_once(\?|$)/, (route) => {
        calls.push(route.request().postDataJSON());
        return calls.length === 1 ? route.abort("failed") : json(route, 200, { ...REVIEW_MEMBER, name: "Joris Voorbeeld", balance_cents: 2500, auth_user_id: null });
      });
      await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
      const check = page.getByRole("button", { name: "Resultaat controleren", exact: true });
      await expect(check).toBeVisible();
      expect(calls).toHaveLength(1);
      await expect(page.getByLabel("Naam", { exact: true })).toHaveAttribute("readonly", "");
      await expect(page.getByText("Nieuw lid: Joris Voorbeeld · Startsaldo € 25,00", { exact: true })).toBeVisible();
      const inspections: Array<Record<string, unknown>> = [];
      await page.route(/\/rpc\/inspect_money_request(\?|$)/, (route) => {
        const args = route.request().postDataJSON(); inspections.push(args);
        return json(route, 200, { status: outcome === "complete" ? "missing" : outcome, ...(outcome === "completed" ? { result: { ...REVIEW_MEMBER, name: "Joris Voorbeeld", balance_cents: 2500, auth_user_id: null } } : {}) });
      });
      await page.getByRole("button", { name: outcome === "cancelled" ? /definitief annuleren/ : outcome === "complete" ? /veilig afronden/ : "Resultaat controleren" }).click();
      await expect.poll(() => inspections.length).toBe(1);
      expect(inspections[0].p_request_id).toBe(calls[0].p_request_id);
      expect(inspections[0].p_payload).toEqual(["Joris Voorbeeld", 2500, null]);
      expect(inspections[0].p_cancel).toBe(outcome === "cancelled");
      if (outcome === "complete") {
        await expect.poll(() => calls.length).toBe(2);
        expect(calls[1]).toEqual(calls[0]);
      } else expect(calls).toHaveLength(1);
      if (outcome === "completed" || outcome === "complete") await expect(page.getByRole("dialog", { name: "Nieuw lid", exact: true })).toHaveCount(0);
      else if (outcome === "cancelled") {
        await expect(page.getByText("De onbevestigde actie is definitief geannuleerd. Er is geen boeking teruggedraaid.", { exact: true })).toBeVisible();
        await expect(page.getByLabel("Naam", { exact: true })).toHaveValue("");
        await expect(page.getByLabel("Naam", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
      } else {
        await expect(page.getByText(/Er is nog geen boeking gevonden/)).toBeVisible();
        await expect(check).toBeVisible();
      }
    });
  }
});

test("gedeelde patronen: AA-scan portal Account", async ({ page }) => {
  await reviewFixture(page, "portal");
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Naam wijzigen/ })).toBeVisible();
  await scanAxe(page);
});
