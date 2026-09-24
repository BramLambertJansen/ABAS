import { existsSync } from "fs";
import { defineConfig } from "@playwright/test";

/**
 * Config for the WCAG-AA gate only (see e2e/a11y.spec.ts). This is not a
 * general e2e suite yet — that's a separate concern for when real screens
 * exist. Boots the Next.js dev server against the shells-scaffold pages so
 * the axe-core scan has something real to hit.
 */

// Some sandboxes pre-install a fixed Chromium build outside npm's control
// (no outbound access to download a matching one) and expose it as a
// `chromium` symlink under PLAYWRIGHT_BROWSERS_PATH — use it when present
// instead of the version `@playwright/test` would otherwise try to fetch.
// CI has no such pre-install, runs `npx playwright install --with-deps
// chromium` instead, and falls through to Playwright's own default here.
const preinstalledChromium = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
  : undefined;
const executablePath =
  preinstalledChromium && existsSync(preinstalledChromium)
    ? preinstalledChromium
    : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    // Zonder overgangen meet axe de eindkleuren, niet een tussenkleur
    // halverwege `transition-colors` (#71). globals.css zet overgangen uit
    // onder prefers-reduced-motion.
    contextOptions: { reducedMotion: "reduce" },
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
