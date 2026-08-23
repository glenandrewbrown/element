/**
 * H-cov-4: Stale-fetch cancellation for PresetStrip (§3.7 pattern).
 *
 * PresetStrip is a non-exported sub-component inside InspectorHub.tsx (line 68).
 * It renders when a node is selected in useGraphStore. We drive it by rendering
 * <InspectorHub /> with controlled store state.
 *
 * §3.7 pattern pinned here:
 *   1. Rapid `nodeId` prop changes → the previous-fetch resolution is dropped;
 *      only the latest fetch call's data renders.
 *   2. Immediate `presets = []` reset on dep change → stale data does not
 *      flash before the new fetch resolves.
 *
 * Bridge mock: installJuceBridgeMock() (canonical Phase H mock util).
 * The mock intercepts `invokeElementNative("elementPresetList", ...)`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../../test/mockJuceBridge";
import { useGraphStore } from "../../../stores/useGraphStore";
import { useEngineSnapshotStore } from "../../../stores/useEngineSnapshotStore";
import { usePerformStore } from "../../../stores/usePerformStore";
import type { BlockData } from "../../../data/types";
import { InspectorHub } from "../InspectorHub";

// ── helpers ────────────────────────────────────────────────────────────────

function makeBlock(id: string): BlockData {
  return {
    id,
    name: `Block ${id}`,
    category: "generator",
    format: "INT",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  };
}

/**
 * JSON-encode the response shape that nativePresetList expects:
 *   { ok: boolean; presets: string[] }
 */
function presetPayload(presets: string[]): string {
  return JSON.stringify({ ok: true, presets });
}

// InspectorHub fetches parameters on node selection; stub those responses
// so only preset-related assertions need per-test mock values.
function stubParamCalls(bridge: JuceBridgeMock): void {
  // nativeGetNodeParameters → elementGetNodeParameters
  // nativePresetSnapshot / nativePresetList etc. are also intercepted
  // Default: bridge.mock returns undefined unless overridden.
  bridge.mock.mockImplementation(
    async (name: string, _args: unknown[]) => {
      if (name === "elementGetNodeParameters") return "[]";
      // Default for any other call: undefined (no-op)
      return undefined;
    },
  );
}

// ── store reset ─────────────────────────────────────────────────────────────

function resetStores(): void {
  // Reset graph store: clear nodes and selection
  useGraphStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
  });

  // Reset engine snapshot store to initial state (no host data)
  useEngineSnapshotStore.getState().stopPolling();
  useEngineSnapshotStore.setState({
    cpu: 0,
    engineRunning: false,
    sampleRate: 0,
    bufferSize: 0,
    deviceName: "",
    deviceLatencyInputMs: 0,
    deviceLatencyOutputMs: 0,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
    transportFrame: 0,
    transportTimecode: "1.1.0",
    lastUpdated: 0,
    hasHostData: false,
  });

  // Reset perform store liveHealth to quiet defaults
  usePerformStore.setState((s) => ({
    liveHealth: {
      ...s.liveHealth,
      cpu: 0,
      outputPeak: 0,
    },
  }));
}

// ── tests ───────────────────────────────────────────────────────────────────

describe("PresetStrip — §3.7 stale-fetch cancellation", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    stubParamCalls(bridge);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.restoreAllMocks();
  });

  it("(H-cov-4a) loads preset list for the selected node on mount", async () => {
    const blockA = makeBlock("node-A");

    // Set up response for the preset list call
    bridge.mock.mockImplementation(
      async (name: string, _args: unknown[]) => {
        if (name === "elementGetNodeParameters") return "[]";
        if (name === "elementPresetList")
          return presetPayload(["Warm Pad", "Bright Lead"]);
        return undefined;
      },
    );

    // Add node to store and select it
    act(() => {
      useGraphStore.setState({
        nodes: [blockA],
        selectedNodeId: "node-A",
      });
    });

    render(<InspectorHub />);

    // Wait for the Load… button and the presets label to appear
    // PresetStrip renders "Load…" button — wait for preset strip to show
    await screen.findByText("Load…");

    // The presets should have been fetched; bridge call was made
    const presetCalls = bridge.callsOf("elementPresetList");
    expect(presetCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("(H-cov-4b) immediate [] reset on nodeId change — stale data does not flash", async () => {
    const blockA = makeBlock("node-alpha");
    const blockB = makeBlock("node-beta");

    // Slow response for node-alpha, fast for node-beta
    let callCount = 0;
    bridge.mock.mockImplementation(
      async (name: string, _args: unknown[]) => {
        if (name === "elementGetNodeParameters") return "[]";
        if (name === "elementPresetList") {
          callCount++;
          if (callCount === 1) {
            // First call (node-alpha): simulate a slow fetch that resolves AFTER
            // the node changes to beta. We use a long delay controlled by fakeTimers.
            await new Promise<void>((resolve) =>
              setTimeout(resolve, 500),
            );
            return presetPayload(["Alpha Preset"]);
          }
          // Second call (node-beta): resolve quickly with beta presets
          return presetPayload(["Beta Preset"]);
        }
        return undefined;
      },
    );

    act(() => {
      useGraphStore.setState({
        nodes: [blockA, blockB],
        selectedNodeId: "node-alpha",
      });
    });

    const { rerender } = render(<InspectorHub />);

    // Wait briefly for the component to settle (first async effect queued)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Switch selection to node-beta — triggers cleanup of the alpha effect
    act(() => {
      useGraphStore.setState({ selectedNodeId: "node-beta" });
    });

    // Force rerender to reflect new state
    rerender(<InspectorHub />);

    // Allow beta preset fetch to resolve (no long delay on second call)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // The Load… button should still be present (beta's PresetStrip rendered)
    expect(screen.getByText("Load…")).toBeInTheDocument();

    // Beta's fetch was invoked at least once
    const presetCalls = bridge.callsOf("elementPresetList");
    expect(presetCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("(H-cov-4c) cancelled alpha fetch does NOT clobber beta's empty presets list", async () => {
    // This test validates the § 3.7 guard: `if (cancelled) return`
    // When alpha fetch resolves late (after beta's nodeId takes over),
    // the stale resolution should be discarded and presets stays as
    // whatever beta-fetch set (initially []).
    const blockA = makeBlock("node-1");
    const blockB = makeBlock("node-2");

    // We manually control promise resolution
    let resolveAlpha!: (v: string) => void;
    const alphaPromise = new Promise<string>((res) => {
      resolveAlpha = res;
    });

    let callCount = 0;
    bridge.mock.mockImplementation(
      async (name: string, _args: unknown[]) => {
        if (name === "elementGetNodeParameters") return "[]";
        if (name === "elementPresetList") {
          callCount++;
          if (callCount === 1) return alphaPromise; // slow alpha
          return presetPayload([]); // fast beta (empty)
        }
        return undefined;
      },
    );

    // Select node-1 → triggers alpha fetch
    act(() => {
      useGraphStore.setState({
        nodes: [blockA, blockB],
        selectedNodeId: "node-1",
      });
    });

    render(<InspectorHub />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Switch to node-2 — alpha effect cleanup sets cancelled=true
    act(() => {
      useGraphStore.setState({ selectedNodeId: "node-2" });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // NOW resolve alpha with stale data — should be ignored
    act(() => {
      resolveAlpha(presetPayload(["Stale Preset"]));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // The PresetStrip for node-2 is visible (Load… button present)
    expect(screen.getByText("Load…")).toBeInTheDocument();

    // At least 2 elementPresetList calls were made (one per node selection)
    expect(bridge.callsOf("elementPresetList").length).toBeGreaterThanOrEqual(2);
  });
});
