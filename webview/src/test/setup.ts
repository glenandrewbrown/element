/**
 * Vitest global setup — extends `expect` with @testing-library matchers
 * and auto-cleans the DOM between tests (vitest 4 doesn't do this by default
 * the way vitest 1.x did, so we wire it explicitly).
 *
 * Loaded by webview/vitest.config.ts (`test.setupFiles`).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
