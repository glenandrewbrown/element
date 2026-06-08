/**
 * Task 3.A — name-coherence MECHANICAL GUARD (Owner feedback #6(1)).
 *
 * The complaint: "plugins in the left inspector have names that don't match the
 * blocks." The fix locks a placed Block's display name to ONE source — the
 * graph-snapshot `block.name` — read identically by the canvas Block title and
 * the Inspector header, with NO re-derivation from the plugin catalog.
 *
 * This guard renders the REAL <Block /> and the REAL <InspectorHub /> against
 * the SAME BlockData and asserts the two displayed name strings are byte-equal —
 * the exact prescription in the left-panel brief §2.3 fix #4 / §6 Phase A. It
 * must hold for:
 *   1. a freshly-inserted (catalog-named) node,
 *   2. a user-RENAMED node (block.name ≠ catalogName), and
 *   3. it must be loadState-aware (a `loading` node shows the catalog name and
 *      does NOT flake) — loading-node contract §5/§7.
 *
 * If a future change wires the Inspector header to usePluginBrowserStore (the
 * regression this whole task exists to prevent), assertions 1–2 break.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { BlockData } from "../../../data/types";

// ── Shared selected-node, driven into BOTH component trees ─────────────────────
let selected: BlockData | null = null;

// ── Mock React Flow (Block needs Handle/Position) ─────────────────────────────
vi.mock("@xyflow/react", () => ({
  Handle: ({
    children,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) => (
    <div data-testid={`handle-${rest.id ?? "port"}`}>{children}</div>
  ),
  Position: { Left: "left", Right: "right" },
}));

// ── Mock stores (one graph store powers BOTH the canvas Block and Inspector) ──
vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      nodes: selected ? [selected] : [],
      edges: [],
      selectedNodeId: selected?.id ?? null,
      selectedEdgeId: null,
      zoomTier: "normal",
      toggleBypass: vi.fn(),
      toggleMute: vi.fn(),
      toggleMuteInput: vi.fn(),
      selectEdge: vi.fn(),
      selectNode: vi.fn(),
    }),
  ),
  selectSelectedNode: (s: { selectedNodeId: string | null; nodes: BlockData[] }) =>
    s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : undefined,
  selectSelectedEdge: () => undefined,
  selectSelectedNodeId: (s: { selectedNodeId: string | null }) => s.selectedNodeId,
  selectSelectedEdgeId: (s: { selectedEdgeId: string | null }) => s.selectedEdgeId,
  selectNodes: (s: { nodes: unknown[] }) => s.nodes,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
  selectZoomTier: (s: { zoomTier: string }) => s.zoomTier,
}));

vi.mock("../../../stores/useBusStore", () => ({
  useBusStore: vi.fn((sel?: (s: unknown) => unknown) =>
    sel ? sel({ cableBus: {} }) : {},
  ),
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ sessionName: "Demo", liveHealth: { cpu: 10, latency: 4 } }),
  ),
  selectLiveHealth: (s: { liveHealth: unknown }) => s.liveHealth,
  selectSessionName: (s: { sessionName: string }) => s.sessionName,
}));

vi.mock("../../../stores/useEngineSnapshotStore", () => ({
  useEngineSnapshotStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      cpu: 0.1,
      sampleRate: 48000,
      bufferSize: 256,
      deviceName: "Dev",
      hasHostData: true,
    }),
  ),
  selectCpuPercent: (s: { cpu: number }) => s.cpu * 100,
  selectSampleRate: (s: { sampleRate: number }) => s.sampleRate,
  selectBufferSize: (s: { bufferSize: number }) => s.bufferSize,
  selectDeviceName: (s: { deviceName: string }) => s.deviceName,
  selectDeviceLatencyMs: () => 4,
  selectHasHostData: (s: { hasHostData: boolean }) => s.hasHostData,
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: unknown) => unknown) => sel({ logLines: [] })),
}));

vi.mock("../../../stores/useCableMeterStore", () => ({
  useCableMeterStore: Object.assign(
    vi.fn((sel: (s: unknown) => unknown) => sel({ levels: {} })),
    { subscribe: () => () => {} },
  ),
}));

// ── Bridge + heavy sub-component mocks ────────────────────────────────────────
const mockGetNodeParams = vi.fn().mockResolvedValue({ parameters: [] });
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGetNodeParameters: (...a: unknown[]) => mockGetNodeParams(...a),
  nativeGraphSetNodeNote: vi.fn().mockResolvedValue({}),
  nativeSetNodeParameter: vi.fn().mockResolvedValue({}),
  nativePresetSnapshot: vi.fn().mockResolvedValue({}),
  nativePresetSwap: vi.fn().mockResolvedValue({}),
  nativePresetSave: vi.fn().mockResolvedValue({ ok: true }),
  nativePresetLoad: vi.fn().mockResolvedValue({}),
  nativePresetList: vi.fn().mockResolvedValue({ ok: true, presets: [] }),
}));
vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorOpen: vi.fn().mockResolvedValue({}),
  nativePluginEditorClose: vi.fn().mockResolvedValue({}),
  nativePluginEditorFloat: vi.fn().mockResolvedValue({}),
  nativePluginEditorSetBounds: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../canvas/ScriptEditor", () => ({ ScriptEditor: () => <div /> }));
vi.mock("../BusInspector", () => ({ BusInspector: () => <div /> }));
vi.mock("../LiveHealth", () => ({ LiveHealth: () => <div /> }));
vi.mock("../NeuPromptModal", () => ({ NeuPromptModal: () => null }));
vi.mock("../../canvas/BlockEmbed", () => ({ BlockEmbed: () => null }));

// ── Imports under test (after mocks) ──────────────────────────────────────────
import { InspectorHub } from "../InspectorHub";
import { Block } from "../../canvas/Block";

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "block-1",
    name: "Pro-Q 3",
    category: "audiofx",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    muted: false,
    muteInput: false,
    error: false,
    isMacroTagged: false,
    ...overrides,
  } as BlockData;
}

function renderBlock(data: BlockData) {
  return render(
    <Block
      id={data.id}
      data={data}
      selected={false}
      type="block"
      zIndex={0}
      isConnectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      dragging={false}
      draggable
      selectable
      deletable
    />,
  );
}

/** The canvas Block's displayed title (single source: data-testid="block-title"). */
function canvasTitle(data: BlockData): string {
  const { unmount } = renderBlock(data);
  const text = screen.getByTestId("block-title").textContent ?? "";
  unmount();
  return text;
}

/** The Inspector header's displayed name (data-testid="inspector-block-name"). */
async function inspectorName(data: BlockData): Promise<string> {
  selected = data;
  const { unmount } = render(<InspectorHub />);
  await waitFor(() =>
    expect(screen.getByTestId("inspector-block-name")).toBeInTheDocument(),
  );
  const text = screen.getByTestId("inspector-block-name").textContent ?? "";
  unmount();
  return text;
}

beforeEach(() => {
  vi.clearAllMocks();
  selected = null;
  mockGetNodeParams.mockResolvedValue({ parameters: [] });
});

describe("Task 3.A — Inspector header name === canvas Block title", () => {
  it("freshly-inserted node: both surfaces show the catalog name", async () => {
    const block = makeBlock({ id: "n1", name: "Pro-Q 3" });
    const fromCanvas = canvasTitle(block);
    const fromInspector = await inspectorName(block);

    expect(fromCanvas).toBe("Pro-Q 3");
    // THE GUARD: byte-equal across the two surfaces for the same node id.
    expect(fromInspector).toBe(fromCanvas);
  });

  it("user-renamed node: both surfaces show the RENAMED name, not the catalog", async () => {
    // A renamed node carries the user's name in `name` and the immutable catalog
    // name in `catalogName`. The displayed title on BOTH surfaces must be the
    // user name — the inspector must NOT re-derive "FabFilter Pro-Q 3" from the
    // catalog. (catalogName surfaces only as the muted "Renamed from:" line.)
    const block = makeBlock({
      id: "n2",
      name: "My Bus EQ",
      catalogName: "FabFilter Pro-Q 3",
    });
    const fromCanvas = canvasTitle(block);
    const fromInspector = await inspectorName(block);

    expect(fromCanvas).toBe("My Bus EQ");
    expect(fromInspector).toBe(fromCanvas);
    expect(fromInspector).not.toBe("FabFilter Pro-Q 3");
  });

  it("renamed node: inspector shows a muted 'Renamed from: <catalog>' line", async () => {
    selected = makeBlock({
      id: "n3",
      name: "My Bus EQ",
      catalogName: "FabFilter Pro-Q 3",
    });
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByTestId("inspector-block-name")).toBeInTheDocument(),
    );
    // The catalog name appears as the explicit rename relationship, not the title.
    expect(screen.getByText(/Renamed from:/)).toBeInTheDocument();
    expect(screen.getByText("FabFilter Pro-Q 3")).toBeInTheDocument();
  });

  it("UNrenamed node: NO 'Renamed from' line (catalogName absent)", async () => {
    selected = makeBlock({ id: "n4", name: "Pro-Q 3" });
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByTestId("inspector-block-name")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Renamed from:/)).not.toBeInTheDocument();
  });

  it("loadState-aware: a LOADING node shows the catalog name on both surfaces (no flake)", async () => {
    // Loading-node contract §5: the placeholder carries its final catalog name
    // from creation, so the guard holds mid-load. The Inspector renders an honest
    // loading state but the HEADER name still equals the canvas title.
    const block = makeBlock({
      id: "n5",
      name: "Massive X",
      loadState: "loading",
    });
    const fromCanvas = canvasTitle(block);
    const fromInspector = await inspectorName(block);

    expect(fromInspector).toBe(fromCanvas);
    expect(fromInspector).toBe("Massive X");
  });

  it("loading node: inspector renders an HONEST loading state, no fabricated params", async () => {
    // Even if the param bridge were to return rows, a loading node must not show
    // them (NOTHING-fake). Stub a non-empty param list to prove the gate.
    mockGetNodeParams.mockResolvedValue({
      parameters: [{ index: 0, name: "Cutoff", label: "", value: 0.5, boolean: false }],
    });
    selected = makeBlock({ id: "n6", name: "Massive X", loadState: "loading" });
    render(<InspectorHub />);
    const status = await screen.findByRole("status", { name: "Block loading" });
    expect(status).toBeInTheDocument();
    // No param row leaked through.
    expect(screen.queryByText("Cutoff")).not.toBeInTheDocument();
    // The honest loading indicator is present (header LOADING… badge).
    expect(within(document.body).getByText(/Loading…/)).toBeInTheDocument();
  });
});
