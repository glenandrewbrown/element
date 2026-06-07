/**
 * Tests for bridge/nativeSession.ts.
 *
 * Covers boolean wrappers (nativeSessionOpen, nativeSessionOpenPath,
 * nativeSessionSetActiveGraph, nativeSessionImportGraph, nativeSessionExportGraph),
 * void wrappers (New, Save, SaveAs), and nativeSessionListFiles (JSON parse + error).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { logBridgeError } from "../bridgeError";
import {
  nativeSessionExportGraph,
  nativeSessionFindRecoverable,
  nativeSessionImportGraph,
  nativeSessionListFiles,
  nativeSessionNew,
  nativeSessionOpen,
  nativeSessionOpenPath,
  nativeSessionRecover,
  nativeSessionSave,
  nativeSessionSaveAs,
  nativeSessionSaveNamed,
  nativeSessionSetActiveGraph,
} from "../nativeSession";

vi.mock("../bridgeError", () => ({ logBridgeError: vi.fn() }));
const mockLogBridgeError = logBridgeError as ReturnType<typeof vi.fn>;

describe("boolean session wrappers", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("nativeSessionOpen happy: returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionOpen()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionOpen", []);
  });

  it("nativeSessionOpen error: returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionOpen()).toBe(false);
  });

  it("nativeSessionOpenPath happy: returns true and forwards path", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionOpenPath("/home/user/session.els")).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionOpenPath", [
      "/home/user/session.els",
    ]);
  });

  it("nativeSessionOpenPath error: returns false for bad path", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionOpenPath("/bad/path.els")).toBe(false);
  });

  it("nativeSessionSetActiveGraph happy: returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionSetActiveGraph(0)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith(
      "elementSessionSetActiveGraph",
      [0],
    );
  });

  it("nativeSessionSetActiveGraph error: returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionSetActiveGraph(99)).toBe(false);
  });

  it("nativeSessionImportGraph happy: returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionImportGraph()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionImportGraph", []);
  });

  it("nativeSessionExportGraph happy: returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionExportGraph()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionExportGraph", []);
  });
});

describe("void session wrappers", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("nativeSessionNew resolves void", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeSessionNew()).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionNew", []);
  });

  it("nativeSessionSave resolves void", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeSessionSave()).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionSave", []);
  });

  it("nativeSessionSaveAs resolves void", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeSessionSaveAs()).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionSaveAs", []);
  });
});

describe("nativeSessionListFiles", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns parsed entries array from JSON string", async () => {
    const entries = [
      { path: "/a/b.els", name: "b", ext: ".els", modifiedMs: 1000 },
    ];
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ entries }));
    const result = await nativeSessionListFiles();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("b");
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionListFiles", []);
  });

  it("returns empty array when host returns non-string", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeSessionListFiles()).toEqual([]);
  });

  it("returns empty array when JSON missing entries field", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ other: [] }));
    expect(await nativeSessionListFiles()).toEqual([]);
  });

  it("returns empty array and calls logBridgeError on invalid JSON", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    expect(await nativeSessionListFiles()).toEqual([]);
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeSessionListFiles.parse",
    );
  });

  it("preserves isAutosave flag from host entries (E8 shelf)", async () => {
    const entries = [
      { path: "/s/a.els", name: "a", ext: ".els", modifiedMs: 1, isAutosave: false },
      {
        path: "/s/autosave_x.els",
        name: "Untitled — recovered",
        ext: ".els",
        modifiedMs: 2,
        isAutosave: true,
      },
    ];
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ entries }));
    const result = await nativeSessionListFiles();
    expect(result).toHaveLength(2);
    expect(result[1].isAutosave).toBe(true);
  });
});

// ── 4b — named-save (E6) + recovery (E1) wrappers ─────────────────────────────
describe("nativeSessionSaveNamed (E6)", () => {
  let bridge: JuceBridgeMock;
  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });
  afterEach(() => {
    bridge.uninstall();
  });

  it("forwards the name and returns true on success", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionSaveNamed("My Project")).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionSaveNamed", [
      "My Project",
    ]);
  });

  it("returns false when the host rejects (e.g. empty name)", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionSaveNamed("")).toBe(false);
  });
});

describe("nativeSessionRecover (E1)", () => {
  let bridge: JuceBridgeMock;
  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });
  afterEach(() => {
    bridge.uninstall();
  });

  it("forwards the path and returns true on success", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeSessionRecover("/s/autosave_x.els")).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSessionRecover", [
      "/s/autosave_x.els",
    ]);
  });

  it("returns false when recovery fails", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSessionRecover("/bad.els")).toBe(false);
  });
});

describe("nativeSessionFindRecoverable (E1)", () => {
  let bridge: JuceBridgeMock;
  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });
  afterEach(() => {
    bridge.uninstall();
  });

  it("parses a recoverable autosave object", async () => {
    bridge.mock.mockResolvedValueOnce(
      JSON.stringify({
        path: "/s/autosave_x.els",
        name: "Untitled — recovered",
        untitled: true,
        modifiedMs: 42,
      }),
    );
    const r = await nativeSessionFindRecoverable();
    expect(r).not.toBeNull();
    expect(r?.path).toBe("/s/autosave_x.els");
    expect(r?.untitled).toBe(true);
    expect(r?.modifiedMs).toBe(42);
  });

  it("returns null for an empty result object (none recoverable)", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({}));
    expect(await nativeSessionFindRecoverable()).toBeNull();
  });

  it("returns null and logs on invalid JSON", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    expect(await nativeSessionFindRecoverable()).toBeNull();
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
  });

  it("returns null when host returns non-string", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeSessionFindRecoverable()).toBeNull();
  });
});
