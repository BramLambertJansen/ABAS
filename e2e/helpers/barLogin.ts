import type { Page } from "@playwright/test";

/**
 * Logt in op de bar vanaf de namenlijst, met het wachtwoord (docs/features/
 * dienst-per-sessie.md → Inloggen op de bar): tik op de naam, vul het
 * wachtwoord in, "Inloggen". Zonder apparaatcookie kan alleen het wachtwoord,
 * dus dit is ook de weg waarlangs een apparaat voor de PIN vertrouwd wordt.
 * Vervangt `koppelTablet` uit de tijd van het gedeelde device-account (ADR
 * 0011). Een live-backend-helper: de server zoekt het e-mailadres zelf op en
 * maakt de sessie aan, dus hier zit geen mock in.
 *
 * `naam` is een RegExp zoals /^Femke Bos\b/: de knop van de `StaffPicker`
 * heet "Femke Bos" (sinds ADR 0017 zonder rol), en na het inloggen staat er ook een
 * "Bezetting: Femke Bos — tik om te wijzigen"-knop.
 *
 * Wacht niet op wat er na het inloggen volgt (activiteitkeuze, "Er loopt al
 * een dienst", Verkoop): dat verschilt per scenario en is aan de aanroeper.
 */
export async function logInOpBar(page: Page, naam: RegExp, wachtwoord: string) {
  await page.goto("/");
  const naamKnop = page.getByRole("button", { name: naam });
  await naamKnop.waitFor({ state: "visible", timeout: 15_000 });
  await naamKnop.click();

  const veld = page.locator('input[type="password"]');
  await veld.waitFor({ state: "visible", timeout: 15_000 });
  await veld.fill(wachtwoord);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
}

/** De naamknop van een seed-bardienst op het startscherm. */
export const FEMKE = /^Femke Bos\b/;
export const TOM = /^Tom Willems\b/;

/** Seed-wachtwoorden (supabase/seed.sql, alleen lokaal). */
export const WACHTWOORD_FEMKE = "local-beheerder-dev-only";
export const WACHTWOORD_TOM = "local-bardienst-dev-only";
