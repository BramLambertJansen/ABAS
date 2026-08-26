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
   *  block — there's no end_shift UI, see docs/features/verkoop.md →
   *  Randgevallen "shift_not_open" reachability note). Lands on the
   *  Verkoop tab either way (docs/features/verkoop.md → Navigatie:
   *  Verkoop is the default tab after start / on an already-open shift). */
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

      for (const digit of ["1", "2", "3", "4"]) {
        await page.getByRole("button", { name: `Cijfer ${digit}` }).click();
      }

      await verkoopTab.waitFor({ state: "visible", timeout: 15_000 });
    }
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
