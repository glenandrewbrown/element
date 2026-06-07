/**
 * Tests for bridge/nativeGraph.ts — wrapper coverage.
 *
 * Exercises the REAL invokeElementNative via installJuceBridgeMock so the
 * juceBackend.ts shape (window.__JUCE__.backend.invokeNativeFunction) is
 * also under test. Bucketed by return shape:
 *   - Boolean wrappers (host -> bool === true ? true : false)
 *   - Number wrappers  (host -> typeof === "number" ? r : 0)
 *   - Void   wrappers  (no return inspection)
 *   - String wrappers  (typeof === "string" ? r : "")
 *   - JSON-parse wrappers (parse + bail to safe default, log on parse error)
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
  nativeGraphAddPlugin,
  nativeGraphAddPluginConnected,
  nativeGraphRemoveNode,
  nativeGraphConnect,
  nativeGraphDisconnect,
  nativeGraphSetMute,
  nativeGraphSetMuteInput,
  nativeGraphDisconnectNode,
  nativeGraphSetNodeColor,
  nativeGraphSetOversample,
  nativeGraphReplacePlugin,
  nativeGraphSetCanvasOptions,
  nativeGraphSetCableBus,
  nativeGraphSetViewport,
  nativeGraphDuplicateNode,
  nativeGraphRenameNode,
  nativeGraphSetNodeNote,
  nativeGraphSetNodeHiddenParams,
  nativeGraphSetNodeCollapsed,
  nativeGraphCommentAdd,
  nativeGraphCommentUpsert,
  nativeGraphCommentDelete,
  nativeTransportStop,
  nativeTransportRewind,
  nativeTransportSetRecording,
  nativeTransportSetTempo,
  nativeSetNodeParameter,
  nativeGraphMoveNodes,
  nativeGraphAutoLayout,
  nativeMoleculeInsert,
  nativeGraphDuplicateNodes,
  nativeGraphCopyNodes,
  nativeGraphPasteNodes,
  nativeUndo,
  nativeRedo,
  nativeTransportPanic,
  nativeTransportTogglePlay,
  nativeScriptGetSource,
  nativeScriptSetSource,
  nativeScriptCompile,
  nativeScriptGetRuntimeState,
  nativeGraphGetConnectionList,
  nativePresetSwap,
  nativePresetSave,
  nativePresetLoad,
  nativePresetList,
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

// ─────────────────────────────────────────────────────────────────────────────
// Extended coverage (May 2026) — exhaustive wrapper sweep
// ─────────────────────────────────────────────────────────────────────────────

let bridge: JuceBridgeMock;
beforeEach(() => {
  bridge = installJuceBridgeMock();
  mockLogBridgeError.mockReset();
});
afterEach(() => {
  bridge.uninstall();
});

// ── Boolean wrappers — table-driven ──
type BoolCase = {
  name: string;
  call: () => Promise<boolean>;
  nativeName: string;
  args: unknown[];
};

const booleanCases: BoolCase[] = [
  {
    name: "nativeGraphAddPlugin",
    call: () => nativeGraphAddPlugin("vst3:foo"),
    nativeName: "elementGraphAddPlugin",
    args: ["vst3:foo"],
  },
  {
    name: "nativeGraphRemoveNode",
    call: () => nativeGraphRemoveNode("n-1"),
    nativeName: "elementGraphRemoveNode",
    args: ["n-1"],
  },
  {
    name: "nativeGraphConnect",
    call: () => nativeGraphConnect("a", "out", "b", "in"),
    nativeName: "elementGraphConnect",
    args: ["a", "out", "b", "in"],
  },
  // T3 — ⌥+drop add-and-connect: positional add + auto-connect to origin port.
  // Marshalls identifier, flow x/y, origin uuid, origin port id, and the
  // origin-is-source flag in order.
  {
    name: "nativeGraphAddPluginConnected (origin is source/output)",
    call: () =>
      nativeGraphAddPluginConnected("vst3:reverb", 320, 180, "n-src", "out-0", true),
    nativeName: "elementGraphAddPluginConnected",
    args: ["vst3:reverb", 320, 180, "n-src", "out-0", true],
  },
  {
    name: "nativeGraphAddPluginConnected (origin is target/input)",
    call: () =>
      nativeGraphAddPluginConnected("vst3:synth", -40, 12.5, "n-dst", "in-1", false),
    nativeName: "elementGraphAddPluginConnected",
    args: ["vst3:synth", -40, 12.5, "n-dst", "in-1", false],
  },
  {
    name: "nativeGraphDisconnect",
    call: () => nativeGraphDisconnect("a", "out", "b", "in"),
    nativeName: "elementGraphDisconnect",
    args: ["a", "out", "b", "in"],
  },
  {
    name: "nativeGraphSetMute",
    call: () => nativeGraphSetMute("n", true),
    nativeName: "elementGraphSetMute",
    args: ["n", true],
  },
  {
    name: "nativeGraphSetMuteInput",
    call: () => nativeGraphSetMuteInput("n", false),
    nativeName: "elementGraphSetMuteInput",
    args: ["n", false],
  },
  // ── G3-A: NodeContextMenu native-parity bridges ──
  {
    name: "nativeGraphDisconnectNode (inputs scope)",
    call: () => nativeGraphDisconnectNode("node-1", "inputs"),
    nativeName: "elementGraphDisconnectNode",
    args: ["node-1", "inputs"],
  },
  {
    name: "nativeGraphDisconnectNode (default scope = all)",
    call: () => nativeGraphDisconnectNode("node-1"),
    nativeName: "elementGraphDisconnectNode",
    args: ["node-1", "all"],
  },
  {
    name: "nativeGraphDisconnectNode (midi scope)",
    call: () => nativeGraphDisconnectNode("node-1", "midi"),
    nativeName: "elementGraphDisconnectNode",
    args: ["node-1", "midi"],
  },
  {
    name: "nativeGraphSetNodeColor",
    call: () => nativeGraphSetNodeColor("node-1", "#4A90D9"),
    nativeName: "elementGraphSetNodeColor",
    args: ["node-1", "#4A90D9"],
  },
  {
    name: "nativeGraphSetNodeColor (clear)",
    call: () => nativeGraphSetNodeColor("node-1", ""),
    nativeName: "elementGraphSetNodeColor",
    args: ["node-1", ""],
  },
  {
    name: "nativeGraphSetOversample",
    call: () => nativeGraphSetOversample("node-1", 4),
    nativeName: "elementGraphSetOversample",
    args: ["node-1", 4],
  },
  {
    name: "nativeGraphReplacePlugin",
    call: () => nativeGraphReplacePlugin("node-1", "VST3-Serum-1234"),
    nativeName: "elementGraphReplacePlugin",
    args: ["node-1", "VST3-Serum-1234"],
  },
  {
    name: "nativeGraphSetCanvasOptions",
    call: () => nativeGraphSetCanvasOptions(true, 24),
    nativeName: "elementGraphSetCanvasOptions",
    args: [true, 24],
  },
  {
    name: "nativeGraphSetCableBus",
    call: () => nativeGraphSetCableBus("c-1", "Reverb"),
    nativeName: "elementGraphSetCableBus",
    args: ["c-1", "Reverb"],
  },
  {
    name: "nativeGraphSetViewport",
    call: () => nativeGraphSetViewport(10, 20, 1.5),
    nativeName: "elementGraphSetViewport",
    args: [10, 20, 1.5],
  },
  {
    name: "nativeGraphDuplicateNode",
    call: () => nativeGraphDuplicateNode("n"),
    nativeName: "elementGraphDuplicateNode",
    args: ["n"],
  },
  {
    name: "nativeGraphRenameNode",
    call: () => nativeGraphRenameNode("n", "Lead"),
    nativeName: "elementGraphRenameNode",
    args: ["n", "Lead"],
  },
  {
    name: "nativeGraphSetNodeNote",
    call: () => nativeGraphSetNodeNote("n", "hi"),
    nativeName: "elementGraphSetNodeNote",
    args: ["n", "hi"],
  },
  // Hidden params: the array is joined to a CSV before crossing the bridge.
  {
    name: "nativeGraphSetNodeHiddenParams (CSV join)",
    call: () => nativeGraphSetNodeHiddenParams("n", ["p-mix", "p-width"]),
    nativeName: "elementGraphSetNodeHiddenParams",
    args: ["n", "p-mix,p-width"],
  },
  {
    name: "nativeGraphSetNodeHiddenParams (empty → clears)",
    call: () => nativeGraphSetNodeHiddenParams("n", []),
    nativeName: "elementGraphSetNodeHiddenParams",
    args: ["n", ""],
  },
  // Persisted collapse (Decision A-2a) — boolean crosses the bridge verbatim.
  {
    name: "nativeGraphSetNodeCollapsed (collapse)",
    call: () => nativeGraphSetNodeCollapsed("n", true),
    nativeName: "elementNodeSetCollapsed",
    args: ["n", true],
  },
  {
    name: "nativeGraphSetNodeCollapsed (expand)",
    call: () => nativeGraphSetNodeCollapsed("n", false),
    nativeName: "elementNodeSetCollapsed",
    args: ["n", false],
  },
  {
    name: "nativeGraphCommentAdd (defaults)",
    call: () => nativeGraphCommentAdd(0, 0),
    nativeName: "elementGraphCommentAdd",
    args: [0, 0, 240, 160],
  },
  {
    name: "nativeGraphCommentAdd (explicit size)",
    call: () => nativeGraphCommentAdd(5, 7, 300, 200),
    nativeName: "elementGraphCommentAdd",
    args: [5, 7, 300, 200],
  },
  {
    name: "nativeGraphCommentDelete",
    call: () => nativeGraphCommentDelete("cb-1"),
    nativeName: "elementGraphCommentDelete",
    args: ["cb-1"],
  },
  {
    name: "nativeTransportStop",
    call: () => nativeTransportStop(),
    nativeName: "elementTransportStop",
    args: [],
  },
  {
    name: "nativeTransportRewind",
    call: () => nativeTransportRewind(),
    nativeName: "elementTransportRewind",
    args: [],
  },
  {
    name: "nativeTransportSetRecording",
    call: () => nativeTransportSetRecording(true),
    nativeName: "elementTransportSetRecording",
    args: [true],
  },
  {
    name: "nativeTransportSetTempo",
    call: () => nativeTransportSetTempo(120),
    nativeName: "elementTransportSetTempo",
    args: [120],
  },
  {
    name: "nativeSetNodeParameter",
    call: () => nativeSetNodeParameter("n", 3, 0.42),
    nativeName: "elementSetNodeParameter",
    args: ["n", 3, 0.42],
  },
];

describe("boolean wrappers — table-driven", () => {
  for (const c of booleanCases) {
    describe(c.name, () => {
      it("returns true on host true + invokes the correct native fn with args", async () => {
        bridge.mock.mockResolvedValueOnce(true);
        expect(await c.call()).toBe(true);
        expect(bridge.mock).toHaveBeenCalledWith(c.nativeName, c.args);
      });

      it("returns false on host false", async () => {
        bridge.mock.mockResolvedValueOnce(false);
        expect(await c.call()).toBe(false);
      });

      it("returns false on non-boolean host response (strict ===)", async () => {
        bridge.mock.mockResolvedValueOnce("true"); // truthy but not boolean
        expect(await c.call()).toBe(false);
      });

      it("returns false on undefined host response", async () => {
        bridge.mock.mockResolvedValueOnce(undefined);
        expect(await c.call()).toBe(false);
      });
    });
  }
});

describe("nativeGraphCommentUpsert (boolean + JSON.stringify of payload)", () => {
  it("serialises the payload as a JSON string before calling the native fn", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const payload = { id: "cb1", x: 1, y: 2, width: 3, height: 4 };
    expect(await nativeGraphCommentUpsert(payload)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementGraphCommentUpsert", [
      JSON.stringify(payload),
    ]);
  });

  it("returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(
      await nativeGraphCommentUpsert({
        id: "x",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      }),
    ).toBe(false);
  });
});

// ── Number wrappers — table-driven ──
type NumCase = {
  name: string;
  call: () => Promise<number>;
  nativeName: string;
  args: unknown[];
};

const numberCases: NumCase[] = [
  {
    name: "nativeGraphMoveNodes",
    call: () =>
      nativeGraphMoveNodes([
        { id: "n1", x: 1, y: 2 },
        { id: "n2", x: 3, y: 4 },
      ]),
    nativeName: "elementGraphMoveNodes",
    args: [
      [
        { id: "n1", x: 1, y: 2 },
        { id: "n2", x: 3, y: 4 },
      ],
    ],
  },
  {
    name: "nativeGraphAutoLayout",
    call: () =>
      nativeGraphAutoLayout([
        { id: "n1", x: 80, y: 80 },
        { id: "n2", x: 360, y: 80 },
      ]),
    nativeName: "elementGraphAutoLayout",
    args: [
      [
        { id: "n1", x: 80, y: 80 },
        { id: "n2", x: 360, y: 80 },
      ],
    ],
  },
  {
    name: "nativeMoleculeInsert (defaults)",
    call: () => nativeMoleculeInsert("ReverbChain"),
    nativeName: "elementMoleculeInsert",
    args: ["ReverbChain", 120, 120],
  },
  {
    name: "nativeMoleculeInsert (explicit position)",
    call: () => nativeMoleculeInsert("ReverbChain", 50, 60),
    nativeName: "elementMoleculeInsert",
    args: ["ReverbChain", 50, 60],
  },
  {
    name: "nativeGraphDuplicateNodes",
    call: () => nativeGraphDuplicateNodes(["a", "b"]),
    nativeName: "elementGraphDuplicateNodes",
    args: [["a", "b"]],
  },
  {
    name: "nativeGraphCopyNodes",
    call: () => nativeGraphCopyNodes(["a", "b"]),
    nativeName: "elementGraphCopyNodes",
    args: [["a", "b"]],
  },
  {
    name: "nativeGraphPasteNodes",
    call: () => nativeGraphPasteNodes(),
    nativeName: "elementGraphPasteNodes",
    args: [],
  },
];

describe("number wrappers — table-driven", () => {
  for (const c of numberCases) {
    describe(c.name, () => {
      it("forwards the host number response unchanged and invokes the correct fn", async () => {
        bridge.mock.mockResolvedValueOnce(7);
        expect(await c.call()).toBe(7);
        expect(bridge.mock).toHaveBeenCalledWith(c.nativeName, c.args);
      });

      it("returns 0 when the host returns a non-number", async () => {
        bridge.mock.mockResolvedValueOnce("nope");
        expect(await c.call()).toBe(0);
      });

      it("returns 0 when the host returns undefined", async () => {
        bridge.mock.mockResolvedValueOnce(undefined);
        expect(await c.call()).toBe(0);
      });
    });
  }
});

// ── Void wrappers — fire-and-forget, only assert the call shape ──
type VoidCase = {
  name: string;
  call: () => Promise<void>;
  nativeName: string;
};

const voidCases: VoidCase[] = [
  { name: "nativeUndo", call: () => nativeUndo(), nativeName: "elementUndo" },
  { name: "nativeRedo", call: () => nativeRedo(), nativeName: "elementRedo" },
  {
    name: "nativeTransportPanic",
    call: () => nativeTransportPanic(),
    nativeName: "elementTransportPanic",
  },
  {
    name: "nativeTransportTogglePlay",
    call: () => nativeTransportTogglePlay(),
    nativeName: "elementTransportTogglePlay",
  },
];

describe("void wrappers — table-driven", () => {
  for (const c of voidCases) {
    it(`${c.name} fires the correct native call with [] args`, async () => {
      bridge.mock.mockResolvedValueOnce(undefined);
      await c.call();
      expect(bridge.mock).toHaveBeenCalledWith(c.nativeName, []);
    });
  }
});

describe("nativeScriptGetSource (string wrapper)", () => {
  it("returns the host string verbatim", async () => {
    bridge.mock.mockResolvedValueOnce("print('hi')");
    expect(await nativeScriptGetSource("n")).toBe("print('hi')");
    expect(bridge.mock).toHaveBeenCalledWith("elementScriptGetSource", ["n"]);
  });

  it("returns '' when the host returns a non-string", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeScriptGetSource("n")).toBe("");
  });

  it("returns '' when the host returns undefined", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeScriptGetSource("n")).toBe("");
  });
});

describe("nativeScriptSetSource / nativeScriptCompile (ScriptCompileResult)", () => {
  it("nativeScriptSetSource happy path parses ok=true + error=''", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ ok: true, error: "" }));
    const r = await nativeScriptSetSource("n", "x=1");
    expect(r).toEqual({ ok: true, error: "" });
    expect(bridge.mock).toHaveBeenCalledWith("elementScriptSetSource", [
      "n",
      "x=1",
    ]);
  });

  it("nativeScriptSetSource defaults missing fields", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ ok: false }));
    const r = await nativeScriptSetSource("n", "x");
    expect(r).toEqual({ ok: false, error: "" });
  });

  it("nativeScriptSetSource returns 'no response' on non-string host result", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeScriptSetSource("n", "x")).toEqual({
      ok: false,
      error: "no response",
    });
  });

  it("nativeScriptSetSource returns 'invalid response' + logs on bad JSON", async () => {
    bridge.mock.mockResolvedValueOnce("{nope");
    expect(await nativeScriptSetSource("n", "x")).toEqual({
      ok: false,
      error: "invalid response",
    });
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeScriptSetSource.parse",
    );
  });

  it("nativeScriptCompile happy path", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ ok: true, error: "" }));
    expect(await nativeScriptCompile("n")).toEqual({ ok: true, error: "" });
    expect(bridge.mock).toHaveBeenCalledWith("elementScriptCompile", ["n"]);
  });

  it("nativeScriptCompile returns 'no response' on non-string", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeScriptCompile("n")).toEqual({
      ok: false,
      error: "no response",
    });
  });

  it("nativeScriptCompile returns 'invalid response' + logs on bad JSON", async () => {
    bridge.mock.mockResolvedValueOnce("{nope");
    expect(await nativeScriptCompile("n")).toEqual({
      ok: false,
      error: "invalid response",
    });
    expect(mockLogBridgeError).toHaveBeenCalled();
  });
});

describe("nativeScriptGetRuntimeState (string|object union)", () => {
  it("parses a JSON string", async () => {
    const state = { ok: true, vars: [{ name: "x", type: "int", value: "1" }] };
    bridge.mock.mockResolvedValueOnce(JSON.stringify(state));
    const r = await nativeScriptGetRuntimeState("n");
    expect(r.ok).toBe(true);
    expect(r.vars?.[0].name).toBe("x");
  });

  it("returns object responses as-is (no parse)", async () => {
    const state = { ok: true, vars: [] };
    bridge.mock.mockResolvedValueOnce(state);
    expect(await nativeScriptGetRuntimeState("n")).toBe(state);
  });

  it("returns parse error and logs when JSON is malformed", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    expect(await nativeScriptGetRuntimeState("n")).toEqual({
      ok: false,
      error: "parse error",
    });
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeScriptGetRuntimeState.parse",
    );
  });

  it("returns 'no response' when host returns null", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeScriptGetRuntimeState("n")).toEqual({
      ok: false,
      error: "no response",
    });
  });
});

describe("nativeGraphGetConnectionList (JSON array)", () => {
  it("parses a JSON array of connection entries", async () => {
    const list = [
      {
        id: "c1",
        source: "n1",
        sourcePort: "out0",
        target: "n2",
        targetPort: "in0",
        signalType: "audio",
        channelCount: 2,
      },
    ];
    bridge.mock.mockResolvedValueOnce(JSON.stringify(list));
    const r = await nativeGraphGetConnectionList();
    expect(r).toHaveLength(1);
    expect(r[0].channelCount).toBe(2);
  });

  it("returns [] on non-string host response", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeGraphGetConnectionList()).toEqual([]);
  });

  it("returns [] and logs on parse error", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    expect(await nativeGraphGetConnectionList()).toEqual([]);
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeGraphGetConnectionList.parse",
    );
  });
});

describe("preset wrappers (JSON-parse + safe defaults)", () => {
  it("nativePresetSwap happy path returns ok + swapped count", async () => {
    bridge.mock.mockResolvedValueOnce(
      JSON.stringify({ ok: true, swapped: 5 }),
    );
    const r = await nativePresetSwap("n", "B");
    expect(r).toEqual({ ok: true, swapped: 5 });
    expect(bridge.mock).toHaveBeenCalledWith("elementPresetSwap", ["n", "B"]);
  });

  it("nativePresetSwap parse error returns swapped=0 + logs", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    expect(await nativePresetSwap("n", "A")).toEqual({
      ok: false,
      swapped: 0,
      error: "parse error",
    });
    expect(mockLogBridgeError.mock.calls[0][0]).toBe("nativePresetSwap.parse");
  });

  it("nativePresetSwap returns 'no response' on null host", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativePresetSwap("n", "A")).toEqual({
      ok: false,
      swapped: 0,
      error: "no response",
    });
  });

  it("nativePresetSave happy path", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ ok: true }));
    expect(await nativePresetSave("n", "preset.fxp")).toEqual({ ok: true });
    expect(bridge.mock).toHaveBeenCalledWith("elementPresetSave", [
      "n",
      "preset.fxp",
    ]);
  });

  it("nativePresetSave parse error + logs", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    expect(await nativePresetSave("n", "p")).toEqual({
      ok: false,
      error: "parse error",
    });
    expect(mockLogBridgeError.mock.calls[0][0]).toBe("nativePresetSave.parse");
  });

  it("nativePresetSave 'no response' on non-string", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativePresetSave("n", "p")).toEqual({
      ok: false,
      error: "no response",
    });
  });

  it("nativePresetLoad happy path", async () => {
    bridge.mock.mockResolvedValueOnce(JSON.stringify({ ok: true }));
    expect(await nativePresetLoad("n", "p")).toEqual({ ok: true });
    expect(bridge.mock).toHaveBeenCalledWith("elementPresetLoad", ["n", "p"]);
  });

  it("nativePresetLoad parse error", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    expect(await nativePresetLoad("n", "p")).toEqual({
      ok: false,
      error: "parse error",
    });
    expect(mockLogBridgeError.mock.calls[0][0]).toBe("nativePresetLoad.parse");
  });

  it("nativePresetList happy path with filter", async () => {
    bridge.mock.mockResolvedValueOnce(
      JSON.stringify({ ok: true, presets: ["a", "b"] }),
    );
    expect(await nativePresetList("vst3:foo")).toEqual({
      ok: true,
      presets: ["a", "b"],
    });
    expect(bridge.mock).toHaveBeenCalledWith("elementPresetList", ["vst3:foo"]);
  });

  it("nativePresetList default pluginId is empty string", async () => {
    bridge.mock.mockResolvedValueOnce(
      JSON.stringify({ ok: true, presets: [] }),
    );
    await nativePresetList();
    expect(bridge.mock).toHaveBeenCalledWith("elementPresetList", [""]);
  });

  it("nativePresetList parse error returns empty array", async () => {
    bridge.mock.mockResolvedValueOnce("{bad");
    expect(await nativePresetList()).toEqual({
      ok: false,
      presets: [],
      error: "parse error",
    });
    expect(mockLogBridgeError.mock.calls[0][0]).toBe("nativePresetList.parse");
  });

  it("nativePresetList 'no response' on non-string", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativePresetList()).toEqual({
      ok: false,
      presets: [],
      error: "no response",
    });
  });
});
