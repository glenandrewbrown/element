/**
 * useGraphStore — branch coverage gaps.
 *
 * Uncovered branches identified from coverage report (67.14%):
 *   1. alignSelectedNodes — targets.length < 2 (IDs given but nodes not in store)
 *   2. alignSelectedNodes — node already at target position (no-op return inside map)
 *   3. alignSelectedNodes — no updates produced (nativeGraphMoveNodes NOT called)
 *   4. distributeSelectedNodes — node already at computed coord (no-change guard)
 *   5. distributeSelectedNodes — non-selected nodes in map (coord === undefined path)
 *   6. distributeSelectedNodes — selectedIds < 3 with exactly 2 matching nodes
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockMoveNodes } = vi.hoisted(() => ({
  // Typed to accept args so .mock.calls[0][0] is indexable + the spread in the
  // mock factory below type-checks (pre-existing tsc -b breakage, not G3c).
  mockMoveNodes: vi.fn(async (..._a: unknown[]) => undefined),
}));

vi.mock("../../bridge/nativeGraph", () => ({
  nativeGraphMoveNodes: (...a: unknown[]) => mockMoveNodes(...a),
  nativeGraphSetBypass: vi.fn(async () => true),
  nativeGraphSetMute: vi.fn(async () => true),
  nativeGraphSetMuteInput: vi.fn(async () => true),
}));

import type { BlockData } from "../../data/types";
import { useGraphStore } from "../useGraphStore";
import { useBusStore } from "../useBusStore";

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

function resetStore(...blocks: BlockData[]) {
  useGraphStore.setState({
    nodes: blocks,
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    breadcrumbStack: ["Main Project"],
    commentBoxes: [],
    minimapVisible: true,
    zoomTier: "standard",
  });
  useBusStore.setState({ cableBus: {} });
  mockMoveNodes.mockClear();
}

// ── alignSelectedNodes — targets not in store ────────────────────────────────

describe("alignSelectedNodes — targets.length < 2 no-op", () => {
  beforeEach(() => resetStore(makeBlock("n1", 0, 0)));

  it("no-op when selected IDs reference nodes not in the store", () => {
    const before = useGraphStore.getState().nodes;
    useGraphStore.getState().alignSelectedNodes("left", ["ghost1", "ghost2"]);
    expect(useGraphStore.getState().nodes).toBe(before);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });

  it("no-op when only one selected ID matches a node", () => {
    const before = useGraphStore.getState().nodes;
    useGraphStore.getState().alignSelectedNodes("left", ["n1", "ghost"]);
    expect(useGraphStore.getState().nodes).toBe(before);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });
});

// ── alignSelectedNodes — node already at target (no bridge call) ─────────────

describe("alignSelectedNodes — no position change → nativeGraphMoveNodes NOT called", () => {
  it("aligning left when all nodes already at minX fires no bridge call", () => {
    // Both nodes at x=0; aligning left sets target to minX=0 — no change
    resetStore(makeBlock("n1", 0, 10), makeBlock("n2", 0, 50));
    useGraphStore.getState().alignSelectedNodes("left", ["n1", "n2"]);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });

  it("aligning top when all nodes already at minY fires no bridge call", () => {
    resetStore(makeBlock("n1", 10, 0), makeBlock("n2", 50, 0));
    useGraphStore.getState().alignSelectedNodes("top", ["n1", "n2"]);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });
});

// ── alignSelectedNodes — some nodes move, some don't ────────────────────────

describe("alignSelectedNodes — partial movement", () => {
  it("only moves nodes that are NOT already at the target x", () => {
    resetStore(makeBlock("n1", 0, 0), makeBlock("n2", 100, 50));
    useGraphStore.getState().alignSelectedNodes("left", ["n1", "n2"]);
    // n1 is already at minX=0 — no change; n2 moves from x=100 to x=0
    expect(mockMoveNodes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "n2", x: 0 })]),
    );
    const call = mockMoveNodes.mock.calls[0][0] as Array<{ id: string }>;
    expect(call.find((u) => u.id === "n1")).toBeUndefined();
  });
});

// ── distributeSelectedNodes — < 3 matching nodes ────────────────────────────

describe("distributeSelectedNodes — fewer than 3 matching nodes", () => {
  it("no-op when only 2 IDs given", () => {
    resetStore(makeBlock("n1", 0, 0), makeBlock("n2", 200, 0));
    const before = useGraphStore.getState().nodes;
    useGraphStore.getState().distributeSelectedNodes("horizontal", ["n1", "n2"]);
    expect(useGraphStore.getState().nodes).toBe(before);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });

  it("no-op when 3+ IDs given but only 2 exist in store", () => {
    resetStore(makeBlock("n1", 0, 0), makeBlock("n2", 200, 0));
    const before = useGraphStore.getState().nodes;
    useGraphStore.getState().distributeSelectedNodes("horizontal", ["n1", "n2", "ghost"]);
    expect(useGraphStore.getState().nodes).toBe(before);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });
});

// ── distributeSelectedNodes — non-selected node in store ─────────────────────

describe("distributeSelectedNodes — non-selected nodes unaffected", () => {
  it("does not move a node that is in the store but not in selectedIds", () => {
    resetStore(
      makeBlock("n1", 0, 0),
      makeBlock("n2", 100, 0),
      makeBlock("n3", 200, 0),
      makeBlock("bystander", 999, 999),
    );
    useGraphStore.getState().distributeSelectedNodes("horizontal", ["n1", "n2", "n3"]);
    const bystander = useGraphStore.getState().nodes.find((n) => n.id === "bystander");
    expect(bystander?.position).toEqual({ x: 999, y: 999 });
  });
});

// ── distributeSelectedNodes — already evenly spaced (no bridge call) ─────────

describe("distributeSelectedNodes — already even → no bridge call", () => {
  it("does not call nativeGraphMoveNodes when middle node is already at computed coord", () => {
    // Three nodes at x=0, x=100, x=200 — middle is already at the distribute target (100)
    resetStore(
      makeBlock("n1", 0, 0),
      makeBlock("n2", 100, 0),
      makeBlock("n3", 200, 0),
    );
    useGraphStore.getState().distributeSelectedNodes("horizontal", ["n1", "n2", "n3"]);
    expect(mockMoveNodes).not.toHaveBeenCalled();
  });
});

// ── distributeSelectedNodes — vertical axis ───────────────────────────────────

describe("distributeSelectedNodes — vertical axis branch", () => {
  afterEach(() => mockMoveNodes.mockClear());

  it("repositions middle node on y-axis", () => {
    resetStore(
      makeBlock("n1", 0, 0),
      makeBlock("n2", 0, 50),    // middle — will move to y=100
      makeBlock("n3", 0, 200),
    );
    useGraphStore.getState().distributeSelectedNodes("vertical", ["n1", "n2", "n3"]);
    expect(mockMoveNodes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "n2", y: 100 }),
      ]),
    );
  });

  it("x coords of distributed nodes are preserved on vertical distribute", () => {
    resetStore(
      makeBlock("n1", 30, 0),
      makeBlock("n2", 30, 50),
      makeBlock("n3", 30, 200),
    );
    useGraphStore.getState().distributeSelectedNodes("vertical", ["n1", "n2", "n3"]);
    const updated = useGraphStore.getState().nodes.find((n) => n.id === "n2");
    expect(updated?.position.x).toBe(30);
  });
});
