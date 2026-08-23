/**
 * Tests for bridge/nativePluginEditor.ts.
 *
 * Covers nativePluginEditorOpen (retry loop returns true on first success,
 * false when all retries fail), nativePluginEditorClose, nativePluginEditorSetBounds,
 * and nativePluginEditorFloat (void wrappers).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import {
  nativePluginEditorClose,
  nativePluginEditorFloat,
  nativePluginEditorOpen,
  nativePluginEditorSetBounds,
} from "../nativePluginEditor";

describe("nativePluginEditorOpen", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    bridge.uninstall();
  });

  it("happy path: returns true immediately when first call succeeds", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const promise = nativePluginEditorOpen("node-1", 0, 0, 400, 300);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementPluginEditorOpen", [
      "node-1",
      0,
      0,
      400,
      300,
    ]);
  });

  it("error path: returns false when all retries return false", async () => {
    bridge.mock.mockResolvedValue(false);
    const promise = nativePluginEditorOpen("node-bad", 0, 0, 400, 300);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(false);
  });

  it("retries and succeeds on the second attempt", async () => {
    bridge.mock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const promise = nativePluginEditorOpen("node-1", 0, 0, 400, 300);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(true);
    expect(bridge.mock).toHaveBeenCalledTimes(2);
  });
});

describe("nativePluginEditorClose", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("fire-and-forget: resolves void, calls the host", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    const result = await nativePluginEditorClose();
    expect(result).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementPluginEditorClose", []);
  });
});

describe("nativePluginEditorSetBounds", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("passes bounds to host and resolves void", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    const result = await nativePluginEditorSetBounds(10, 20, 800, 600);
    expect(result).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementPluginEditorSetBounds", [
      10,
      20,
      800,
      600,
    ]);
  });
});

describe("nativePluginEditorFloat", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("fire-and-forget: resolves void, calls the host", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    const result = await nativePluginEditorFloat();
    expect(result).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementPluginEditorFloat", []);
  });
});
