import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { loginMetWachtwoord } from "./helpers/supabaseMock";
import { koppelTablet, koppelformulier, openKoppelscherm } from "./helpers/tabletKoppelen";

/**
 * docs/features/tablet-koppelen.md → Testplan → e2e (ADR 0011). Echte
 * lokale Supabase (supabase/seed.sql) en het vaste CI-secret
 * `BAR_DEVICE_SECRET` uit .github/workflows/ci.yml. Elke test krijgt een
 * verse browsercontext, dus begint ongekoppeld.
 *
 * Geen assertie leunt op de schermteksten van /koppel
 * (src/features/tablet-koppelen/teksten.ts): alleen rol, label-koppeling,
 * URL en cookies.
 */

const KOPPELCOOKIE = "abas_tablet";
/** Het Supabase-sessiecookie van de bar (@supabase/ssr, evt. in chunks). */
const SUPABASE_SESSIECOOKIE = /^sb-.+-auth-token(\.\d+)?$/;
/** Zelfde verankerde naam als in e2e/a11y.spec.ts (zie de toelichting daar). */
const STAFF_BUTTON_NAME = /^Tom Willems\b/;

async function supabaseSessiecookies(context: BrowserContext) {
  return (await context.cookies()).filter((c) => SUPABASE_SESSIECOOKIE.test(c.name));
}

function pad(page: Page) {
  return new URL(page.url()).pathname;
}

test("niet gekoppeld: / gaat naar /koppel en er wordt geen sessie aangemaakt", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/koppel");

  const formulier = koppelformulier(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Het veld heeft een gekoppeld label (toegankelijke naam), de knop ook.
  await expect(formulier.getByRole("textbox")).toHaveAccessibleName(/\S/);
  await expect(formulier.getByRole("button")).toHaveAccessibleName(/\S/);

  expect(await supabaseSessiecookies(context)).toEqual([]);
});

test("verkeerde code: melding in de kaart, veld leeg met focus, nog steeds geen sessie", async ({
  page,
  context,
}) => {
  await openKoppelscherm(page);
  const formulier = koppelformulier(page);
  const veld = formulier.getByRole("textbox");

  await veld.fill("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-A");
  await formulier.getByRole("button").click();

  await expect(formulier.getByRole("alert")).toHaveText(/\S/);
  await expect(veld).toHaveValue("");
  await expect(veld).toBeFocused();
  expect(pad(page)).toBe("/koppel");
  expect(await supabaseSessiecookies(context)).toEqual([]);
  expect((await context.cookies()).some((c) => c.name === KOPPELCOOKIE)).toBe(false);
});

test("juiste code: naar / met het bar-scherm, abas_tablet HttpOnly en SameSite=Strict", async ({
  page,
  context,
}) => {
  await koppelTablet(page);

  // Staff picker of, als er al een dienst open staat, DienstTabs.
  await Promise.race([
    page.getByRole("tab", { name: "Verkoop" }).waitFor({ state: "visible", timeout: 15_000 }),
    page.getByRole("button", { name: STAFF_BUTTON_NAME }).waitFor({ state: "visible", timeout: 15_000 }),
  ]);

  const cookie = (await context.cookies()).find((c) => c.name === KOPPELCOOKIE);
  expect(cookie).toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe("Strict");
  expect(cookie!.path).toBe("/");
  // http://127.0.0.1 in CI: Secure moet hier uit staan, anders stuurt de
  // browser het cookie niet terug (spec → "Nog te verifiëren in de eerste
  // CI-run").
  expect(cookie!.secure).toBe(false);
  expect((await supabaseSessiecookies(context)).length).toBeGreaterThan(0);
});

test("gekoppeld met een gemanipuleerde cookiewaarde: behandeld als niet gekoppeld", async ({
  page,
  context,
}) => {
  await koppelTablet(page);
  const cookie = (await context.cookies()).find((c) => c.name === KOPPELCOOKIE);
  expect(cookie).toBeDefined();

  const laatste = cookie!.value.slice(-1);
  await context.addCookies([
    { ...cookie!, value: cookie!.value.slice(0, -1) + (laatste === "A" ? "B" : "A") },
  ]);

  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/koppel");
  // De device-sessie zonder geldige koppeling is uitgelogd (scope local).
  expect(await supabaseSessiecookies(context)).toEqual([]);
});

test("/beheer niet gekoppeld: inlogformulier zonder denied-melding, inloggen → ModusKeuze, uitloggen → /koppel", async ({
  page,
}) => {
  await page.goto("/beheer");
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });
  expect(pad(page)).toBe("/beheer");
  await expect(page.getByText("Dit account is niet gekoppeld aan een lid")).toHaveCount(0);

  await loginMetWachtwoord(page, "femke.bos@aurora.local", "local-beheerder-dev-only");
  await page
    .getByRole("heading", { name: /^Welkom,/ })
    .waitFor({ state: "visible", timeout: 15_000 });

  await page.getByRole("button", { name: "Uitloggen" }).click();
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });

  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/koppel");
});
