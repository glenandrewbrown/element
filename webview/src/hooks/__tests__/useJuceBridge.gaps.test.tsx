/**
 * useJuceBridge.gaps.test.tsx — covers callbacks NOT pinned in useJuceBridge.test.tsx.
 *
 * Missing paths at 52.3% coverage:
 *   onMetering — fires but does NOT write cpu (comment in source)
 *   onCableLevels — dispatches to useCableMeterStore
 *   onLogHistory — dispatches to useHostExtrasStore.setLogLines
 *   onParameterUpdate — dispatches to useParameterStore.applyDeltas
 *   onGraphState string path — parses JSON string then calls applySnapshot
 *   onGraphState null/non-object — no-op (no crash)
 *   cleanup — restores previous __elementNative on unmount
 *   applySnapshot breadcrumbs — non-empty array written to graph store
 *   applySnapshot parseGraphOutline — nested children
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { useJuceBridge } from "../useJuceBridge";
import { useAppStore } from "../../stores/useAppStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useParameterStore } from "../../stores/useParameterStore";
import { usePerformStore } from "../../stores/usePerformStore";

// ── helpers ───────────────────────────────────────────────────────────────────

async function flushAsync(hops = 20): Promise<void> {
  for (let i = 0; i < hops; i++) await Promise.resolve();
}

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
  useGraphStore.setState({ nodes: [], edges: [], commentBoxes: [], breadcrumbStack: ["Main Project"] });
  usePluginBrowserStore.setState({
    plugins: [],
    favoriteIdentifiers: new Set<string>(),
    recentIdentifiers: [],
  });
  useEngineSnapshotStore.getState().stopPolling();
  useEngineSnapshotStore.setState({
    cpu: 0, engineRunning: false, sampleRate: 0, bufferSize: 0,
    deviceName: "", deviceLatencyInputMs: 0, deviceLatencyOutputMs: 0,
    transportPlaying: false, transportRecording: false, tempoBpm: 120,
    timeSig: [4, 4] as [number, number], transportFrame: 0,
    transportTimecode: "1.1.0", lastUpdated: 0, hasHostData: false,
  });
  useCableMeterStore.setState({ levels: {} });
  useHostExtrasStore.setState({
    audioSetup: null, oscHost: { enabled: false, port: 9001 },
    canvas: {
      snapToGrid: false,
      gridSize: 8,
      viewport: { x: 0, y: 0, zoom: 1 },
      graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    },
    midiMapping: { learning: false, maps: [] },
    molecules: [], logLines: [], activeGraphOutline: [],
  });
  useParameterStore.setState({ values: {} });
  usePerformStore.setState((s) => ({
    ...s, scenes: [], bpm: 120, isPlaying: false,
    liveHealth: { ...s.liveHealth, cpu: 0 },
  }));
}

const PLUGIN_LIST_RESPONSE = {
  plugins: [], favoriteIdentifiers: [], recentIdentifiers: [],
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useJuceBridge — gap coverage", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    // Default boot: return minimal graph state, then plugin list
    bridge.mock
      .mockResolvedValueOnce({ blocks: [], cables: [], session: {} })
      .mockResolvedValueOnce(PLUGIN_LIST_RESPONSE)
      .mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    useEngineSnapshotStore.getState().stopPolling();
  });

  // ── onCableLevels callback ────────────────────────────────────────────────

  it("onCableLevels dispatches levels to useCableMeterStore", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    // onCableLevels coalesces into the store on the next animation frame
    // (perf: one set() per frame, not per ~60Hz host push) — flush a frame.
    await act(async () => {
      window.__elementNative?.onCableLevels?.([
        { id: "cable-1", level: 0.75 },
        { id: "cable-2", level: 0.25 },
      ]);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });

    const levels = useCableMeterStore.getState().levels;
    expect(levels["cable-1"]).toBe(0.75);
    expect(levels["cable-2"]).toBe(0.25);
  });

  it("onCableLevels is a no-op when non-array is passed (no crash)", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    expect(() => {
      act(() => {
        window.__elementNative?.onCableLevels?.(null as any);
      });
    }).not.toThrow();
  });

  // ── onLogHistory callback ─────────────────────────────────────────────────

  it("onLogHistory writes lines to useHostExtrasStore", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onLogHistory?.(["Line 1", "Line 2", "Line 3"]);
    });

    expect(useHostExtrasStore.getState().logLines).toEqual(["Line 1", "Line 2", "Line 3"]);
  });

  it("onLogHistory is a no-op when non-array is passed (no crash)", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    expect(() => {
      act(() => {
        window.__elementNative?.onLogHistory?.(42 as any);
      });
    }).not.toThrow();
  });

  // ── onParameterUpdate callback ────────────────────────────────────────────

  it("onParameterUpdate applies deltas to useParameterStore", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onParameterUpdate?.([
        { nodeId: "node-1", params: [{ i: 0, v: 0.5 }] },
      ]);
    });

    const values = useParameterStore.getState().values;
    expect(values["node-1:0"]).toBe(0.5);
  });

  it("onParameterUpdate is a no-op when non-array is passed (no crash)", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    expect(() => {
      act(() => {
        window.__elementNative?.onParameterUpdate?.(undefined as any);
      });
    }).not.toThrow();
  });

  // ── onMetering callback ───────────────────────────────────────────────────

  it("onMetering fires without writing cpu (void peak per source comment)", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    const cpuBefore = usePerformStore.getState().liveHealth.cpu;

    act(() => {
      window.__elementNative?.onMetering?.(0.99);
    });

    // CPU must NOT be derived from peak (US-002 Wave 2 rule)
    expect(usePerformStore.getState().liveHealth.cpu).toBe(cpuBefore);
  });

  // ── onGraphState string path ──────────────────────────────────────────────

  it("onGraphState accepts a JSON string and parses it into graph store", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    const snapshot = JSON.stringify({
      blocks: [{ id: "b-1", name: "Synth", x: 0, y: 0 }],
      cables: [],
    });

    act(() => {
      window.__elementNative?.onGraphState?.(snapshot);
    });

    expect(useGraphStore.getState().nodes.find((n) => n.id === "b-1")).toBeDefined();
  });

  it("onGraphState with null payload does not crash", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    expect(() => {
      act(() => {
        window.__elementNative?.onGraphState?.(null);
      });
    }).not.toThrow();
  });

  it("onGraphState with invalid JSON string does not crash", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    expect(() => {
      act(() => {
        window.__elementNative?.onGraphState?.("{bad json]]");
      });
    }).not.toThrow();
  });

  // ── applySnapshot — breadcrumbs ───────────────────────────────────────────

  it("applySnapshot writes non-empty breadcrumbs to graph store", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onGraphState?.({
        blocks: [], cables: [],
        breadcrumbs: ["Root", "Sub-Board"],
      });
    });

    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Root", "Sub-Board"]);
  });

  it("applySnapshot with empty breadcrumbs resets to the default root crumb", async () => {
    useGraphStore.setState({ breadcrumbStack: ["Root"] });
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onGraphState?.({
        blocks: [], cables: [], breadcrumbs: [],
      });
    });

    // Empty breadcrumbs array → hydrateFromEngine falls back to the default
    // root crumb ["Main Project"] (useGraphStore.ts:286-289).
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
  });

  // ── cleanup — restores previous __elementNative ───────────────────────────

  it("unmounting restores previous __elementNative handlers", async () => {
    const prevHandler = { onMetering: vi.fn() };
    window.__elementNative = prevHandler;

    const { unmount } = renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    unmount();

    // Cleanup restores `prev`, which is a shallow copy taken at mount
    // (`{ ...window.__elementNative }`, useJuceBridge.ts:406,518) — so the
    // restored object is content-equal but not the same reference.
    expect(window.__elementNative).toStrictEqual(prevHandler);
  });

  // ── chained previous handlers ─────────────────────────────────────────────

  it("onCableLevels chains through to previous handler", async () => {
    const prevCableLevels = vi.fn();
    window.__elementNative = { onCableLevels: prevCableLevels };

    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onCableLevels?.([{ id: "c", level: 0.5 }]);
    });

    expect(prevCableLevels).toHaveBeenCalledWith([{ id: "c", level: 0.5 }]);
  });

  // ── applySnapshot engine state → isPlaying ───────────────────────────────

  it("applySnapshot writes isPlaying from engine snapshot", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onGraphState?.({
        blocks: [], cables: [],
        engine: { isPlaying: true, sampleRate: 44100 },
        session: {},
      });
    });

    expect(usePerformStore.getState().isPlaying).toBe(true);
  });

  // ── onEmbeddedEditorClosed → clears the embed mirror (BUG 1 reopen fix) ────

  it("onEmbeddedEditorClosed clears embeddedEditorNodeId so a reopen toggle works", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    // Mirror is set (e.g. host opened an embed) …
    act(() => {
      useAppStore.getState().setEmbeddedEditorNodeId("valhalla");
    });
    expect(useAppStore.getState().embeddedEditorNodeId).toBe("valhalla");

    // … then the host tears the embed down (container dive / delete / Float /
    // explicit close) and pushes onEmbeddedEditorClosed. The mirror must clear,
    // otherwise the next canvas double-click on that Block dead-ends on CLOSE.
    act(() => {
      window.__elementNative?.onEmbeddedEditorClosed?.();
    });
    expect(useAppStore.getState().embeddedEditorNodeId).toBeNull();
  });

  it("onEmbeddedEditorClosed chains to a previously-installed handler", async () => {
    const prev = vi.fn();
    window.__elementNative = { onEmbeddedEditorClosed: prev };

    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onEmbeddedEditorClosed?.();
    });
    expect(prev).toHaveBeenCalledTimes(1);
  });

  // ── onEmbeddedEditorReady → sets the embed mirror (Phase 4 Task 4.2) ───────
  // The host pushes this once the embedded editor is mounted, replacing the
  // interim retry-poll backoff with an authoritative "it's open" signal.

  it("onEmbeddedEditorReady sets embeddedEditorNodeId to the pushed node uuid", async () => {
    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    expect(useAppStore.getState().embeddedEditorNodeId).toBeNull();

    act(() => {
      window.__elementNative?.onEmbeddedEditorReady?.("valhalla");
    });
    expect(useAppStore.getState().embeddedEditorNodeId).toBe("valhalla");
  });

  it("onEmbeddedEditorReady ignores an empty/invalid node id (no mirror set)", async () => {
    // Establish a clean precondition (prior tests in this suite may have set it).
    act(() => {
      useAppStore.getState().setEmbeddedEditorNodeId(null);
    });

    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onEmbeddedEditorReady?.("");
    });
    expect(useAppStore.getState().embeddedEditorNodeId).toBeNull();
  });

  it("onEmbeddedEditorReady chains to a previously-installed handler", async () => {
    const prev = vi.fn();
    window.__elementNative = { onEmbeddedEditorReady: prev };

    renderHook(() => useJuceBridge());
    await act(async () => { await flushAsync(); });

    act(() => {
      window.__elementNative?.onEmbeddedEditorReady?.("node-x");
    });
    expect(prev).toHaveBeenCalledTimes(1);
    expect(prev).toHaveBeenCalledWith("node-x");
  });
});
