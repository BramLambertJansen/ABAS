import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  USER,
  USER_ZONDER_FACTOR,
  alertOf,
  fakeSession,
  json,
  mockTweedeFactor,
  portalLoginMetWachtwoord,
} from "./helpers/supabaseMock";
import { adminSetPassword, adminVerwijderFactoren } from "./helpers/supabaseAdmin";
import { totpCode, versTotpCode, vulCodeIn } from "./helpers/totp";

/**
 * docs/features/portal-profiel.md (#17) → Testplan → e2e. Het Account-
 * tabblad in `/portal`: naam, wachtwoord en (voor bar-rollen) de eigen
 * bar-PIN. A11y-scans van dezelfde schermen staan in e2e/a11y.spec.ts, net
 * als de stafkeuze-controle op het bar-tablet (die moet in de serial-groep
 * met de gedeelde dienst).
 *
 * Twee soorten test, zelfde opzet als e2e/portal-login.spec.ts:
 *
 *   1. "gemockt" — auth- en REST-calls onderschept via `page.route()`. Dekt
 *      de sheet-logica (aria-disabled, foutteksten, geen request bij een
 *      ongelijke PIN-herhaling) zonder live backend.
 *   2. "live backend" — echte lokale Supabase met supabase/seed.sql. Elke
 *      muterende test gebruikt een eigen `e2e.profiel.*`-fixture die geen
 *      andere test gebruikt (fullyParallel, spec → "Eigen
 *      fixture-accounts").
 */

// ---------------------------------------------------------------------------
// Gemockt
// ---------------------------------------------------------------------------

type ProfielRow = { name: string; role: "lid" | "bardienst" | "beheerder"; archived: boolean; has_pin: boolean };

type PortalMock = {
  updateUser: Array<Record<string, unknown>>;
  setOwnPin: Array<Record<string, unknown>>;
};

async function mockPortal(
  page: Page,
  {
    profiel,
    updateUser,
    setOwnPin,
    sessie,
    gebruiker,
  }: {
    profiel: ProfielRow;
    updateUser?: (n: number) => [number, unknown];
    setOwnPin?: (n: number) => [number, unknown];
    /** De sessie na het inloggen (standaard aal2 met factor). */
    sessie?: unknown;
    /** Wat `GET /auth/v1/user` teruggeeft (`mfa.listFactors`); zonder dit
     *  gaat die aanroep niet via de mock. */
    gebruiker?: () => unknown;
  }
): Promise<PortalMock> {
  const calls: PortalMock = { updateUser: [], setOwnPin: [] };
  const objectOrList = (route: Route, row: unknown) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  };

  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, sessie ?? fakeSession()));
  // Vangnet voor elke andere REST-call (app_settings, order_lines, …).
  await page.route(/\/rest\/v1\//, (route) => objectOrList(route, null));
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const own = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    return objectOrList(route, own ? { ...profiel, balance_cents: 1500 } : null);
  });
  await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/, (route) => json(route, 200, []));
  await page.route(/\/rest\/v1\/rpc\/set_own_pin(\?|$)/, (route) => {
    const n = calls.setOwnPin.length;
    calls.setOwnPin.push(route.request().postDataJSON());
    const [status, body] = setOwnPin?.(n) ?? [200, { ...profiel, has_pin: true, pin_hash: null }];
    return json(route, status, body);
  });
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => {
    if (route.request().method() === "GET" && gebruiker) return json(route, 200, gebruiker());
    if (route.request().method() !== "PUT") return route.fallback();
    const n = calls.updateUser.length;
    calls.updateUser.push(route.request().postDataJSON());
    const [status, body] = updateUser?.(n) ?? [200, USER];
    return json(route, status, body);
  });

  return calls;
}

async function openAccount(page: Page) {
  await portalLoginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("tab", { name: "Account" }).click({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Wachtwoord wijzigen/ })).toBeVisible();
}

const LID: ProfielRow = { name: "Mock Lid", role: "lid", archived: false, has_pin: false };
const BARDIENST: ProfielRow = { name: "Mock Bardienst", role: "bardienst", archived: false, has_pin: false };
const BEHEERDER: ProfielRow = { name: "Mock Beheerder", role: "beheerder", archived: false, has_pin: false };

test.describe("gemockt — wachtwoord wijzigen", () => {
  async function openSheet(page: Page) {
    await openAccount(page);
    await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();
    const dialog = page.getByRole("dialog", { name: "Wachtwoord wijzigen" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("Wijzigen blijft aria-disabled tot de checklist groen is en beide velden gelijk zijn; succes → toast, nog ingelogd", async ({
    page,
  }) => {
    const calls = await mockPortal(page, { profiel: LID });
    const dialog = await openSheet(page);
    const wijzigen = dialog.getByRole("button", { name: "Wijzigen" });

    // Geen veld "Huidig wachtwoord" (besluit 3).
    await expect(dialog.getByLabel(/huidig/i)).toHaveCount(0);
    await expect(wijzigen).toHaveAttribute("aria-disabled", "true");

    await dialog.getByLabel("Nieuw wachtwoord").fill("zwak");
    await dialog.getByLabel("Herhaal wachtwoord").fill("zwak");
    await expect(wijzigen).toHaveAttribute("aria-disabled", "true");

    await dialog.getByLabel("Nieuw wachtwoord").fill("Aurora#2026");
    await dialog.getByLabel("Herhaal wachtwoord").fill("Aurora#2025");
    await expect(wijzigen).toHaveAttribute("aria-disabled", "true");
    // Playwright weigert uit zichzelf te klikken op aria-disabled; force
    // bewijst dat de knop dan ook echt niets verstuurt.
    await wijzigen.click({ force: true });
    expect(calls.updateUser).toHaveLength(0);

    await dialog.getByLabel("Herhaal wachtwoord").fill("Aurora#2026");
    await expect(wijzigen).toHaveAttribute("aria-disabled", "false");
    await wijzigen.click();

    await expect(page.getByRole("status").filter({ hasText: "Wachtwoord gewijzigd" })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Hoi Mock" })).toBeVisible();
    expect(calls.updateUser).toEqual([expect.objectContaining({ password: "Aurora#2026" })]);
  });

  for (const [naam, status, body, melding] of [
    [
      "weak_password",
      422,
      { code: "weak_password", msg: "Password should contain...", weak_password: { reasons: ["characters"] } },
      "Dit wachtwoord voldoet niet aan de eisen.",
    ],
    [
      "same_password",
      422,
      { code: "same_password", msg: "New password should be different from the old password." },
      "Kies een ander wachtwoord dan je huidige.",
    ],
    [
      "rate limit",
      429,
      { code: "over_request_rate_limit", msg: "Request rate limit reached" },
      "te veel pogingen — probeer het over een paar minuten opnieuw",
    ],
    // Supabase "Secure password change" en een sessie buiten het venster
    // (spec → Randgevallen): niet de unknown-tekst.
    [
      "reauthentication_needed",
      400,
      { code: "reauthentication_needed", msg: "Password update requires reauthentication" },
      "log opnieuw in en probeer het nog eens",
    ],
  ] as const) {
    test(`updateUser weigert met ${naam} → "${melding}", sheet blijft open`, async ({ page }) => {
      await mockPortal(page, { profiel: LID, updateUser: () => [status, body] });
      const dialog = await openSheet(page);
      await dialog.getByLabel("Nieuw wachtwoord").fill("Aurora#2026");
      await dialog.getByLabel("Herhaal wachtwoord").fill("Aurora#2026");
      await dialog.getByRole("button", { name: "Wijzigen" }).click();

      await expect(dialog.getByRole("alert")).toHaveText(melding);
      await expect(dialog.getByLabel("Nieuw wachtwoord")).toHaveValue("Aurora#2026");
    });
  }

  test("voor een bardienst staat de uitleg over het beheerwachtwoord erbij, voor een lid niet", async ({
    page,
  }) => {
    await mockPortal(page, { profiel: BARDIENST });
    const dialog = await openSheet(page);
    await expect(dialog.getByText("Dit is ook je wachtwoord voor beheer op de bar-tablet.")).toBeVisible();
  });
});

test.describe("gemockt — pincode", () => {
  async function typePin(page: Page, pin: string) {
    for (const digit of pin) {
      await page.getByRole("button", { name: `Cijfer ${digit}` }).click();
    }
  }

  test("een gewoon lid heeft geen PIN-rij in de DOM", async ({ page }) => {
    await mockPortal(page, { profiel: LID });
    await openAccount(page);
    await expect(page.getByRole("button", { name: /Pincode/ })).toHaveCount(0);
  });

  test("ongelijke herhaling → 'Codes komen niet overeen', terug naar stap 1, geen set_own_pin-request", async ({
    page,
  }) => {
    const calls = await mockPortal(page, { profiel: BARDIENST });
    await openAccount(page);
    await page.getByRole("button", { name: /^Pincode voor de bar-tablet/ }).click();

    await expect(page.getByRole("dialog", { name: "Pincode instellen" })).toBeVisible();
    await typePin(page, "1234");
    await expect(page.getByRole("dialog", { name: "Pincode herhalen" })).toBeVisible();
    await typePin(page, "4321");

    const dialog = page.getByRole("dialog", { name: "Pincode instellen" });
    await expect(dialog).toBeVisible();
    await expect(alertOf(page).filter({ hasText: "Codes komen niet overeen" })).toBeVisible();
    await expect(dialog.getByText("Pincode: 0 van 4 cijfers ingevoerd")).toHaveCount(1);
    expect(calls.setOwnPin).toHaveLength(0);
  });

  test("gelijke herhaling → set_own_pin met alleen de PIN, toast 'Pincode ingesteld'", async ({ page }) => {
    const calls = await mockPortal(page, { profiel: BARDIENST });
    await openAccount(page);
    await page.getByRole("button", { name: /^Pincode voor de bar-tablet/ }).click();
    await typePin(page, "4821");
    await typePin(page, "4821");

    await expect(page.getByRole("status").filter({ hasText: "Pincode ingesteld" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(calls.setOwnPin).toEqual([{ p_pin: "4821" }]);
  });

  test("no_bar_role → bestaande tekst, terug naar stap 1", async ({ page }) => {
    await mockPortal(page, {
      profiel: BARDIENST,
      setOwnPin: () => [400, { code: "P0001", message: "no_bar_role", details: null, hint: null }],
    });
    await openAccount(page);
    await page.getByRole("button", { name: /^Pincode voor de bar-tablet/ }).click();
    await typePin(page, "4821");
    await typePin(page, "4821");

    await expect(
      alertOf(page).filter({ hasText: "dit account kan geen pincode instellen — vraag een beheerder" })
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Pincode instellen" })).toBeVisible();
  });
});

test.describe("gemockt — tweestapsverificatie (ADR 0017)", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

  async function scan(page: Page) {
    await page.mouse.move(0, 0);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  }

  for (const profiel of [LID, BARDIENST]) {
    test(`${profiel.role}: geen rij Tweestapsverificatie`, async ({ page }) => {
      await mockPortal(page, { profiel });
      await openAccount(page);
      await expect(page.getByText("Tweestapsverificatie", { exact: true })).toHaveCount(0);
    });
  }

  test("beheerder zonder factor: 'Uit' → sheet (QR en sleutel, code, Bevestigen) → toast, 'Aan' zonder knop", async ({
    page,
  }) => {
    let ingesteld = false;
    const verwijderd: string[] = [];
    await mockPortal(page, {
      profiel: BEHEERDER,
      sessie: fakeSession({ aal: "aal1", user: USER_ZONDER_FACTOR }),
      gebruiker: () =>
        ingesteld
          ? USER
          : {
              ...USER_ZONDER_FACTOR,
              // Een niet-afgemaakte factor van een eerdere poging: die gaat eerst weg.
              factors: [{ ...USER.factors[0], id: "00000000-0000-4000-8000-0000000000f0", status: "unverified" }],
            },
    });
    await page.route(/\/auth\/v1\/factors\/[^/]+(\?|$)/, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      verwijderd.push(route.request().url().split("/factors/")[1].split("?")[0]);
      return json(route, 200, { id: "x" });
    });
    await page.route(/\/auth\/v1\/factors(\?|$)/, (route) =>
      json(route, 200, {
        id: USER.factors[0].id,
        type: "totp",
        friendly_name: "",
        totp: { qr_code: SVG, secret: "GEHEIMESLEUTEL234", uri: "otpauth://totp/x" },
      })
    );
    const factor = await mockTweedeFactor(page, (n) => {
      if (n === 0) return [422, { code: "mfa_verification_failed", msg: "Invalid TOTP code entered" }];
      ingesteld = true;
      return [200, fakeSession({ aal: "aal2" })];
    });

    await openAccount(page);
    const rij = page.getByRole("button", { name: /^Tweestapsverificatie/ });
    await expect(rij).toContainText("Uit", { timeout: 15_000 });
    await expect(rij).toContainText(
      "Nodig om in beheer te komen. Je gebruikt een app zoals Google Authenticator of Microsoft Authenticator."
    );
    await rij.click();

    const stap1 = page.getByRole("dialog", { name: "Tweestapsverificatie instellen" });
    await expect(stap1.getByText("GEHEIMESLEUTEL234")).toBeVisible({ timeout: 15_000 });
    await expect(
      stap1.getByText("Scan deze code met je authenticator-app. Lukt scannen niet, typ dan deze sleutel over:")
    ).toBeVisible();
    await expect(stap1.getByRole("img", { name: "QR-code" })).toBeVisible();
    expect(verwijderd).toEqual(["00000000-0000-4000-8000-0000000000f0"]);
    await scan(page);
    await stap1.getByRole("button", { name: "Volgende" }).click();

    const stap2 = page.getByRole("dialog", { name: "Code invoeren" });
    await expect(stap2.getByText("Voer de 6 cijfers in die je app nu toont.")).toBeVisible();
    // Besloten 12 (docs/features/beheer-tweede-factor.md): focus naar de kop.
    await expect(stap2.getByRole("heading", { name: "Code invoeren" })).toBeFocused();
    const bevestigen = stap2.getByRole("button", { name: "Bevestigen" });
    await expect(bevestigen).toHaveAttribute("aria-disabled", "true");
    await scan(page);

    await vulCodeIn(page, "000000");
    await bevestigen.click();
    await expect(stap2.getByText("onjuiste code — probeer het opnieuw")).toBeVisible();

    await vulCodeIn(page, "123456");
    await bevestigen.click();
    await expect(page.getByRole("status").filter({ hasText: "Tweestapsverificatie ingesteld" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(factor.codes).toEqual(["000000", "123456"]);

    await expect(page.getByText("Aan", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tweestapsverificatie/ })).toHaveCount(0);
  });

  test("wachtwoord wijzigen met een factor en een aal1-sessie: eerst de code, dan de velden", async ({ page }) => {
    const calls = await mockPortal(page, { profiel: BEHEERDER, sessie: fakeSession({ aal: "aal1" }), gebruiker: () => USER });
    await mockTweedeFactor(page);
    await openAccount(page);
    await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();

    const dialog = page.getByRole("dialog", { name: "Wachtwoord wijzigen" });
    await expect(dialog.getByText("Voer eerst de code uit je authenticator-app in.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByLabel("Nieuw wachtwoord")).toHaveCount(0);
    await scan(page);

    await vulCodeIn(page, "123456");
    await expect(dialog.getByLabel("Nieuw wachtwoord")).toBeVisible();
    // Besloten 12: na de code de focus naar de kop van de stap met de velden.
    await expect(dialog.getByRole("heading", { name: "Wachtwoord wijzigen" })).toBeFocused();
    await dialog.getByLabel("Nieuw wachtwoord").fill("Aurora#2026");
    await dialog.getByLabel("Herhaal wachtwoord").fill("Aurora#2026");
    await dialog.getByRole("button", { name: "Wijzigen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Wachtwoord gewijzigd" })).toBeVisible();
    expect(calls.updateUser).toEqual([expect.objectContaining({ password: "Aurora#2026" })]);
  });
});

// ---------------------------------------------------------------------------
// Live backend
// ---------------------------------------------------------------------------

test.describe("live backend (echte lokale Supabase, supabase/seed.sql)", () => {
  const heading = (page: Page, firstName: string) =>
    page.getByRole("heading", { name: `Hoi ${firstName}` });

  /** 1. Alleen lezen, dus het gedeelde seedlid Anna de Vries mag. */
  test("Anna de Vries (lid): Naam en Wachtwoord zichtbaar, geen PIN-rij in de DOM", async ({ page }) => {
    await portalLoginMetWachtwoord(page, "anna.de.vries@aurora.local", "local-lid-dev-only");
    await expect(heading(page, "Anna")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Account" }).click();

    await expect(page.getByRole("button", { name: /^Naam wijzigen/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Wachtwoord wijzigen/ })).toBeVisible();
    await expect(page.getByText("anna.de.vries@aurora.local", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pincode/ })).toHaveCount(0);
  });

  /** 2. Eigen fixture. Header verandert zonder herladen (bewijst de
   *  doorgegeven refetch, spec → Schermflow §1) en na herladen nog steeds.
   *  Een unieke voornaam per run, zodat een tweede run op dezelfde stack
   *  ook echt een verandering ziet. */
  test("profiel-lid-naam wijzigt de naam → toast, header ververst zonder herladen", async ({ page }) => {
    const firstName = `Noor${Date.now().toString(36).replace(/[0-9]/g, "")}`;
    const newName = `${firstName} Profiel`;

    await portalLoginMetWachtwoord(page, "e2e.profiel.naam@aurora.local", "local-e2e-profiel-naam-dev-only");
    await expect(page.getByRole("heading", { name: /^Hoi / })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByRole("button", { name: /^Naam wijzigen/ }).click();

    const dialog = page.getByRole("dialog", { name: "Naam wijzigen" });
    const opslaan = dialog.getByRole("button", { name: "Opslaan" });
    await expect(opslaan).toHaveAttribute("aria-disabled", "true");
    await dialog.getByLabel("Volledige naam").fill("   ");
    await expect(opslaan).toHaveAttribute("aria-disabled", "true");
    await dialog.getByLabel("Volledige naam").fill(newName);
    await opslaan.click();

    await expect(page.getByRole("status").filter({ hasText: "Naam bijgewerkt" })).toBeVisible();
    await expect(heading(page, firstName)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Naam wijzigen/ }).getByText(newName, { exact: true })
    ).toBeVisible();

    await page.reload();
    await expect(heading(page, firstName)).toBeVisible({ timeout: 15_000 });
  });

  /** Eigen fixture (een beheerder zonder factor, supabase/seed.sql). Stelt
   *  tweestapsverificatie echt in tegen Supabase Auth, met de code uit de
   *  getoonde sleutel. Opzet en teardown verwijderen de factor via de Admin
   *  API (docs/features/beheer-tweede-factor.md, ADR 0017). */
  test.describe("profiel-beheerder-tweestap", () => {
    const EMAIL = "e2e.profiel.tweestap@aurora.local";
    const WACHTWOORD = "local-e2e-profiel-tweestap-dev-only";

    test.beforeEach(async () => {
      await adminVerwijderFactoren(EMAIL);
    });
    test.afterEach(async () => {
      await adminVerwijderFactoren(EMAIL);
    });

    test("stelt tweestapsverificatie in: QR en sleutel, code, toast, rij 'Aan'", async ({ page }) => {
      await portalLoginMetWachtwoord(page, EMAIL, WACHTWOORD);
      await expect(page.getByRole("heading", { name: /^Hoi / })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("tab", { name: "Account" }).click();

      const rij = page.getByRole("button", { name: /^Tweestapsverificatie/ });
      await expect(rij).toContainText("Uit", { timeout: 15_000 });
      await rij.click();

      const stap1 = page.getByRole("dialog", { name: "Tweestapsverificatie instellen" });
      const sleutel = stap1.locator("code");
      await expect(sleutel).toBeVisible({ timeout: 15_000 });
      const secret = (await sleutel.innerText()).trim();
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
      // De sleutel en de QR-code horen bij elkaar; de code volgt uit de sleutel.
      expect(totpCode(secret)).toMatch(/^[0-9]{6}$/);
      await stap1.getByRole("button", { name: "Volgende" }).click();

      const stap2 = page.getByRole("dialog", { name: "Code invoeren" });
      await expect(stap2).toBeVisible();
      await vulCodeIn(page, await versTotpCode(secret));
      await stap2.getByRole("button", { name: "Bevestigen" }).click();

      await expect(page.getByRole("status").filter({ hasText: "Tweestapsverificatie ingesteld" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("Aan", { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /^Tweestapsverificatie/ })).toHaveCount(0);
    });
  });

  /** 5. Eigen fixture. Teardown zet het seed-wachtwoord terug via de Admin
   *  API, zodat een tweede run op dezelfde stack zonder `db reset` werkt. */
  test.describe("profiel-lid-wachtwoord", () => {
    const EMAIL = "e2e.profiel.wachtwoord@aurora.local";
    const OLD = "local-e2e-profiel-wachtwoord-dev-only";
    const NEW = "Profiel#Nieuw2026";

    test.afterEach(async () => {
      await adminSetPassword(EMAIL, OLD);
    });

    test("wijzigt het wachtwoord → uitloggen → nieuw wachtwoord werkt, oud niet", async ({ page }) => {
      await portalLoginMetWachtwoord(page, EMAIL, OLD);
      await expect(page.getByRole("heading", { name: /^Hoi / })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("tab", { name: "Account" }).click();
      await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();

      const dialog = page.getByRole("dialog", { name: "Wachtwoord wijzigen" });
      await dialog.getByLabel("Nieuw wachtwoord").fill(NEW);
      await dialog.getByLabel("Herhaal wachtwoord").fill(NEW);
      await dialog.getByRole("button", { name: "Wijzigen" }).click();

      await expect(page.getByRole("status").filter({ hasText: "Wachtwoord gewijzigd" })).toBeVisible({
        timeout: 15_000,
      });
      // Besluit 4: de sessie blijft actief.
      await expect(page.getByRole("heading", { name: /^Hoi / })).toBeVisible();

      await page.getByRole("button", { name: "Uitloggen" }).click();
      await portalLoginMetWachtwoord(page, EMAIL, OLD);
      await expect(alertOf(page)).toHaveText("onjuist e-mailadres of wachtwoord", { timeout: 15_000 });

      await portalLoginMetWachtwoord(page, EMAIL, NEW);
      await expect(page.getByRole("heading", { name: /^Hoi / })).toBeVisible({ timeout: 15_000 });
    });
  });
});
