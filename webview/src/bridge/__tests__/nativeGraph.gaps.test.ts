/**
 * Gap tests for bridge/nativeGraph.ts — uses vi.mock("../juceBackend") to
 * exercise response-branch guards not covered by nativeGraph.test.ts.
 *
 * nativeGraph.test.ts uses installJuceBridgeMock (real bridge shape).
 * These tests use vi.mock so they run independently of the JUCE backend shim.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../juceBackend", () => ({ invokeElementNative: vi.fn() }));
vi.mock("../bridgeError", () => ({ logBridgeError: vi.fn() }));

import { invokeElementNative } from "../juceBackend";
import { logBridgeError } from "../bridgeError";
import {
  nativeScriptGetRuntimeState,
  nativeSessionGetGraphTree,
  nativeGraphGetConnectionList,
  nativeGetNodeParameters,
  nativePresetList,
  nativeGraphMoveNodes,
  nativeMoleculeInsert,
} from "../nativeGraph";

const mockInvoke = invokeElementNative as ReturnType<typeof vi.fn>;
const mockLogError = logBridgeError as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockInvoke.mockReset();
  mockLogError.mockReset();
});

// ── nativeScriptGetRuntimeState ───────────────────────────────────────────────

describe("nativeScriptGetRuntimeState", () => {
  it("returns plain object response directly without re-parsing", async () => {
    const state = { ok: true, vars: [{ name: "x", type: "number", value: "1" }] };
    mockInvoke.mockResolvedValueOnce(state);
    const r = await nativeScriptGetRuntimeState("n1");
    expect(r).toBe(state);
  });

  it("returns { ok: false, error: 'no response' } when bridge returns null", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const r = await nativeScriptGetRuntimeState("n1");
    expect(r).toEqual({ ok: false, error: "no response" });
  });

  it("returns { ok: false, error: 'parse error' } and logs on malformed JSON string", async () => {
    mockInvoke.mockResolvedValueOnce("{bad json");
    const r = await nativeScriptGetRuntimeState("n1");
    expect(r).toEqual({ ok: false, error: "parse error" });
    expect(mockLogError).toHaveBeenCalledOnce();
    expect(mockLogError.mock.calls[0][0]).toBe("nativeScriptGetRuntimeState.parse");
  });
});

// ── nativeSessionGetGraphTree ─────────────────────────────────────────────────

describe("nativeSessionGetGraphTree", () => {
  it("returns [] when bridge returns a number (not a string)", async () => {
    mockInvoke.mockResolvedValueOnce(42);
    const r = await nativeSessionGetGraphTree();
    expect(r).toEqual([]);
  });

  it("returns [] and logs when bridge returns invalid JSON string", async () => {
    mockInvoke.mockResolvedValueOnce("{{invalid");
    const r = await nativeSessionGetGraphTree();
    expect(r).toEqual([]);
    expect(mockLogError).toHaveBeenCalledOnce();
    expect(mockLogError.mock.calls[0][0]).toBe("nativeSessionGetGraphTree.parse");
  });
});

// ── nativeGraphGetConnectionList ──────────────────────────────────────────────

describe("nativeGraphGetConnectionList", () => {
  it("returns [] when bridge returns a non-string value", async () => {
    mockInvoke.mockResolvedValueOnce({ unexpected: true });
    const r = await nativeGraphGetConnectionList();
    expect(r).toEqual([]);
  });

  it("returns [] and logs when bridge returns invalid JSON string", async () => {
    mockInvoke.mockResolvedValueOnce("[bad");
    const r = await nativeGraphGetConnectionList();
    expect(r).toEqual([]);
    expect(mockLogError).toHaveBeenCalledOnce();
    expect(mockLogError.mock.calls[0][0]).toBe("nativeGraphGetConnectionList.parse");
  });
});

// ── nativeGetNodeParameters ───────────────────────────────────────────────────

describe("nativeGetNodeParameters", () => {
  it("returns { parameters: [] } when bridge returns null", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const r = await nativeGetNodeParameters("n1");
    expect(r).toEqual({ parameters: [] });
  });

  it("returns { parameters: [] } and logs when bridge returns invalid JSON string", async () => {
    mockInvoke.mockResolvedValueOnce("{nope");
    const r = await nativeGetNodeParameters("n1");
    expect(r).toEqual({ parameters: [] });
    expect(mockLogError).toHaveBeenCalledOnce();
    expect(mockLogError.mock.calls[0][0]).toBe("nativeGetNodeParameters.parse");
  });

  it("parses a valid JSON string with a parameters array", async () => {
    const params = [{ index: 0, name: "Gain", value: 0.8, defaultValue: 1.0 }];
    mockInvoke.mockResolvedValueOnce(JSON.stringify({ parameters: params }));
    const r = await nativeGetNodeParameters("n1");
    expect(r.parameters).toHaveLength(1);
    expect(r.parameters[0].name).toBe("Gain");
  });
});

// ── nativePresetList ──────────────────────────────────────────────────────────

describe("nativePresetList", () => {
  it("returns { ok: false, presets: [], error: 'parse error' } and logs on parse error", async () => {
    mockInvoke.mockResolvedValueOnce("{bad");
    const r = await nativePresetList();
    expect(r).toEqual({ ok: false, presets: [], error: "parse error" });
    expect(mockLogError).toHaveBeenCalledOnce();
    expect(mockLogError.mock.calls[0][0]).toBe("nativePresetList.parse");
  });

  it("returns { ok: false, presets: [], error: 'no response' } when bridge returns non-string", async () => {
    mockInvoke.mockResolvedValueOnce(99);
    const r = await nativePresetList();
    expect(r).toEqual({ ok: false, presets: [], error: "no response" });
  });
});

// ── nativeGraphMoveNodes ──────────────────────────────────────────────────────

describe("nativeGraphMoveNodes", () => {
  it("returns 0 when bridge returns a non-number value", async () => {
    mockInvoke.mockResolvedValueOnce("not-a-number");
    const r = await nativeGraphMoveNodes([{ id: "n1", x: 10, y: 20 }]);
    expect(r).toBe(0);
  });

  it("returns the host number unchanged when bridge returns a number", async () => {
    mockInvoke.mockResolvedValueOnce(3);
    const r = await nativeGraphMoveNodes([
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 0, y: 0 },
      { id: "n3", x: 0, y: 0 },
    ]);
    expect(r).toBe(3);
  });
});

// ── nativeMoleculeInsert ──────────────────────────────────────────────────────

describe("nativeMoleculeInsert", () => {
  it("returns 0 when bridge returns a non-number value", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const r = await nativeMoleculeInsert("ReverbChain");
    expect(r).toBe(0);
  });

  it("returns the host number unchanged when bridge returns a number", async () => {
    mockInvoke.mockResolvedValueOnce(42);
    const r = await nativeMoleculeInsert("ReverbChain", 50, 80);
    expect(r).toBe(42);
  });
});
