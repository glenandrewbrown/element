/**
 * Tests for `useGraphStore` — processing graph node/edge state.
 *
 * Covers:
 *   1) `selectNode` / `selectEdge` set selection state and clear the other
 *   2) `clearSelection` resets both selected ids to null
 *   3) `hydrateFromEngine` replaces nodes, edges, and comment boxes
 *   4) `updateNodePositions` patches x/y on the matched node only
 *   5) `pushBreadcrumb` / `popBreadcrumb` / `navigateToBreadcrumb` stack operations
 *   6) Selector shape — nodes/edges arrays reflect mutations correctly
 *
 * Bridge calls inside toggleBypass/toggleMute are mocked via nativeGraph.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock nativeGraph bridge before importing the store.
vi.mock("../../bridge/nativeGraph", () => ({
  nativeGraphMoveNodes: vi.fn(async () => undefined),
  nativeGraphSetBypass: vi.fn(async () => undefined),
  nativeGraphSetMute: vi.fn(async () => undefined),
  nativeGraphSetMuteInput: vi.fn(async () => undefined),
}));

import type { BlockData, CableData } from "../../data/types";
import { useGraphStore } from "../useGraphStore";
import { useBusStore } from "../useBusStore";

const makeBlock = (id: string, x = 0, y = 0): BlockData => ({
  id,
  name: `Block ${id}`,
  category: "modifier",
  format: "VST3",
  position: { x, y },
  ports: [],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
});

const makeCable = (id: string, source = "n1", target = "n2"): CableData => ({
  id,
  source,
  sourcePort: "out_0",
  target,
  targetPort: "in_0",
  signalType: "audio",
  channelCount: 2,
  isSidechain: false,
});

describe("useGraphStore", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      breadcrumbStack: ["Main Project"],
      commentBoxes: [],
      minimapVisible: true,
      zoomTier: "standard",
    });
    useBusStore.setState({ cableBus: {} });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Node selection ────────────────────────────────────────────────────────

  it("selectNode sets selectedNodeId and clears selectedEdgeId", () => {
    useGraphStore.setState({ selectedEdgeId: "e1" });
    useGraphStore.getState().selectNode("n1");
    expect(useGraphStore.getState().selectedNodeId).toBe("n1");
    expect(useGraphStore.getState().selectedEdgeId).toBeNull();
  });

  it("selectEdge sets selectedEdgeId and clears selectedNodeId", () => {
    useGraphStore.setState({ selectedNodeId: "n1" });
    useGraphStore.getState().selectEdge("e1");
    expect(useGraphStore.getState().selectedEdgeId).toBe("e1");
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });

  it("clearSelection resets both selected ids to null", () => {
    useGraphStore.setState({ selectedNodeId: "n1", selectedEdgeId: "e1" });
    useGraphStore.getState().clearSelection();
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
    expect(useGraphStore.getState().selectedEdgeId).toBeNull();
  });

  // ── hydrateFromEngine ─────────────────────────────────────────────────────

  it("hydrateFromEngine replaces nodes and edges", () => {
    const nodes = [makeBlock("n1"), makeBlock("n2")];
    const edges = [makeCable("e1", "n1", "n2")];
    useGraphStore.getState().hydrateFromEngine({ nodes, edges });
    expect(useGraphStore.getState().nodes).toHaveLength(2);
    expect(useGraphStore.getState().edges).toHaveLength(1);
    expect(useGraphStore.getState().nodes[0].id).toBe("n1");
  });

  it("hydrateFromEngine clears selections", () => {
    useGraphStore.setState({ selectedNodeId: "old", selectedEdgeId: "old-e" });
    useGraphStore.getState().hydrateFromEngine({ nodes: [], edges: [] });
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
    expect(useGraphStore.getState().selectedEdgeId).toBeNull();
  });

  it("hydrateFromEngine seeds useBusStore from cable busName fields", () => {
    const edges: CableData[] = [
      { ...makeCable("e1", "n1", "n2"), busName: "Reverb Send" },
      makeCable("e2", "n2", "n3"),
    ];
    useGraphStore.getState().hydrateFromEngine({ nodes: [], edges });
    expect(useBusStore.getState().cableBus["e1"]).toBe("Reverb Send");
    expect(useBusStore.getState().cableBus["e2"]).toBeUndefined();
  });

  it("hydrateFromEngine uses supplied breadcrumbs when non-empty", () => {
    useGraphStore.getState().hydrateFromEngine({
      nodes: [],
      edges: [],
      breadcrumbs: ["Root", "Sub"],
    });
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Root", "Sub"]);
  });

  // ── updateNodePositions ───────────────────────────────────────────────────

  it("updateNodePositions patches x/y for the matched node only", () => {
    const nodes = [makeBlock("n1", 0, 0), makeBlock("n2", 50, 50)];
    useGraphStore.setState({ nodes });
    useGraphStore.getState().updateNodePositions([{ id: "n1", x: 100, y: 200 }]);
    const updated = useGraphStore.getState().nodes;
    expect(updated[0].position).toEqual({ x: 100, y: 200 });
    expect(updated[1].position).toEqual({ x: 50, y: 50 });
  });

  // ── Breadcrumb stack ──────────────────────────────────────────────────────

  it("pushBreadcrumb appends to the stack", () => {
    useGraphStore.getState().pushBreadcrumb("Container A");
    expect(useGraphStore.getState().breadcrumbStack).toEqual([
      "Main Project",
      "Container A",
    ]);
  });

  it("popBreadcrumb removes the last entry but keeps at least one", () => {
    useGraphStore.getState().pushBreadcrumb("Sub");
    useGraphStore.getState().popBreadcrumb();
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
  });

  it("popBreadcrumb is a no-op when only one entry remains", () => {
    useGraphStore.getState().popBreadcrumb();
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
  });

  it("navigateToBreadcrumb trims to the requested index", () => {
    useGraphStore.getState().pushBreadcrumb("A");
    useGraphStore.getState().pushBreadcrumb("B");
    useGraphStore.getState().navigateToBreadcrumb(0);
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
  });

  // ── Selector shape ────────────────────────────────────────────────────────

  it("nodes selector returns updated array after hydrateFromEngine", () => {
    const nodes = [makeBlock("nA"), makeBlock("nB")];
    useGraphStore.getState().hydrateFromEngine({ nodes, edges: [] });
    expect(useGraphStore.getState().nodes.map((n) => n.id)).toEqual(["nA", "nB"]);
  });
});
