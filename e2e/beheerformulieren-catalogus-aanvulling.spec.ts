import { test, expect, type Page } from "@playwright/test";
import { USER, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

/**
 * #131 (T11), aanvulling van de tester op e2e/beheerformulieren-catalogus.spec.ts:
 * focus na archiveren van een activiteitstype (de rij herordent na de refetch).
 */

type Type = { id: string; name: string; archived: boolean };

async function mockTypes(page: Page, types: Type[]) {
  const calls: Array<Record<string, unknown>> = [];
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
  await page.route(/\/rest\/v1\/activity_types(\?|$)/, (route) =>
    json(route, 200, [...types].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name)))
  );
  await page.route(/\/rest\/v1\/rpc\/set_activity_type_archived(\?|$)/, async (route) => {
    const body = route.request().postDataJSON() as { p_activity_type_id: string; p_archived: boolean };
    calls.push(body);
    const type = types.find((t) => t.id === body.p_activity_type_id)!;
    type.archived = body.p_archived;
    await new Promise((r) => setTimeout(r, 150));
    return json(route, 200, type);
  });
  await mockBarSessie(page);
  return calls;
}

async function naarInstellingen(page: Page) {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: "Instellingen" }).click();
}

/** Wacht tot de refetch en herordening klaar zijn en lees dan de focus. */
async function actieveFocus(page: Page): Promise<string> {
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return "BODY";
    return a.getAttribute("aria-label") ?? a.textContent ?? a.tagName;
  });
}

test("Activiteitstypes: na archiveren van een van twee actieve types blijft de focus op een knop in de lijst, niet op body", async ({ page }) => {
  await mockTypes(page, [
    { id: "t1", name: "Training", archived: false },
    { id: "t2", name: "Concert", archived: false },
  ]);
  await naarInstellingen(page);
  // "Concert" staat boven "Training"; archiveer het bovenste: de rij zakt naar onder.
  await page.getByRole("button", { name: "Concert archiveren" }).click();
  expect(await actieveFocus(page)).not.toBe("BODY");
  expect(await actieveFocus(page)).toBe("Concert herstellen");
});

test("Activiteitstypes: na Toch archiveren landt de focus op de herstelknop van die rij, niet op body", async ({ page }) => {
  await mockTypes(page, [
    { id: "t1", name: "Training", archived: false },
    { id: "t2", name: "Concert", archived: true },
  ]);
  await naarInstellingen(page);
  await page.getByRole("button", { name: "Training archiveren" }).click();
  await page.getByRole("button", { name: "Toch archiveren" }).click();
  expect(await actieveFocus(page)).toBe("Training herstellen");
});

test("Activiteitstypes: na herstellen van een type landt de focus op zijn archiveerknop", async ({ page }) => {
  await mockTypes(page, [
    { id: "t1", name: "Training", archived: false },
    { id: "t2", name: "Concert", archived: true },
  ]);
  await naarInstellingen(page);
  await page.getByRole("button", { name: "Concert herstellen" }).click();
  expect(await actieveFocus(page)).toBe("Concert archiveren");
});

test("Activiteitstypes: archiveren zonder herordening van de rij laat de focus ook niet op body vallen", async ({ page }) => {
  await mockTypes(page, [
    { id: "t1", name: "Training", archived: false },
    { id: "t2", name: "Concert", archived: false },
  ]);
  await naarInstellingen(page);
  await page.getByRole("button", { name: "Training archiveren" }).click();
  expect(await actieveFocus(page)).toBe("Training herstellen");
});
