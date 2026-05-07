/**
 * Vitest config for Element webview tests (Phase F.0.6).
 *
 * Runs in jsdom for component rendering. The @vitejs/plugin-react plugin is
 * pulled from the project's existing devDependencies so JSX in tests compiles
 * under the same toolchain as `vite build`.
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
