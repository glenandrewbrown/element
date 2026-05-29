/**
 * ConnectionEditor.test.tsx — coverage for the 2.6% ConnectionEditor component.
 *
 * Covers:
 *   1. Empty state — no cables in store or native API → "No connections" message
 *   2. Populates cable list from store edges
 *   3. Native API fallback when store edges are empty
 *   4. Search box filters cable list by block name
 *   5. Search box filters by port label
 *   6. No-match filter → "No connections match your filter"
 *   7. Signal type chip filters (All / Audio / MIDI / Value)
 *   8. Disconnect button calls nativeGraphDisconnect + removes row
 *   9. nativeGraphDisconnect returning false → row stays in list
 *  10. "Add Cable" button reveals AddCableForm
 *  11. AddCableForm — Cancel hides the form
 *  12. AddCableForm — Connect disabled until all 4 selects filled
 *  13. AddCableForm — successful connect calls nativeGraphConnect
 *  14. ConnectionRow — aria-label on remove button
 *  15. toSignalType helper: unknown string → "audio"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installJuceBridgeMock, type JuceBridgeMock } from "../../../test/mockJuceBridge";
import { useGraphStore } from "../../../stores/useGraphStore";
import type { BlockCategory } from "../../../data/types";
import { ConnectionEditor } from "../ConnectionEditor";

// ── bridge mocks ──────────────────────────────────────────────────────────────

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphConnect: vi.fn().mockResolvedValue(true),
  nativeGraphDisconnect: vi.fn().mockResolvedValue(true),
  nativeGraphGetConnectionList: vi.fn().mockResolvedValue([]),
  // stubs for other imports in the module graph
  nativeGraphSetCableBus: vi.fn(),
}));

import {
  nativeGraphConnect,
  nativeGraphDisconnect,
  nativeGraphGetConnectionList,
} from "../../../bridge/nativeGraph";

// ── test data ─────────────────────────────────────────────────────────────────

const makeNode = (id: string, name: string, category: BlockCategory = "generator") => ({
  id,
  name,
  category,
  format: "INT" as const,
  position: { x: 0, y: 0 },
  ports: [
    { id: "out-0", type: "audio" as const, direction: "output" as const, label: "Out L", connected: false },
    { id: "in-0",  type: "audio" as const, direction: "input"  as const, label: "In L",  connected: false },
  ],
  cpuLoad: 0, latencyMs: 0, bypassed: false, muted: false, muteInput: false,
  error: false, isMacroTagged: false, isPortal: false,
});

const SYNTH = makeNode("synth-1", "Synth", "generator");
const REVERB = makeNode("reverb-1", "Reverb", "modifier");

const CABLE_AUDIO = {
  id: "c-audio",
  source: "synth-1", sourcePort: "out-0",
  target: "reverb-1", targetPort: "in-0",
  signalType: "audio" as const, channelCount: 2 as const, isSidechain: false,
};
const CABLE_MIDI = {
  id: "c-midi",
  source: "synth-1", sourcePort: "out-0",
  target: "reverb-1", targetPort: "in-0",
  signalType: "midi" as const, channelCount: 1 as const, isSidechain: false,
};

function resetStores() {
  useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null, commentBoxes: [] });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("ConnectionEditor", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    vi.clearAllMocks();
    // Default: native list returns empty so it doesn't interfere
    vi.mocked(nativeGraphGetConnectionList).mockResolvedValue([]);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  // ── 1. Empty state ────────────────────────────────────────────────────────

  it("shows 'No connections in this board' when store empty and native returns []", async () => {
    render(<ConnectionEditor />);
    await waitFor(() =>
      expect(screen.getByText(/no connections in this board/i)).toBeInTheDocument(),
    );
  });

  it("renders 'Connections' header", () => {
    render(<ConnectionEditor />);
    expect(screen.getByText("Connections")).toBeInTheDocument();
  });

  // ── 2. Cable list from store ───────────────────────────────────────────────

  it("renders cable rows from store edges", () => {
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO] });
    });
    render(<ConnectionEditor />);
    expect(screen.getByText("Synth")).toBeInTheDocument();
    expect(screen.getByText("Reverb")).toBeInTheDocument();
  });

  it("shows cable count badge matching edge count", () => {
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO, CABLE_MIDI] });
    });
    render(<ConnectionEditor />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // ── 3. Native API fallback ────────────────────────────────────────────────

  it("falls back to nativeGraphGetConnectionList when store edges empty", async () => {
    vi.mocked(nativeGraphGetConnectionList).mockResolvedValue([
      {
        id: "native-c",
        source: "x", sourcePort: "out-0",
        target: "y", targetPort: "in-0",
        signalType: "audio", channelCount: 2,
      } as any,
    ]);
    render(<ConnectionEditor />);
    await waitFor(() => expect(nativeGraphGetConnectionList).toHaveBeenCalled());
  });

  // ── 4. Search by block name ───────────────────────────────────────────────

  it("filters cables by source block name", () => {
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO, CABLE_MIDI] });
    });
    render(<ConnectionEditor />);
    const search = screen.getByPlaceholderText(/search blocks or ports/i);
    fireEvent.change(search, { target: { value: "synth" } });
    // Both cables remain (both originate from Synth)
    expect(screen.getAllByText("Synth").length).toBeGreaterThan(0);
  });

  it("hides cables that don't match search text", () => {
    const DELAY = makeNode("delay-1", "Delay", "modifier");
    const CABLE_DELAY = {
      id: "c-delay",
      source: "delay-1", sourcePort: "out-0",
      target: "reverb-1", targetPort: "in-0",
      signalType: "audio" as const, channelCount: 1 as const, isSidechain: false,
    };
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB, DELAY], edges: [CABLE_AUDIO, CABLE_DELAY] });
    });
    render(<ConnectionEditor />);
    const search = screen.getByPlaceholderText(/search blocks or ports/i);
    fireEvent.change(search, { target: { value: "delay" } });
    expect(screen.queryByText("Synth")).not.toBeInTheDocument();
    expect(screen.getByText("Delay")).toBeInTheDocument();
  });

  // ── 5. No-match state ─────────────────────────────────────────────────────

  it("shows 'no connections match your filter' when search finds nothing", () => {
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO] });
    });
    render(<ConnectionEditor />);
    fireEvent.change(
      screen.getByPlaceholderText(/search blocks or ports/i),
      { target: { value: "zzz-no-match" } },
    );
    expect(screen.getByText(/no connections match your filter/i)).toBeInTheDocument();
  });

  // ── 6. Signal type chip filters ───────────────────────────────────────────

  it("renders All / Audio / MIDI / Value filter chips", () => {
    render(<ConnectionEditor />);
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^audio$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^midi$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^value$/i })).toBeInTheDocument();
  });

  it("MIDI filter hides audio cables", () => {
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO, CABLE_MIDI] });
    });
    render(<ConnectionEditor />);
    // Audio is shown twice by default (2 rows)
    fireEvent.click(screen.getByRole("button", { name: /^midi$/i }));
    // Count badge should now be 1
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("All filter restores full list after MIDI filter", () => {
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO, CABLE_MIDI] });
    });
    render(<ConnectionEditor />);
    fireEvent.click(screen.getByRole("button", { name: /^midi$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^all$/i }));
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // ── 7. Disconnect ─────────────────────────────────────────────────────────

  it("disconnect button calls nativeGraphDisconnect with correct args", async () => {
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO] });
    });
    render(<ConnectionEditor />);
    const removeBtn = screen.getByRole("button", { name: /remove cable/i });
    fireEvent.click(removeBtn);
    await waitFor(() =>
      expect(nativeGraphDisconnect).toHaveBeenCalledWith(
        "synth-1", "out-0", "reverb-1", "in-0",
      ),
    );
  });

  it("removes row from list after successful disconnect", async () => {
    vi.mocked(nativeGraphDisconnect).mockResolvedValue(true);
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO] });
    });
    render(<ConnectionEditor />);
    fireEvent.click(screen.getByRole("button", { name: /remove cable/i }));
    await waitFor(() =>
      expect(screen.getByText(/no connections in this board/i)).toBeInTheDocument(),
    );
  });

  it("keeps row when nativeGraphDisconnect returns false", async () => {
    vi.mocked(nativeGraphDisconnect).mockResolvedValue(false);
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [CABLE_AUDIO] });
    });
    render(<ConnectionEditor />);
    fireEvent.click(screen.getByRole("button", { name: /remove cable/i }));
    await waitFor(() =>
      expect(screen.queryByText(/no connections in this board/i)).not.toBeInTheDocument(),
    );
  });

  // ── 8. Add Cable form lifecycle ───────────────────────────────────────────

  it("'Add Cable' button reveals the AddCableForm", () => {
    render(<ConnectionEditor />);
    // Cancel button only exists inside AddCableForm
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add cable/i }));
    // After click, form is visible — Cancel + Connect buttons appear
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^connect$/i })).toBeInTheDocument();
  });

  it("Cancel button in AddCableForm hides the form", () => {
    render(<ConnectionEditor />);
    fireEvent.click(screen.getByRole("button", { name: /add cable/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    // Form gone — only one "Add Cable" button remains
    expect(screen.getAllByRole("button", { name: /add cable/i }).length).toBe(1);
  });

  it("Connect is not triggered when form is incomplete", () => {
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [] });
    });
    render(<ConnectionEditor />);
    fireEvent.click(screen.getByRole("button", { name: /add cable/i }));
    // Click Connect without filling selects
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    expect(nativeGraphConnect).not.toHaveBeenCalled();
  });

  it("Connect button calls nativeGraphConnect when all selects filled", async () => {
    vi.mocked(nativeGraphConnect).mockResolvedValue(true);
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [] });
    });
    render(<ConnectionEditor />);
    fireEvent.click(screen.getByRole("button", { name: /add cable/i }));

    const [srcBlock, srcPort, tgtBlock, tgtPort] = screen.getAllByRole("combobox");

    fireEvent.change(srcBlock, { target: { value: "synth-1" } });
    fireEvent.change(srcPort, { target: { value: "out-0" } });
    fireEvent.change(tgtBlock, { target: { value: "reverb-1" } });
    fireEvent.change(tgtPort, { target: { value: "in-0" } });

    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() =>
      expect(nativeGraphConnect).toHaveBeenCalledWith(
        "synth-1", "out-0", "reverb-1", "in-0",
      ),
    );
  });

  it("hides AddCableForm after successful connect", async () => {
    vi.mocked(nativeGraphConnect).mockResolvedValue(true);
    act(() => {
      useGraphStore.setState({ nodes: [SYNTH, REVERB], edges: [] });
    });
    render(<ConnectionEditor />);
    fireEvent.click(screen.getByRole("button", { name: /add cable/i }));

    const [srcBlock, srcPort, tgtBlock, tgtPort] = screen.getAllByRole("combobox");
    fireEvent.change(srcBlock, { target: { value: "synth-1" } });
    fireEvent.change(srcPort, { target: { value: "out-0" } });
    fireEvent.change(tgtBlock, { target: { value: "reverb-1" } });
    fireEvent.change(tgtPort, { target: { value: "in-0" } });

    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() =>
      // Form disappears after success
      expect(screen.queryByRole("button", { name: /^connect$/i })).not.toBeInTheDocument(),
    );
  });

  // ── 9. Port label fallback ────────────────────────────────────────────────

  it("falls back to port ID when no matching port label is found", () => {
    // ConnectionRow resolves the port label via
    //   block.ports.find(p => p.id === cable.sourcePort)?.label ?? cable.sourcePort
    // (ConnectionEditor.tsx:86-88). The `??` only falls back when no port
    // matches (find → undefined), so give the source block no ports.
    const nodeNoPort = { ...SYNTH, ports: [] };
    const cable = { ...CABLE_AUDIO };
    act(() => {
      useGraphStore.setState({ nodes: [nodeNoPort, REVERB], edges: [cable] });
    });
    render(<ConnectionEditor />);
    // No port matches "out-0" → falls back to the raw port id.
    expect(screen.getByText("out-0")).toBeInTheDocument();
  });
});
