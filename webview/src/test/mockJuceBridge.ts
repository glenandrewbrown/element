/**
 * mockJuceBridge — canonical test util for the JUCE bridge layer.
 *
 * Phase H-coverage (master-fix-plan.md §4.3) calls for a single shared
 * helper that simulates `window.__JUCE__` instead of mocking
 * `bridge/juceBackend.ts` per-test. Reasons:
 *
 *   1. Tests exercise the REAL `invokeElementNative` wrapper, so bugs
 *      in juceBackend.ts itself are catchable.
 *   2. No `vi.mock` hoisting gotchas — the install runs imperatively
 *      inside `beforeEach` / `beforeAll`.
 *   3. Symmetric mock shape for every bridge wrapper test (10× modules
 *      under `webview/src/bridge/`).
 *
 * USAGE — bridge wrapper test
 * ───────────────────────────
 *   import { afterEach, beforeEach, describe, expect, it } from "vitest";
 *   import { installJuceBridgeMock, type JuceBridgeMock } from "../../test/mockJuceBridge";
 *   import { nativeAppGetAbout } from "../nativeApp";
 *
 *   describe("nativeAppGetAbout", () => {
 *     let bridge: JuceBridgeMock;
 *     beforeEach(() => { bridge = installJuceBridgeMock(); });
 *     afterEach(() => bridge.uninstall());
 *
 *     it("happy path: returns AboutInfo from host JSON", async () => {
 *       bridge.mock.mockResolvedValueOnce({ name: "Element", version: "1.2", copyright: "© Glen" });
 *       const info = await nativeAppGetAbout();
 *       expect(info).toEqual({ name: "Element", version: "1.2", copyright: "© Glen" });
 *       expect(bridge.mock).toHaveBeenCalledWith("elementAppGetAbout", []);
 *     });
 *
 *     it("error path: returns null when host returns malformed shape", async () => {
 *       bridge.mock.mockResolvedValueOnce("not-an-object");
 *       expect(await nativeAppGetAbout()).toBeNull();
 *     });
 *   });
 *
 * USAGE — store test
 * ──────────────────
 *   const bridge = installJuceBridgeMock();
 *   bridge.mock.mockResolvedValueOnce(true);
 *   await usePerformStore.getState().activateScene(2);
 *   expect(bridge.mock).toHaveBeenCalledWith("elementPerformSetActiveScene", [2]);
 *
 * NOTE on coexistence with `vi.mock("../../bridge/juceBackend", ...)`
 * ──────────────────────────────────────────────────────────────────
 * The two existing pre-Phase-H tests (`useEngineSnapshotStore.test.ts`,
 * `sceneActivation.test.ts`) use the older `vi.mock` pattern and remain
 * green. New tests SHOULD prefer `installJuceBridgeMock()` per the
 * master plan; the older tests can be migrated opportunistically but
 * are not in scope for Phase H-coverage.
 */

import { vi } from "vitest";

/** A single host-side native function call as observed at the bridge boundary. */
export type BridgeCall = {
  name: string;
  args: unknown[];
};

export type JuceBridgeMock = {
  /**
   * The vitest mock that backs `window.__JUCE__.backend.invokeNativeFunction`.
   * Use `mockResolvedValueOnce(...)`, `mockRejectedValueOnce(...)`, etc.
   * Inspect with `expect(mock).toHaveBeenCalledWith("elementXxx", [...args])`.
   */
  mock: ReturnType<typeof vi.fn>;

  /**
   * Convenience: reset the mock between assertions in the same test
   * without re-installing. Calls `mockReset()` then sets a default
   * resolution of `undefined` so production code that does not specify
   * a per-test response gets the dev-mode behaviour.
   */
  reset: () => void;

  /**
   * Restore `window.__JUCE__` to whatever (if anything) was there
   * before `installJuceBridgeMock()` ran. Call in `afterEach`.
   */
  uninstall: () => void;

  /**
   * Helper: list every recorded call in `{ name, args }` form.
   * Easier to read in failure messages than `mock.mock.calls`.
   */
  callsOf: (name?: string) => BridgeCall[];
};

type GlobalShape = {
  __JUCE__?: { backend?: { invokeNativeFunction?: unknown } };
};

/**
 * Install a fresh JUCE bridge mock on `window.__JUCE__`. Returns a handle
 * that exposes the mock, a `reset()` for in-test mock cycles, and an
 * `uninstall()` for `afterEach`.
 *
 * Idempotent across test files: each `installJuceBridgeMock()` replaces
 * the previous backend with a brand-new `vi.fn()` so cross-test pollution
 * is impossible.
 */
export function installJuceBridgeMock(): JuceBridgeMock {
  const mock = vi.fn(async (_name: string, _args: unknown[]) => undefined);

  const root = globalThis as unknown as GlobalShape;
  const previous = root.__JUCE__;
  root.__JUCE__ = { backend: { invokeNativeFunction: mock } };

  return {
    mock,
    reset() {
      mock.mockReset();
      mock.mockResolvedValue(undefined);
    },
    uninstall() {
      if (previous === undefined) {
        delete root.__JUCE__;
      } else {
        root.__JUCE__ = previous;
      }
    },
    callsOf(name?: string) {
      const calls = mock.mock.calls as Array<[string, unknown[]]>;
      const all = calls.map(([n, args]) => ({ name: n, args }));
      return name === undefined ? all : all.filter((c) => c.name === name);
    },
  };
}

/**
 * Canned response presets for common host-side return shapes. Optional —
 * tests may compose responses inline. These are here so all 10 wrapper
 * tests share the same canonical shapes and a future bridge-shape
 * change is one-line to update across the suite.
 */
export const BridgePresets = {
  /** Generic boolean-OK response (used by all `nativePerform*` setters). */
  boolOk: true as const,
  /** Generic boolean-FAIL response (used to exercise rollback paths). */
  boolFail: false as const,
  /** Empty AboutInfo (used by `nativeAppGetAbout` happy path). */
  aboutInfo: {
    name: "Element",
    version: "0.0.0",
    copyright: "© Test",
  } as const,
} satisfies Record<string, unknown>;
