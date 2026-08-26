import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
 * from an earlier test in the block, so this suite doesn't additionally
 * assume a specific run order beyond "not interleaved with itself".
 */
test.describe.serial("stateful bar-shell scenarios (shared session)", () => {
  /** Starts a shift as the demo "Tom Willems" bardienst account (PIN 1234,
   *  per seed.sql's comment: "Demo PIN for every bar/beheer member below is
   *  1234") if none is open yet on this shared session, or reuses whichever
   *  shift is already open (e.g. left open by an earlier test in this
   *  block — there's no end_shift UI, see docs/features/verkoop.md →
   *  Randgevallen "shift_not_open" reachability note). Lands on the
   *  Verkoop tab either way (docs/features/verkoop.md → Navigatie:
   *  Verkoop is the default tab after start / on an already-open shift). */
  async function ensureShiftStarted(page: Page) {
    await page.goto("/");

    const alreadyOpen = await page
      .getByRole("tab", { name: "Verkoop" })
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (alreadyOpen) return;

    const staffButton = page.getByRole("button", { name: /Tom Willems/i });
    await staffButton.waitFor({ state: "visible", timeout: 15_000 });
    await staffButton.click();

    for (const digit of ["1", "2", "3", "4"]) {
      await page.getByRole("button", { name: `Cijfer ${digit}` }).click();
    }

    await page
      .getByRole("tab", { name: "Verkoop" })
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * docs/features/bezetting-beheren.md (#7) → Randgevallen → "A11y-dekking
   * van de overlay zelf": this app's first real interactive overlay
   * (src/components/Overlay.tsx — role="dialog", aria-modal, focus-trap,
   * Escape/backdrop-close), opened from
   * src/features/bezetting-beheren/DienstActief.tsx via the "Bezetting
   * wijzigen" button. The routes above only scan static/error-state pages —
   * this drives the app into a real open-dialog state before scanning so the
   * modal itself is under the WCAG-AA gate, not just its trigger.
   *
   * Requires a live Supabase instance reachable at build/run time
   * (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) seeded
   * with supabase/seed.sql. Without that seeded data, useBarStaff()/
   * useOpenShift() resolve to an error state (see
   * src/hooks/queries/useBarStaff.ts, useOpenShift.ts) and the staff picker —
   * therefore the whole path down to the overlay — never renders, so this
   * test cannot complete.
   *
   * NOT RUN from this sandbox: no live Supabase project/local stack was
   * reachable here (same known limitation as db:test, see
   * docs/ARCHITECTURE.md → "Verified vs. not"). Written to run correctly
   * against a real environment, not executed here — do not read this test's
   * presence as proof the overlay has actually been scanned yet.
   *
   * Also worth flagging (not something for Tester to silently fix): as
   * configured today, .github/workflows/ci.yml runs `npm run check:a11y`
   * *before* `supabase start`/seeding the database, and never wires
   * NEXT_PUBLIC_SUPABASE_URL/KEY into the build at all. Under that ordering
   * this test will fail every time in CI (staff picker never renders), not
   * because the overlay is inaccessible but because there's no backend for
   * it to load data from yet. Making this test actually pass in CI needs a
   * pipeline change (seed + env wiring ahead of check:a11y) that's outside
   * writing/running tests — flagging for Developer/Reviewer rather than
   * reordering CI myself. Per the launching session's brief, this is being
   * fixed separately in #40 (branch claude/fix-device-account-seed), not
   * yet merged — once it lands, this test (and the one below) should
   * actually be able to load data in CI for the first time.
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
   *
   * Same "requires a live seeded Supabase instance, NOT RUN from this
   * sandbox" caveats as the bezetting-overlay test above apply here too —
   * see that test's docblock, not repeated verbatim.
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
});
