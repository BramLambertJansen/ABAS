import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginMetWachtwoord, portalLoginMetWachtwoord } from "./helpers/supabaseMock";
import { FEMKE, TOM, WACHTWOORD_FEMKE, WACHTWOORD_TOM, logInOpBar } from "./helpers/barLogin";
import { FEMKE_TOTP_SECRET, versTotpCode, vulCodeIn } from "./helpers/totp";

// Deze live tests delen het seed-account Femke, de TOTP-factor en één globale
// dienst. Afzonderlijke browsercookies isoleren die backendtoestand niet:
// overlappende Auth-acties gaven session_not_found tijdens een andere login.
// Houd dit bestand in één worker; de gemockte specs blijven parallel draaien.
test.describe.configure({ mode: "default" });

/**
 * The WCAG-AA gate CLAUDE.md calls for: axe-core against every shell's
 * scaffold entry point. Add a route here the moment a real screen lands —
 * this list is meant to grow with the app, not stay at two placeholder
 * pages. See docs/ARCHITECTURE.md → Verificatie for how this fits
 * npm run check:all.
 */
const routes = [
  // docs/features/dienst-per-sessie.md → Schermflow punt 1: zonder sessie
  // toont `/` de namenlijst. De schermen daarna (inloggen, hervatten,
  // activiteitkeuze, Verkoop, …) worden gescand in het stateful block
  // hieronder.
  { name: "bar shell (startscherm, namenlijst)", path: "/" },
  { name: "portal shell", path: "/portal" },
  { name: "beheer login", path: "/beheer" },
  // docs/features/wachtwoord-vergeten.md — aanvraagweergave, en het
  // herstelscherm met een (nep)token (formulier) en zonder (link ongeldig).
  // Het token wordt pas bij verzenden gebruikt, dus een neptoken rendert
  // gewoon het formulier.
  { name: "wachtwoord vergeten", path: "/beheer?wachtwoord=vergeten" },
  {
    name: "wachtwoord herstellen",
    path: "/beheer/wachtwoord-herstellen?token_hash=a11y&type=recovery",
  },
  { name: "wachtwoord herstellen, link ongeldig", path: "/beheer/wachtwoord-herstellen" },
  // docs/features/portal-login.md (#15) → Randgevallen → "A11y":
  // "/portal/wachtwoord-herstellen (formulier + 'link ongeldig')" — zelfde
  // twee statische staten als hierboven voor /beheer, nu voor de
  // portal-variant (PortalWachtwoordHerstellen.tsx).
  {
    name: "portal wachtwoord herstellen",
    path: "/portal/wachtwoord-herstellen?token_hash=a11y&type=recovery",
  },
  { name: "portal wachtwoord herstellen, link ongeldig", path: "/portal/wachtwoord-herstellen" },
];

for (const { name, path } of routes) {
  test(`${name} (${path}) has no WCAG2A/AA violations`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });
}

/**
 * #71: de scans hierboven en hieronder meten kleuren. Een knop of tab met
 * `transition-colors` die net van staat wisselde, stond soms nog halverwege
 * de overgang, en axe mat dan een tussenkleur. playwright.config.ts draait
 * daarom met reducedMotion "reduce", en globals.css zet overgangen dan uit.
 * Deze test bewaakt dat die twee samen blijven werken.
 */
test("a11y-scans draaien zonder kleurovergangen (#71)", async ({ page }) => {
  await page.goto("/beheer");

  const inloggen = page.getByRole("button", { name: /^(Inloggen|Stuur inloglink)$/ });
  await expect(inloggen).toHaveCSS("transition-duration", "0s");
});

/**
 * docs/features/portal-login.md (#15) → Randgevallen → "A11y": de routes-
 * loop hierboven scant alleen `/portal`'s standaardstaat (methode Magic
 * link, geen sessie). Deze tests dekken de overige stateful weergaven van
 * `PortalLogin.tsx`/`PortalShellHome.tsx` die de spec expliciet noemt:
 * methode-keuze (Wachtwoord geselecteerd), de "link verstuurd"-bevestiging,
 * de wachtwoord-vergeten-aanvraag- en -verstuurd-weergave, en
 * `PortalShellHome`'s ingelogd-/denied-branches. Zelfde live-backend-opzet
 * als de rest van dit bestand (een echte lokale Supabase-stack, gevuld met
 * `supabase/seed.sql`) — geen mocking, dus ook de magic-link-/
 * wachtwoord-vergeten-aanvragen hieronder gaan echt naar de lokale GoTrue
 * (onschadelijk: er hoeft geen mail aan te komen voor een a11y-scan, alleen
 * de resulterende UI-staat telt).
 */
test.describe("portal (a11y)", () => {
  test("portal (/portal) methode-keuze met Wachtwoord geselecteerd has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await page.goto("/portal");
    const emailVeld = page.locator('input[type="email"]');
    await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
    await page.locator('label:has(input[value="password"])').click();
    await page.locator('input[type="password"]').waitFor({ state: "visible" });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  test("portal (/portal) 'link verstuurd'-bevestiging has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await page.goto("/portal");
    const emailVeld = page.locator('input[type="email"]');
    await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
    await emailVeld.fill("a11y-scan-magiclink@aurora.local");
    await page.getByRole("button", { name: "Stuur mij een inloglink" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "hebben we een inloglink gestuurd" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  test("portal (/portal) wachtwoord-vergeten-aanvraag has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await page.goto("/portal");
    const emailVeld = page.locator('input[type="email"]');
    await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
    await page.locator('label:has(input[value="password"])').click();
    await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
    await page
      .getByRole("heading", { name: "Wachtwoord vergeten" })
      .waitFor({ state: "visible" });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  test("portal (/portal) wachtwoord-vergeten-verstuurd has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await page.goto("/portal");
    const emailVeld = page.locator('input[type="email"]');
    await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
    await emailVeld.fill("a11y-scan-vergeten@aurora.local");
    await page.locator('label:has(input[value="password"])').click();
    await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
    await page.getByRole("button", { name: "Stuur herstellink" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "hebben we een link gestuurd" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * `PortalShellHome`'s "signed-in"-branch — Anna de Vries (seeded `lid`-rol
   * e-mail/wachtwoord-account, `supabase/seed.sql`), zelfde fixture als
   * e2e/portal-login.spec.ts's wachtwoordpad-test. Scant sinds #16
   * (docs/features/portal-dashboard.md) het nieuwe `PortalDashboard` — de
   * oude "Welkom, {naam}"-placeholder bestaat niet meer, dus dit scenario
   * wacht nu op het (standaard geopende) Saldo-tabblad in plaats daarvan.
   * Uitgebreide scenario's (Transacties-tabblad, laag-saldo-variant, lege
   * staat) zijn aan de Tester (spec → Randgevallen → "a11y").
   */
  test("portal (/portal) ingelogde staat (Anna de Vries) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await portalLoginMetWachtwoord(page, "anna.de.vries@aurora.local", "local-lid-dev-only");
    await page
      .getByRole("heading", { name: "Hoi Anna" })
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.getByText("HUIDIG SALDO").waitFor({ state: "visible" });
    // T09: de teruggedraaide seed-bestelling is op Saldo even zichtbaar als
    // op Transacties (badge, wie, waarom, uitlegregel).
    await expect(page.getByRole("heading", { name: "RECENTE TRANSACTIES" })).toBeVisible();
    await expect(page.getByText("Teruggedraaid", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Door: Sanne Bakker", { exact: true })).toBeVisible();
    await expect(page.getByText("Reden: verkeerd product getikt", { exact: true })).toBeVisible();
    await expect(page.getByText(/niet meer afgeschreven/)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * Minimale sanity-check bovenop het scenario hierboven: het Transacties-
   * tabblad is bereikbaar en axe-schoon met de gevulde seed-data (Anna de
   * Vries heeft sinds #16 een bestelling, een opwaardering en een
   * teruggedraaide bestelling, `supabase/seed.sql`). Geen uitputtende
   * dekking (filters, maandgroepering, lege staat) — dat is de Tester's
   * werk, zie spec → Randgevallen → "a11y".
   */
  test("portal (/portal) Transacties-tabblad (Anna de Vries) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await portalLoginMetWachtwoord(page, "anna.de.vries@aurora.local", "local-lid-dev-only");
    await page
      .getByRole("heading", { name: "Hoi Anna" })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("tab", { name: "Transacties" }).click();
    await page.getByText("Bestelling").first().waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.getByText("Teruggedraaid", { exact: true })).toBeVisible();
    await expect(page.getByText("Door: Sanne Bakker", { exact: true })).toBeVisible();
    await expect(page.getByText("Reden: verkeerd product getikt", { exact: true })).toBeVisible();
    await expect(page.getByText(/niet meer afgeschreven/)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/portal-sessielookup-laadfout.md (#115) → Teststrategie 11:
   * de foutstaat van `PortalShellHome`. Echte login (Anna de Vries), alleen
   * de sessielookup (`members` met `auth_user_id`, zonder `balance_cents`)
   * krijgt een 500, zodat `usePortalSession` op `error` komt.
   */
  test("portal (/portal) sessielookup-foutstaat has no WCAG2A/AA violations", async ({ page }) => {
    await page.route(/\/rest\/v1\/members\?/, (route) => {
      const url = decodeURIComponent(route.request().url());
      if (!url.includes("auth_user_id=eq.") || url.includes("balance_cents")) return route.fallback();
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ code: "PGRST301", message: "kapot", details: null, hint: null }),
      });
    });
    await portalLoginMetWachtwoord(page, "anna.de.vries@aurora.local", "local-lid-dev-only");
    const fout = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(fout).toContainText("Kan je account niet laden.", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Opnieuw proberen" })).toBeVisible();
    await expect(page.getByText("Dit account is niet gekoppeld aan een lid.")).toHaveCount(0);
    for (const knop of ["Opnieuw proberen", "Uitloggen"]) {
      const box = await page.getByRole("button", { name: knop }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/portal-dashboard.md (#16) → Randgevallen → "a11y": de
   * laag-saldo-variant, nog niet gedekt door het scenario hierboven (Anna
   * de Vries zit boven de €10-drempel). Piet Bakker (seeded `lid`,
   * `supabase/seed.sql`) heeft een saldo van -€8,40 — al onder de drempel
   * zonder dat er nog iets voor deze test bij hoefde — en krijgt hier een
   * eigen e-mail/wachtwoord-account (Tester-toevoeging, zelfde patroon als
   * Anna de Vries' account in `portal-login.md`). Scant de "Saldo bijna
   * op"-kaart op het standaard geopende Saldo-tabblad.
   */
  test("portal (/portal) laag-saldo-variant (Piet Bakker) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await portalLoginMetWachtwoord(page, "piet.bakker@aurora.local", "local-lid-laag-saldo-dev-only");
    await page
      .getByRole("heading", { name: "Hoi Piet" })
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.getByText("Saldo bijna op").waitFor({ state: "visible" });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/portal-dashboard.md (#16) → Randgevallen → "a11y": de
   * lege-transacties-staat, op beide tabbladen. Piet Bakker heeft — anders
   * dan Anna de Vries — geen enkele `orders`/`top_ups`-rij
   * (`supabase/seed.sql`), dus dit is tegelijk de kandidaat-fixture die de
   * spec noemde ("lege-staat-fixture", zie de Developer's verslag) en de
   * laag-saldo-fixture hierboven — bewust één en dezelfde seed-rij, geen
   * losse toggle. Scant eerst de "Recente transacties"-lege-staat op het al open
   * Saldo-tabblad, dan dezelfde lege-staat op het Transacties-tabblad.
   */
  test("portal (/portal) lege-transacties-staat (Piet Bakker) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await portalLoginMetWachtwoord(page, "piet.bakker@aurora.local", "local-lid-laag-saldo-dev-only");
    await page
      .getByRole("heading", { name: "Hoi Piet" })
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.getByText("Nog geen transacties").waitFor({ state: "visible", timeout: 15_000 });

    const saldoResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(saldoResults.violations, JSON.stringify(saldoResults.violations, null, 2))
      .toEqual([]);

    await page.getByRole("tab", { name: "Transacties" }).click();
    await page.getByText("Nog geen transacties").waitFor({ state: "visible", timeout: 15_000 });

    const txResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(txResults.violations, JSON.stringify(txResults.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/portal-dashboard.md (#16) → Randgevallen → "a11y": het
   * Transacties-tabblad met de filters en de maandgroepering, tegen Anna de
   * Vries' gevulde seed-data (een bestelling, een teruggedraaide bestelling,
   * een opwaardering — `supabase/seed.sql`). Het bestaande
   * "Transacties-tabblad"-scenario hierboven scant alleen de standaardstaat
   * (filter "Alles"); dit scenario schakelt daadwerkelijk tussen de drie
   * filters (`aria-pressed`, `TransactiesTab.tsx`) en scant elke staat
   * apart, zelfde "één test, meerdere passes bij wisselende schermstaat"
   * vorm als de Logboek-tab-test verderop in dit bestand. De maandgroepering
   * zelf (een `<section aria-label="{maand}">` per maand,
   * `TransactiesTab.tsx`) wordt hier niet op een letterlijke maandnaam
   * getoetst (die hangt af van de dag waarop de test draait) — de
   * "Einde van de lijst"-voettekst bewijst dat de groepen daadwerkelijk
   * gerenderd zijn.
   */
  test("portal (/portal) Transacties-tabblad met filters en maandgroepering (Anna de Vries) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await portalLoginMetWachtwoord(page, "anna.de.vries@aurora.local", "local-lid-dev-only");
    await page
      .getByRole("heading", { name: "Hoi Anna" })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("tab", { name: "Transacties" }).click();
    await page.getByText("Einde van de lijst").waitFor({ state: "visible", timeout: 15_000 });

    // Filter "Alles" (standaard): zowel een bestelling als een opwaardering
    // zichtbaar.
    await page.getByText("Bestelling").first().waitFor({ state: "visible" });
    await page.getByText("Opgewaardeerd").first().waitFor({ state: "visible" });

    const allesResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(allesResults.violations, JSON.stringify(allesResults.violations, null, 2))
      .toEqual([]);

    // Filter "Uitgaven": de opwaardering verdwijnt, de (ook teruggedraaide)
    // bestellingen blijven staan (spec → Schermflow §2: "het is en blijft
    // een bestelling").
    const uitgavenFilter = page.getByRole("button", { name: "Uitgaven" });
    await uitgavenFilter.click();
    await expect(uitgavenFilter).toHaveAttribute("aria-pressed", "true");
    await page.getByText("Bestelling").first().waitFor({ state: "visible" });
    await expect(page.getByText("Opgewaardeerd")).toHaveCount(0);

    const uitgavenResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(uitgavenResults.violations, JSON.stringify(uitgavenResults.violations, null, 2))
      .toEqual([]);

    // Filter "Opwaarderingen": het omgekeerde.
    const opwaarderingenFilter = page.getByRole("button", { name: "Opwaarderingen" });
    await opwaarderingenFilter.click();
    await expect(opwaarderingenFilter).toHaveAttribute("aria-pressed", "true");
    await page.getByText("Opgewaardeerd").first().waitFor({ state: "visible" });
    await expect(page.getByText("Bestelling")).toHaveCount(0);

    const opwaarderingenResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      opwaarderingenResults.violations,
      JSON.stringify(opwaarderingenResults.violations, null, 2)
    ).toEqual([]);
  });

  /**
   * `usePortalSession()`'s `denied`-staat — een sessie die bestaat maar niet
   * naar een `members`-record herleidt. Sinds ADR 0012
   * (docs/features/portal-profiel.md, #17) is een bardienst-account op de
   * portal gewoon `signed-in`; deze staat wordt daarom gescand met het
   * ongekoppelde seed-account (`auth.users` zonder `members`-rij), zelfde
   * account als e2e/portal-login.spec.ts's denied-test.
   */
  test("portal (/portal) denied-staat (ongekoppeld account) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await portalLoginMetWachtwoord(page, "e2e.ongekoppeld@aurora.local", "local-e2e-ongekoppeld-dev-only");
    await page
      .getByText("Dit account is niet gekoppeld aan een lid.")
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/portal-profiel.md (#17) → Randgevallen → "a11y": het
   * Account-tabblad en de drie sheets. Alleen lezen (sheets open, niets
   * opslaan), dus de gedeelde seedleden mogen: Anna de Vries als `lid`
   * (zonder PIN-rij), Sanne Bakker als bardienst (met PIN-rij). De
   * foutstaat van de naam-sheet wordt met een onderschepte RPC-respons
   * opgeroepen, zodat er niets in de database verandert.
   */
  async function openAccountTab(page: Page, email: string, password: string, firstName: string) {
    await portalLoginMetWachtwoord(page, email, password);
    await page
      .getByRole("heading", { name: `Hoi ${firstName}` })
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("tab", { name: "Account" }).click();
    await page
      .getByRole("button", { name: /^Wachtwoord wijzigen/ })
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  async function expectNoViolations(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  }

  test("portal (/portal) Account-tabblad als lid (Anna de Vries, zonder PIN-rij) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await openAccountTab(page, "anna.de.vries@aurora.local", "local-lid-dev-only", "Anna");
    await expect(page.getByRole("button", { name: /Pincode/ })).toHaveCount(0);
    await expectNoViolations(page);
  });

  test("portal (/portal) Account-tabblad als bardienst (Sanne Bakker, met PIN-rij) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await openAccountTab(page, "sanne.bakker@aurora.local", "local-bardienst-dev-only", "Sanne");
    await expect(page.getByRole("button", { name: /^Pincode voor de bar-tablet/ })).toBeVisible();
    await expectNoViolations(page);
  });

  test("portal (/portal) naam-sheet, ook met foutmelding, has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await page.route(/\/rest\/v1\/rpc\/update_own_name(\?|$)/, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "P0001", message: "invalid_name", details: null, hint: null }),
      })
    );
    await openAccountTab(page, "anna.de.vries@aurora.local", "local-lid-dev-only", "Anna");
    await page.getByRole("button", { name: /^Naam wijzigen/ }).click();
    const dialog = page.getByRole("dialog", { name: "Naam wijzigen" });
    await dialog.waitFor({ state: "visible" });
    await expectNoViolations(page);

    await dialog.getByLabel("Volledige naam").fill("Anna de Vries-a11y");
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await dialog.getByText("vul een naam in").waitFor({ state: "visible", timeout: 15_000 });
    await expectNoViolations(page);
  });

  test("portal (/portal) wachtwoord-sheet has no WCAG2A/AA violations", async ({ page }) => {
    await openAccountTab(page, "sanne.bakker@aurora.local", "local-bardienst-dev-only", "Sanne");
    await page.getByRole("button", { name: /^Wachtwoord wijzigen/ }).click();
    await page.getByRole("dialog", { name: "Wachtwoord wijzigen" }).waitFor({ state: "visible" });
    await expectNoViolations(page);
  });

  test("portal (/portal) pincode-sheet (stap 1, stap 2, foutmelding) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await openAccountTab(page, "sanne.bakker@aurora.local", "local-bardienst-dev-only", "Sanne");
    await page.getByRole("button", { name: /^Pincode voor de bar-tablet/ }).click();
    await page.getByRole("dialog", { name: "Pincode instellen" }).waitFor({ state: "visible" });
    await expectNoViolations(page);

    for (const digit of ["1", "2", "3", "4"]) {
      await page.getByRole("button", { name: `Cijfer ${digit}` }).click();
    }
    await page.getByRole("dialog", { name: "Pincode herhalen" }).waitFor({ state: "visible" });
    await expectNoViolations(page);

    // Ongelijke herhaling: client-side melding, geen request.
    for (const digit of ["4", "3", "2", "1"]) {
      await page.getByRole("button", { name: `Cijfer ${digit}` }).click();
    }
    await page.getByText("Codes komen niet overeen").waitFor({ state: "visible" });
    await expectNoViolations(page);
  });
});

/**
 * docs/features/negatieve-saldolimiet.md (#11) → Randgevallen → "A11y":
 * the routes loop above only scans `/beheer`'s signed-out inlogformulier —
 * the signed-in state (tabbalk + both tabbladen) was never in this file's
 * scenario list, a gap the spec explicitly calls out for the Tester to
 * close. Signs in as the seeded beheerder e-mail/wachtwoord account (Femke
 * Bos, `supabase/seed.sql`) via `BeheerLogin.tsx`'s real wachtwoord-pad —
 * her PIN (also seeded, 1234) is a *different* mechanism entirely
 * (bar-modus dienst-starten, never used for the beheer-sessie, ADR
 * 0002/0003), so it cannot substitute here. `supabase/seed.sql` had no
 * beheerder auth.users/auth.identities row before this (no prior /beheer
 * e2e scenario needed one) — added there as a minimal extension of the
 * exact same local-dev-only direct-insert pattern already used for the
 * shared bar-tablet device account.
 *
 * Two separate tests (one per tab) rather than two `analyze()` calls in a
 * single test — same one-scan-per-test shape as every other scenario in
 * this file — sharing the sign-in step via `loginAsBeheerder()`. Both are
 * independent of the "one open shift" shared-state concern the stateful
 * block below documents (no shift/order/top_up touched here), so they are
 * not grouped into that `describe.serial`.
 *
 * Updated for #42 (docs/features/auth-methode-per-lid.md): a successful
 * `/beheer`-login no longer lands directly on `BeheerTabs` — it lands on
 * `ModusKeuze` (Bar/Beheer/Mijn account) first, ADR 0003 → Beslissing 2.
 * `loginAsBeheerder()` now clicks the "Beheer"-tegel after signing in,
 * before waiting for the tabbalk. `ModusKeuze`/"Mijn account" zelf krijgen
 * hun eigen a11y-scenario's van de Tester (spec → Randgevallen → A11y) —
 * deze aanpassing bestaat alleen om het bestaande, al gemergede scenario
 * kloppend te houden met het nu gewijzigde schermverloop.
 *
 * Sinds ADR 0017 (docs/features/beheer-tweede-factor.md) eist beheer een
 * tweede factor: na de tik op "Beheer" volgt de code uit de authenticator-app.
 * Femke Bos heeft in supabase/seed.sql een geverifieerde TOTP-factor met een
 * vast secret; de code rekent e2e/helpers/totp.ts uit, en de echte Supabase
 * Auth controleert hem (challenge + verify → aal2).
 */
async function naarCodeStap(page: Page) {
  await loginMetWachtwoord(page, "femke.bos@aurora.local", "local-beheerder-dev-only");

  const beheerTegel = page.getByRole("button", { name: /^Beheer/ });
  await beheerTegel.waitFor({ state: "visible", timeout: 15_000 });
  // De tegel is aria-disabled tot de factoren gelezen zijn.
  await expect(beheerTegel).not.toHaveAttribute("aria-disabled", "true", { timeout: 15_000 });
  await beheerTegel.click();

  await page
    .getByRole("heading", { name: "Code uit je authenticator-app" })
    .waitFor({ state: "visible", timeout: 15_000 });
}

async function loginAsBeheerder(page: Page) {
  await naarCodeStap(page);
  await vulCodeIn(page, await versTotpCode(FEMKE_TOTP_SECRET));

  await page
    .getByRole("tablist", { name: "Beheer-navigatie" })
    .waitFor({ state: "visible", timeout: 15_000 });
}

/**
 * docs/features/auth-methode-per-lid.md (#42) → Randgevallen → "A11y" (a):
 * signs in the same way as `loginAsBeheerder()` above, but stops at
 * `ModusKeuze` (Bar/Beheer/Mijn account) instead of clicking through to
 * `BeheerTabs` — this is the screen state itself under test here, not a
 * step on the way to another one.
 */
async function loginToModusKeuze(page: Page) {
  await loginMetWachtwoord(page, "femke.bos@aurora.local", "local-beheerder-dev-only");

  await page
    .getByRole("heading", { name: /^Welkom,/ })
    .waitFor({ state: "visible", timeout: 15_000 });
}

test.describe("beheer ingelogde staat (a11y)", () => {
  test("beheer (/beheer) Assortiment-tab (ingelogd) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginAsBeheerder(page);

    // Assortiment is the default tab after login (BeheerTabs.tsx), already
    // active here — nothing to click.
    await page
      .getByRole("heading", { name: "Assortiment" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  test("beheer (/beheer) Instellingen-tab (ingelogd) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginAsBeheerder(page);

    await page.getByRole("tab", { name: "Instellingen" }).click();
    await page
      .getByRole("heading", { name: "Negatief saldo toestaan" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/activiteittypes.md (#18) → Randgevallen → "A11y van de
   * nieuwe Instellingen-kaart (inline bewerken) en de nieuwe
   * activiteitkeuze-stap in dienst-starten": the closed/default state of
   * `ActiviteitstypesInstellingen.tsx` is already scanned incidentally by
   * the Instellingen-tab test above (it renders alongside
   * `NegatieveLimietInstellingen`, `BeheerTabs.tsx`) — the scenario the spec
   * explicitly calls out as still missing is the inline-bewerkveld state,
   * opened via a row's "bewerken"-knop. Uses "Training", one of the four
   * seed rows from `0019_activiteittypes.sql` (`supabase/seed.sql` doesn't
   * override `activity_types`).
   */
  test("beheer (/beheer) Activiteitstypes-kaart met geopend inline-bewerkveld has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginAsBeheerder(page);

    await page.getByRole("tab", { name: "Instellingen" }).click();
    await page
      .getByRole("heading", { name: "Activiteitstypes" })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: "Training bewerken" }).click();
    await page
      .getByLabel("Naam van Training")
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/auth-methode-per-lid.md (#42) → Randgevallen → "A11y" (a):
   * the modus-keuzestaat op `/beheer` — after a successful e-mail/wachtwoord-
   * login, before Bar or Beheer is chosen (`ModusKeuze.tsx`). Not part of the
   * `loginAsBeheerder()`-based tests above/below: those all click straight
   * through to `BeheerTabs`, so this is the only scenario that actually
   * scans this intermediate screen.
   */
  /**
   * docs/features/beheer-tweede-factor.md (ADR 0017): de code-stap in de
   * modus-keuze, na een tik op "Beheer" met een aal1-sessie. Scant de lege
   * invoer; de muis gaat eerst van de knoppen af (hover-kleuren).
   */
  test("beheer (/beheer) code-stap in de modus-keuze has no WCAG2A/AA violations", async ({ page }) => {
    await naarCodeStap(page);
    await page.mouse.move(0, 0);

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("beheer (/beheer) modus-keuze (ingelogd, vóór modus gekozen) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginToModusKeuze(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/ledenbeheer.md → Randgevallen → "A11y": "Tester breidt
   * hetzelfde scenario uit met de Leden-tab en beide nieuwe overlays
   * ('Nieuw lid'/'Lid beheren')" — same shape as the Assortiment-/
   * Instellingen-tab scenarios above, just for the new third tab
   * (`LedenLijst.tsx`, `src/features/ledenbeheer/`).
   */
  test("beheer (/beheer) Leden-tab (ingelogd) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginAsBeheerder(page);

    await page.getByRole("tab", { name: "Leden" }).click();
    await page
      .getByRole("heading", { name: "Leden" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/ledenbeheer.md → Randgevallen → "A11y", second of the two
   * new overlays. Opened from the Leden-tab's "+ nieuw lid"-button
   * (`NieuwLidOverlay.tsx` — a plain `Overlay.tsx` consumer, same
   * open-dialog-then-scan shape as the bar-shell overlay scenarios below,
   * just reached from the beheer-sessie rather than a started shift).
   */
  test("beheer (/beheer) Nieuw-lid-overlay has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginAsBeheerder(page);

    await page.getByRole("tab", { name: "Leden" }).click();
    await page
      .getByRole("heading", { name: "Leden" })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: "nieuw lid" }).click();

    const dialog = page.getByRole("dialog", { name: "Nieuw lid" });
    await dialog.waitFor({ state: "visible" });

    // Same focus-on-open contract as every Overlay.tsx consumer (see
    // docs/features/bezetting-beheren.md → useShell()-contract).
    await expect(dialog).toBeFocused();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/ledenbeheer.md → Randgevallen → "A11y", the last of the
   * two new overlays. Opened by tapping a lidrij in the Leden-tab
   * (`LidBeherenOverlay.tsx`). Uses "Anna de Vries" — same seeded, non-
   * beheerder lid the stateful bar-shell scenarios below already pick by
   * name (`supabase/seed.sql`) — deliberately not Femke Bos herself (the
   * logged-in beheerder): opening her own row would still open the same
   * overlay markup, but picking a different lid keeps this scenario's
   * fixture choice independent of the self_archive_forbidden/
   * self_demote_forbidden guards (docs/features/ledenbeheer.md →
   * Randgevallen), which this a11y-only scan never exercises anyway (no
   * button here is clicked beyond opening the dialog).
   */
  test("beheer (/beheer) Lid-beheren-overlay has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginAsBeheerder(page);

    await page.getByRole("tab", { name: "Leden" }).click();
    await page
      .getByRole("heading", { name: "Leden" })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: /Anna de Vries/i }).click();

    const dialog = page.getByRole("dialog", { name: "Lid beheren" });
    await dialog.waitFor({ state: "visible" });

    // Same focus-on-open contract as every Overlay.tsx consumer (see
    // docs/features/bezetting-beheren.md → useShell()-contract).
    await expect(dialog).toBeFocused();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/logboek.md (#19) → Randgevallen → "A11y": "Tester moet
   * het bestaande scenario uitbreiden met de Logboek-tab — dezelfde soort
   * toevoeging als bij Instellingen destijds, geen nieuw scenario-type."
   * Same shape as the Assortiment-/Instellingen-/Leden-tab scenarios above,
   * for the new fourth tab (`LogboekLijst.tsx`, `src/features/logboek/`).
   *
   * Two `analyze()` calls in one test rather than a second test — same
   * "one test per screen, several passes as the screen's own state changes"
   * shape as the Dienst-scherm test's open-filter-dropdown second pass
   * above — because the spec's Randgevallen table also calls out the
   * Assortiment-/Leden-filterchip's "Nog niet geregistreerd"-lege-staat (geen
   * databron, geen foutmelding) as a state worth covering here, not a new
   * scenario type of its own.
   */
  test("beheer (/beheer) Logboek-tab (ingelogd) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginAsBeheerder(page);

    await page.getByRole("tab", { name: "Logboek" }).click();
    await page
      .getByRole("heading", { name: "Logboek" })
      .waitFor({ state: "visible", timeout: 15_000 });
    // Wait for the list to settle (rows or an empty state) so the scan
    // doesn't catch the "Logboek laden…" intermediate state — same
    // reasoning as the Dienst-scherm test's "Boekingen laden…" wait above.
    await page
      .getByText("Logboek laden…")
      .waitFor({ state: "hidden", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);

    // Randgevallen → "Assortiment-/Leden-filter aangetikt": geen databron,
    // dus de eerlijke "Nog niet geregistreerd"-lege-staat — geen foutmelding.
    await page.getByRole("button", { name: "Assortiment" }).click();
    await page
      .getByText("Nog niet geregistreerd")
      .waitFor({ state: "visible", timeout: 15_000 });

    const filteredResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(
      filteredResults.violations,
      JSON.stringify(filteredResults.violations, null, 2)
    ).toEqual([]);
  });

  /**
   * docs/features/logboek.md (#19): de Logboek-tab was "beheerder only" en
   * BeheerTabs.tsx bewaakt dat nog. Sinds dienst-per-sessie (ADR 0016) komt een
   * bardienst helemaal niet meer in beheer: `register_bar_session('beheer')`
   * is alleen voor een beheerder, en de modus-keuze biedt hem de tegel niet
   * aan. Dit bewijst dat tegen een echte `bardienst`-sessie (Sanne Bakker,
   * `supabase/seed.sql`): wel "Bar", geen "Beheer".
   */
  test("beheer (/beheer) modus-keuze biedt een bardienst geen Beheer-tegel (#19, dienst-per-sessie)", async ({
    page,
  }) => {
    await loginMetWachtwoord(page, "sanne.bakker@aurora.local", "local-bardienst-dev-only");

    await page
      .getByRole("heading", { name: /^Welkom,/ })
      .waitFor({ state: "visible", timeout: 15_000 });

    await expect(page.getByRole("button", { name: "Bar" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Beheer" })).toHaveCount(0);
  });
});

/**
 * De stateful scenario's van de bar-shell hieronder hebben elk een eigen,
 * verse browsercontext, en dus een eigen persoonlijke sessie (dienst-per-sessie,
 * ADR 0016): geen gedeeld device-account meer, geen koppelcode. Elke test logt
 * in vanaf de namenlijst (`logInOpBar`, e2e/helpers/barLogin.ts) als een
 * seed-bardienst.
 *
 * Er is nog steeds hooguit één open dienst in de database (fase 1 is stand
 * (a), `start_shift` weigert een tweede met `shift_already_open`), en die
 * dienst hoort bij de sessie waarin hij gestart is. Een nieuwe test ziet de
 * dienst van de vorige dus als "Er loopt al een dienst" en kan er niet in
 * werken — tenzij het een beheerder is: die neemt hem over
 * (`admin_take_over_shift`). Daarom werken de scenario's als Femke Bos
 * (beheerder), en `ensureShiftStarted()` start een dienst óf neemt de lopende
 * over. Grouped in `test.describe.serial` so Playwright runs them one after
 * another rather than in separate parallel workers (`fullyParallel: true` in
 * playwright.config.ts) — twee gelijktijdige overnames of starts tegen die ene
 * open dienst zijn racy.
 *
 * Needs a live Supabase instance reachable at build/run time
 * (NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, plus
 * SUPABASE_SECRET_KEY voor de server-side bar-login, src/lib/barLogin.ts) seeded
 * with supabase/seed.sql — see .github/workflows/ci.yml for how CI provisions
 * that.
 */
/**
 * De naamknop van de beheerder waarmee de scenario's werken. Anchored on
 * purpose: StaffPicker's button is named "Femke Bos" (sinds ADR 0017 zonder rol), but since
 * #83 the Verkoop screen's BezettingPil is a button named "Bezetting: Femke
 * Bos — tik om te wijzigen". An unanchored /Femke Bos/ matched that pill.
 */
const STAFF_BUTTON_NAME = FEMKE;

test.describe.serial("stateful bar-shell scenarios (persoonlijke sessies)", () => {
  /**
   * Logt in als Femke Bos en zorgt dat deze sessie in een lopende dienst werkt:
   * start er een ("Training", één van de vier seed-rijen uit
   * 0019_activiteittypes.sql) als er geen loopt, of neemt de lopende over
   * (een beheerder in bar-modus, docs/features/dienst-per-sessie.md → Beheerder).
   * Landt op de Verkoop-tab (docs/features/verkoop.md → Navigatie).
   *
   * Race op de drie landingsstaten in plaats van te raden welke eerst komt (PR
   * #41, run 33012912605): de activiteitkeuze (geen dienst), "Er loopt al een
   * dienst" (een dienst elders), of Verkoop (al een eigen dienst).
   */
  async function ensureShiftStarted(page: Page) {
    await logInOpBar(page, STAFF_BUTTON_NAME, WACHTWOORD_FEMKE);

    const verkoopTab = page.getByRole("tab", { name: "Verkoop" });
    const activitySelect = page.getByRole("combobox", { name: "Activiteit" });
    const overnemen = page.getByRole("region", { name: "Er loopt al een dienst" }).getByRole("button", { name: "Overnemen", exact: true });
    await Promise.race([
      verkoopTab.waitFor({ state: "visible", timeout: 15_000 }),
      activitySelect.waitFor({ state: "visible", timeout: 15_000 }),
      overnemen.waitFor({ state: "visible", timeout: 15_000 }),
    ]);

    if (await overnemen.isVisible()) {
      await overnemen.click();
      const dialog = page.getByRole("dialog", { name: "Dienst overnemen?" });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByRole("button", { name: "Overnemen", exact: true }).click();
    } else if (await activitySelect.isVisible()) {
      await activitySelect.click();
      await page.getByRole("option", { name: "Training" }).click();
    }

    await verkoopTab.waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * The inverse of `ensureShiftStarted()`: logt in als Femke en laat deze sessie
   * met *geen* open dienst achter, zodat `/` de activiteitkeuze toont in plaats
   * van DienstTabs. Sluit een lopende dienst via de echte flows (de eigen dienst
   * via "Dienst afsluiten", een dienst elders via "Afsluiten" van de
   * beheerder), niet via de database: zo kan deze helper niet uit de pas lopen
   * met het gedrag van de app. Op een Playwright-retry in CI (`retries: 1`)
   * staat de dienst van de vorige poging nog open, tegen dezelfde lokale
   * Postgres (#88).
   */
  async function ensureNoOpenShift(page: Page) {
    await logInOpBar(page, STAFF_BUTTON_NAME, WACHTWOORD_FEMKE);

    const verkoopTab = page.getByRole("tab", { name: "Verkoop" });
    const activitySelect = page.getByRole("combobox", { name: "Activiteit" });
    const afsluitenElders = page.getByRole("region", { name: "Er loopt al een dienst" }).getByRole("button", { name: "Afsluiten", exact: true });
    await Promise.race([
      verkoopTab.waitFor({ state: "visible", timeout: 15_000 }),
      activitySelect.waitFor({ state: "visible", timeout: 15_000 }),
      afsluitenElders.waitFor({ state: "visible", timeout: 15_000 }),
    ]);

    if (await activitySelect.isVisible()) return;

    if (await afsluitenElders.isVisible()) {
      await afsluitenElders.click();
    } else {
      await page.getByRole("tab", { name: "Dienst" }).click();
      await page
        .getByRole("heading", { name: "Dienst", exact: true })
        .waitFor({ state: "visible", timeout: 15_000 });
      await page.getByRole("button", { name: "Dienst afsluiten" }).click();
    }

    // Scope the confirm to the dialog: the trigger button behind it has
    // the same accessible name, and Playwright's name matching ignores
    // case, so an unscoped locator would be a strict-mode violation.
    const dialog = page.getByRole("dialog", { name: "Dienst afsluiten" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "dienst afsluiten" }).click();

    await activitySelect.waitFor({ state: "visible", timeout: 15_000 });
  }

  test("T01: e-maillogin zonder PIN start onder eigen naam; refresh, modusguard en uitloggen met open dienst", async ({ page }) => {
    test.setTimeout(60_000);
    // Binnen hetzelfde serial block: fase 1 heeft één globale open dienst.
    await ensureNoOpenShift(page);
    await page.getByRole("button", { name: "Uitloggen", exact: true }).click();
    await expect(page.getByRole("button", { name: TOM })).toBeVisible();

    // Sanne heeft een wachtwoord en geen PIN (de echte lokale seed).
    await loginMetWachtwoord(page, "sanne.bakker@aurora.local", "local-bardienst-dev-only");
    await page.getByRole("button", { name: /^Bar/ }).click();
    await expect(page.getByText("Ingelogd als Sanne Bakker")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Ingelogd als Sanne Bakker")).toBeVisible();
    await page.goto("/beheer");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Ingelogd als Sanne Bakker")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    const start = page.waitForResponse(/\/rpc\/start_shift/);
    const eigenDienst = page.waitForResponse(async (r) =>
      r.url().includes("/rpc/my_bar_state") && r.ok() && (await r.json()).shift?.started_by_name === "Sanne Bakker"
    );
    await page.getByRole("combobox", { name: "Activiteit" }).click();
    await page.getByRole("option", { name: "Training" }).click();
    const antwoord = await start;
    expect(antwoord.ok()).toBe(true);
    expect(Object.keys(antwoord.request().postDataJSON())).toEqual(["p_activity_type_id"]);
    await eigenDienst;
    await expect(page.getByRole("tab", { name: "Verkoop" })).toBeVisible();

    await page.getByRole("button", { name: "Uitloggen", exact: true }).click();
    const keuze = page.getByRole("dialog", { name: "Je dienst loopt nog" });
    await expect(keuze.getByRole("button", { name: "Dienst afsluiten" })).toBeVisible();
    await keuze.getByRole("button", { name: "Open laten en uitloggen" }).click();
    await expect(page.getByRole("button", { name: TOM })).toBeVisible();

    // Een ander account krijgt de modus-keuze opnieuw en ziet de echte
    // servermelding. Open laten sluit de dienst dus niet stilzwijgend.
    await loginMetWachtwoord(page, "femke.bos@aurora.local", WACHTWOORD_FEMKE);
    await page.getByRole("button", { name: /^Bar/ }).click();
    await expect(page.getByText("Ingelogd als Femke Bos")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dienst zonder apparaat" })).toBeVisible();
    const elders = page.getByRole("region", { name: "Er loopt al een dienst" });
    await expect(elders).toContainText("Sanne Bakker");
    await elders.getByRole("button", { name: "Afsluiten", exact: true }).click();
    await page.getByRole("dialog", { name: "Dienst afsluiten" }).getByRole("button", { name: "dienst afsluiten" }).click();
    await expect(page.getByRole("combobox", { name: "Activiteit" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dienst zonder apparaat" })).toHaveCount(0);
  });

  test("T01: twee persoonlijke sessies starten gelijktijdig hooguit één dienst", async ({ page, browser, baseURL }) => {
    test.setTimeout(60_000);
    await ensureNoOpenShift(page);
    const contexts = [await browser.newContext({ baseURL }), await browser.newContext({ baseURL })];
    try {
      const paginas = [await contexts[0].newPage(), await contexts[1].newPage()];
      let aantal = 0;
      let vrijgeven!: () => void;
      const beideOnderweg = new Promise<void>((resolve) => { vrijgeven = resolve; });
      for (const [i, p] of paginas.entries()) {
        await loginMetWachtwoord(p, i === 0 ? "sanne.bakker@aurora.local" : "tom.willems@aurora.local",
          i === 0 ? "local-bardienst-dev-only" : WACHTWOORD_TOM);
        await p.getByRole("button", { name: /^Bar/ }).click();
        await p.getByRole("combobox", { name: "Activiteit" }).click();
        // Houd alleen de verzending tegen; Auth, RPC en database zijn echt.
        await p.route(/\/rpc\/start_shift/, async (route) => {
          if (++aantal === 2) vrijgeven();
          await beideOnderweg;
          await route.continue();
        });
      }
      const antwoorden = paginas.map((p) => p.waitForResponse(/\/rpc\/start_shift/));
      await Promise.all(paginas.map((p) => p.getByRole("option", { name: "Training" }).click()));
      const resultaten = await Promise.all(antwoorden);
      expect(resultaten.filter((r) => r.ok())).toHaveLength(1);
      const geweigerd = resultaten.find((r) => !r.ok());
      expect(geweigerd).toBeDefined();
      expect((await geweigerd!.json()).message).toBe("shift_already_open");
      const winnaar = paginas[resultaten.findIndex((r) => r.ok())];
      const verliezer = paginas[resultaten.findIndex((r) => !r.ok())];
      await expect(winnaar.getByRole("tab", { name: "Verkoop" })).toBeVisible();
      await expect(verliezer.getByRole("region", { name: "Er loopt al een dienst" })).toBeVisible();
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      // Ook een mislukte/retried test laat geen dienst voor andere tests staan.
      await page.context().clearCookies();
      await ensureNoOpenShift(page);
    }
  });

  test("T02: echte bezetting biedt medewerkers zonder PIN aan en bewaart de servercrew", async ({ page }) => {
    await ensureNoOpenShift(page);
    await page.getByRole("combobox", { name: "Activiteit" }).click();
    await page.getByRole("option", { name: "Training" }).click();
    await page.getByRole("tab", { name: "Dienst" }).click();
    await page.getByRole("button", { name: "Bezetting wijzigen", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Bezetting van deze dienst" });
    // De lokale seed: Tom met PIN, Sanne/Femke zonder PIN, Anna gewoon lid.
    const sanne = dialog.getByRole("button", { name: /^Sanne Bakker, bardienst/ });
    await expect(sanne).toHaveAttribute("aria-pressed", "false");
    await expect(dialog.getByRole("button", { name: /^Tom Willems, bardienst/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Femke Bos, beheerder/ })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("button", { name: /^Anna de Vries/ })).toHaveCount(0);
    const add = page.waitForResponse(/\/rpc\/add_shift_member/);
    await sanne.click();
    const added = await add;
    expect(added.ok()).toBe(true);
    await expect(sanne).toHaveAttribute("aria-pressed", "true");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    const remove = page.waitForResponse(/\/rpc\/remove_shift_member/);
    await sanne.click();
    const removed = await remove;
    expect(removed.ok()).toBe(true);
    expect(removed.request().postDataJSON()).toEqual(added.request().postDataJSON());
    await expect(sanne).toHaveAttribute("aria-pressed", "false");
    await dialog.getByRole("button", { name: "Klaar", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Bezetting:/ })).toHaveAccessibleName("Bezetting: Femke Bos — tik om te wijzigen");
  });

  /**
   * docs/features/dienst-per-sessie.md → Schermflow punt 2: het inlogscherm
   * na een tik op een naam. Op een apparaat zonder apparaatcookie (elke test
   * begint met een verse context) kan alleen het wachtwoord: het veld, de
   * uitleg waarom de pincode hier nog niet kan, en "Wachtwoord vergeten?".
   */
  test("bar shell (/) inlogscherm met wachtwoord has no WCAG2A/AA violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: FEMKE }).click();
    await page.locator('input[type="password"]').waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /** Schermflow punt 2 → "Wachtwoord vergeten?": de aanvraagweergave vanaf de
   *  namenlijst. Er wordt niets verstuurd; alleen de weergave wordt gescand. */
  test("bar shell (/) wachtwoord vergeten vanaf de namenlijst has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: FEMKE }).click();
    await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
    await page
      .getByRole("button", { name: "Stuur herstellink" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/activiteittypes.md (#18) → Randgevallen → "A11y van de nieuwe
   * ... activiteitkeuze-stap in dienst-starten": ActiviteitKeuze.tsx, sinds
   * dienst-per-sessie de enige stap na de login (geen PIN-stap meer). Deliberately
   * doesn't pick an activity (that would start a shift as a side effect of an
   * a11y-only scan). `ensureNoOpenShift()` closes any leftover shift first
   * (#88).
   */
  test("bar shell (/) activiteitkeuze-stap (dienst starten) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureNoOpenShift(page);

    const activitySelect = page.getByRole("combobox", { name: "Activiteit" });
    // Scan met het menu open: de listbox en haar opties tellen dan mee
    // (dicht is de listbox `display: none` en slaat axe haar over).
    await activitySelect.click();
    await page
      .getByRole("listbox", { name: "Activiteit" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/dienst-per-sessie.md → Schermflow punt 3: "Verder als {naam}?"
   * na browser dicht en weer open. Een sessie zonder het sessiecookie
   * `abas_bar_bevestigd` (ADR 0017) is nog niet bevestigd; het cookie wissen en
   * herladen simuleert dat. Femke Bos heeft een tweede factor, dus haar
   * bar-sessie is te hervatten. Scant het hervatscherm zelf en bewijst dat
   * "Verder" de gewone schermen teruggeeft.
   */
  test("bar shell (/) hervatscherm (Verder als …) has no WCAG2A/AA violations", async ({ page }) => {
    await ensureNoOpenShift(page);

    await page.context().clearCookies({ name: "abas_bar_bevestigd" });
    await page.reload();

    await page
      .getByRole("heading", { name: /^Verder als / })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);

    await page.getByRole("button", { name: "Verder", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Activiteit" })
      .waitFor({ state: "visible", timeout: 15_000 });
  });

  /**
   * docs/features/dienst-per-sessie.md → Inloggen op de bar, punt 4 en ADR 0016
   * → Beslissing 7: de PIN werkt alleen op een apparaat waar het lid eerder met
   * het wachtwoord inlogde. Tom Willems (bardienst, PIN 1234 in supabase/seed.sql)
   * logt eerst met zijn wachtwoord in, logt uit, en tikt daarna weer op zijn
   * naam: nu verschijnt de pincode-invoer (`PinPad`), die als enige interactieve
   * bar-scherm zonder scan zou zijn. Scant de pad in zijn lege staat en tikt
   * geen cijfers: een vierde cijfer logt in.
   */
  test("bar shell (/) pincode-invoer op een vertrouwd apparaat has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await logInOpBar(page, TOM, WACHTWOORD_TOM);
    await page.getByRole("button", { name: "Uitloggen" }).waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: "Uitloggen" }).click();

    await page.getByRole("button", { name: TOM }).waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: TOM }).click();

    await page
      .getByRole("button", { name: "Cijfer 1" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/dienst-per-sessie.md → Teksten → Dienst loopt op een ander
   * apparaat: een bardienst die inlogt terwijl er elders een dienst loopt, ziet
   * "Er loopt al een dienst" en kan er niets mee (alleen een beheerder neemt over
   * of sluit af). Femke start de dienst in de ene context, Tom logt in de andere
   * in.
   */
  test("bar shell (/) 'Er loopt al een dienst' voor een bardienst has no WCAG2A/AA violations", async ({
    page,
    browser,
  }) => {
    await ensureShiftStarted(page);

    const tweedeContext = await browser.newContext();
    try {
      const tom = await tweedeContext.newPage();
      await logInOpBar(tom, TOM, WACHTWOORD_TOM);
      await tom
        .getByRole("heading", { name: "Er loopt al een dienst" })
        .waitFor({ state: "visible", timeout: 15_000 });
      await expect(tom.getByRole("button", { name: "Overnemen", exact: true })).toHaveCount(0);

      const results = await new AxeBuilder({ page: tom })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      expect(results.violations, JSON.stringify(results.violations, null, 2))
        .toEqual([]);
    } finally {
      await tweedeContext.close();
    }
  });

  /**
   * docs/features/dienst-per-sessie.md → Teksten → Overnemen: de beheerder op
   * een ander apparaat ziet "Overnemen" en "Afsluiten", en de overname-dialoog
   * ("Dienst overnemen?") is een echte `Overlay`. Scant de dialoog open en
   * annuleert, zodat de dienst blijft staan.
   */
  test("bar shell (/) overnemen-dialoog has no WCAG2A/AA violations", async ({ page, browser }) => {
    await ensureShiftStarted(page);

    const tweedeContext = await browser.newContext();
    try {
      const femke = await tweedeContext.newPage();
      await logInOpBar(femke, FEMKE, WACHTWOORD_FEMKE);
      await femke.getByRole("button", { name: "Overnemen", exact: true }).click();

      const dialog = femke.getByRole("dialog", { name: "Dienst overnemen?" });
      await dialog.waitFor({ state: "visible" });
      await expect(dialog).toBeFocused();

      const results = await new AxeBuilder({ page: femke })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      expect(results.violations, JSON.stringify(results.violations, null, 2))
        .toEqual([]);

      await dialog.getByRole("button", { name: "Annuleren" }).click();
    } finally {
      await tweedeContext.close();
    }
  });

  /**
   * docs/features/bezetting-beheren.md (#7) → Randgevallen → "A11y-dekking
   * van de overlay zelf": this app's first real interactive overlay
   * (src/components/Overlay.tsx — role="dialog", aria-modal, focus-trap,
   * Escape/backdrop-close), opened from
   * src/features/bezetting-beheren/DienstActief.tsx via the "Bezetting
   * wijzigen" button. The routes above only scan static/error-state pages —
   * this drives the app into a real open-dialog state before scanning so the
   * modal itself is under the WCAG-AA gate, not just its trigger.
   */
  test("bar shell (/) bezetting-overlay has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureShiftStarted(page);

    // Since #8 (docs/features/verkoop.md → Navigatie), a started/open shift
    // lands on the Verkoop tab by default — DienstActief now lives under the
    // Dienst tab, not shown directly.
    await page.getByRole("tab", { name: "Dienst" }).click();

    await page
      .getByRole("heading", { name: "Dienst", exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: "Bezetting wijzigen" }).click();

    const dialog = page.getByRole("dialog", { name: "Bezetting van deze dienst" });
    await dialog.waitFor({ state: "visible" });

    // Required behaviour per docs/features/bezetting-beheren.md →
    // useShell()-contract: focus moves into the dialog on open.
    await expect(dialog).toBeFocused();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/dienst-afsluiten.md (#12) → Randgevallen → "A11y van de
   * nieuwe overlay in het algemeen" / "e2e/a11y.spec.ts's bestaande
   * ensureShiftStarted()-helper": this screen's newest interactive overlay
   * (DienstAfsluitenOverlay.tsx — the fourth real consumer of
   * src/components/Overlay.tsx). Opens via the "Dienst afsluiten"-button
   * next to "Bezetting wijzigen" on the same Dienst-tab as the
   * bezetting-overlay test above. Deliberately does **not** click the
   * overlay's own "dienst afsluiten"-confirm button — that would actually
   * call end_shift and close the shared session's open shift, which the
   * later stateful tests in this block don't need and shouldn't have to
   * tolerate as a side effect of an a11y scan; `ensureShiftStarted()` would
   * recover either way (see its own comment), but scanning the open dialog
   * is the whole point here, not exercising the RPC (that's
   * end_shift.test.sql's job, supabase/tests/).
   */
  test("bar shell (/) dienst-afsluiten-overlay has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureShiftStarted(page);

    await page.getByRole("tab", { name: "Dienst" }).click();

    await page
      .getByRole("heading", { name: "Dienst", exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: "Dienst afsluiten" }).click();

    const dialog = page.getByRole("dialog", { name: "Dienst afsluiten" });
    await dialog.waitFor({ state: "visible" });

    // Same focus-on-open contract as every Overlay.tsx consumer (see
    // docs/features/bezetting-beheren.md → useShell()-contract).
    await expect(dialog).toBeFocused();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/dialogen-tabs-landmarks.md (#125, F28) → Teststrategie →
   * Axe: de actieve Verkoop- en Dienst-weergave en een open dialoog, met de
   * best-practice-regels `landmark-one-main` en `region` niet uitgezet.
   * Dezelfde scans draaien gemockt in e2e/dialogen-tabs-landmarks.spec.ts.
   */
  test("bar shell (/) Verkoop, Dienst en open dialoog: één main, geen region-melding (#125)", async ({
    page,
  }) => {
    await ensureShiftStarted(page);

    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .withRules(["landmark-one-main", "region"])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    };

    const product = page.getByRole("button", { name: /^Pils,/ });
    await product.waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.locator("main")).toHaveCount(1);
    await scan();

    await product.click();
    await page.getByLabel("Zoek lid op naam").fill("Anna");
    const memberOption = page.getByRole("option", { name: /Anna de Vries/i });
    await memberOption.waitFor({ state: "visible", timeout: 15_000 });
    await memberOption.click();
    await page.getByRole("button", { name: "Tik afrekenen" }).click();
    const checkout = page.getByRole("dialog", { name: /^Afrekenen bij/ });
    await checkout.waitFor({ state: "visible" });
    await scan();
    await checkout.getByRole("button", { name: "annuleren" }).click();
    await checkout.waitFor({ state: "hidden" });

    await page.getByRole("tab", { name: "Dienst" }).click();
    await page
      .getByRole("heading", { name: "Dienst", exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.locator("main")).toHaveCount(1);
    await scan();
  });

  /**
   * docs/features/dienst-overzicht.md → Randgevallen → "A11y": the
   * Dienst-scherm itself (DienstActief.tsx — omzetkaart,
   * transactielijst, bezettingspaneel) with no dialog open. The two
   * overlay tests above only scan it behind an open dialog. Places one
   * real order first (one Pils on seeded "Anna de Vries", €12,40) so the
   * transactielijst has a row and the "geboekt door"-filter renders — on
   * a clean CI database a fresh shift has no bookings, and without this
   * the open-dropdown scan below would never run (Codex review on #82).
   * The filter's option list only renders while open, so it's opened and
   * scanned as a second pass.
   */
  test("bar shell (/) Dienst-scherm has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureShiftStarted(page);

    const product = page.getByRole("button", { name: /^Pils,/ });
    await product.waitFor({ state: "visible", timeout: 15_000 });
    await product.click();
    await page.getByLabel("Zoek lid op naam").fill("Anna");
    const memberOption = page.getByRole("option", { name: /Anna de Vries/i });
    await memberOption.waitFor({ state: "visible", timeout: 15_000 });
    await memberOption.click();
    await page.getByRole("button", { name: "Tik afrekenen" }).click();
    const checkout = page.getByRole("dialog", { name: /^Afrekenen bij/ });
    await checkout.waitFor({ state: "visible" });
    await checkout.getByRole("button", { name: "ja, afrekenen" }).click();
    await checkout.waitFor({ state: "hidden", timeout: 15_000 });

    await page.getByRole("tab", { name: "Dienst" }).click();
    await page
      .getByRole("heading", { name: "Dienst", exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });
    // Wait for the ledger to settle (either rows or the empty state) so
    // the scan doesn't catch the "Boekingen laden…" intermediate state.
    await page
      .getByText("Boekingen laden…")
      .waitFor({ state: "hidden", timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);

    const personFilter = page.getByRole("button", { name: /^Geboekt door:/ });
    await expect(personFilter).toBeVisible();
    await personFilter.click();
    await page
      .getByRole("button", { name: /^Iedereen/ })
      .waitFor({ state: "visible" });

    const openResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      openResults.violations,
      JSON.stringify(openResults.violations, null, 2)
    ).toEqual([]);
  });

  /**
   * docs/features/bestelling-terugdraaien.md → Bar: de ⤺ in de
   * transactielijst, de terugdraai-overlay (TerugdraaienOverlay.tsx — een
   * Overlay.tsx-consument) en het resultaat op het Dienst-scherm, tegen de
   * echte reverse_order_at_bar. Rekent eerst zelf een Pils af op "Anna de
   * Vries", zodat er altijd een nog niet teruggedraaide bestelling van deze
   * dienst is — ook op een retry, waar eerdere bestellingen van dezelfde
   * dienst al teruggedraaid kunnen zijn. Draait daarna écht terug: dat
   * boekt het bedrag terug op Anna's saldo, dus de latere tests (die op
   * haar saldo leunen) houden hun marge.
   */
  test("bar shell (/) bestelling terugdraaien has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureShiftStarted(page);

    const product = page.getByRole("button", { name: /^Pils,/ });
    await product.waitFor({ state: "visible", timeout: 15_000 });
    await product.click();
    await page.getByLabel("Zoek lid op naam").fill("Anna");
    const memberOption = page.getByRole("option", { name: /Anna de Vries/i });
    await memberOption.waitFor({ state: "visible", timeout: 15_000 });
    await memberOption.click();
    await page.getByRole("button", { name: "Tik afrekenen" }).click();
    const checkout = page.getByRole("dialog", { name: /^Afrekenen bij/ });
    await checkout.waitFor({ state: "visible" });
    await checkout.getByRole("button", { name: "ja, afrekenen" }).click();
    await checkout.waitFor({ state: "hidden", timeout: 15_000 });

    await page.getByRole("tab", { name: "Dienst" }).click();
    await page
      .getByRole("heading", { name: "Dienst", exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Nieuwste eerst: de eerste ⤺ voor Anna is de zojuist afgerekende.
    await page
      .getByRole("button", { name: /^Bestelling terugdraaien: Anna de Vries/ })
      .first()
      .click();

    const dialog = page.getByRole("dialog", { name: "Bestelling terugdraaien" });
    await dialog.waitFor({ state: "visible" });
    await expect(dialog).toBeFocused();
    await expect(dialog.getByRole("button", { name: "terugdraaien", exact: true })).toBeDisabled();
    await dialog.getByLabel("Reden").fill("a11y-test: verkeerd lid getikt");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);

    // Femke staat alleen in de bezetting (zie de afrekenbevestiging-test
    // hieronder), dus geen keuze nodig: de knop is nu actief.
    await dialog.getByRole("button", { name: "terugdraaien", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 15_000 });

    await expect(page.getByText(/^Bestelling teruggedraaid · /)).toBeVisible();
    await expect(page.getByText(/^\d+ correcties? deze dienst$/)).toBeVisible();
    await expect(page.getByText("TERUG").first()).toBeVisible();
  });

  /**
   * docs/features/verkoop.md (#8) → Randgevallen → "A11y van de
   * afrekenbevestiging": this screen's other new interactive overlay (the
   * afrekenbevestiging, AfrekenenOverlay.tsx — the second real consumer of
   * src/components/Overlay.tsx). Builds a one-line cart, picks a member,
   * and taps "Tik afrekenen" to open the confirmation before scanning —
   * same shape as the bezetting-overlay test above, just for the verkoop
   * screen's own dialog.
   *
   * Picker coverage: per the spec, the "Wie geeft uit?"-picker inside this
   * dialog is only rendered once the bezetting is 2+ (docs/features/
   * verkoop.md → Schermflow §3 / Randgevallen). The demo account used here
   * ("Femke Bos") starts (or takes over) a shift alone and this suite never adds a second
   * crew member, so against supabase/seed.sql the bezetting stays at 1 and
   * this test exercises the auto-toewijzing path (no picker), not the 2+
   * picker-visible path — noted explicitly per tester.md rather than
   * silently assumed covered. The picker's own markup (a `<fieldset>`/
   * `<legend>` with `aria-pressed` toggle buttons, see AfrekenenOverlay.tsx)
   * is still exercised indirectly by the bezetting-overlay test's roster
   * markup conventions, but not scanned in this specific 2+ state — that
   * would need seeding a second bar/beheer member into the bezetting first,
   * which no current fixture/test in this suite does.
   */
  test("bar shell (/) afrekenbevestiging has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureShiftStarted(page);
    // Verkoop is already the active/default tab (docs/features/verkoop.md
    // → Navigatie) — nothing to click to get here.

    const product = page.getByRole("button", { name: /^Pils,/ });
    await product.waitFor({ state: "visible", timeout: 15_000 });
    await product.click();

    await page.getByLabel("Zoek lid op naam").fill("Anna");
    const memberOption = page.getByRole("option", { name: /Anna de Vries/i });
    await memberOption.waitFor({ state: "visible", timeout: 15_000 });
    await memberOption.click();

    const checkoutButton = page.getByRole("button", { name: "Tik afrekenen" });
    await expect(checkoutButton).toBeEnabled();
    await checkoutButton.click();

    const dialog = page.getByRole("dialog", { name: /^Afrekenen bij/ });
    await dialog.waitFor({ state: "visible" });

    // Same focus-on-open contract as every Overlay.tsx consumer (see
    // docs/features/bezetting-beheren.md → useShell()-contract).
    await expect(dialog).toBeFocused();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/opwaarderen.md (#10) → Randgevallen → "A11y van de
   * opwaardeer-overlay": this screen's own new interactive overlay (the
   * opwaardeer-overlay, OpwaarderenOverlay.tsx — the third real consumer of
   * src/components/Overlay.tsx). Picks a member and taps "saldo
   * opwaarderen" on the member card to open it before scanning — same
   * shape as the afrekenbevestiging test above.
   *
   * Picker coverage: same known gap as the afrekenbevestiging test — the
   * demo account used here starts a shift alone, so the bezetting stays at
   * 1 for this suite and this test exercises the auto-toewijzing path (no
   * "Wie geeft uit?"-picker), not the 2+ picker-visible path. Noted
   * explicitly per tester.md rather than silently assumed covered.
   */
  test("bar shell (/) opwaardeerscherm has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureShiftStarted(page);
    // Verkoop is already the active/default tab.

    await page.getByLabel("Zoek lid op naam").fill("Anna");
    const memberOption = page.getByRole("option", { name: /Anna de Vries/i });
    await memberOption.waitFor({ state: "visible", timeout: 15_000 });
    await memberOption.click();

    const topupButton = page.getByRole("button", { name: "saldo opwaarderen" });
    await expect(topupButton).toBeEnabled();
    await topupButton.click();

    const dialog = page.getByRole("dialog", { name: /^Saldo opwaarderen bij/ });
    await dialog.waitFor({ state: "visible" });

    // Same focus-on-open contract as every Overlay.tsx consumer (see
    // docs/features/bezetting-beheren.md → useShell()-contract).
    await expect(dialog).toBeFocused();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });

  /**
   * docs/features/opwaarderen.md (#10) → Schermflow §1: the second trigger
   * into the same overlay, from the onvoldoende-saldo-banner rather than
   * the member card. Builds a cart that exceeds the member's balance
   * (negative_limit_cents is 0 in supabase/seed.sql, so any purchase
   * beyond the raw balance already triggers it) and confirms the banner's
   * "opwaarderen" button opens the same dialog.
   */
  test("onvoldoende-saldo-banner opens the same opwaardeeroverlay", async ({
    page,
  }) => {
    await ensureShiftStarted(page);

    await page.getByLabel("Zoek lid op naam").fill("Anna");
    const memberOption = page.getByRole("option", { name: /Anna de Vries/i });
    await memberOption.waitFor({ state: "visible", timeout: 15_000 });
    await memberOption.click();

    // Tap the same product repeatedly until the onvoldoende-saldo-banner
    // shows — cheaper than reading Anna's exact seeded balance/price here.
    const product = page.getByRole("button", { name: /^Pils,/ });
    await product.waitFor({ state: "visible", timeout: 15_000 });
    const banner = page.getByText(/Onvoldoende saldo/);
    for (let i = 0; i < 50 && !(await banner.isVisible()); i++) {
      await product.click();
    }
    await banner.waitFor({ state: "visible", timeout: 15_000 });

    // exact: true — "saldo opwaarderen" (de ledenkaart-knop, ook zichtbaar
    // hier) matcht anders ook als substring op deze niet-exacte naam.
    await page.getByRole("button", { name: "opwaarderen", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: /^Saldo opwaarderen bij/ });
    await dialog.waitFor({ state: "visible" });
    await expect(dialog).toBeFocused();
  });

  /**
   * docs/features/dienst-te-lang-open.md → Testgevallen → check:a11y: de
   * melding "Dienst staat nog open" (DienstTeLangOpenMelding.tsx, een
   * Overlay.tsx-consument). `started_at` in de database blijft staan; de
   * browserklok gaat met Playwright's `page.clock` ruim 6 uur vooruit.
   * Tikt na de scan "Nog bezig", zodat de dienst hier niet met een open
   * melding achterblijft (elke volgende test krijgt sowieso een verse
   * pagina met de echte klok).
   */
  test("bar shell (/) dienst-te-lang-open-melding has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await page.clock.install();
    await ensureShiftStarted(page);

    // Ook een dienst die een eerdere test in dit block net startte, staat
    // na deze sprong meer dan 6 uur open.
    await page.clock.fastForward("06:05:00");

    const dialog = page.getByRole("dialog", { name: "Dienst staat nog open" });
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    await expect(dialog).toBeFocused();
    await expect(dialog).toHaveAccessibleDescription(/^Deze dienst staat al \d+ uur open\. Klopt dat\?$/);

    // De login-klikken laten de muis achter waar de melding straks zijn
    // knoppen heeft; `hover:bg-accent` op "Dienst afsluiten" geeft dan een
    // contrast van 3,42 in plaats van dat van de rustkleur.
    await page.mouse.move(0, 0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);

    await dialog.getByRole("button", { name: "Nog bezig" }).click();
    await expect(dialog).toBeHidden();
  });
});
