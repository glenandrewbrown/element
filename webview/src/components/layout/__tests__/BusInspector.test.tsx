/**
 * BusInspector.test.tsx — coverage for the BusInspector IO send/receive auditor.
 *
 * Wizard R1 #4 reworked this away from the old "wireless bus" framing into the
 * IO send/receive model (buses are blocks that SEND TO / RECEIVE FROM a named
 * bus), and R2 added SEPARATE Send + Receive activity meters + sidechain display
 * + a direct open-editor affordance. These tests track the reworked component.
 *
 * Covers:
 *   1. Empty state — no buses → "Buses" heading + Bus Send / Bus Receive tip
 *   2. Bus rows — name + signal-type label render
 *   3. Endpoint names appear under the Send / Receive meters
 *   4. Select button — calls useGraphStore.selectEdge with first cable ID
 *   5. Remove (✕) button — calls setBusForCable(id, undefined) + nativeGraphSetCableBus
 *   6. Header bus-count badge renders
 *   7. Unknown block ID → falls back to "?" endpoint label
 *   8. Audio signal type → audio-token colour somewhere in the row
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { installJuceBridgeMock, type JuceBridgeMock } from "../../../test/mockJuceBridge";
import { useGraphStore } from "../../../stores/useGraphStore";
import { useBusStore } from "../../../stores/useBusStore";
import { useCableMeterStore } from "../../../stores/useCableMeterStore";
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
  useCableMeterStore.setState((s) => ({ ...s, levels: {} }));
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

  it("shows 'Buses' heading even when empty", () => {
    render(<BusInspector />);
    expect(screen.getByText(/^buses$/i)).toBeInTheDocument();
  });

  it("shows the Bus Send / Bus Receive tip when no buses exist (no 'wireless')", () => {
    render(<BusInspector />);
    expect(screen.getByText(/bus send/i)).toBeInTheDocument();
    expect(screen.getByText(/bus receive/i)).toBeInTheDocument();
    // The corrected model never uses the word "wireless".
    expect(screen.queryByText(/wireless/i)).not.toBeInTheDocument();
  });

  it("does NOT show the bus-count badge in empty state", () => {
    render(<BusInspector />);
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

  it("renders separate Send and Receive meters", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    // The meter direction labels are literally "SEND →" and "← RECEIVE".
    expect(screen.getByText(/SEND →/)).toBeInTheDocument();
    expect(screen.getByText(/← RECEIVE/)).toBeInTheDocument();
  });

  it("shows the total bus-count badge in the header", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  // ── 3. Endpoint display (under Send / Receive meters) ─────────────────────

  it("renders the source block name under the Send meter", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    // Source endpoint "Synth" feeds the bus.
    expect(screen.getByText(/synth/i)).toBeInTheDocument();
  });

  it("renders the destination block name under the Receive meter", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    // Target endpoint "Reverb" reads from the bus.
    expect(screen.getByText(/reverb/i)).toBeInTheDocument();
  });

  it("falls back to '?' when a block ID is unknown", () => {
    const orphanCable = { ...CABLE_1, source: "ghost-id" };
    act(() => {
      useGraphStore.setState({ nodes: [NODE_B], edges: [orphanCable] });
      useBusStore.setState({ cableBus: { "cable-1": "Ghost Bus" } });
    });
    render(<BusInspector />);
    expect(screen.getByText(/\?/)).toBeInTheDocument();
  });

  // ── 4. Select button ──────────────────────────────────────────────────────

  it("clicking the bus name button calls selectEdge with the first cable ID", () => {
    const selectEdgeSpy = vi.fn();
    useGraphStore.setState({
      nodes: [NODE_A, NODE_B],
      edges: [CABLE_1],
      selectEdge: selectEdgeSpy,
    } as any);
    useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });

    render(<BusInspector />);
    fireEvent.click(screen.getByTitle(/select this bus's cable/i));
    expect(selectEdgeSpy).toHaveBeenCalledWith("cable-1");
  });

  // ── 5. Remove button ──────────────────────────────────────────────────────

  it("remove button (✕) clears the bus assignment in the store", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    fireEvent.click(screen.getByRole("button", { name: /remove bus fx send/i }));
    expect(useBusStore.getState().cableBus["cable-1"]).toBeUndefined();
  });

  it("remove button calls nativeGraphSetCableBus with an empty string", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    fireEvent.click(screen.getByRole("button", { name: /remove bus fx send/i }));
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

  // ── 7. Sidechain display ──────────────────────────────────────────────────

  it("shows a SIDECHAIN badge when a feed on the bus is a sidechain", () => {
    const scCable = { ...CABLE_1, isSidechain: true };
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [scCable] });
      useBusStore.setState({ cableBus: { "cable-1": "SC Bus" } });
    });
    render(<BusInspector />);
    expect(screen.getByText(/sidechain/i)).toBeInTheDocument();
  });

  // ── 8. Open editor affordance (only when onOpenBlock provided) ─────────────

  it("shows an Open editor button when onOpenBlock is provided", () => {
    const onOpenBlock = vi.fn();
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector onOpenBlock={onOpenBlock} />);
    const btn = screen.getByRole("button", { name: /open editor/i });
    fireEvent.click(btn);
    // Destination block "node-b" (Reverb) is what opens.
    expect(onOpenBlock).toHaveBeenCalledWith("node-b");
  });

  it("hides the Open editor button when onOpenBlock is omitted", () => {
    act(() => {
      useGraphStore.setState({ nodes: [NODE_A, NODE_B], edges: [CABLE_1] });
      useBusStore.setState({ cableBus: { "cable-1": "FX Send" } });
    });
    render(<BusInspector />);
    expect(screen.queryByRole("button", { name: /open editor/i })).not.toBeInTheDocument();
  });
});
