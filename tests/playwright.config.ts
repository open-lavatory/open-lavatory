import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

/**
 * Resolve a Chromium binary: OPENLV_E2E_BROWSER env override, the Playwright
 * download if present, otherwise a system-installed chromium.
 */
const systemChromium = [
  process.env["OPENLV_E2E_BROWSER"],
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/etc/profiles/per-user/" + (process.env["USER"] ?? "") + "/bin/chromium",
  "/run/current-system/sw/bin/chromium",
].find(p => p && existsSync(p));

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  fullyParallel: false,
  // Both tabs of a test share one relay topic; parallel runs are fine, but
  // keep a single worker so public-broker traffic stays polite.
  workers: 1,
  use: {
    launchOptions: systemChromium ? { executablePath: systemChromium } : {},
  },
  webServer: {
    command: "pnpm --dir ../examples/sandbox dev --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
