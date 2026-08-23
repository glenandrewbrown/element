/**
 * Tests for bridge/bridgeError.ts.
 *
 * Verifies that `logBridgeError` emits `console.warn` with the canonical
 * `[bridge:<label>]` prefix so bridge failures are surfaced in dev and prod.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logBridgeError } from "../bridgeError";

describe("logBridgeError", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("calls console.warn with [bridge:<label>] as first arg", () => {
    logBridgeError("nativeApp.parse", new Error("bad json"));
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toBe("[bridge:nativeApp.parse]");
  });

  it("passes the original error as the second arg", () => {
    const err = new TypeError("unexpected token");
    logBridgeError("someLabel", err);
    expect(warnSpy.mock.calls[0][1]).toBe(err);
  });

  it("works with non-Error values (string, null, object)", () => {
    logBridgeError("label-a", "raw string error");
    expect(warnSpy).toHaveBeenCalledWith("[bridge:label-a]", "raw string error");

    logBridgeError("label-b", null);
    expect(warnSpy).toHaveBeenCalledWith("[bridge:label-b]", null);

    const obj = { code: 42 };
    logBridgeError("label-c", obj);
    expect(warnSpy).toHaveBeenCalledWith("[bridge:label-c]", obj);
  });

  it("formats the prefix correctly with colons and dots in label", () => {
    logBridgeError("nativeGetEngineSnapshot.parse", new Error());
    expect(warnSpy.mock.calls[0][0]).toBe(
      "[bridge:nativeGetEngineSnapshot.parse]",
    );
  });
});
