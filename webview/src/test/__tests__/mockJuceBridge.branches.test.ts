/**
 * mockJuceBridge — branch coverage (was 35% branches).
 *
 * The bridge mock is used by ~10 test files but its own internal branches
 * were never directly exercised. This file drives those paths:
 *
 *   - removeEventListener: null handle, non-object, missing name, list not found, cb not found
 *   - emitEvent: non-invoke event → generic dispatch (not via pending promise)
 *   - emitEvent: malformed payload (no resultId, no name, no params)
 *   - rejectPending: mockRejectedValueOnce → production promise rejects
 *   - callsOf(name) filtered vs callsOf() all
 *   - reset(): clears calls and sets default resolution
 *   - emit(): dispatches to listeners
 *   - BridgePresets constants are correct shapes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  installJuceBridgeMock,
  BridgePresets,
  type JuceBridgeMock,
} from "../mockJuceBridge";
import { invokeElementNative } from "../../bridge/juceBackend";

// ── Helpers ───────────────────────────────────────────────────────────────────

let bridge: JuceBridgeMock;

beforeEach(() => {
  bridge = installJuceBridgeMock();
});

afterEach(() => {
  bridge.uninstall();
  vi.clearAllMocks();
});

// ── removeEventListener edge cases ───────────────────────────────────────────

describe("mockJuceBridge — removeEventListener edge cases", () => {
  it("null handle → no throw", () => {
    const backend = (window as unknown as { __JUCE__: { backend: { removeEventListener: (h: unknown) => void } } }).__JUCE__.backend;
    expect(() => backend.removeEventListener(null)).not.toThrow();
  });

  it("non-object handle (string) → no throw", () => {
    const backend = (window as unknown as { __JUCE__: { backend: { removeEventListener: (h: unknown) => void } } }).__JUCE__.backend;
    expect(() => backend.removeEventListener("not-an-object")).not.toThrow();
  });

  it("handle with non-string name → no throw", () => {
    const backend = (window as unknown as { __JUCE__: { backend: { removeEventListener: (h: unknown) => void } } }).__JUCE__.backend;
    expect(() => backend.removeEventListener({ name: 42 })).not.toThrow();
  });

  it("handle pointing to non-existent event name → no throw", () => {
    const backend = (window as unknown as { __JUCE__: { backend: { removeEventListener: (h: unknown) => void } } }).__JUCE__.backend;
    // No listeners registered for "__nonexistent__" yet
    expect(() =>
      backend.removeEventListener({ name: "__nonexistent__event__", cb: vi.fn() }),
    ).not.toThrow();
  });

  it("removing a listener that was never in the list → no throw, list unchanged", () => {
    const backend = (window as unknown as { __JUCE__: { backend: { addEventListener: (n: string, cb: () => void) => unknown; removeEventListener: (h: unknown) => void } } }).__JUCE__.backend;
    const realCb = vi.fn();
    backend.addEventListener("__testEvent__", realCb);
    const ghostCb = vi.fn(); // was never registered
    expect(() =>
      backend.removeEventListener({ name: "__testEvent__", cb: ghostCb }),
    ).not.toThrow();
    // Real listener should still fire
    bridge.emit("__testEvent__", { ok: true });
    expect(realCb).toHaveBeenCalledWith({ ok: true });
  });

  it("removing a valid listener stops it from being called", () => {
    const backend = (window as unknown as { __JUCE__: { backend: { addEventListener: (n: string, cb: (p: unknown) => void) => unknown; removeEventListener: (h: unknown) => void } } }).__JUCE__.backend;
    const cb = vi.fn();
    const handle = backend.addEventListener("__removable__", cb);
    bridge.emit("__removable__", "before-remove");
    expect(cb).toHaveBeenCalledTimes(1);

    backend.removeEventListener(handle);
    bridge.emit("__removable__", "after-remove");
    expect(cb).toHaveBeenCalledTimes(1); // not called again
  });
});

// ── emitEvent: non-invoke events ─────────────────────────────────────────────

describe("mockJuceBridge — emitEvent generic (non-invoke) dispatch", () => {
  it("non-__juce__invoke event name dispatches to registered listeners", () => {
    const listener = vi.fn();
    bridge.emit("__juce__engineStatus", { running: true });
    // Install a listener first, then emit
    const backend = (window as unknown as { __JUCE__: { backend: { addEventListener: (n: string, cb: (p: unknown) => void) => unknown } } }).__JUCE__.backend;
    backend.addEventListener("__juce__customPush", listener);
    bridge.emit("__juce__customPush", { val: 42 });
    expect(listener).toHaveBeenCalledWith({ val: 42 });
  });

  it("emitting to an event with no listeners does not throw", () => {
    expect(() =>
      bridge.emit("__juce__noListenersHere__xyz", { foo: 1 }),
    ).not.toThrow();
  });
});

// ── emitEvent: malformed invoke payload ──────────────────────────────────────

describe("mockJuceBridge — emitEvent malformed invoke payload", () => {
  it("invoke with null payload uses empty string name and empty params array", async () => {
    bridge.mock.mockResolvedValueOnce("result");
    const backend = (window as unknown as { __JUCE__: { backend: { emitEvent: (n: string, p: unknown) => void } } }).__JUCE__.backend;
    backend.emitEvent("__juce__invoke", null);
    await new Promise((r) => setTimeout(r, 20));
    // mock should have been called with ("", [])
    expect(bridge.mock).toHaveBeenCalledWith("", []);
  });

  it("invoke with non-array params uses empty array", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const backend = (window as unknown as { __JUCE__: { backend: { emitEvent: (n: string, p: unknown) => void } } }).__JUCE__.backend;
    backend.emitEvent("__juce__invoke", { name: "testFn", params: "not-array", resultId: "id1" });
    await new Promise((r) => setTimeout(r, 20));
    expect(bridge.mock).toHaveBeenCalledWith("testFn", []);
  });
});

// ── rejectPending: host-side failure ─────────────────────────────────────────

describe("mockJuceBridge — host-side rejection via invokeElementNative", () => {
  it("mockRejectedValueOnce causes invokeElementNative to reject", async () => {
    bridge.mock.mockRejectedValueOnce(new Error("host error"));
    await expect(invokeElementNative("elementTest", [])).rejects.toThrow("host error");
  });

  it("after rejection, next call with mockResolvedValue resolves normally", async () => {
    bridge.mock.mockRejectedValueOnce(new Error("fail"));
    bridge.mock.mockResolvedValueOnce("ok");

    await expect(invokeElementNative("elementFirst", [])).rejects.toThrow();
    await expect(invokeElementNative("elementSecond", [])).resolves.toBe("ok");
  });
});

// ── callsOf ───────────────────────────────────────────────────────────────────

describe("mockJuceBridge — callsOf", () => {
  it("callsOf() with no args returns all recorded calls", async () => {
    bridge.mock.mockResolvedValue(undefined);
    await invokeElementNative("elementFoo", [1]);
    await invokeElementNative("elementBar", ["x"]);
    const all = bridge.callsOf();
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual({ name: "elementFoo", args: [1] });
    expect(all[1]).toEqual({ name: "elementBar", args: ["x"] });
  });

  it("callsOf(name) filters to only the named calls", async () => {
    bridge.mock.mockResolvedValue(undefined);
    await invokeElementNative("elementFoo", [1]);
    await invokeElementNative("elementBar", ["x"]);
    await invokeElementNative("elementFoo", [2]);
    const foos = bridge.callsOf("elementFoo");
    expect(foos).toHaveLength(2);
    expect(foos.every((c) => c.name === "elementFoo")).toBe(true);
  });

  it("callsOf(name) returns empty array when that fn was never called", async () => {
    expect(bridge.callsOf("elementNeverCalled")).toEqual([]);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe("mockJuceBridge — reset()", () => {
  it("reset clears recorded calls", async () => {
    bridge.mock.mockResolvedValue("data");
    await invokeElementNative("elementSomething", []);
    expect(bridge.mock.mock.calls).toHaveLength(1);
    bridge.reset();
    expect(bridge.mock.mock.calls).toHaveLength(0);
  });

  it("after reset, subsequent calls still resolve to undefined (default)", async () => {
    bridge.reset();
    const result = await invokeElementNative("elementAfterReset", []);
    expect(result).toBeUndefined();
  });

  it("mockResolvedValueOnce after reset works normally", async () => {
    bridge.reset();
    bridge.mock.mockResolvedValueOnce(42);
    const result = await invokeElementNative("elementVal", []);
    expect(result).toBe(42);
  });
});

// ── emit (host→app push) ──────────────────────────────────────────────────────

describe("mockJuceBridge — emit()", () => {
  it("emit dispatches payload to listeners registered with addEventListener", () => {
    const backend = (window as unknown as { __JUCE__: { backend: { addEventListener: (n: string, cb: (p: unknown) => void) => unknown } } }).__JUCE__.backend;
    const cb = vi.fn();
    backend.addEventListener("__juce__testPush", cb);
    bridge.emit("__juce__testPush", { key: "val" });
    expect(cb).toHaveBeenCalledWith({ key: "val" });
  });

  it("emit to event with no listeners does not throw", () => {
    expect(() => bridge.emit("__juce__noListeners", {})).not.toThrow();
  });

  it("multiple listeners for same event all receive the payload", () => {
    const backend = (window as unknown as { __JUCE__: { backend: { addEventListener: (n: string, cb: (p: unknown) => void) => unknown } } }).__JUCE__.backend;
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    backend.addEventListener("__juce__multi", cb1);
    backend.addEventListener("__juce__multi", cb2);
    bridge.emit("__juce__multi", "broadcast");
    expect(cb1).toHaveBeenCalledWith("broadcast");
    expect(cb2).toHaveBeenCalledWith("broadcast");
  });
});

// ── BridgePresets ────────────────────────────────────────────────────────────

describe("BridgePresets", () => {
  it("boolOk is true", () => {
    expect(BridgePresets.boolOk).toBe(true);
  });

  it("boolFail is false", () => {
    expect(BridgePresets.boolFail).toBe(false);
  });

  it("aboutInfo has expected shape", () => {
    expect(BridgePresets.aboutInfo).toMatchObject({
      name: expect.any(String),
      version: expect.any(String),
      copyright: expect.any(String),
    });
  });
});
