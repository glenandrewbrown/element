/**
 * useGraphStore — alignment, distribution, zoomTier, minimap, commentBox, and selector gaps.
 *
 * Covers previously untested actions:
 *   alignSelectedNodes — all 6 directions (left/right/center/top/bottom/middle)
 *   alignSelectedNodes — no-op when < 2 nodes
 *   distributeSelectedNodes — horizontal and vertical axes
 *   distributeSelectedNodes — no-op when < 3 nodes
 *   zoomToTier — compact / standard / expanded thresholds
 *   setZoomTier — updates zoomTier field
 *   toggleMinimap — toggles minimapVisible
 *   updateCommentBoxLayout — patches position and size
 *   selectNodeById — returns matching node or undefined
 *   selectSelectedNode / selectSelectedEdge — reflect selections
 *   navigateToBreadcrumb — slices stack to given index
 *   popBreadcrumb — no-op when only one entry remains
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockMoveNodes = vi.fn(async () => undefined);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spread = (fn: (...a: any[]) => any) => (...a: any[]) => fn(...a);

vi.mock("../../bridge/nativeGraph", () => ({
  nativeGraphMoveNodes: spread(mockMoveNodes),
  nativeGraphSetBypass: vi.fn(async () => true),
  nativeGraphSetMute: vi.fn(async () => true),
  nativeGraphSetMuteInput: vi.fn(async () => true),
}));

import type { BlockData, CableData, CommentBoxData } from "../../data/types";
import {
  useGraphStore,
  zoomToTier,
  selectNodeById,
  selectSelectedNode,
  selectSelectedEdge,
} from "../useGraphStore";
import { useBusStore } from "../useBusStore";

// ── helpers ───────────────────────────────────────────────────────────────────

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

const makeEdge = (id: string): CableData => ({
  id,
  source: "n1",
  sourcePort: "out_0",
  target: "n2",
  targetPort: "in_0",
  signalType: "audio",
  channelCount: 2,
  isSidechain: false,
});

const makeComment = (id: string): CommentBoxData => ({
  id,
  label: "Note",
  color: "#808080",
  position: { x: 0, y: 0 },
  size: { width: 200, height: 150 },
});

function resetStore() {
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
}

// ── zoomToTier ────────────────────────────────────────────────────────────────

describe("zoomToTier", () => {
  it("returns compact for zoom < 0.5", () => {
    expect(zoomToTier(0.49)).toBe("compact");
    expect(zoomToTier(0)).toBe("compact");
  });

  it("returns compact at exactly 0 (boundary)", () => {
    expect(zoomToTier(0)).toBe("compact");
  });

  it("returns standard for zoom in [0.5, 0.8]", () => {
    expect(zoomToTier(0.5)).toBe("standard");
    expect(zoomToTier(0.8)).toBe("standard");
    expect(zoomToTier(0.65)).toBe("standard");
  });

  it("returns expanded for zoom > 0.8", () => {
    expect(zoomToTier(0.81)).toBe("expanded");
    expect(zoomToTier(2)).toBe("expanded");
  });
});

// ── setZoomTier ───────────────────────────────────────────────────────────────

describe("setZoomTier", () => {
  beforeEach(resetStore);

  it("sets compact", () => {
    useGraphStore.getState().setZoomTier("compact");
    expect(useGraphStore.getState().zoomTier).toBe("compact");
  });

  it("sets expanded", () => {
    useGraphStore.getState().setZoomTier("expanded");
    expect(useGraphStore.getState().zoomTier).toBe("expanded");
  });

  it("sets back to standard", () => {
    useGraphStore.getState().setZoomTier("expanded");
    useGraphStore.getState().setZoomTier("standard");
    expect(useGraphStore.getState().zoomTier).toBe("standard");
  });
});

// ── toggleMinimap ─────────────────────────────────────────────────────────────

describe("toggleMinimap", () => {
  beforeEach(resetStore);

  it("hides minimap when visible", () => {
    useGraphStore.setState({ minimapVisible: true });
    useGraphStore.getState().toggleMinimap();
    expect(useGraphStore.getState().minimapVisible).toBe(false);
  });

  it("shows minimap when hidden", () => {
    useGraphStore.setState({ minimapVisible: false });
    useGraphStore.getState().toggleMinimap();
    expect(useGraphStore.getState().minimapVisible).toBe(true);
  });

  it("toggling twice restores original state", () => {
    useGraphStore.getState().toggleMinimap();
    useGraphStore.getState().toggleMinimap();
    expect(useGraphStore.getState().minimapVisible).toBe(true);
  });
});

// ── updateCommentBoxLayout ────────────────────────────────────────────────────

describe("updateCommentBoxLayout", () => {
  beforeEach(resetStore);

  it("patches position and size for the matched comment box", () => {
    useGraphStore.setState({ commentBoxes: [makeComment("cm1"), makeComment("cm2")] });
    useGraphStore.getState().updateCommentBoxLayout("cm1", { x: 100, y: 200, width: 400, height: 300 });
    const boxes = useGraphStore.getState().commentBoxes;
    expect(boxes[0].position).toEqual({ x: 100, y: 200 });
    expect(boxes[0].size).toEqual({ width: 400, height: 300 });
    expect(boxes[1].position).toEqual({ x: 0, y: 0 }); // unchanged
  });

  it("is a no-op when id not found", () => {
    useGraphStore.setState({ commentBoxes: [makeComment("cm1")] });
    useGraphStore.getState().updateCommentBoxLayout("missing", { x: 50, y: 50, width: 100, height: 100 });
    expect(useGraphStore.getState().commentBoxes[0].position).toEqual({ x: 0, y: 0 });
  });
});

// ── navigateToBreadcrumb ──────────────────────────────────────────────────────

describe("navigateToBreadcrumb", () => {
  beforeEach(() => {
    resetStore();
    useGraphStore.setState({
      breadcrumbStack: ["Root", "Board A", "Board B", "Board C"],
    });
  });

  it("slices to the given index (inclusive)", () => {
    useGraphStore.getState().navigateToBreadcrumb(1);
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Root", "Board A"]);
  });

  it("navigating to index 0 keeps only root", () => {
    useGraphStore.getState().navigateToBreadcrumb(0);
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Root"]);
  });

  it("navigating to last index keeps all entries", () => {
    useGraphStore.getState().navigateToBreadcrumb(3);
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Root", "Board A", "Board B", "Board C"]);
  });
});

describe("popBreadcrumb — boundary", () => {
  beforeEach(resetStore);

  it("is a no-op when only one entry remains", () => {
    expect(useGraphStore.getState().breadcrumbStack).toHaveLength(1);
    useGraphStore.getState().popBreadcrumb();
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
  });
});

// ── selectors ─────────────────────────────────────────────────────────────────

describe("selectNodeById", () => {
  beforeEach(() => {
    resetStore();
    useGraphStore.setState({ nodes: [makeBlock("n1", 10, 20), makeBlock("n2", 30, 40)] });
  });

  it("returns matching node", () => {
    const node = selectNodeById("n1")(useGraphStore.getState());
    expect(node?.id).toBe("n1");
  });

  it("returns undefined for unknown id", () => {
    expect(selectNodeById("nope")(useGraphStore.getState())).toBeUndefined();
  });
});

describe("selectSelectedNode / selectSelectedEdge", () => {
  beforeEach(() => {
    resetStore();
    useGraphStore.setState({
      nodes: [makeBlock("n1")],
      edges: [makeEdge("e1")],
    });
  });

  it("selectSelectedNode returns undefined when nothing selected", () => {
    expect(selectSelectedNode(useGraphStore.getState())).toBeUndefined();
  });

  it("selectSelectedNode returns the selected node", () => {
    useGraphStore.getState().selectNode("n1");
    expect(selectSelectedNode(useGraphStore.getState())?.id).toBe("n1");
  });

  it("selectSelectedEdge returns undefined when nothing selected", () => {
    expect(selectSelectedEdge(useGraphStore.getState())).toBeUndefined();
  });

  it("selectSelectedEdge returns the selected edge", () => {
    useGraphStore.getState().selectEdge("e1");
    expect(selectSelectedEdge(useGraphStore.getState())?.id).toBe("e1");
  });
});

// ── alignSelectedNodes ────────────────────────────────────────────────────────

describe("alignSelectedNodes", () => {
  beforeEach(() => {
    resetStore();
    mockMoveNodes.mockClear();
    useGraphStore.setState({
      nodes: [
        makeBlock("n1", 10, 50),
        makeBlock("n2", 60, 100),
        makeBlock("n3", 30, 20),
      ],
    });
  });

  afterEach(() => {
    mockMoveNodes.mockClear();
  });

  it("no-op when fewer than 2 ids provided", () => {
    useGraphStore.getState().alignSelectedNodes("left", ["n1"]);
    // Position unchanged
    expect(useGraphStore.getState().nodes[0].position.x).toBe(10);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });

  it("no-op when ids don't match any nodes", () => {
    useGraphStore.getState().alignSelectedNodes("left", ["x", "y"]);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });

  it('aligns "left" — all nodes get minX', () => {
    useGraphStore.getState().alignSelectedNodes("left", ["n1", "n2", "n3"]);
    const nodes = useGraphStore.getState().nodes;
    expect(nodes[0].position.x).toBe(10);
    expect(nodes[1].position.x).toBe(10);
    expect(nodes[2].position.x).toBe(10);
  });

  it('aligns "right" — all nodes get maxX', () => {
    useGraphStore.getState().alignSelectedNodes("right", ["n1", "n2", "n3"]);
    const nodes = useGraphStore.getState().nodes;
    expect(nodes[0].position.x).toBe(60);
    expect(nodes[1].position.x).toBe(60);
    expect(nodes[2].position.x).toBe(60);
  });

  it('aligns "center" — all nodes centered on (minX+maxX+BLOCK_W)/2 - BLOCK_W/2', () => {
    // minX=10, maxX=60, BLOCK_REF_WIDTH=200 → centerX=(10+60+200)/2=135 → targetX=135-100=35
    useGraphStore.getState().alignSelectedNodes("center", ["n1", "n2", "n3"]);
    const nodes = useGraphStore.getState().nodes;
    nodes.forEach((n) => expect(n.position.x).toBe(35));
  });

  it('aligns "top" — all nodes get minY', () => {
    useGraphStore.getState().alignSelectedNodes("top", ["n1", "n2", "n3"]);
    const nodes = useGraphStore.getState().nodes;
    expect(nodes[0].position.y).toBe(20);
    expect(nodes[1].position.y).toBe(20);
    expect(nodes[2].position.y).toBe(20);
  });

  it('aligns "bottom" — all nodes get maxY', () => {
    useGraphStore.getState().alignSelectedNodes("bottom", ["n1", "n2", "n3"]);
    const nodes = useGraphStore.getState().nodes;
    expect(nodes[0].position.y).toBe(100);
    expect(nodes[1].position.y).toBe(100);
    expect(nodes[2].position.y).toBe(100);
  });

  it('aligns "middle" — all nodes centered on (minY+maxY+BLOCK_H)/2 - BLOCK_H/2', () => {
    // minY=20, maxY=100, BLOCK_REF_HEIGHT=100 → middleY=(20+100+100)/2=110 → targetY=110-50=60
    useGraphStore.getState().alignSelectedNodes("middle", ["n1", "n2", "n3"]);
    const nodes = useGraphStore.getState().nodes;
    nodes.forEach((n) => expect(n.position.y).toBe(60));
  });

  it("calls nativeGraphMoveNodes with nodes that actually moved", () => {
    useGraphStore.getState().alignSelectedNodes("left", ["n1", "n2", "n3"]);
    // n1 is already at x=10 (minX), n2 and n3 move
    expect(mockMoveNodes).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moves = (mockMoveNodes.mock.calls as any[][])[0][0] as Array<{ id: string }>;
    expect(moves.map((m) => m.id).sort()).toEqual(["n2", "n3"]);
  });

  it("does not call nativeGraphMoveNodes when nothing moves", () => {
    // All same x position — left align is a no-op
    useGraphStore.setState({
      nodes: [makeBlock("a", 10, 0), makeBlock("b", 10, 50)],
    });
    useGraphStore.getState().alignSelectedNodes("left", ["a", "b"]);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });
});

// ── distributeSelectedNodes ───────────────────────────────────────────────────

describe("distributeSelectedNodes", () => {
  beforeEach(() => {
    resetStore();
    mockMoveNodes.mockClear();
  });

  afterEach(() => {
    mockMoveNodes.mockClear();
  });

  it("no-op when fewer than 3 ids provided", () => {
    useGraphStore.setState({ nodes: [makeBlock("n1", 0, 0), makeBlock("n2", 100, 0)] });
    useGraphStore.getState().distributeSelectedNodes("horizontal", ["n1", "n2"]);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });

  it("distributes horizontally — middle nodes evenly spaced between outermost", () => {
    useGraphStore.setState({
      nodes: [
        makeBlock("n1", 0, 0),
        makeBlock("n2", 150, 0), // should move to x=100
        makeBlock("n3", 200, 0),
      ],
    });
    useGraphStore.getState().distributeSelectedNodes("horizontal", ["n1", "n2", "n3"]);
    const nodes = useGraphStore.getState().nodes;
    const map = Object.fromEntries(nodes.map((n) => [n.id, n.position.x]));
    expect(map["n1"]).toBe(0);   // anchor unchanged
    expect(map["n3"]).toBe(200); // anchor unchanged
    expect(map["n2"]).toBe(100); // evenly spaced
  });

  it("distributes vertically — middle nodes evenly spaced", () => {
    useGraphStore.setState({
      nodes: [
        makeBlock("n1", 0, 0),
        makeBlock("n2", 0, 75),  // should move to y=50
        makeBlock("n3", 0, 100),
      ],
    });
    useGraphStore.getState().distributeSelectedNodes("vertical", ["n1", "n2", "n3"]);
    const nodes = useGraphStore.getState().nodes;
    const map = Object.fromEntries(nodes.map((n) => [n.id, n.position.y]));
    expect(map["n1"]).toBe(0);
    expect(map["n3"]).toBe(100);
    expect(map["n2"]).toBe(50);
  });

  it("calls nativeGraphMoveNodes for moved nodes", () => {
    useGraphStore.setState({
      nodes: [makeBlock("n1", 0, 0), makeBlock("n2", 90, 0), makeBlock("n3", 200, 0)],
    });
    useGraphStore.getState().distributeSelectedNodes("horizontal", ["n1", "n2", "n3"]);
    expect(mockMoveNodes).toHaveBeenCalledTimes(1);
  });

  it("distributes 4 nodes horizontally with equal spacing", () => {
    useGraphStore.setState({
      nodes: [
        makeBlock("a", 0, 0),
        makeBlock("b", 10, 0),  // → 100
        makeBlock("c", 250, 0), // → 200
        makeBlock("d", 300, 0),
      ],
    });
    useGraphStore.getState().distributeSelectedNodes("horizontal", ["a", "b", "c", "d"]);
    const nodes = useGraphStore.getState().nodes;
    const map = Object.fromEntries(nodes.map((n) => [n.id, n.position.x]));
    expect(map["a"]).toBe(0);
    expect(map["d"]).toBe(300);
    expect(map["b"]).toBeCloseTo(100);
    expect(map["c"]).toBeCloseTo(200);
  });
});
