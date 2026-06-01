/**
 * useJuceBridge — inferCategory and mapBlock edge-case gaps.
 *
 * The existing useJuceBridge.mappers.test.ts covers: container, "midi", "input",
 * "output", default-audiofx, "lfo", "synth", explicit category/format.
 *
 * This file covers the remaining inferCategory branches and mapBlock edge cases:
 *   inferCategory:
 *     - "envelope" → modulator
 *     - "modulat" → modulator (substring match)
 *     - "cv" → modulator
 *     - "automation" → modulator
 *     - "macro" → modulator
 *     - "sampler" → instrument
 *     - "instrument" → instrument (substring)
 *     - "osc" → instrument
 *     - "generat" → instrument (substring: "generator")
 *     - "drum" → instrument
 *     - "keys" → instrument
 *     - plain "router" (no midi) → audiofx (default)
 *   mapBlock edge cases:
 *     - cpuLoad < 0 → clamped to 0
 *     - latencyMs < 0 → clamped to 0
 *     - note string field mapped through
 *     - note absent → undefined
 *     - containerNodeCount mapped
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { useJuceBridge } from "../useJuceBridge";
import { useGraphStore } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { useParameterStore } from "../../stores/useParameterStore";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { useBusStore } from "../../stores/useBusStore";

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
  useBusStore.setState({ cableBus: {} });
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

function firstNode() {
  return useGraphStore.getState().nodes[0];
}

beforeEach(() => {
  bridge = installJuceBridgeMock();
  bridge.mock.mockResolvedValue(undefined);
  resetStores();
});

afterEach(() => {
  bridge.uninstall();
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ── inferCategory — modulator variants ───────────────────────────────────────

describe("inferCategory — modulator branches", () => {
  it('returns "modulator" for blocks with "envelope" in name', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "ADSR Envelope" }], cables: [] });
    expect(firstNode()?.category).toBe("modulator");
  });

  it('returns "modulator" for blocks with "modulat" substring (e.g. "Modulator")', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Step Modulator" }], cables: [] });
    expect(firstNode()?.category).toBe("modulator");
  });

  it('returns "modulator" for blocks with "cv" in name', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "CV Gate" }], cables: [] });
    expect(firstNode()?.category).toBe("modulator");
  });

  it('returns "modulator" for blocks with "automation" in name', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Automation Curve" }], cables: [] });
    expect(firstNode()?.category).toBe("modulator");
  });

  it('returns "modulator" for blocks with "macro" in name', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Macro Knob" }], cables: [] });
    expect(firstNode()?.category).toBe("modulator");
  });
});

// ── inferCategory — instrument variants ──────────────────────────────────────

describe("inferCategory — instrument branches", () => {
  it('returns "instrument" for blocks with "sampler" in name', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Sampler Pro" }], cables: [] });
    expect(firstNode()?.category).toBe("instrument");
  });

  it('returns "instrument" for blocks with "instrument" substring', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Virtual Instrument" }], cables: [] });
    expect(firstNode()?.category).toBe("instrument");
  });

  it('returns "instrument" for blocks with "osc" in name', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "OSC Source" }], cables: [] });
    expect(firstNode()?.category).toBe("instrument");
  });

  it('returns "instrument" for blocks with "generat" substring (e.g. "Generator")', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Tone Generator" }], cables: [] });
    expect(firstNode()?.category).toBe("instrument");
  });

  it('returns "instrument" for blocks with "drum" in name', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Drum Machine" }], cables: [] });
    expect(firstNode()?.category).toBe("instrument");
  });

  it('returns "instrument" for blocks with "keys" in name', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Electric Keys" }], cables: [] });
    expect(firstNode()?.category).toBe("instrument");
  });
});

// ── inferCategory — audiofx edge cases ───────────────────────────────────────

describe("inferCategory — audiofx edge cases", () => {
  it('plain "Router" (no midi) → "audiofx"', () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Audio Router" }], cables: [] });
    expect(firstNode()?.category).toBe("audiofx");
  });
});

// ── mapBlock — numeric field clamping ─────────────────────────────────────────

describe("mapBlock — cpuLoad / latencyMs clamping", () => {
  it("clamps negative cpuLoad to 0", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "X", cpuLoad: -5 }], cables: [] });
    expect(firstNode()?.cpuLoad).toBe(0);
  });

  it("clamps negative latencyMs to 0", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "X", latencyMs: -1 }], cables: [] });
    expect(firstNode()?.latencyMs).toBe(0);
  });

  it("passes through zero cpuLoad", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "X", cpuLoad: 0 }], cables: [] });
    expect(firstNode()?.cpuLoad).toBe(0);
  });

  it("passes through positive latencyMs", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "X", latencyMs: 2.5 }], cables: [] });
    expect(firstNode()?.latencyMs).toBe(2.5);
  });
});

// ── mapBlock — note and containerNodeCount ────────────────────────────────────

describe("mapBlock — note and containerNodeCount", () => {
  it("maps note string when present", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "X", note: "Side-chain this" }], cables: [] });
    expect(firstNode()?.note).toBe("Side-chain this");
  });

  it("note is undefined when absent", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "X" }], cables: [] });
    expect(firstNode()?.note).toBeUndefined();
  });

  it("maps containerNodeCount when present", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "Container", isContainer: true, containerNodeCount: 4 }], cables: [] });
    expect(firstNode()?.containerNodeCount).toBe(4);
  });

  it("containerNodeCount is undefined when absent", () => {
    mountHook();
    pushSnapshot({ blocks: [{ id: "1", name: "X" }], cables: [] });
    expect(firstNode()?.containerNodeCount).toBeUndefined();
  });
});

// ── mapCable — channelCount boundary ─────────────────────────────────────────

describe("mapCable — channelCount non-1/non-6 values default to 2", () => {
  const base = { id: "c1", source: "a", target: "b" };

  it("channelCount=4 → defaults to 2", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...base, channelCount: 4 }] });
    expect(useGraphStore.getState().edges[0]?.channelCount).toBe(2);
  });

  it("channelCount=3 → defaults to 2", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...base, channelCount: 3 }] });
    expect(useGraphStore.getState().edges[0]?.channelCount).toBe(2);
  });

  it("channelCount=0 → defaults to 2", () => {
    mountHook();
    pushSnapshot({ blocks: [], cables: [{ ...base, channelCount: 0 }] });
    expect(useGraphStore.getState().edges[0]?.channelCount).toBe(2);
  });
});
