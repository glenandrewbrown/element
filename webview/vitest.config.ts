/**
 * Vitest config for Element webview (Phase F.0.6 + Storybook test integration).
 *
 * Two projects:
 *   - "unit"      : the original jsdom component/store suite (unchanged).
 *                   `npm run test` targets ONLY this project, so the existing
 *                   workflow and results are preserved exactly.
 *   - "storybook" : every *.stories.tsx run as a smoke / interaction test in a
 *                   real headless Chromium via @storybook/addon-vitest. Run with
 *                   `npm run test:stories` (or `npm run test:all` for both).
 *
 * Keeping them as separate named projects means a browser-provider hiccup can
 * never break the unit suite, and either can be run in isolation.
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: "unit",
          environment: "jsdom",
          globals: false,
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
          css: false,
        },
      },
      {
        // storybookTest discovers every story and runs it as a test, applying
        // play functions and (when enabled) the a11y checks from preview.ts.
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
            storybookScript: "npm run storybook -- --no-open",
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
          setupFiles: ["./.storybook/vitest.setup.ts"],
        },
      },
    ],
  },
});
