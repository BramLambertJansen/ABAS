import type { Page } from "@playwright/test";

/**
 * Koppelt de browsercontext van `page` als bar-tablet via de echte
 * `/koppel`-flow (docs/features/tablet-koppelen.md → e2e en CI): code
 * invullen, versturen, wachten op `/`. Bouwt bewust géén cookie zelf via
 * `context.addCookies`: dan zouden de tests aan het cookieformaat vastzitten
 * en de koppelflow zelf nooit raken.
 *
 * Leunt niet op de schermteksten (src/features/tablet-koppelen/teksten.ts),
 * alleen op rol: het enige tekstveld en de enige knop in het formulier.
 * Na afloop heeft de eerstvolgende documentrequest naar `/` de
 * device-sessie aangemaakt (middleware, tabelrij 1).
 */
export async function koppelTablet(page: Page) {
  const code = process.env.BAR_DEVICE_SECRET;
  if (!code) {
    throw new Error(
      "koppelTablet: BAR_DEVICE_SECRET ontbreekt in de testomgeving (zie .github/workflows/ci.yml)"
    );
  }

  await openKoppelscherm(page);
  const formulier = koppelformulier(page);
  await formulier.getByRole("textbox").fill(code);
  await formulier.getByRole("button").click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
}

/** Het koppelformulier op `/koppel`, zonder op tekst te leunen. */
export function koppelformulier(page: Page) {
  return page.getByRole("main").locator("form");
}

/**
 * Opent `/koppel` en wacht tot het formulier gehydrateerd is: vóór de
 * hydratie doet versturen een native POST die op `/koppel` blijft.
 */
export async function openKoppelscherm(page: Page) {
  await page.goto("/koppel");
  await koppelformulier(page).getByRole("textbox").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}
