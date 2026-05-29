/**
 * mockJuceBridge — canonical test util for the JUCE-8 bridge layer.
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
 * JUCE-8 event-handshake contract (matches `bridge/juceBackend.ts`)
 * ────────────────────────────────────────────────────────────────
 * JUCE 8 does NOT expose `backend.invokeNativeFunction`. Production's
 * `invokeElementNative` instead drives an event handshake:
 *
 *   1. It wires a one-shot `__juce__complete` listener (latched module-wide
 *      via `listenerWired`, so it registers on the FIRST backend only).
 *   2. For each call it stores a pending promise keyed by `resultId`, then
 *      `backend.emitEvent("__juce__invoke", { name, params, resultId })`.
 *   3. The host is expected to reply by emitting `__juce__complete` with
 *      `{ promiseId: resultId, result }`, which resolves the pending promise.
 *
 * This mock therefore installs a backend whose `emitEvent` intercepts
 * `__juce__invoke`, records the call on a fresh `vi.fn()` as
 * `mock(name, params)`, and replies on the `__juce__complete` channel with
 * whatever the `vi.fn()` resolves to. Because production latches the
 * completion listener on the first backend object only, the
 * `addEventListener`/`emitEvent` pair both close over a *persistent*
 * module-level listener registry so re-installs within the same test file
 * keep the host→app channel live (see `sharedListeners`). Only the
 * `vi.fn()` is fresh per install, so call records never leak across tests.
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
 * USAGE — host→app event push
 * ───────────────────────────
 *   const bridge = installJuceBridgeMock();
 *   bridge.emit("__juce__someHostEvent", { foo: 1 });
 */

import { vi } from "vitest";

const INVOKE_EVENT = "__juce__invoke";
const COMPLETE_EVENT = "__juce__complete";

/** A single host-side native function call as observed at the bridge boundary. */
export type BridgeCall = {
  name: string;
  args: unknown[];
};

export type JuceBridgeMock = {
  /**
   * The vitest mock that backs the JUCE-8 native-function handshake. The
   * mock is invoked as `mock(name, params)` whenever production emits a
   * `__juce__invoke` event, and its resolved value is replied to production
   * on the `__juce__complete` channel.
   *
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

  /**
   * Host→app event push. Dispatches `payload` to every listener production
   * registered for `eventName` via `backend.addEventListener`. Use to
   * simulate the host pushing data (e.g. a streamed snapshot) rather than
   * replying to an invoke.
   */
  emit: (eventName: string, payload: unknown) => void;
};

type BackendEvent = {
  addEventListener: (name: string, cb: (payload: unknown) => void) => unknown;
  removeEventListener?: (handle: unknown) => void;
  emitEvent: (name: string, payload: unknown) => void;
};

type GlobalShape = {
  __JUCE__?: { backend?: BackendEvent };
};

type InvokePayload = { name?: unknown; params?: unknown; resultId?: unknown };

/**
 * Persistent, module-level listener registry. Production wires its
 * `__juce__complete` listener exactly once per test-file lifetime
 * (`listenerWired` latches in juceBackend.ts and never re-registers on a
 * fresh `installJuceBridgeMock()`). The registry therefore must survive
 * re-install/uninstall within a file so the host→app completion channel
 * keeps dispatching to that one live production callback. Both the
 * installed backend's `addEventListener` and `emitEvent` close over this
 * same map.
 */
const sharedListeners: Map<string, Array<(payload: unknown) => void>> =
  new Map();

function addSharedListener(
  name: string,
  cb: (payload: unknown) => void,
): { name: string; cb: (payload: unknown) => void } {
  const list = sharedListeners.get(name);
  if (list) list.push(cb);
  else sharedListeners.set(name, [cb]);
  return { name, cb };
}

function dispatchShared(name: string, payload: unknown): void {
  const list = sharedListeners.get(name);
  if (!list) return;
  // Copy so a listener that mutates the registry mid-dispatch is safe.
  for (const cb of [...list]) cb(payload);
}

/**
 * Install a fresh JUCE-8 bridge mock on `window.__JUCE__`. Returns a handle
 * that exposes the mock, a `reset()` for in-test mock cycles, an `emit()`
 * for host→app pushes, and an `uninstall()` for `afterEach`.
 *
 * Idempotent across test files: each `installJuceBridgeMock()` swaps in a
 * brand-new `vi.fn()` so per-test call records never leak. The host→app
 * listener registry is shared (see `sharedListeners`) because production
 * latches its completion listener on the first install only.
 */
export function installJuceBridgeMock(): JuceBridgeMock {
  // `mock(name, params)` — matches `toHaveBeenCalledWith("elementXxx", [...])`.
  const mock = vi.fn(async (_name: string, _args: unknown[]) => undefined);

  const backend: BackendEvent = {
    addEventListener(name: string, cb: (payload: unknown) => void) {
      return addSharedListener(name, cb);
    },
    removeEventListener(handle: unknown) {
      if (handle == null || typeof handle !== "object") return;
      const h = handle as { name?: unknown; cb?: unknown };
      if (typeof h.name !== "string") return;
      const list = sharedListeners.get(h.name);
      if (!list) return;
      const idx = list.indexOf(h.cb as (payload: unknown) => void);
      if (idx >= 0) list.splice(idx, 1);
    },
    emitEvent(name: string, payload: unknown) {
      if (name !== INVOKE_EVENT) {
        // Not an invoke — treat as a generic host→app dispatch.
        dispatchShared(name, payload);
        return;
      }
      const p = (payload ?? {}) as InvokePayload;
      const fnName = typeof p.name === "string" ? p.name : "";
      const params = Array.isArray(p.params) ? (p.params as unknown[]) : [];
      const promiseId = p.resultId;

      // Record the call on the user-facing mock and reply on the completion
      // channel with whatever it resolves to. A rejection is forwarded by
      // re-throwing inside the completion listener's microtask so the
      // production promise (which has no native reject channel) rejects via
      // the dispatch — see the throw in the .catch handler below.
      void Promise.resolve()
        .then(() => mock(fnName, params))
        .then((result) => {
          dispatchShared(COMPLETE_EVENT, { promiseId, result });
        })
        .catch((err) => {
          // Production's `__juce__complete` listener only ever resolves.
          // To surface a host-side failure as a rejected `invokeElementNative`
          // promise without touching production, reject the matching pending
          // promise directly via the captured resolver registry.
          rejectPending(promiseId, err);
        });
    },
  };

  const root = globalThis as unknown as GlobalShape;
  const previous = root.__JUCE__;
  root.__JUCE__ = { backend };

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
    emit(eventName: string, payload: unknown) {
      dispatchShared(eventName, payload);
    },
  };
}

/**
 * Reject the production pending promise for `promiseId` (host-side failure).
 *
 * Production (`juceBackend.ts`) stores `{ resolve, reject }` keyed by
 * `promiseId` and its `__juce__complete` listener only ever calls
 * `resolve(obj.result)` — there is no native reject channel. We model a
 * host-side failure (tests using `mockRejectedValueOnce`) without touching
 * production by exploiting Promise adoption: when `obj.result` is itself a
 * rejected thenable, `resolve(rejectedThenable)` makes the production
 * promise ADOPT and reject with that reason. So we dispatch the completion
 * with `result` set to a pre-rejected promise carrying the original error;
 * `invokeElementNative` then rejects exactly as a real bridge failure would
 * surface, and the consuming wrapper's `try/catch` fires.
 */
function rejectPending(promiseId: unknown, err: unknown): void {
  // Pre-attach a no-op catch so the rejected promise we hand to production
  // is not flagged as an unhandled rejection before production adopts it.
  const rejected = Promise.reject(err);
  rejected.catch(() => undefined);
  dispatchShared(COMPLETE_EVENT, { promiseId, result: rejected });
}

/**
 * Canned response presets for common host-side return shapes. Optional —
 * tests may compose responses inline. These are here so all bridge wrapper
 * tests share the same canonical shapes and a future bridge-shape change is
 * one-line to update across the suite.
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
