/**
 * useJuceBridge mapper tests — exercises the pure mapping functions
 * (inferCategory, mapBlock, mapCable, mapCommentBoxes, parseGraphOutline)
 * by pushing engine snapshots through `window.__elementNative.onGraphState`
 * and asserting the resulting Zustand store state.
 *
 * This approach tests the real mapper logic without exporting internals.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { useJuceBridge } from "../useJuceBridge";
import { useGraphStore } from "../../stores/useGraphStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useAppStore } from "../../stores/useAppStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { useParameterStore } from "../../stores/useParameterStore";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";

// ── helpers ───────────────────────────────────────────────────────────────────

let bridge: JuceBridgeMock;

function resetStores() {
  useAppStore.setState({
    hostReady: false, refreshNonce: 0, activeScene: 0, mode: "edit",
    leftPanelOpen: true, rightPanelOpen: true, bottomPanelOpen: true,
    virtualKeyboardOpen: false, openBlockTabs: [], spatialBookmarks: {},
    cableRouting: "manhattan",
  });
  useSessionStore.setState({
    sessionLoaded: false, filePath: "", dirty: false, recentFiles: [], graphs: [],
  });
  useGraphStore.setState({ nodes: [], edges: [], commentBoxes: [], breadcrumbs: undefined } as any);
  usePluginBrowserStore.setState({
    plugins: [],
    favoriteIdentifiers: new Set<string>(),
    recentIdentifiers: [],
  });
  useEngineSnapshotStore.getState().stopPolling?.();
  useEngineSnapshotStore.setState((s: any) => ({
    ...s, cpu: 0, engineRunning: false, hasHostData: false,
  }));
  useParameterStore.setState({ values: {} });
  useHostExtrasStore.setState((s) => ({
    ...s, activeGraphOutline: [], midiMapping: { learning: false, maps: [] },
  }));
  usePerformStore.setState((s) => ({ ...s, scenes: [], isPlaying: false }));
}

function mountHook() {
  return renderHook(() => useJuceBridge());
}

function pushSnapshot(payload: unknown) {
  act(() => {
    window.__elementNative?.onGraphState?.(payload);
  });
}

beforeEach(() => {
  bridge = installJuceBridgeMock();
  // Resolve initial fetch to undefined so boot IIFE doesn't interfere
  bridge.mock.mockResolvedValue(undefined);
  resetStores();
});

afterEach(() => {
  bridge.uninstall();
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ── inferCategory ─────────────────────────────────────────────────────────────

describe("inferCategory via mapBlock", () => {
  it("returns 'midifx' for container blocks", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "1", name: "Container", isContainer: true }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.category).toBe("midifx");
  });

  it("returns 'midifx' for blocks with 'midi' in name", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "1", name: "MIDI Router" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.category).toBe("midifx");
  });

  it("returns 'instrument' for blocks with 'input' in name", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "1", name: "Audio Input" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.category).toBe("instrument");
  });

  it("returns 'audiofx' for blocks with 'output' in name (output is a sink)", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "1", name: "Stereo Output" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.category).toBe("audiofx");
  });

  it("returns 'audiofx' as default fallback", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "1", name: "Compressor" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.category).toBe("audiofx");
  });

  it("returns 'modulator' for blocks with 'lfo' in name", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "1", name: "LFO Tool" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.category).toBe("modulator");
  });

  it("returns 'instrument' for blocks with 'synth' in name", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "1", name: "SynthMaster" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.category).toBe("instrument");
  });

  it("honours explicit category from engine JSON (BUG-012)", () => {
    mountHook();
    pushSnapshot({
      // Engine explicitly sets category — should NOT be overridden by inferCategory
      blocks: [{ id: "1", name: "Diva", category: "audiofx" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.category).toBe("audiofx");
  });
});

// ── mapBlock ──────────────────────────────────────────────────────────────────

describe("mapBlock field mapping", () => {
  it("maps id and name", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "Test Synth" }], cables: [] });
    const n = useGraphStore.getState().nodes[0];
    expect(n?.id).toBe("b1");
    expect(n?.name).toBe("Test Synth");
  });

  it("defaults position to {x:0, y:0} when absent", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it("uses engine x/y when provided", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X", x: 50, y: 100 }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.position).toEqual({ x: 50, y: 100 });
  });

  it("defaults bypassed to false", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.bypassed).toBe(false);
  });

  it("maps bypassed=true", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X", bypassed: true }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.bypassed).toBe(true);
  });

  it("defaults cpuLoad to 0 when absent", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.cpuLoad).toBe(0);
  });

  it("maps cpuLoad when positive", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X", cpuLoad: 42 }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.cpuLoad).toBe(42);
  });

  it("defaults latencyMs to 0 when absent", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.latencyMs).toBe(0);
  });

  it("maps hostColor when string", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X", color: "ff4400ff" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.hostColor).toBe("ff4400ff");
  });

  it("omits hostColor when empty string", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X", color: "" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.hostColor).toBeUndefined();
  });

  it("honours explicit format from engine JSON (BUG-013)", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X", format: "VST3" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.format).toBe("VST3");
  });

  // ── hiddenParams CSV → array (Configure Parameters… persistence) ──
  it("defaults hiddenParams to [] when absent", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.hiddenParams).toEqual([]);
  });

  it("defaults hiddenParams to [] when the CSV is empty", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X", hiddenParams: "" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.hiddenParams).toEqual([]);
  });

  it("splits a hiddenParams CSV into a trimmed, blank-free array", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "b1", name: "X", hiddenParams: "p-mix, p-width ,,p-decay" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.hiddenParams).toEqual([
      "p-mix",
      "p-width",
      "p-decay",
    ]);
  });

  // ── identifier + intMode (P0 — inline logic/comparator controls) ──
  it("maps the internal identifier through for all blocks", () => {
    mountHook();
    pushSnapshot({
      blocks: [{ id: "b1", name: "Cmp", identifier: "element.compare" }],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.identifier).toBe("element.compare");
  });

  it("maps intMode through when the host emits it", () => {
    mountHook();
    pushSnapshot({
      blocks: [
        { id: "b1", name: "Cmp", identifier: "element.compare", intMode: 3 },
      ],
      cables: [],
    });
    expect(useGraphStore.getState().nodes[0]?.intMode).toBe(3);
  });

  it("leaves intMode undefined when the host omits it (no fake value)", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "b1", name: "X" }], cables: [] });
    expect(useGraphStore.getState().nodes[0]?.intMode).toBeUndefined();
  });
});

// ── mapCable ──────────────────────────────────────────────────────────────────

describe("mapCable", () => {
  const baseCable = { id: "c1", source: "a", target: "b" };

  it("defaults signalType to 'audio' when absent", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [baseCable] });
    expect(useGraphStore.getState().edges[0]?.signalType).toBe("audio");
  });

  it("maps midi signalType", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...baseCable, signalType: "midi" }] });
    expect(useGraphStore.getState().edges[0]?.signalType).toBe("midi");
  });

  it("maps value signalType", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...baseCable, signalType: "value" }] });
    expect(useGraphStore.getState().edges[0]?.signalType).toBe("value");
  });

  it("defaults channelCount to 2 for unknown value", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [baseCable] });
    expect(useGraphStore.getState().edges[0]?.channelCount).toBe(2);
  });

  it("maps channelCount=1", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...baseCable, channelCount: 1 }] });
    expect(useGraphStore.getState().edges[0]?.channelCount).toBe(1);
  });

  it("maps channelCount=6 (surround)", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...baseCable, channelCount: 6 }] });
    expect(useGraphStore.getState().edges[0]?.channelCount).toBe(6);
  });

  it("defaults sourcePort to 'out-0' when absent", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [baseCable] });
    expect(useGraphStore.getState().edges[0]?.sourcePort).toBe("out-0");
  });

  it("uses sourceHandle when provided", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...baseCable, sourceHandle: "out-1" }] });
    expect(useGraphStore.getState().edges[0]?.sourcePort).toBe("out-1");
  });

  it("maps isSidechain=true", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...baseCable, isSidechain: true }] });
    expect(useGraphStore.getState().edges[0]?.isSidechain).toBe(true);
  });
});

// ── mapCommentBoxes ───────────────────────────────────────────────────────────

describe("mapCommentBoxes", () => {
  it("maps comment id, label, color, position, size", () => {
    mountHook();
    pushSnapshot({
      blocks: [],
      cables: [],
      commentBoxes: [
        { id: "cm1", title: "Hello", color: "#ff0000", x: 10, y: 20, width: 300, height: 200 },
      ],
    });
    const cb = useGraphStore.getState().commentBoxes[0];
    expect(cb?.id).toBe("cm1");
    expect(cb?.label).toBe("Hello");
    expect(cb?.color).toBe("#ff0000");
    expect(cb?.position).toEqual({ x: 10, y: 20 });
    expect(cb?.size).toEqual({ width: 300, height: 200 });
  });

  it("defaults label to empty string when title absent", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      commentBoxes: [{ id: "cm1" }],
    });
    expect(useGraphStore.getState().commentBoxes[0]?.label).toBe("");
  });

  it("defaults color to #40808080 when absent", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      commentBoxes: [{ id: "cm1" }],
    });
    expect(useGraphStore.getState().commentBoxes[0]?.color).toBe("#40808080");
  });

  it("defaults size to 200x150 when absent", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      commentBoxes: [{ id: "cm1" }],
    });
    const { size } = useGraphStore.getState().commentBoxes[0]!;
    expect(size).toEqual({ width: 200, height: 150 });
  });
});

// ── parseGraphOutline ─────────────────────────────────────────────────────────

describe("parseGraphOutline", () => {
  it("returns [] when activeGraphOutline is missing", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [] });
    expect(useHostExtrasStore.getState().activeGraphOutline).toEqual([]);
  });

  it("parses a flat list of outline nodes", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      activeGraphOutline: [
        { id: "n1", name: "Synth" },
        { id: "n2", name: "Reverb" },
      ],
    });
    const outline = useHostExtrasStore.getState().activeGraphOutline;
    expect(outline).toHaveLength(2);
    expect(outline[0].name).toBe("Synth");
    expect(outline[1].name).toBe("Reverb");
  });

  it("parses nested children recursively", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      activeGraphOutline: [
        {
          id: "root",
          name: "Container",
          isContainer: true,
          children: [
            { id: "child", name: "Inner", isContainer: false },
          ],
        },
      ],
    });
    const root = useHostExtrasStore.getState().activeGraphOutline[0];
    expect(root.isContainer).toBe(true);
    expect(root.children).toHaveLength(1);
    expect(root.children![0].name).toBe("Inner");
  });

  it("handles null items gracefully", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      activeGraphOutline: [null, { id: "n1", name: "OK" }],
    });
    const outline = useHostExtrasStore.getState().activeGraphOutline;
    // null item → fallback id generated, name=""
    expect(outline[0].name).toBe("");
    expect(outline[1].name).toBe("OK");
  });
});

// ── applySnapshot — session/latency calculations ──────────────────────────────

describe("applySnapshot session fields", () => {
  it("maps filePath and dirty", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      session: { filePath: "/my/project.elg", dirty: true },
    });
    expect(useSessionStore.getState().filePath).toBe("/my/project.elg");
    expect(useSessionStore.getState().dirty).toBe(true);
  });

  it("computes latencyMs from sampleRate + latency samples", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      engine: {
        sampleRate: 48000,
        inputLatencySamples: 256,
        outputLatencySamples: 256,
      },
    });
    // (256 + 256) / 48000 * 1000 = 10.666... → Math.round(x*10)/10 = 10.7
    // stored as liveHealth.latency (not latencyMs — hydrateFromEngine maps it)
    const { latency } = usePerformStore.getState().liveHealth;
    expect(latency).toBeCloseTo(10.7, 1);
  });

  it("maps scenes from perform block", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      perform: {
        scenes: [
          { id: "s1", name: "Verse", index: 0, active: true },
          { id: "s2", name: "Chorus", index: 1, active: false },
        ],
        activeSceneIndex: 0,
      },
    });
    expect(usePerformStore.getState().scenes).toHaveLength(2);
    expect(usePerformStore.getState().scenes[0].name).toBe("Verse");
  });

  it("maps isPlaying from engine block", () => {
    mountHook();
    pushSnapshot({
      blocks: [], cables: [],
      engine: { isPlaying: true },
    });
    expect(usePerformStore.getState().isPlaying).toBe(true);
  });

  it("is a no-op when payload is null", () => {
    mountHook();
    pushSnapshot(null);
    // Stores remain at reset state — no crash
    expect(useGraphStore.getState().nodes).toHaveLength(0);
  });

  it("is a no-op when payload is a non-object primitive", () => {
    mountHook();
    pushSnapshot(42);
    expect(useGraphStore.getState().nodes).toHaveLength(0);
  });

  it("parses JSON string payload", () => {
    mountHook();
    const payload = JSON.stringify({
      blocks: [{ id: "b1", name: "From JSON string" }],
      cables: [],
    });
    pushSnapshot(payload);
    expect(useGraphStore.getState().nodes).toHaveLength(1);
    expect(useGraphStore.getState().nodes[0]?.name).toBe("From JSON string");
  });
});
