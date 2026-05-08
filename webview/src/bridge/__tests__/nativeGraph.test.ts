/**
 * Tests for bridge/nativeGraph.ts — representative wrapper coverage.
 *
 * Covers nativeGraphSetBypass (boolean), nativeGetNodeParameters (JSON parse),
 * nativePresetSnapshot (JSON parse + error), and nativeSessionGetGraphTree (JSON array).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { logBridgeError } from "../bridgeError";
import {
  nativeGetNodeParameters,
  nativeGraphSetBypass,
  nativePresetSnapshot,
  nativeSessionGetGraphTree,
} from "../nativeGraph";

vi.mock("../bridgeError", () => ({ logBridgeError: vi.fn() }));
const mockLogBridgeError = logBridgeError as ReturnType<typeof vi.fn>;

describe("nativeGraphSetBypass", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true when host returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const result = await nativeGraphSetBypass("node-1", true);
    expect(result).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementGraphSetBypass", [
      "node-1",
      true,
    ]);
  });

  it("returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeGraphSetBypass("node-1", true)).toBe(false);
  });

  it("strict equality: non-boolean host response → false", async () => {
    bridge.mock.mockResolvedValueOnce(1);
    expect(await nativeGraphSetBypass("node-1", true)).toBe(false);
  });
});

describe("nativeGetNodeParameters", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: parses JSON string with parameters array", async () => {
    const params = [
      { index: 0, name: "Gain", value: 0.5, defaultValue: 1.0 },
      { index: 1, name: "Pan", value: 0.0, defaultValue: 0.0 },
    ];
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ parameters: params }));
    const result = await nativeGetNodeParameters("node-abc");
    expect(result.parameters).toHaveLength(2);
    expect(result.parameters[0].name).toBe("Gain");
  });

  it("returns empty parameters when host returns non-string", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    const result = await nativeGetNodeParameters("node-abc");
    expect(result.parameters).toEqual([]);
  });

  it("returns empty parameters and calls logBridgeError on invalid JSON", async () => {
    bridge.mock.mockResolvedValueOnce("{bad json}}}");
    const result = await nativeGetNodeParameters("node-abc");
    expect(result.parameters).toEqual([]);
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeGetNodeParameters.parse",
    );
  });
});

describe("nativePresetSnapshot", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: parses JSON string { ok: true }", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ ok: true }));
    const result = await nativePresetSnapshot("node-1", "A");
    expect(result.ok).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementPresetSnapshot", [
      "node-1",
      "A",
    ]);
  });

  it("returns { ok: false } when host returns non-string", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    const result = await nativePresetSnapshot("node-1", "B");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no response");
  });

  it("returns { ok: false } and calls logBridgeError on invalid JSON", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    const result = await nativePresetSnapshot("node-1", "A");
    expect(result.ok).toBe(false);
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativePresetSnapshot.parse",
    );
  });
});

describe("nativeSessionGetGraphTree", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: parses JSON array of graph nodes", async () => {
    const tree = [
      { id: "g0", name: "Graph 1", index: 0, active: true, isContainer: false, children: [] },
    ];
    bridge.mock.mockResolvedValueOnce(JSON.stringify(tree));
    const result = await nativeSessionGetGraphTree();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Graph 1");
  });

  it("returns empty array when host returns non-string", async () => {
    bridge.mock.mockResolvedValueOnce(42);
    const result = await nativeSessionGetGraphTree();
    expect(result).toEqual([]);
  });

  it("returns empty array and calls logBridgeError on invalid JSON", async () => {
    bridge.mock.mockResolvedValueOnce("not-json");
    const result = await nativeSessionGetGraphTree();
    expect(result).toEqual([]);
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeSessionGetGraphTree.parse",
    );
  });
});
