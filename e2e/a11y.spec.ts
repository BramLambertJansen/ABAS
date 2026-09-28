import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginMetWachtwoord, portalLoginMetWachtwoord } from "./helpers/supabaseMock";
import { koppelTablet, koppelformulier, openKoppelscherm } from "./helpers/tabletKoppelen";

/**
 * The WCAG-AA gate CLAUDE.md calls for: axe-core against every shell's
 * scaffold entry point. Add a route here the moment a real screen lands —
 * this list is meant to grow with the app, not stay at two placeholder
 * pages. See docs/ARCHITECTURE.md → Verificatie for how this fits
 * npm run check:all.
 */
const routes = [
  // docs/features/tablet-koppelen.md → e2e en CI: zonder koppeling stuurt
  // de middleware `/` door naar `/koppel`, dus dat scherm staat hier. Het
  // gekoppelde `/` wordt gescand in het stateful block hieronder
  // (activiteitkeuze, pincode, Verkoop, …).
  { name: "tablet koppelen", path: "/koppel" },
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
/**
 * docs/features/tablet-koppelen.md → Testplan → "A11y": de foutstaat van
 * het koppelscherm (melding in role="alert", veld leeg met focus) als eigen
 * scan. Leunt niet op de schermteksten, alleen op rol.
 */
test("tablet koppelen (/koppel) foutstaat na een verkeerde code has no WCAG2A/AA violations", async ({
  page,
}) => {
  await openKoppelscherm(page);
  const formulier = koppelformulier(page);
  await formulier.getByRole("textbox").fill("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-A");
  await formulier.getByRole("button").click();
  await expect(formulier.getByRole("alert")).toHaveText(/\S/);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations, JSON.stringify(results.violations, null, 2))
    .toEqual([]);
});

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
   * losse toggle. Scant eerst de "Deze maand"-lege-staat op het al open
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
 */
async function loginAsBeheerder(page: Page) {
  await loginMetWachtwoord(page, "femke.bos@aurora.local", "local-beheerder-dev-only");

  const beheerTegel = page.getByRole("button", { name: "Beheer" });
  await beheerTegel.waitFor({ state: "visible", timeout: 15_000 });
  await beheerTegel.click();

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

/**
 * docs/features/logboek.md (#19) → Randgevallen: signs in as the seeded
 * `bardienst` e-mail/wachtwoord account (Sanne Bakker, `supabase/seed.sql`)
 * and clicks through to `BeheerTabs`, same shape as `loginAsBeheerder()`
 * above but for the other role `useBeheerSession.ts` accepts into
 * `/beheer`. Not `role="beheerder"`: BeheerTabs.tsx renders the Logboek tab
 * only for that role, and this helper exists specifically to prove the
 * opposite case genuinely reaches the tabbalk (Assortiment/Leden/
 * Instellingen) without Logboek, rather than being denied outright by
 * `useBeheerSession.ts` — a `bardienst` session is a fully accepted
 * "signed-in" state there (ADR 0005), not a "denied" one.
 */
async function loginAsBardienst(page: Page) {
  await loginMetWachtwoord(page, "sanne.bakker@aurora.local", "local-bardienst-dev-only");

  const beheerTegel = page.getByRole("button", { name: "Beheer" });
  await beheerTegel.waitFor({ state: "visible", timeout: 15_000 });
  await beheerTegel.click();

  await page
    .getByRole("tablist", { name: "Beheer-navigatie" })
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
   * docs/features/auth-methode-per-lid.md (#42) → Randgevallen → "A11y" (b):
   * the new "Mijn account"-overlay/PIN-toggle (`MijnAccountOverlay.tsx`),
   * opened from `ModusKeuze.tsx`'s "Mijn account"-knop — this app's fifth
   * real `Overlay.tsx` consumer. Scans the "geen pincode ingesteld"-staat
   * (Femke Bos, the seeded beheerder used here, has no `pin_hash` set in
   * `supabase/seed.sql`), i.e. the invoerveld-variant of the overlay rather
   * than the "pincode uitzetten"-knop-variant — both variants share the same
   * `Overlay.tsx` chrome/markup already scanned elsewhere in this file, the
   * form-vs-button difference is the part unique to this scenario.
   */
  test("beheer (/beheer) Mijn-account-overlay has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await loginToModusKeuze(page);

    await page.getByRole("button", { name: "Mijn account" }).click();

    const dialog = page.getByRole("dialog", { name: "Mijn account" });
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
   * Assortiment-/Leden-filterchip's "Nog niets vastgelegd"-lege-staat (geen
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
    // dus de "Nog niets vastgelegd"-lege-staat — geen foutmelding.
    await page.getByRole("button", { name: "Assortiment" }).click();
    await page
      .getByText("Nog niets vastgelegd")
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
   * docs/features/logboek.md (#19) → Randgevallen: "beheerder only" was
   * previously only claimed in the spec, never enforced — BeheerTabs.tsx
   * now gates the Logboek tab on `role === "beheerder"` (commit ab7dfe6),
   * with `role` threaded through from `useBeheerSession.ts`. This proves
   * that structurally, against a genuine `bardienst` session
   * (`loginAsBardienst()`, Sanne Bakker — `supabase/seed.sql`), not by
   * inspecting the source.
   *
   * Asserts absence via `.getByRole("tab", { name: "Logboek" })` +
   * `toHaveCount(0)` — the tab button isn't in the DOM at all for this
   * role (no `hidden`/`display: none` toggle to check instead, see
   * BeheerTabs.tsx's `{role === "beheerder" && (...)}` guard). Also
   * confirms the other three tabs (Assortiment/Leden/Instellingen) ARE
   * present for this same session, so this test actually distinguishes
   * "correctly scoped to one missing tab" from "everything broken/empty" —
   * an empty tablist would otherwise also make the Logboek-absence
   * assertion pass for the wrong reason. Not an axe scan itself (no new
   * screen state beyond what the Assortiment-/Leden-/Instellingen-tab
   * tests above already cover) — this is the role-gate's own regression
   * test, not a duplicate a11y pass.
   */
  test("beheer (/beheer) Logboek-tab is genuinely absent for a bardienst session (#19)", async ({
    page,
  }) => {
    await loginAsBardienst(page);

    await expect(page.getByRole("tab", { name: "Assortiment" })).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Leden" })).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Instellingen" })).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Logboek" })).toHaveCount(0);
  });
});

/**
 * Both scenarios below need a shift already open on the shared bar-tablet
 * session before they can reach their target screen — there is exactly one
 * "current open shift" (docs/ARCHITECTURE.md → "Shared bar-tablet session
 * mechanism"), not scoped per browser/page; since #29 `start_shift` refuses
 * a second open shift (`shift_already_open`). Grouped in
 * `test.describe.serial` so Playwright runs them one after another rather
 * than in separate parallel workers (`fullyParallel: true` in
 * playwright.config.ts) — two concurrent `start_shift`/`place_order` calls
 * against that shared "one open shift" state would be racy
 * (whichever finishes last "wins" as the shift the other test's page
 * observes, independent of which test's assertions expect it).
 * `ensureShiftStarted()` below also tolerates a shift that's already open
 * from an earlier test in the block, or one left running by a previous
 * failed attempt on the *same* commit (Playwright retries in CI reuse the
 * same local Postgres, only the browser context is fresh) — so this suite
 * doesn't additionally assume a specific run order beyond "not interleaved
 * with itself".
 *
 * Needs a live Supabase instance reachable at build/run time
 * (NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_DEVICE_EMAIL/PASSWORD, plus BAR_DEVICE_SECRET for the koppeling
 * each test starts with — ADR 0011) seeded with supabase/seed.sql — see
 * docs/ARCHITECTURE.md → "Local/CI device account" for how CI provisions
 * that. Confirmed actually passing in real CI as of PR #40 (merged
 * 2026-08-26), which also fixed two pre-existing bugs (`useOpenShift`'s
 * PGRST201 embed ambiguity, a WCAG-AA contrast gap in the `accent` design
 * token) that this test was the first thing in the repo to ever reach far
 * enough to surface.
 */
/**
 * The stafkeuze-knop for the demo bardienst account. Anchored on purpose:
 * StaffPicker's button is named "Tom Willems, bardienst", but since #83 the
 * Verkoop screen's BezettingPil is a button named "Bezetting: Tom Willems —
 * tik om te wijzigen". An unanchored /Tom Willems/ matched that pill as
 * soon as the bezetting loaded, so ensureShiftStarted()/ensureNoOpenShift()
 * took the "no shift open" branch with a shift actually open — timing-
 * dependent, and it failed PR #82's CI run.
 */
const STAFF_BUTTON_NAME = /^Tom Willems\b/;

test.describe.serial("stateful bar-shell scenarios (shared session)", () => {
  // docs/features/tablet-koppelen.md → e2e en CI: elke test krijgt een
  // verse browsercontext, dus zonder koppeling geen abas_tablet-cookie en
  // geen device-sessie. Eén formulier-POST per test via de echte flow.
  test.beforeEach(async ({ page }) => {
    await koppelTablet(page);
  });

  /** Starts a shift as the demo "Tom Willems" bardienst account (PIN 1234,
   *  per seed.sql's comment: "Demo PIN for every bar/beheer member below is
   *  1234") if none is open yet on this shared session, or reuses whichever
   *  shift is already open (e.g. left open by an earlier test in this
   *  block). Note: since #12 (docs/features/dienst-afsluiten.md) there *is*
   *  an end_shift UI (the "Dienst afsluiten"-overlay, scanned in its own
   *  test below) — this helper itself only ever starts a shift, it never
   *  closes one, so a shift left open by an earlier test in this block is
   *  still the expected/reused case here, not a stale assumption. Lands on
   *  the Verkoop tab either way (docs/features/verkoop.md → Navigatie:
   *  Verkoop is the default tab after start / on an already-open shift).
   *
   *  Updated for #18 (docs/features/activiteittypes.md): `start_shift` now
   *  requires an activity type, and DienstStarten.tsx inserted a new
   *  activiteitkeuze-stap (ActiviteitKeuze.tsx) between the staff picker and
   *  the PIN pad — tapping the staff button no longer lands directly on
   *  PinPad. "Training" is one of the four seed rows
   *  (0019_activiteittypes.sql; supabase/seed.sql doesn't override them).
   *  Without this step the PIN digits below would be typed into a screen
   *  that doesn't exist yet, and every test using this helper would time
   *  out waiting for the Verkoop tab. */
  async function ensureShiftStarted(page: Page) {
    await page.goto("/");

    const verkoopTab = page.getByRole("tab", { name: "Verkoop" });
    const staffButton = page.getByRole("button", { name: STAFF_BUTTON_NAME });

    // A short isVisible()-with-timeout pre-check here was racy in CI: on a
    // slower/cold navigation, hydration can take longer than a couple of
    // seconds, so a too-short check would give up and wrongly assume no
    // shift is open — then wait 15s for a staff button that, with a shift
    // actually already open, never renders (PR #41, run 33012912605). Race
    // both landing states with the full timeout instead of pre-guessing
    // which one shows first — same pattern as the bezetting-overlay test's
    // own retry-vs-fresh-login race (PR #40).
    await Promise.race([
      verkoopTab.waitFor({ state: "visible", timeout: 15_000 }),
      staffButton.waitFor({ state: "visible", timeout: 15_000 }),
    ]);

    if (await staffButton.isVisible()) {
      await staffButton.click();

      const activitySelect = page.getByRole("combobox", { name: "Activiteit" });
      await activitySelect.waitFor({ state: "visible", timeout: 15_000 });
      await activitySelect.click();
      await page.getByRole("option", { name: "Training" }).click();

      for (const digit of ["1", "2", "3", "4"]) {
        await page.getByRole("button", { name: `Cijfer ${digit}` }).click();
      }

      await verkoopTab.waitFor({ state: "visible", timeout: 15_000 });
    }
  }

  /**
   * docs/features/activiteittypes.md (#18) → Randgevallen → "A11y van de
   * nieuwe Instellingen-kaart ... en de nieuwe activiteitkeuze-stap in
   * dienst-starten": ActiviteitKeuze.tsx, the new step between StaffPicker
   * and PinPad (DienstStarten.tsx → step "activity"). Deliberately the
   * *first* test in this `describe.serial` block, before
   * `ensureShiftStarted()` runs anywhere else in the file — that helper is
   * the only place a shift gets started on this shared bar-tablet session,
   * so running first (same worker, in declaration order, per
   * `.serial()`'s own guarantee) is what keeps the staff picker — and this
   * step right after it — reachable rather than already replaced by
   * DienstTabs. Position alone isn't enough, though (#88): the later tests
   * in this block leave a shift open, so a second run against the same
   * local Postgres — or a CI retry of this block — landed on DienstTabs
   * and timed out waiting for the staff button. `ensureNoOpenShift()`
   * closes any such leftover first. Doesn't pick an activity or type a PIN (that would start a
   * shift as a side effect of an a11y-only scan, same reasoning as the
   * dienst-afsluiten-overlay test below not clicking its own confirm
   * button).
   */
  test("bar shell (/) activiteitkeuze-stap (dienst starten) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureNoOpenShift(page);

    const staffButton = page.getByRole("button", { name: STAFF_BUTTON_NAME });
    await staffButton.waitFor({ state: "visible", timeout: 15_000 });
    await staffButton.click();

    const activitySelect = page.getByRole("combobox", { name: "Activiteit" });
    await activitySelect.waitFor({ state: "visible", timeout: 15_000 });
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
   * docs/features/activiteittypes.md (#18), task item 5: going back from
   * the PIN-stap to the activiteitkeuze-stap (`backToActivityKeuze()`,
   * DienstStarten.tsx) clears `pin`/foutstatus but deliberately does NOT
   * clear `selectedActivityType` in React state (spec → Schermflow §2 stap
   * 3: "`selectedStaff` blijft daarbij behouden" — the same is true in the
   * implementation for `selectedActivityType`). ActiviteitKeuze.tsx's own
   * `<select>` always renders `value=""` though (hardcoded, never bound to
   * `selectedActivityType`), so the dropdown visually resets to the
   * placeholder while the internal state still holds the earlier choice —
   * a UI/state mismatch, not a functional break: the user has to interact
   * with the dropdown again regardless (`onSelect` only fires on a real
   * `onChange`), and doing so immediately overwrites the stale state before
   * it can be submitted anywhere. This test locks down that this is the
   * CURRENT behaviour, not a statement that it's the correct one.
   *
   * The PIN-stap's back button now has its own label ("← andere
   * activiteit", `PinPad`'s `backLabel` prop) distinct from
   * ActiviteitKeuze's own "← andere bardienst" — fixed after the Tester
   * flagged the copy as misleading (PinPad's back button went to the
   * activiteitkeuze-stap, not back to staff selection).
   *
   * Placed second in this block (after the a11y-only scan above, before
   * `ensureShiftStarted()`'s own tests); like that first test it closes a
   * leftover shift via `ensureNoOpenShift()` rather than assuming none is
   * open (#88).
   */
  test("bar shell (/) activiteitkeuze toont na 'terug' vanaf de PIN-stap weer de placeholder", async ({
    page,
  }) => {
    await ensureNoOpenShift(page);

    const staffButton = page.getByRole("button", { name: STAFF_BUTTON_NAME });
    await staffButton.waitFor({ state: "visible", timeout: 15_000 });
    await staffButton.click();

    const activitySelect = page.getByRole("combobox", { name: "Activiteit" });
    await activitySelect.waitFor({ state: "visible", timeout: 15_000 });
    await activitySelect.click();
    await page.getByRole("option", { name: "Training" }).click();

    // Auto-advances to the PIN-stap once an activity is picked (spec →
    // Schermflow §2 stap 2) — geen aparte "volgende"-knop.
    const digit1 = page.getByRole("button", { name: "Cijfer 1" });
    await digit1.waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: "← andere activiteit" }).click();

    const activitySelectAgain = page.getByRole("combobox", { name: "Activiteit" });
    await activitySelectAgain.waitFor({ state: "visible", timeout: 15_000 });
    await expect(activitySelectAgain).toHaveText("Kies een activiteit…");

    // Functioneel onschadelijk (Reviewer's beoordeling): opnieuw kiezen
    // (ook dezelfde activiteit) werkt gewoon en komt weer op de PIN-stap
    // uit — geen dead end.
    await activitySelectAgain.click();
    await page.getByRole("option", { name: "Training" }).click();
    await digit1.waitFor({ state: "visible", timeout: 15_000 });
  });

  /**
   * The inverse of `ensureShiftStarted()`: leaves the shared session with
   * *no* open shift, so `/` renders the stafkeuze/PIN-entry screen rather
   * than DienstTabs. The two activiteitkeuze scenarios above and the
   * pincode-invoer scenario below need this — those screens are unreachable
   * while a shift is open, and on a Playwright
   * retry in CI (`retries: 1`) the previous attempt's shift is still open
   * against the same local Postgres.
   *
   * Closes the shift through the real "Dienst afsluiten"-flow rather than
   * touching the database directly: it's the same path a bardienst takes
   * (docs/features/dienst-afsluiten.md), so this helper can't drift away
   * from the app's own behaviour. The scan below re-starts nothing — the
   * next test in this block calls `ensureShiftStarted()` as usual.
   */
  /**
   * docs/features/portal-profiel.md (#17) → Testplan → e2e stap 3 + 4: een
   * PIN die de bardienst zelf in de portal zet, zet hem in de stafkeuze op
   * het bar-tablet (`useBarStaff` filtert op `has_pin`); na "Pincode
   * verwijderen" staat hij er niet meer in. Eén test voor beide kanten, met
   * de eigen fixture `e2e.profiel.bardienst` (geen andere test gebruikt
   * hem). In deze serial-groep omdat de stafkeuze alleen zichtbaar is zonder
   * open dienst; `ensureNoOpenShift()` zorgt daarvoor. De portal draait in
   * een tweede tab van dezelfde context: de portal-sessie heeft een eigen
   * cookie (ADR 0009) en raakt de device-sessie van het tablet niet. Geen
   * dienst starten met de nieuwe PIN: dat bewijst
   * supabase/tests/set_own_pin_start_shift.test.sql.
   */
  test("portal-PIN instellen zet de bardienst in de stafkeuze, verwijderen haalt hem eruit", async ({
    page,
  }) => {
    const FIXTURE_STAFF = /^E2E Profiel Bardienst\b/;
    await ensureNoOpenShift(page);

    const portal = await page.context().newPage();
    await portalLoginMetWachtwoord(
      portal,
      "e2e.profiel.bardienst@aurora.local",
      "local-e2e-profiel-bardienst-dev-only"
    );
    await portal
      .getByRole("heading", { name: /^Hoi / })
      .waitFor({ state: "visible", timeout: 15_000 });
    await portal.getByRole("tab", { name: "Account" }).click();
    const pinRow = portal.getByRole("button", { name: /^Pincode voor de bar-tablet/ });
    await pinRow.waitFor({ state: "visible", timeout: 15_000 });

    async function removePin() {
      await pinRow.click();
      await portal.getByRole("button", { name: "Pincode verwijderen" }).click();
      await portal
        .getByRole("status")
        .filter({ hasText: "Pincode verwijderd" })
        .waitFor({ state: "visible", timeout: 15_000 });
    }

    // Opruimen na een eerder afgebroken run op dezelfde stack.
    if (await pinRow.getByText("ingesteld", { exact: true }).isVisible()) {
      await removePin();
    }
    await expect(pinRow.getByText("niet ingesteld", { exact: true })).toBeVisible();

    await pinRow.click();
    for (const digit of ["4", "8", "2", "1", "4", "8", "2", "1"]) {
      await portal.getByRole("button", { name: `Cijfer ${digit}` }).click();
    }
    await expect(portal.getByRole("status").filter({ hasText: "Pincode ingesteld" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(pinRow.getByText("ingesteld", { exact: true })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("button", { name: FIXTURE_STAFF })).toBeVisible({ timeout: 15_000 });

    await removePin();
    await expect(pinRow.getByText("niet ingesteld", { exact: true })).toBeVisible();

    await page.goto("/");
    await page
      .getByRole("button", { name: STAFF_BUTTON_NAME })
      .waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.getByRole("button", { name: FIXTURE_STAFF })).toHaveCount(0);

    await portal.close();
  });

  async function ensureNoOpenShift(page: Page) {
    await page.goto("/");

    const verkoopTab = page.getByRole("tab", { name: "Verkoop" });
    const staffButton = page.getByRole("button", { name: STAFF_BUTTON_NAME });

    // Same "race both landing states rather than pre-guessing which one
    // shows first" reasoning as ensureShiftStarted() above.
    await Promise.race([
      verkoopTab.waitFor({ state: "visible", timeout: 15_000 }),
      staffButton.waitFor({ state: "visible", timeout: 15_000 }),
    ]);

    if (await staffButton.isVisible()) return;

    await page.getByRole("tab", { name: "Dienst" }).click();
    await page
      .getByRole("heading", { name: "Dienst", exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: "Dienst afsluiten" }).click();

    // Scope the confirm to the dialog: the trigger button behind it has
    // the same accessible name, and Playwright's name matching ignores
    // case, so an unscoped locator would be a strict-mode violation.
    const dialog = page.getByRole("dialog", { name: "Dienst afsluiten" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "dienst afsluiten" }).click();

    await staffButton.waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * docs/features/dienst-starten.md (#6) → the PIN-entry screen
   * (PinPad.tsx). Added at the app-review of 2026-09-21: this was the only
   * interactive screen in the app with no axe coverage at all. The routes
   * loop at the top of this file used to scan `/` (now `/koppel`, ADR
   * 0011), but that landed on the stafkeuze — the numpad only renders after picking a bardienst, and
   * `ensureShiftStarted()` clicks straight through it without scanning.
   *
   * Scans the pad in its empty, pre-entry state and deliberately enters no
   * digits: a fourth digit submits (see DienstStarten.tsx → pressDigit),
   * which would start a shift as a side effect of an a11y scan. The pad's
   * non-obvious a11y affordances are all present in this state anyway —
   * the `aria-hidden` dot row with its `sr-only` `role="status"`
   * counterpart, the per-key `aria-label`s ("Cijfer 3", "Wis laatste
   * cijfer"), and the `role="alert"` error line.
   *
   * Updated for #18 (docs/features/activiteittypes.md): a staff pick no
   * longer lands on PinPad directly — the new activiteitkeuze-stap sits in
   * between (same as `ensureShiftStarted()` above) — so an activity has to
   * be selected first, otherwise the "Cijfer 1"-wait below would time out
   * against a `<select>` that isn't PinPad.
   */
  test("bar shell (/) pincode-invoer has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await ensureNoOpenShift(page);

    await page.getByRole("button", { name: STAFF_BUTTON_NAME }).click();

    const activitySelect = page.getByRole("combobox", { name: "Activiteit" });
    await activitySelect.waitFor({ state: "visible", timeout: 15_000 });
    await activitySelect.click();
    await page.getByRole("option", { name: "Training" }).click();

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
    const memberOption = page.getByRole("button", { name: /Anna de Vries/i });
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
    const memberOption = page.getByRole("button", { name: /Anna de Vries/i });
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

    // Tom staat alleen in de bezetting (zie de afrekenbevestiging-test
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
   * ("Tom Willems") starts a shift alone and this suite never adds a second
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
    const memberOption = page.getByRole("button", { name: /Anna de Vries/i });
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
    const memberOption = page.getByRole("button", { name: /Anna de Vries/i });
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
    const memberOption = page.getByRole("button", { name: /Anna de Vries/i });
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
});
