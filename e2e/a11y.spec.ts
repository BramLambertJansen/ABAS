import { test, expect } from "@playwright/test";
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
 * with supabase/seed.sql — the flow below starts a shift as the demo
 * "Tom Willems" bardienst account (PIN 1234, per seed.sql's comment: "Demo
 * PIN for every bar/beheer member below is 1234") and then opens the
 * bezetting overlay on top of it. Without that seeded data,
 * useBarStaff()/useOpenShift() resolve to an error state (see
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
 * `.github/workflows/ci.yml` runs `supabase start`/seeds/wires the
 * Supabase env vars ahead of `build`/`check:a11y` (fixed 2026-08-26,
 * unrelated ordering issue this comment used to flag). A real CI run after
 * that fix still timed out here — root cause was `src/middleware.ts` never
 * having a device account to sign in as, so RLS rejected every read before
 * the staff picker could render at all. `supabase/seed.sql` now provisions
 * that account too; see docs/ARCHITECTURE.md → "Local/CI device account".
 */
test("bar shell (/) bezetting-overlay has no WCAG2A/AA violations", async ({
  page,
}) => {
  await page.goto("/");

  const staffButton = page.getByRole("button", { name: /Tom Willems/i });
  await staffButton.waitFor({ state: "visible", timeout: 15_000 });
  await staffButton.click();

  for (const digit of ["1", "2", "3", "4"]) {
    await page.getByRole("button", { name: `Cijfer ${digit}` }).click();
  }

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
