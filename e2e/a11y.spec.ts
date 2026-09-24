import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginMetWachtwoord } from "./helpers/supabaseMock";

/**
 * The WCAG-AA gate CLAUDE.md calls for: axe-core against every shell's
 * scaffold entry point. Add a route here the moment a real screen lands —
 * this list is meant to grow with the app, not stay at two placeholder
 * pages. See docs/ARCHITECTURE.md → Verificatie for how this fits
 * npm run check:all.
 */
const routes = [
  { name: "bar shell", path: "/" },
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
});

/**
 * Both scenarios below need a shift already open on the shared bar-tablet
 * session before they can reach their target screen — there is exactly one
 * "current open shift" (docs/ARCHITECTURE.md → "Shared bar-tablet session
 * mechanism"), not scoped per browser/page, and `start_shift` has no
 * server-side exclusivity yet (issue #29). Grouped in
 * `test.describe.serial` so Playwright runs them one after another rather
 * than in separate parallel workers (`fullyParallel: true` in
 * playwright.config.ts) — two concurrent `start_shift`/`place_order` calls
 * against that shared, unenforced "one open shift" state would be racy
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
 * SUPABASE_DEVICE_EMAIL/PASSWORD) seeded with supabase/seed.sql — see
 * docs/ARCHITECTURE.md → "Local/CI device account" for how CI provisions
 * that. Confirmed actually passing in real CI as of PR #40 (merged
 * 2026-08-26), which also fixed two pre-existing bugs (`useOpenShift`'s
 * PGRST201 embed ambiguity, a WCAG-AA contrast gap in the `accent` design
 * token) that this test was the first thing in the repo to ever reach far
 * enough to surface.
 */
test.describe.serial("stateful bar-shell scenarios (shared session)", () => {
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
    const staffButton = page.getByRole("button", { name: /Tom Willems/i });

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

      const activitySelect = page.getByLabel("Activiteit");
      await activitySelect.waitFor({ state: "visible", timeout: 15_000 });
      await activitySelect.selectOption({ label: "Training" });

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
   * DienstTabs. Doesn't pick an activity or type a PIN (that would start a
   * shift as a side effect of an a11y-only scan, same reasoning as the
   * dienst-afsluiten-overlay test below not clicking its own confirm
   * button).
   */
  test("bar shell (/) activiteitkeuze-stap (dienst starten) has no WCAG2A/AA violations", async ({
    page,
  }) => {
    await page.goto("/");

    const staffButton = page.getByRole("button", { name: /Tom Willems/i });
    await staffButton.waitFor({ state: "visible", timeout: 15_000 });
    await staffButton.click();

    const activitySelect = page.getByLabel("Activiteit");
    await activitySelect.waitFor({ state: "visible", timeout: 15_000 });

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
   * with the `<select>` again regardless (`onSelect` only fires on a real
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
   * `ensureShiftStarted()`'s own tests), same "no shift open yet"
   * ordering-dependency as that first test.
   */
  test("bar shell (/) activiteitkeuze toont na 'terug' vanaf de PIN-stap weer de placeholder", async ({
    page,
  }) => {
    await page.goto("/");

    const staffButton = page.getByRole("button", { name: /Tom Willems/i });
    await staffButton.waitFor({ state: "visible", timeout: 15_000 });
    await staffButton.click();

    const activitySelect = page.getByLabel("Activiteit");
    await activitySelect.waitFor({ state: "visible", timeout: 15_000 });
    await activitySelect.selectOption({ label: "Training" });

    // Auto-advances to the PIN-stap once an activity is picked (spec →
    // Schermflow §2 stap 2) — geen aparte "volgende"-knop.
    const digit1 = page.getByRole("button", { name: "Cijfer 1" });
    await digit1.waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: "← andere activiteit" }).click();

    const activitySelectAgain = page.getByLabel("Activiteit");
    await activitySelectAgain.waitFor({ state: "visible", timeout: 15_000 });
    await expect(activitySelectAgain).toHaveValue("");

    // Functioneel onschadelijk (Reviewer's beoordeling): opnieuw kiezen
    // (ook dezelfde activiteit) werkt gewoon en komt weer op de PIN-stap
    // uit — geen dead end.
    await activitySelectAgain.selectOption({ label: "Training" });
    await digit1.waitFor({ state: "visible", timeout: 15_000 });
  });

  /**
   * The inverse of `ensureShiftStarted()`: leaves the shared session with
   * *no* open shift, so `/` renders the stafkeuze/PIN-entry screen rather
   * than DienstTabs. Only the pincode-invoer scenario below needs this —
   * that screen is unreachable while a shift is open, and on a Playwright
   * retry in CI (`retries: 1`) the previous attempt's shift is still open
   * against the same local Postgres.
   *
   * Closes the shift through the real "Dienst afsluiten"-flow rather than
   * touching the database directly: it's the same path a bardienst takes
   * (docs/features/dienst-afsluiten.md), so this helper can't drift away
   * from the app's own behaviour. The scan below re-starts nothing — the
   * next test in this block calls `ensureShiftStarted()` as usual.
   */
  async function ensureNoOpenShift(page: Page) {
    await page.goto("/");

    const verkoopTab = page.getByRole("tab", { name: "Verkoop" });
    const staffButton = page.getByRole("button", { name: /Tom Willems/i });

    // Same "race both landing states rather than pre-guessing which one
    // shows first" reasoning as ensureShiftStarted() above.
    await Promise.race([
      verkoopTab.waitFor({ state: "visible", timeout: 15_000 }),
      staffButton.waitFor({ state: "visible", timeout: 15_000 }),
    ]);

    if (await staffButton.isVisible()) return;

    await page.getByRole("tab", { name: "Dienst" }).click();
    await page
      .getByRole("heading", { name: "Dienst actief" })
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
   * loop at the top of this file scans `/`, but that lands on the
   * stafkeuze — the numpad only renders after picking a bardienst, and
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

    await page.getByRole("button", { name: /Tom Willems/i }).click();

    const activitySelect = page.getByLabel("Activiteit");
    await activitySelect.waitFor({ state: "visible", timeout: 15_000 });
    await activitySelect.selectOption({ label: "Training" });

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
      .getByRole("heading", { name: "Dienst actief" })
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
      .getByRole("heading", { name: "Dienst actief" })
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
