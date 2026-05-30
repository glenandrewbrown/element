/**
 * BusInspector.test.tsx — coverage for the 2.9% BusInspector component.
 *
 * Covers:
 *   1. Empty state — no buses → renders informational message
 *   2. Bus rows — name, cable count, signal-type colour swatch
 *   3. Endpoint display — source (→) and target (←) labels
 *   4. Select button — calls useGraphStore.selectEdge with first cable ID
 *   5. Dissolve (✕) button — calls setBusForCable(id, undefined) + nativeGraphSetCableBus
 *   6. Bus count badge renders
 *   7. Unknown block ID → falls back to "?" in endpoint label
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { installJuceBridgeMock, type JuceBridgeMock } from "../../../test/mockJuceBridge";
import { useGraphStore } from "../../../stores/useGraphStore";
import { useBusStore } from "../../../stores/useBusStore";
import { BusInspector } from "../BusInspector";

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphSetCableBus: vi.fn().mockResolvedValue(undefined),
  // Provide stubs for any other nativeGraph imports needed at module level
  nativeGraphConnect: vi.fn(),
  nativeGraphDisconnect: vi.fn(),
  nativeGraphGetConnectionList: vi.fn().mockResolvedValue([]),
}));

import { nativeGraphSetCableBus } from "../../../bridge/nativeGraph";

// ── helpers ───────────────────────────────────────────────────────────────────

function resetStores() {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    commentBoxes: [],
  });
  useBusStore.setState({ cableBus: {} });
}

// A minimal BlockData-shaped node the GraphStore understands
const NODE_A = {
  id: "node-a",
  name: "Synth",
  category: "instrument" as const,
  format: "VST3" as const,
  position: { x: 0, y: 0 },
  ports: [],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  muted: false,
  muteInput: false,
  error: false,
  isMacroTagged: false,
  isPortal: false,
};

const NODE_B = {
  id: "node-b",
  name: "Reverb",
  category: "audiofx" as const,
  format: "AU" as const,
  position: { x: 200, y: 0 },
  ports: [],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  muted: false,
  muteInput: false,
  error: false,
  isMacroTagged: false,
  isPortal: false,
};

// A minimal CableData-shaped edge
const CABLE_1 = {
  id: "cable-1",
  source: "node-a",
  sourcePort: "out-0",
  target: "node-b",
  targetPort: "in-0",
  signalType: "audio" as const,
  channelCount: 2 as const,
  isSidechain: false,
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe("BusInspector", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    vi.clearAllMocks();
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  // ── 1. Empty state ────────────────────────────────────────────────────────

  it("shows 'Wireless Buses' heading even when empty", () => {
    render(<BusInspector />);
    expect(screen.getByText(/wireless buses/i)).toBeInTheDocument();
  });

  it("shows Make Wireless tip when no buses exist", () => {
    render(<BusInspector />);
    expect(screen.getByText(/make wireless/i)).toBeInTheDocument();
  });

  it("does NOT show cable count badge in empty state", () => {
    render(<BusInspector />);
    // The tabular count span only appears in the non-empty branch
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  // ── 2. Bus rows rendered when buses exist ─────────────────────────────────

  it("renders bus name when a cable is on a named bus", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    expect(screen.getByText("FX Send")).toBeInTheDocument();
  });

  it("shows cable count badge (e.g. '1 cbl')", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    expect(screen.getByText(/1 cbl/i)).toBeInTheDocument();
  });

  it("shows total bus count badge in header", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  // ── 3. Endpoint display ───────────────────────────────────────────────────

  it("renders source block name in endpoint list", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    // Source endpoint: "Synth → out-0"
    expect(screen.getByText(/synth/i)).toBeInTheDocument();
  });

  it("falls back to '?' when block ID is unknown", () => {
    const orphanCable = { ...CABLE_1, source: "ghost-id" };
    act(() => {
      useGraphStore.setState({ nodes: [NODE_B], edges: [orphanCable] });
      useBusStore.setState({ cableBus: { "cable-1": "Ghost Bus" } });
    });
    render(<BusInspector />);
    // "? → out-0" should appear
    expect(screen.getByText(/\?/)).toBeInTheDocument();
  });

  // ── 4. Select button ──────────────────────────────────────────────────────

  it("clicking bus name button calls selectEdge with first cable ID", () => {
    const selectEdgeSpy = vi.fn();
    useGraphStore.setState({
      nodes: [NODE_A, NODE_B],
      edges: [CABLE_1],
      selectEdge: selectEdgeSpy,
    } as any);
    useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });

    render(<BusInspector />);
    fireEvent.click(screen.getByTitle(/select cable/i));
    expect(selectEdgeSpy).toHaveBeenCalledWith("cable-1");
  });

  // ── 5. Dissolve button ────────────────────────────────────────────────────

  it("dissolve button (✕) clears bus assignment in store", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    fireEvent.click(screen.getByTitle(/make all wired/i));
    expect(useBusStore.getState().cableBus["cable-1"]).toBeUndefined();
  });

  it("dissolve button calls nativeGraphSetCableBus with empty string", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    fireEvent.click(screen.getByTitle(/make all wired/i));
    expect(nativeGraphSetCableBus).toHaveBeenCalledWith("cable-1", "");
  });

  // ── 6. Multiple buses ─────────────────────────────────────────────────────

  it("renders multiple bus rows", () => {
    const cable2 = { ...CABLE_1, id: "cable-2" };
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1, cable2] });
      useBusStore.setState({
        cableBus: { "cable-1": "FX Send", "cable-2": "Verb Return" },
      });
    });
    render(<BusInspector />);
    expect(screen.getByText("FX Send")).toBeInTheDocument();
    expect(screen.getByText("Verb Return")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // total count badge
  });

  // ── 7. Audio signal type colour swatch ────────────────────────────────────

  it("renders colour swatch with audio colour for audio signal type", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "Audio Bus" } });
    });
    const { container } = render(<BusInspector />);
    // Look for the swatch span with audio colour #4A90D9
    const swatch = container.querySelector('[style*="4A90D9"]');
    expect(swatch).toBeInTheDocument();
  });
});
