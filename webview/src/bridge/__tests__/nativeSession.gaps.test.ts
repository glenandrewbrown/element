/**
 * nativeSession — gap coverage.
 *
 * Uncovered paths (lines 16, 23, 30, 38, 44, 57):
 *   nativeSessionOpen — boolean return
 *   nativeSessionOpenPath — boolean return + path arg
 *   nativeSessionSetActiveGraph — boolean return + index arg
 *   nativeSessionImportGraph — boolean return
 *   nativeSessionExportGraph — boolean return
 *   nativeSessionListFiles — non-string response → []
 *                          — invalid JSON → [] (logBridgeError path)
 *                          — missing entries key → []
 *                          — valid entries array
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BridgePresets,
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import {
  nativeSessionOpen,
  nativeSessionOpenPath,
  nativeSessionSetActiveGraph,
  nativeSessionImportGraph,
  nativeSessionExportGraph,
  nativeSessionListFiles,
} from "../nativeSession";

let bridge: JuceBridgeMock;

beforeEach(() => {
  bridge = installJuceBridgeMock();
});

afterEach(() => {
  bridge.uninstall();
  vi.clearAllMocks();
});

// ── nativeSessionOpen ────────────────────────────────────────────────────────

describe("nativeSessionOpen", () => {
  it("returns true when bridge returns true", async () => {
    bridge.mock.mockResolvedValueOnce(BridgePresets.boolOk);
    expect(await nativeSessionOpen()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionOpen", []);
  });

  it("returns false when bridge returns false", async () => {
    bridge.mock.mockResolvedValueOnce(BridgePresets.boolFail);
    expect(await nativeSessionOpen()).toBe(false);
  });

  it("returns false for non-boolean response", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeSessionOpen()).toBe(false);
  });
});

// ── nativeSessionOpenPath ────────────────────────────────────────────────────

describe("nativeSessionOpenPath", () => {
  it("passes path and returns true on success", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionOpenPath("/path/to/session.els")).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionOpenPath", [
      "/path/to/session.els",
    ]);
  });

  it("returns false when bridge returns false (file not found / cancelled)", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionOpenPath("/bad/path.els")).toBe(false);
  });
});

// ── nativeSessionSetActiveGraph ───────────────────────────────────────────────

describe("nativeSessionSetActiveGraph", () => {
  it("returns true and passes graph index", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionSetActiveGraph(2)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionSetActiveGraph", [2]);
  });

  it("returns false when index out of range", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionSetActiveGraph(99)).toBe(false);
  });
});

// ── nativeSessionImportGraph ──────────────────────────────────────────────────

describe("nativeSessionImportGraph", () => {
  it("returns true on successful import", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionImportGraph()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionImportGraph", []);
  });

  it("returns false when user cancels chooser", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionImportGraph()).toBe(false);
  });
});

// ── nativeSessionExportGraph ──────────────────────────────────────────────────

describe("nativeSessionExportGraph", () => {
  it("returns true on successful export", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionExportGraph()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionExportGraph", []);
  });

  it("returns false when user cancels save dialog", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionExportGraph()).toBe(false);
  });
});

// ── nativeSessionListFiles ────────────────────────────────────────────────────

describe("nativeSessionListFiles", () => {
  it("returns empty array when bridge returns non-string (null)", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeSessionListFiles()).toEqual([]);
  });

  it("returns empty array when bridge returns a number", async () => {
    bridge.mock.mockResolvedValueOnce(42);
    expect(await nativeSessionListFiles()).toEqual([]);
  });

  it("returns empty array when JSON is invalid (logBridgeError path)", async () => {
    bridge.mock.mockResolvedValueOnce("not-valid-json{{{");
    expect(await nativeSessionListFiles()).toEqual([]);
  });

  it("returns empty array when parsed object has no entries key", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ other: [] }));
    expect(await nativeSessionListFiles()).toEqual([]);
  });

  it("returns empty array when entries is not an array", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ entries: "wrong" }));
    expect(await nativeSessionListFiles()).toEqual([]);
  });

  it("returns parsed entries on valid response", async () => {
    const entry = {
      path: "/sessions/my.els",
      name: "my",
      ext: ".els",
      modifiedMs: 1700000000000,
    };
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ entries: [entry] }));
    const result = await nativeSessionListFiles();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(entry);
  });
});
