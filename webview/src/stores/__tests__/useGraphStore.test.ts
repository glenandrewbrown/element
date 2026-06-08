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
// nativeEnterContainer / nativeExitContainer default to `true` (host accepted)
// and to `false` (already at top) where a test needs the no-op branch; both are
// re-pointed per-test via mockResolvedValueOnce.
vi.mock("../../bridge/nativeGraph", () => ({
  nativeGraphMoveNodes: vi.fn(async () => undefined),
  nativeGraphSetBypass: vi.fn(async () => undefined),
  nativeGraphSetMute: vi.fn(async () => undefined),
  nativeGraphSetMuteInput: vi.fn(async () => undefined),
  nativeGraphDisconnectNode: vi.fn(async () => true),
  nativeGraphSetNodeColor: vi.fn(async () => true),
  nativeGraphSetOversample: vi.fn(async () => true),
  nativeGraphSetNodeHiddenParams: vi.fn(async () => true),
  nativeGraphSetNodeCollapseTier: vi.fn(async () => true),
  nativeGraphReplacePlugin: vi.fn(async () => true),
  nativeEnterContainer: vi.fn(async () => true),
  nativeExitContainer: vi.fn(async () => true),
}));

import type { BlockData, CableData } from "../../data/types";
import { useGraphStore, selectIsDived } from "../useGraphStore";
import { useBusStore } from "../useBusStore";
import {
  nativeEnterContainer,
  nativeExitContainer,
  nativeGraphSetNodeHiddenParams,
  nativeGraphSetNodeCollapseTier,
} from "../../bridge/nativeGraph";

const makeBlock = (id: string, x = 0, y = 0): BlockData => ({
  id,
  name: `Block ${id}`,
  category: "audiofx",
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
      currentBoardId: null,
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

  it("hydrateFromEngine preserves per-node hiddenParams array", () => {
    const node: BlockData = {
      ...makeBlock("n1"),
      hiddenParams: ["p-mix", "p-width"],
    };
    useGraphStore.getState().hydrateFromEngine({ nodes: [node], edges: [] });
    expect(useGraphStore.getState().nodes[0].hiddenParams).toEqual([
      "p-mix",
      "p-width",
    ]);
  });

  // ── setHiddenParams (Configure Parameters… popover) ────────────────────────

  it("setHiddenParams optimistically sets the full hidden set on the node", async () => {
    useGraphStore.setState({ nodes: [makeBlock("n1")] });
    await useGraphStore.getState().setHiddenParams("n1", ["p-a", "p-b"]);
    expect(useGraphStore.getState().nodes[0].hiddenParams).toEqual([
      "p-a",
      "p-b",
    ]);
    expect(nativeGraphSetNodeHiddenParams).toHaveBeenCalledWith("n1", [
      "p-a",
      "p-b",
    ]);
  });

  it("setHiddenParams with [] clears the hidden set (all params shown)", async () => {
    useGraphStore.setState({
      nodes: [{ ...makeBlock("n1"), hiddenParams: ["p-a"] }],
    });
    await useGraphStore.getState().setHiddenParams("n1", []);
    expect(useGraphStore.getState().nodes[0].hiddenParams).toEqual([]);
    expect(nativeGraphSetNodeHiddenParams).toHaveBeenCalledWith("n1", []);
  });

  // ── Persisted collapse TIER (Wave-3 Task 2.0; widens the legacy bool) ───────

  it("hydrateFromEngine preserves the per-node collapseTier (round-trip)", () => {
    // Simulates a save/load: the snapshot carries collapseTier="title" and the
    // store must keep it (ValueTree persistence echoed back through the snapshot).
    const node: BlockData = { ...makeBlock("n1"), collapseTier: "title" };
    useGraphStore.getState().hydrateFromEngine({ nodes: [node], edges: [] });
    expect(useGraphStore.getState().nodes[0].collapseTier).toBe("title");
  });

  it("idle re-hydrate with the SAME collapseTier is a no-op (reuses node refs)", () => {
    // Perf contract: a static graph pushes NOTHING even with the new field —
    // an identical re-hydrate (incl. collapseTier) reuses the previous node array
    // reference (reconcileArray), so subscribers never re-run.
    const node: BlockData = { ...makeBlock("n1"), collapseTier: "title" };
    useGraphStore.getState().hydrateFromEngine({ nodes: [node], edges: [] });
    const first = useGraphStore.getState().nodes;
    useGraphStore.getState().hydrateFromEngine({
      nodes: [{ ...makeBlock("n1"), collapseTier: "title" }],
      edges: [],
    });
    expect(useGraphStore.getState().nodes).toBe(first); // same reference = idle no-op
  });

  it("setCollapseTier optimistically sets the tier + persists via the native", async () => {
    useGraphStore.setState({ nodes: [makeBlock("n1")] });
    await useGraphStore.getState().setCollapseTier("n1", "expanded");
    expect(useGraphStore.getState().nodes[0].collapseTier).toBe("expanded");
    expect(nativeGraphSetNodeCollapseTier).toHaveBeenCalledWith("n1", "expanded");
  });

  it("setCollapseTier reverts the optimistic set when the bridge rejects", async () => {
    (
      nativeGraphSetNodeCollapseTier as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(false);
    useGraphStore.setState({
      nodes: [{ ...makeBlock("n1"), collapseTier: "macro" }],
    });
    await useGraphStore.getState().setCollapseTier("n1", "title");
    // Bridge said no → the local tier rolls back (prevTier) so nothing fake
    // is left on screen.
    expect(useGraphStore.getState().nodes[0].collapseTier).toBe("macro");
  });

  it("back-compat setCollapsed(true) delegates to setCollapseTier('title')", async () => {
    useGraphStore.setState({ nodes: [makeBlock("n1")] });
    await useGraphStore.getState().setCollapsed("n1", true);
    expect(useGraphStore.getState().nodes[0].collapseTier).toBe("title");
    expect(nativeGraphSetNodeCollapseTier).toHaveBeenCalledWith("n1", "title");
  });

  it("back-compat setCollapsed(false) delegates to setCollapseTier('macro')", async () => {
    useGraphStore.setState({
      nodes: [{ ...makeBlock("n1"), collapseTier: "title" }],
    });
    await useGraphStore.getState().setCollapsed("n1", false);
    expect(useGraphStore.getState().nodes[0].collapseTier).toBe("macro");
    expect(nativeGraphSetNodeCollapseTier).toHaveBeenCalledWith("n1", "macro");
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

  // ── Container dive (engine-driven, NO desync) ─────────────────────────────
  // The breadcrumb is fed SOLELY by the snapshot now, so the legacy optimistic
  // mutators are neutered no-ops and the dive goes through the host bridge.

  it("pushBreadcrumb is a neutered no-op (breadcrumb is snapshot-driven)", () => {
    useGraphStore.getState().pushBreadcrumb("Container A");
    // No optimistic local mutation — the stack only changes via a snapshot.
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
    expect(nativeEnterContainer).not.toHaveBeenCalled();
  });

  it("popBreadcrumb is a neutered no-op", () => {
    useGraphStore.setState({
      breadcrumbStack: ["Main Project", "Graph", "Sub"],
    });
    useGraphStore.getState().popBreadcrumb();
    expect(useGraphStore.getState().breadcrumbStack).toEqual([
      "Main Project",
      "Graph",
      "Sub",
    ]);
    expect(nativeExitContainer).not.toHaveBeenCalled();
  });

  it("navigateToBreadcrumb is a neutered no-op", () => {
    useGraphStore.setState({
      breadcrumbStack: ["Main Project", "Graph", "A", "B"],
    });
    useGraphStore.getState().navigateToBreadcrumb(0);
    expect(useGraphStore.getState().breadcrumbStack).toEqual([
      "Main Project",
      "Graph",
      "A",
      "B",
    ]);
  });

  it("enterContainer calls the host bridge with the node id (no local mutation)", async () => {
    await useGraphStore.getState().enterContainer("node-uuid-1");
    expect(nativeEnterContainer).toHaveBeenCalledWith("node-uuid-1");
    // Breadcrumb unchanged until the host pushes a snapshot — desync-safe.
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
  });

  it("exitContainer calls the host exit bridge", async () => {
    await useGraphStore.getState().exitContainer();
    expect(nativeExitContainer).toHaveBeenCalledTimes(1);
  });

  it("breadcrumb reflects ONLY the snapshot — hydrate drives the multi-level path", () => {
    // Simulate the host re-pushing a 2-deep dive snapshot.
    useGraphStore.getState().hydrateFromEngine({
      nodes: [],
      edges: [],
      breadcrumbs: ["Project", "Main", "Synth Rack", "Voice"],
      currentBoardId: "voice-board",
    });
    expect(useGraphStore.getState().breadcrumbStack).toEqual([
      "Project",
      "Main",
      "Synth Rack",
      "Voice",
    ]);
    expect(useGraphStore.getState().currentBoardId).toBe("voice-board");
  });

  it("hydrate coerces a missing currentBoardId to null (honest top level)", () => {
    useGraphStore.setState({ currentBoardId: "stale" });
    useGraphStore.getState().hydrateFromEngine({
      nodes: [],
      edges: [],
      breadcrumbs: ["Project", "Main"],
    });
    expect(useGraphStore.getState().currentBoardId).toBeNull();
  });

  it("selectIsDived is false at top, true when currentBoardId set or path > 2", () => {
    expect(selectIsDived(useGraphStore.getState())).toBe(false);
    useGraphStore.setState({ currentBoardId: "b1" });
    expect(selectIsDived(useGraphStore.getState())).toBe(true);
    useGraphStore.setState({
      currentBoardId: null,
      breadcrumbStack: ["P", "Main", "Container"],
    });
    expect(selectIsDived(useGraphStore.getState())).toBe(true);
  });

  // Interaction (d): a 2-level enter then 2-level exit drives exactly 2 enter
  // and 2 exit bridge calls — the host owns the actual navigation + snapshots.
  it("2-level dive: 2× enterContainer + 2× exitContainer drive 2 enter / 2 exit bridge calls", async () => {
    await useGraphStore.getState().enterContainer("container-1");
    await useGraphStore.getState().enterContainer("container-2");
    expect(nativeEnterContainer).toHaveBeenCalledTimes(2);
    expect(nativeEnterContainer).toHaveBeenNthCalledWith(1, "container-1");
    expect(nativeEnterContainer).toHaveBeenNthCalledWith(2, "container-2");

    await useGraphStore.getState().exitContainer();
    await useGraphStore.getState().exitContainer();
    expect(nativeExitContainer).toHaveBeenCalledTimes(2);
  });

  it("exitToBreadcrumb loops nativeExitContainer (length − 1 − targetIndex) times", async () => {
    // Path [session, activeGraph, c1, c2] (length 4). Exiting to index 1
    // (activeGraph = fully out) → 4 − 1 − 1 = 2 exit calls.
    useGraphStore.setState({
      breadcrumbStack: ["Project", "Main", "C1", "C2"],
    });
    await useGraphStore.getState().exitToBreadcrumb(1);
    expect(nativeExitContainer).toHaveBeenCalledTimes(2);
  });

  it("exitToBreadcrumb stops early when the host signals top reached", async () => {
    useGraphStore.setState({
      breadcrumbStack: ["Project", "Main", "C1", "C2", "C3"],
    });
    // Host accepts the first exit, then reports it is already at the top.
    (nativeExitContainer as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await useGraphStore.getState().exitToBreadcrumb(0);
    // Would have looped 4× by depth, but the false short-circuits at 2 calls.
    expect(nativeExitContainer).toHaveBeenCalledTimes(2);
  });

  // ── Selector shape ────────────────────────────────────────────────────────

  it("nodes selector returns updated array after hydrateFromEngine", () => {
    const nodes = [makeBlock("nA"), makeBlock("nB")];
    useGraphStore.getState().hydrateFromEngine({ nodes, edges: [] });
    expect(useGraphStore.getState().nodes.map((n) => n.id)).toEqual(["nA", "nB"]);
  });
});

// ── Extended coverage (May 2026) ─────────────────────────────────────────────
// The block above covers the original baseline. The describes below extend
// coverage to the helpers, bridge-coupled toggles, alignment / distribute,
// comment box layout, and the remaining selectors.

import {
  zoomToTier,
  selectNodes,
  selectEdges,
  selectSelectedNodeId,
  selectSelectedEdgeId,
  selectBreadcrumbs,
  selectCommentBoxes,
  selectZoomTier,
  selectNodeById,
  selectSelectedNode,
  selectSelectedEdge,
} from "../useGraphStore";
import {
  nativeGraphMoveNodes,
  nativeGraphSetBypass,
  nativeGraphSetMute,
  nativeGraphSetMuteInput,
} from "../../bridge/nativeGraph";
import type { CommentBoxData } from "../../data/types";

const makeCommentBox = (id: string, x = 0, y = 0): CommentBoxData => ({
  id,
  label: id,
  color: "blue",
  position: { x, y },
  size: { width: 100, height: 80 },
});

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
  vi.clearAllMocks();
});

describe("zoomToTier", () => {
  it("returns 'compact' below 0.5", () => {
    expect(zoomToTier(0.4)).toBe("compact");
    expect(zoomToTier(0)).toBe("compact");
  });
  it("returns 'standard' in [0.5, 0.8]", () => {
    expect(zoomToTier(0.5)).toBe("standard");
    expect(zoomToTier(0.8)).toBe("standard");
    expect(zoomToTier(0.65)).toBe("standard");
  });
  it("returns 'expanded' above 0.9", () => {
    expect(zoomToTier(0.95)).toBe("expanded");
    expect(zoomToTier(2)).toBe("expanded");
  });
});

describe("UI state toggles", () => {
  it("toggleMinimap flips minimapVisible", () => {
    expect(useGraphStore.getState().minimapVisible).toBe(true);
    useGraphStore.getState().toggleMinimap();
    expect(useGraphStore.getState().minimapVisible).toBe(false);
    useGraphStore.getState().toggleMinimap();
    expect(useGraphStore.getState().minimapVisible).toBe(true);
  });

  it("setZoomTier writes the tier", () => {
    useGraphStore.getState().setZoomTier("expanded");
    expect(useGraphStore.getState().zoomTier).toBe("expanded");
  });
});

describe("bypass / mute toggles (bridge-coupled)", () => {
  beforeEach(() => {
    useGraphStore.setState({ nodes: [makeBlock("n1")] });
  });

  it("toggleBypass flips state and calls native bridge with the next value", () => {
    useGraphStore.getState().toggleBypass("n1");
    expect(useGraphStore.getState().nodes[0].bypassed).toBe(true);
    expect(nativeGraphSetBypass).toHaveBeenCalledWith("n1", true);
    useGraphStore.getState().toggleBypass("n1");
    expect(useGraphStore.getState().nodes[0].bypassed).toBe(false);
    expect(nativeGraphSetBypass).toHaveBeenLastCalledWith("n1", false);
  });

  it("toggleMute flips muted and calls bridge", () => {
    useGraphStore.getState().toggleMute("n1");
    expect(useGraphStore.getState().nodes[0].muted).toBe(true);
    expect(nativeGraphSetMute).toHaveBeenCalledWith("n1", true);
  });

  it("toggleMuteInput flips muteInput and calls bridge", () => {
    useGraphStore.getState().toggleMuteInput("n1");
    expect(useGraphStore.getState().nodes[0].muteInput).toBe(true);
    expect(nativeGraphSetMuteInput).toHaveBeenCalledWith("n1", true);
  });

  it("toggleBypass on an unknown node still calls the bridge with true", () => {
    useGraphStore.getState().toggleBypass("missing");
    expect(nativeGraphSetBypass).toHaveBeenCalledWith("missing", true);
  });
});

describe("updateNodePositions — extra cases", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [makeBlock("n1", 0, 0), makeBlock("n2", 10, 10), makeBlock("n3", 20, 20)],
    });
  });

  it("ignores updates for ids that don't exist", () => {
    useGraphStore
      .getState()
      .updateNodePositions([{ id: "ghost", x: 999, y: 999 }]);
    expect(useGraphStore.getState().nodes.map((n) => n.position)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
  });

  it("patches multiple ids in one call", () => {
    useGraphStore
      .getState()
      .updateNodePositions([
        { id: "n1", x: 100, y: 200 },
        { id: "n3", x: 300, y: 400 },
      ]);
    const s = useGraphStore.getState();
    expect(s.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(s.nodes[1].position).toEqual({ x: 10, y: 10 });
    expect(s.nodes[2].position).toEqual({ x: 300, y: 400 });
  });
});

describe("updateCommentBoxLayout", () => {
  it("patches position and size of the matching comment box", () => {
    useGraphStore.setState({
      commentBoxes: [makeCommentBox("cb1", 0, 0), makeCommentBox("cb2", 5, 5)],
    });
    useGraphStore.getState().updateCommentBoxLayout("cb1", {
      x: 50,
      y: 60,
      width: 200,
      height: 150,
    });
    const cb1 = useGraphStore
      .getState()
      .commentBoxes.find((c) => c.id === "cb1");
    expect(cb1?.position).toEqual({ x: 50, y: 60 });
    expect(cb1?.size).toEqual({ width: 200, height: 150 });
  });

  it("leaves other comment boxes untouched", () => {
    useGraphStore.setState({
      commentBoxes: [makeCommentBox("cb1", 0, 0), makeCommentBox("cb2", 5, 5)],
    });
    useGraphStore
      .getState()
      .updateCommentBoxLayout("cb1", { x: 99, y: 99, width: 1, height: 1 });
    const cb2 = useGraphStore
      .getState()
      .commentBoxes.find((c) => c.id === "cb2");
    expect(cb2?.position).toEqual({ x: 5, y: 5 });
  });
});

describe("alignSelectedNodes", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        makeBlock("n1", 10, 10),
        makeBlock("n2", 50, 200),
        makeBlock("n3", 300, 80),
      ],
    });
  });

  it("is a no-op when fewer than 2 ids are supplied", () => {
    useGraphStore.getState().alignSelectedNodes("left", ["n1"]);
    expect(useGraphStore.getState().nodes[0].position.x).toBe(10);
    expect(nativeGraphMoveNodes).not.toHaveBeenCalled();
  });

  it("aligns selected nodes to the left (min X)", () => {
    useGraphStore.getState().alignSelectedNodes("left", ["n1", "n2", "n3"]);
    const xs = useGraphStore.getState().nodes.map((n) => n.position.x);
    expect(xs).toEqual([10, 10, 10]);
    expect(nativeGraphMoveNodes).toHaveBeenCalledTimes(1);
  });

  it("aligns selected nodes to the right (max X)", () => {
    useGraphStore.getState().alignSelectedNodes("right", ["n1", "n2", "n3"]);
    const xs = useGraphStore.getState().nodes.map((n) => n.position.x);
    expect(xs).toEqual([300, 300, 300]);
  });

  it("aligns selected nodes to the top (min Y)", () => {
    useGraphStore.getState().alignSelectedNodes("top", ["n1", "n2", "n3"]);
    const ys = useGraphStore.getState().nodes.map((n) => n.position.y);
    expect(ys).toEqual([10, 10, 10]);
  });

  it("aligns selected nodes to the bottom (max Y)", () => {
    useGraphStore.getState().alignSelectedNodes("bottom", ["n1", "n2", "n3"]);
    const ys = useGraphStore.getState().nodes.map((n) => n.position.y);
    expect(ys).toEqual([200, 200, 200]);
  });

  it("aligns selected nodes to the center (horizontal centerline)", () => {
    useGraphStore.getState().alignSelectedNodes("center", ["n1", "n2", "n3"]);
    const xs = useGraphStore.getState().nodes.map((n) => n.position.x);
    // (minX 10 + maxX 300 + BLOCK_REF_WIDTH 200) / 2 - 200/2 = 155
    expect(xs).toEqual([155, 155, 155]);
  });

  it("aligns selected nodes to the middle (vertical centerline)", () => {
    useGraphStore.getState().alignSelectedNodes("middle", ["n1", "n2", "n3"]);
    const ys = useGraphStore.getState().nodes.map((n) => n.position.y);
    // (minY 10 + maxY 200 + BLOCK_REF_HEIGHT 100) / 2 - 100/2 = 105
    expect(ys).toEqual([105, 105, 105]);
  });

  it("skips bridge call when every node is already at the target", () => {
    useGraphStore.setState({
      nodes: [makeBlock("n1", 100, 0), makeBlock("n2", 100, 0)],
    });
    useGraphStore.getState().alignSelectedNodes("left", ["n1", "n2"]);
    expect(nativeGraphMoveNodes).not.toHaveBeenCalled();
  });

  it("does not touch unselected nodes", () => {
    useGraphStore.getState().alignSelectedNodes("left", ["n1", "n2"]);
    expect(useGraphStore.getState().nodes[2].position.x).toBe(300);
  });

  it("returns unchanged state when selectedIds reference no existing nodes", () => {
    useGraphStore
      .getState()
      .alignSelectedNodes("left", ["ghost1", "ghost2"]);
    expect(nativeGraphMoveNodes).not.toHaveBeenCalled();
    expect(useGraphStore.getState().nodes[0].position.x).toBe(10);
  });
});

describe("distributeSelectedNodes", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        makeBlock("n1", 0, 0),
        makeBlock("n2", 30, 0),
        makeBlock("n3", 100, 0),
      ],
    });
  });

  it("is a no-op when fewer than 3 ids are supplied", () => {
    useGraphStore
      .getState()
      .distributeSelectedNodes("horizontal", ["n1", "n2"]);
    expect(useGraphStore.getState().nodes[1].position.x).toBe(30);
    expect(nativeGraphMoveNodes).not.toHaveBeenCalled();
  });

  it("evenly spaces interior nodes horizontally between the extremes", () => {
    useGraphStore
      .getState()
      .distributeSelectedNodes("horizontal", ["n1", "n2", "n3"]);
    const n2 = useGraphStore.getState().nodes.find((n) => n.id === "n2");
    expect(n2?.position.x).toBe(50);
    expect(nativeGraphMoveNodes).toHaveBeenCalledTimes(1);
  });

  it("evenly spaces interior nodes vertically", () => {
    useGraphStore.setState({
      nodes: [
        makeBlock("n1", 0, 0),
        makeBlock("n2", 0, 30),
        makeBlock("n3", 0, 100),
      ],
    });
    useGraphStore
      .getState()
      .distributeSelectedNodes("vertical", ["n1", "n2", "n3"]);
    const n2 = useGraphStore.getState().nodes.find((n) => n.id === "n2");
    expect(n2?.position.y).toBe(50);
  });

  it("returns unchanged state when fewer than 3 of the ids exist", () => {
    useGraphStore
      .getState()
      .distributeSelectedNodes("horizontal", ["n1", "ghost", "missing"]);
    expect(nativeGraphMoveNodes).not.toHaveBeenCalled();
  });
});

describe("selectors", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [makeBlock("n1", 0, 0), makeBlock("n2", 1, 1)],
      edges: [makeCable("e1"), makeCable("e2")],
      commentBoxes: [makeCommentBox("cb1")],
      breadcrumbStack: ["Main", "A"],
      zoomTier: "expanded",
    });
  });

  it("selectNodes / selectEdges / selectCommentBoxes / selectBreadcrumbs / selectZoomTier return the matching slice", () => {
    const s = useGraphStore.getState();
    expect(selectNodes(s).map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(selectEdges(s).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(selectCommentBoxes(s).map((c) => c.id)).toEqual(["cb1"]);
    expect(selectBreadcrumbs(s)).toEqual(["Main", "A"]);
    expect(selectZoomTier(s)).toBe("expanded");
  });

  it("selectNodeById finds the matching node or undefined", () => {
    const s = useGraphStore.getState();
    expect(selectNodeById("n2")(s)?.id).toBe("n2");
    expect(selectNodeById("ghost")(s)).toBeUndefined();
  });

  it("selectSelectedNode / selectSelectedEdge resolve via id", () => {
    useGraphStore.setState({ selectedNodeId: "n2", selectedEdgeId: null });
    let s = useGraphStore.getState();
    expect(selectSelectedNode(s)?.id).toBe("n2");
    expect(selectSelectedEdge(s)).toBeUndefined();

    useGraphStore.setState({ selectedNodeId: null, selectedEdgeId: "e1" });
    s = useGraphStore.getState();
    expect(selectSelectedNode(s)).toBeUndefined();
    expect(selectSelectedEdge(s)?.id).toBe("e1");
  });

  it("selectSelectedNodeId / selectSelectedEdgeId return the raw ids (or null)", () => {
    useGraphStore.setState({ selectedNodeId: "n1", selectedEdgeId: null });
    const s = useGraphStore.getState();
    expect(selectSelectedNodeId(s)).toBe("n1");
    expect(selectSelectedEdgeId(s)).toBeNull();
  });
});

// ── hydrateFromEngine — array/object identity reuse (ledger #17) ──────────────
// A no-change snapshot must keep the EXISTING array references so downstream
// useSyncExternalStore subscribers (canvas/meters/inspector) see no slice
// change and never re-render. Drag-safe: a moved Block is not deep-equal, so
// its new position is adopted.

describe("hydrateFromEngine — identity reuse on unchanged content", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      breadcrumbStack: ["Main Project"],
      currentBoardId: null,
      commentBoxes: [],
      minimapVisible: true,
      zoomTier: "standard",
    });
    useBusStore.setState({ cableBus: {} });
  });

  it("keeps the SAME nodes/edges array references when re-hydrated with equal content", () => {
    const nodes = [makeBlock("n1", 10, 20), makeBlock("n2", 30, 40)];
    const edges = [makeCable("e1", "n1", "n2")];
    useGraphStore.getState().hydrateFromEngine({ nodes, edges });
    const refNodes = useGraphStore.getState().nodes;
    const refEdges = useGraphStore.getState().edges;

    // Re-hydrate with a FRESH but content-identical snapshot (new object/array
    // identities, same values) — the store must reuse its existing references.
    useGraphStore.getState().hydrateFromEngine({
      nodes: [makeBlock("n1", 10, 20), makeBlock("n2", 30, 40)],
      edges: [makeCable("e1", "n1", "n2")],
    });
    expect(useGraphStore.getState().nodes).toBe(refNodes);
    expect(useGraphStore.getState().edges).toBe(refEdges);
  });

  it("returns the SAME state reference for a true no-change snapshot", () => {
    const nodes = [makeBlock("n1", 0, 0)];
    useGraphStore.getState().hydrateFromEngine({ nodes, edges: [] });
    const before = useGraphStore.getState();
    useGraphStore.getState().hydrateFromEngine({
      nodes: [makeBlock("n1", 0, 0)],
      edges: [],
    });
    expect(useGraphStore.getState()).toBe(before);
  });

  it("reuses unchanged element objects but swaps the array when ONE node moved", () => {
    const nodes = [makeBlock("n1", 0, 0), makeBlock("n2", 50, 50)];
    useGraphStore.getState().hydrateFromEngine({ nodes, edges: [] });
    const prevNodes = useGraphStore.getState().nodes;
    const prevN2 = prevNodes[1];

    // n1 moves; n2 unchanged. Array ref must change; n2 object ref reused.
    useGraphStore.getState().hydrateFromEngine({
      nodes: [makeBlock("n1", 999, 0), makeBlock("n2", 50, 50)],
      edges: [],
    });
    const nextNodes = useGraphStore.getState().nodes;
    expect(nextNodes).not.toBe(prevNodes);
    expect(nextNodes[0].position).toEqual({ x: 999, y: 0 }); // moved → adopted
    expect(nextNodes[1]).toBe(prevN2); // unchanged → reused identity
  });

  it("swaps references when a deep field (ports) changes even if ids match", () => {
    const n: BlockData = {
      ...makeBlock("n1"),
      ports: [
        { id: "p0", type: "audio", direction: "output", label: "Out", connected: false },
      ],
    };
    useGraphStore.getState().hydrateFromEngine({ nodes: [n], edges: [] });
    const prev = useGraphStore.getState().nodes;

    const nMoved: BlockData = {
      ...makeBlock("n1"),
      ports: [
        { id: "p0", type: "audio", direction: "output", label: "Out", connected: true },
      ],
    };
    useGraphStore.getState().hydrateFromEngine({ nodes: [nMoved], edges: [] });
    expect(useGraphStore.getState().nodes).not.toBe(prev);
    expect(useGraphStore.getState().nodes[0].ports[0].connected).toBe(true);
  });

  it("keeps commentBoxes + breadcrumb references stable on a no-change re-hydrate", () => {
    useGraphStore.getState().hydrateFromEngine({
      nodes: [],
      edges: [],
      commentBoxes: [
        {
          id: "cb1",
          label: "Group",
          color: "blue",
          position: { x: 1, y: 2 },
          size: { width: 100, height: 80 },
        },
      ],
      breadcrumbs: ["Project", "Main", "Container"],
    });
    const prevComments = useGraphStore.getState().commentBoxes;
    const prevCrumbs = useGraphStore.getState().breadcrumbStack;

    useGraphStore.getState().hydrateFromEngine({
      nodes: [],
      edges: [],
      commentBoxes: [
        {
          id: "cb1",
          label: "Group",
          color: "blue",
          position: { x: 1, y: 2 },
          size: { width: 100, height: 80 },
        },
      ],
      breadcrumbs: ["Project", "Main", "Container"],
    });
    expect(useGraphStore.getState().commentBoxes).toBe(prevComments);
    expect(useGraphStore.getState().breadcrumbStack).toBe(prevCrumbs);
  });

  it("still clears a live selection on hydrate (does NOT short-circuit when selected)", () => {
    const nodes = [makeBlock("n1", 0, 0)];
    useGraphStore.getState().hydrateFromEngine({ nodes, edges: [] });
    useGraphStore.setState({ selectedNodeId: "n1" });
    // Even content-identical, the selection must be cleared → not a no-op.
    useGraphStore.getState().hydrateFromEngine({
      nodes: [makeBlock("n1", 0, 0)],
      edges: [],
    });
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });
});
