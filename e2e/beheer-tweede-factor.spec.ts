import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  USER,
  USER_ZONDER_FACTOR,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
  mockTweedeFactor,
  type BarSessieMockOpties,
} from "./helpers/supabaseMock";
import { vulCodeIn } from "./helpers/totp";

/**
 * Beheer eist een tweede factor, en de hervat-bevestiging geldt per browser
 * (docs/features/beheer-tweede-factor.md, ADR 0017). Supabase is gemockt via
 * `page.route()`, zoals e2e/bestelling-terugdraaien.spec.ts: de echte
 * afdwinging (aal2 in register_bar_session en elke beheer-RPC, resumable,
 * auth.sessions) staat in supabase/tests/beheer_tweede_factor.test.sql en
 * beheer_rpcs_modus.test.sql, en de echte code-stap tegen Supabase Auth in
 * e2e/a11y.spec.ts (`loginAsBeheerder`, met de TOTP-factor uit de seed).
 *
 * Wat dit toetst: de code-stap in `ModusKeuze` (goed, fout, te vaak), de
 * uitgeschakelde tegel zonder factor, twee tabbladen in één browser, en een
 * nieuwe browser (nieuwe context: geen sessiecookie) met hervatten of
 * `niet_hervat`. Plus de code-stap op /beheer/wachtwoord-herstellen.
 */

const CODE = "123456";

async function mockBeheer(
  page: Page,
  opties: { aal?: "aal1" | "aal2"; sessie?: BarSessieMockOpties } = {}
) {
  const user = opties.sessie?.user ?? USER;
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) =>
    json(route, 200, fakeSession({ aal: opties.aal ?? "aal2", user }))
  );
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
  return mockBarSessie(page, opties.sessie ?? {});
}

const beheerTabs = (page: Page) => page.getByRole("tablist", { name: "Beheer-navigatie" });
const beheerTegel = (page: Page) => page.getByRole("button", { name: /^Beheer/ });
const codeKop = (page: Page) => page.getByRole("heading", { name: "Code uit je authenticator-app" });

async function scan(page: Page) {
  await page.mouse.move(0, 0);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

// ── Code-stap in ModusKeuze ──────────────────────────────────────────────

test("aal1 met factor: 'Beheer' vraagt eerst de code, een foute code geeft de melding, de goede registreert", async ({
  page,
}) => {
  const sessie = await mockBeheer(page, { aal: "aal1" });
  const factor = await mockTweedeFactor(page, (n) =>
    n === 0
      ? [422, { code: "mfa_verification_failed", msg: "Invalid TOTP code entered" }]
      : [200, fakeSession({ aal: "aal2" })]
  );
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  await beheerTegel(page).click();
  await expect(codeKop(page)).toBeVisible({ timeout: 15_000 });
  // Nog niets geregistreerd: eerst de code.
  expect(sessie.registraties).toEqual([]);
  await scan(page);

  await vulCodeIn(page, "000000");
  await expect(page.getByText("onjuiste code — probeer het opnieuw")).toBeVisible();
  expect(sessie.registraties).toEqual([]);
  await scan(page);

  await vulCodeIn(page, CODE);
  await expect(beheerTabs(page)).toBeVisible({ timeout: 15_000 });
  expect(factor.codes).toEqual(["000000", CODE]);
  expect(sessie.registraties).toEqual(["beheer"]);
});

test("te veel pogingen bij Supabase Auth: de eigen tekst", async ({ page }) => {
  await mockBeheer(page, { aal: "aal1" });
  await mockTweedeFactor(page, () => [429, { code: "over_request_rate_limit", msg: "rate limit" }]);
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  await beheerTegel(page).click();
  await expect(codeKop(page)).toBeVisible({ timeout: 15_000 });
  await vulCodeIn(page, CODE);
  await expect(page.getByText("te veel pogingen — probeer het over een paar minuten opnieuw")).toBeVisible();
});

test("'Annuleren' in de code-stap brengt de tegels terug; 'Bar' werkt zonder code", async ({ page }) => {
  const sessie = await mockBeheer(page, { aal: "aal1" });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  await beheerTegel(page).click();
  await expect(codeKop(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Annuleren", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Bar/ })).toBeVisible();

  await page.getByRole("button", { name: /^Bar/ }).click();
  await expect.poll(() => sessie.registraties).toEqual(["bar"]);
});

test("met aal2 registreert 'Beheer' meteen, zonder code", async ({ page }) => {
  const sessie = await mockBeheer(page, { aal: "aal2" });
  const factor = await mockTweedeFactor(page);
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  await beheerTegel(page).click();
  await expect(beheerTabs(page)).toBeVisible({ timeout: 15_000 });
  expect(factor.codes).toEqual([]);
  expect(sessie.registraties).toEqual(["beheer"]);
});

test("zonder factor staat de tegel Beheer uit, met de uitleg; een tik doet niets", async ({ page }) => {
  const sessie = await mockBeheer(page, { aal: "aal1", sessie: { user: USER_ZONDER_FACTOR } });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  const tegel = beheerTegel(page);
  await expect(tegel).toContainText("Stel eerst tweestapsverificatie in via de portal (Account).", {
    timeout: 15_000,
  });
  await expect(tegel).toHaveAttribute("aria-disabled", "true");
  await tegel.click({ force: true });
  await expect(codeKop(page)).toHaveCount(0);
  expect(sessie.registraties).toEqual([]);
  await scan(page);
});

// ── Hervatten per browser (sectie B) ─────────────────────────────────────

test("een tweede tabblad op /beheer laat de beheersessie staan", async ({ page, context }) => {
  const eerste = await mockBeheer(page);
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await beheerTegel(page).click();
  await expect(beheerTabs(page)).toBeVisible({ timeout: 15_000 });

  // Het tweede tabblad deelt de cookies (de Supabase-sessie en
  // abas_bar_bevestigd); de server kent de sessie al in modus beheer.
  const tweede = await context.newPage();
  const tweedeSessie = await mockBeheer(tweede, { sessie: { voorgeregistreerd: "beheer" } });
  await tweede.goto("/beheer");
  await expect(beheerTabs(tweede)).toBeVisible({ timeout: 15_000 });

  expect(tweedeSessie.beeindigingen).toEqual([]);
  expect(eerste.beeindigingen).toEqual([]);
  await expect(beheerTabs(page)).toBeVisible();
});

test("nieuwe browser: een beheersessie wordt niet hervat (niet_hervat), de beheerlogin volgt", async ({
  page,
}) => {
  const sessie = await mockBeheer(page, { sessie: { voorgeregistreerd: "beheer" } });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  await expect.poll(() => sessie.beeindigingen, { timeout: 15_000 }).toEqual(["niet_hervat"]);
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
  await expect(beheerTabs(page)).toHaveCount(0);
});

test("nieuwe browser: een bar-sessie die te hervatten is, toont het hervatscherm", async ({ page }) => {
  const sessie = await mockBeheer(page, { sessie: { voorgeregistreerd: "bar", resumable: true } });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  await expect(page.getByRole("heading", { name: /^Verder als / })).toBeVisible({ timeout: 15_000 });
  expect(sessie.beeindigingen).toEqual([]);
});

test("nieuwe browser: de bar-sessie van een beheerder zonder factor (resumable = false) wordt gesloten", async ({
  page,
}) => {
  const sessie = await mockBeheer(page, {
    sessie: { voorgeregistreerd: "bar", resumable: false, user: USER_ZONDER_FACTOR },
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  await expect.poll(() => sessie.beeindigingen, { timeout: 15_000 }).toEqual(["niet_hervat"]);
  await expect(page.getByRole("heading", { name: /^Verder als / })).toHaveCount(0);
});

// ── /beheer/wachtwoord-herstellen: eerst de code ─────────────────────────

test("wachtwoord herstellen met een factor: eerst de code, dan het nieuwe wachtwoord", async ({ page }) => {
  const updates: unknown[] = [];
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => {
    if (route.request().method() === "PUT") {
      updates.push(route.request().postDataJSON());
      return json(route, 200, USER);
    }
    return json(route, 200, USER);
  });
  await page.route(/\/auth\/v1\/verify(\?|$)/, (route) => json(route, 200, fakeSession({ aal: "aal1" })));
  await page.route(/\/auth\/v1\/logout(\?|$)/, (route) => route.fulfill({ status: 204, body: "" }));
  const factor = await mockTweedeFactor(page);

  await page.goto("/beheer/wachtwoord-herstellen?token_hash=hash-uit-mail&type=recovery");
  await page.getByLabel("Nieuw wachtwoord").fill("Aurora#2026");
  await page.getByLabel("Herhaal wachtwoord").fill("Aurora#2026");
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();

  await expect(page.getByText("Voer eerst de code uit je authenticator-app in.")).toBeVisible({
    timeout: 15_000,
  });
  expect(updates).toEqual([]);
  await scan(page);

  await vulCodeIn(page, CODE);
  await expect(page).toHaveURL(/\/beheer$/, { timeout: 15_000 });
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0]).toEqual(expect.objectContaining({ password: "Aurora#2026" }));
  expect(factor.codes).toEqual([CODE]);
});
