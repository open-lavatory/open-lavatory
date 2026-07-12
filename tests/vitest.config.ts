import { readFileSync } from "node:fs";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const readVersion = (packageJsonPath: string): string => {
  try {
    return JSON.parse(
      readFileSync(new URL(packageJsonPath, import.meta.url), "utf8"),
    ).version;
  }
  catch {
    return "unknown";
  }
};

export default defineConfig({
  define: {
    __OPENLV_VERSIONS__: JSON.stringify({
      branch: readVersion("../packages/session/package.json"),
      latest: readVersion("./node_modules/latest-session/package.json"),
    }),
  },
  test: {
    globals: true,
    exclude: ["dist", "node_modules"],
    // Real ntfy.sh signaling + a full WebRTC handshake, twice (request and
    // response leg of each direction) — needs far more headroom than a unit test.
    testTimeout: 90_000,
    // Public signaling infra can hiccup; one in-process retry before the CI-level
    // retry wrapper kicks in.
    retry: 1,
    // Serialize the compat directions so the two version pairs never share
    // signaling bandwidth or fight over the ntfy.sh rate limit.
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
