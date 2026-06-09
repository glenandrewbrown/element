/**
 * Tests for lib/autoLayout.computeAutoLayout — deterministic layered layout.
 *
 * G3c item 4. Asserts the layout is deterministic, layers downstream nodes to
 * the right of their sources, never overlaps two nodes, handles the empty Board
 * (0 nodes → empty result, the honest-degraded state), and terminates on a
 * cyclic graph (feedback cable).
 */

import { describe, expect, it } from "vitest";
import {
  computeAutoLayout,
  type LayoutEdge,
  type LayoutNode,
} from "../autoLayout";

// A known 4-node / 3-edge DAG:  a → b → d ,  a → c
const NODES: LayoutNode[] = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d" },
];
const EDGES: LayoutEdge[] = [
  { source: "a", target: "b" },
  { source: "a", target: "c" },
  { source: "b", target: "d" },
];

function byId(positions: ReturnType<typeof computeAutoLayout>) {
  const m = new Map<string, { x: number; y: number }>();
  for (const p of positions) m.set(p.id, { x: p.x, y: p.y });
  return m;
}

describe("computeAutoLayout", () => {
  it("returns one position per node, in input order", () => {
    const out = computeAutoLayout(NODES, EDGES);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("is deterministic — same input yields identical output", () => {
    const a = computeAutoLayout(NODES, EDGES);
    const b = computeAutoLayout(NODES, EDGES);
    expect(a).toEqual(b);
  });

  it("layers downstream nodes strictly to the right of their sources", () => {
    const m = byId(computeAutoLayout(NODES, EDGES));
    // a is the source (column 0); b and c are one layer right; d is two right.
    expect(m.get("b")!.x).toBeGreaterThan(m.get("a")!.x);
    expect(m.get("c")!.x).toBeGreaterThan(m.get("a")!.x);
    expect(m.get("d")!.x).toBeGreaterThan(m.get("b")!.x);
    // b and c share a layer → same x column.
    expect(m.get("b")!.x).toBe(m.get("c")!.x);
  });

  it("respects the longest path (d sits two columns right of a)", () => {
    const m = byId(computeAutoLayout(NODES, EDGES, { columnGap: 100 }));
    expect(m.get("d")!.x - m.get("a")!.x).toBe(200);
  });

  it("never overlaps two nodes (all positions are unique)", () => {
    const out = computeAutoLayout(NODES, EDGES);
    const keys = out.map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("honours custom column/row gaps", () => {
    const m = byId(
      computeAutoLayout(NODES, EDGES, { columnGap: 300, rowGap: 200 }),
    );
    // b and c are in the same column, adjacent rows → row gap apart vertically.
    expect(Math.abs(m.get("b")!.y - m.get("c")!.y)).toBe(200);
  });

  it("returns an empty array for 0 nodes (honest 'Board is empty' state)", () => {
    expect(computeAutoLayout([], [])).toEqual([]);
  });

  it("handles a single node with no edges", () => {
    const out = computeAutoLayout([{ id: "solo" }], []);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("solo");
    expect(Number.isFinite(out[0].x)).toBe(true);
    expect(Number.isFinite(out[0].y)).toBe(true);
  });

  it("ignores edges referencing unknown nodes (dangling cables)", () => {
    const out = computeAutoLayout(
      [{ id: "a" }, { id: "b" }],
      [
        { source: "a", target: "b" },
        { source: "a", target: "ghost" }, // dangling — must not throw
        { source: "ghost", target: "b" },
      ],
    );
    expect(out.map((p) => p.id).sort()).toEqual(["a", "b"]);
    const m = byId(out);
    expect(m.get("b")!.x).toBeGreaterThan(m.get("a")!.x);
  });

  it("terminates on a cyclic graph (feedback cable) without hanging", () => {
    // a → b → c → a is a cycle; longest-path relaxation is bounded by N passes.
    const out = computeAutoLayout(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "a" },
      ],
    );
    expect(out).toHaveLength(3);
    // Every node still gets a finite, unique position.
    const keys = out.map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(3);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("ignores self-loops as layering edges", () => {
    const out = computeAutoLayout(
      [{ id: "a" }, { id: "b" }],
      [
        { source: "a", target: "a" }, // self-loop
        { source: "a", target: "b" },
      ],
    );
    const m = byId(out);
    expect(m.get("b")!.x).toBeGreaterThan(m.get("a")!.x);
  });

  // ── Height-aware packing (overlap fix) ─────────────────────────────────────
  it("packs a column by ACTUAL height, not a flat row gap (tall blocks get more room)", () => {
    // Two TALL blocks (262px) sharing a column (both feed a downstream sink),
    // plus the sink. The two tall blocks are layer-0 siblings → same column.
    const nodes: LayoutNode[] = [
      { id: "tallA", height: 262 },
      { id: "tallB", height: 262 },
      { id: "sink", height: 60 },
    ];
    const edges: LayoutEdge[] = [
      { source: "tallA", target: "sink" },
      { source: "tallB", target: "sink" },
    ];
    const rowGap = 40;
    const m = byId(computeAutoLayout(nodes, edges, { rowGap }));
    // tallA and tallB are in the same column (same x).
    expect(m.get("tallA")!.x).toBe(m.get("tallB")!.x);
    // Their vertical pitch must be ≥ height + gutter so the 262px boxes never
    // overlap — the old flat rowGap (40) would have stacked them 40px apart.
    const pitch = Math.abs(m.get("tallA")!.y - m.get("tallB")!.y);
    expect(pitch).toBeGreaterThanOrEqual(262 + rowGap);
  });

  it("tall blocks in a column never overlap (top-to-top gap ≥ upper block height)", () => {
    const H = 262;
    const nodes: LayoutNode[] = [
      { id: "a", height: H },
      { id: "b", height: H },
      { id: "c", height: H },
      { id: "sink", height: 60 },
    ];
    const edges: LayoutEdge[] = [
      { source: "a", target: "sink" },
      { source: "b", target: "sink" },
      { source: "c", target: "sink" },
    ];
    const out = computeAutoLayout(nodes, edges, { rowGap: 30 });
    // a,b,c share the layer-0 column; sort by y and assert each adjacent pair is
    // separated by at least the upper block's full height (no AABB overlap).
    const col = out
      .filter((p) => p.id !== "sink")
      .sort((p, q) => p.y - q.y);
    for (let i = 1; i < col.length; i++) {
      expect(col[i].y - col[i - 1].y).toBeGreaterThanOrEqual(H);
    }
  });

  it("spreads DISCONNECTED nodes into a multi-column grid (not one stacked column)", () => {
    // Four disconnected nodes (no edges) — the fresh-default-board case. They
    // must NOT all share one x (the old layer-0 single-column pile).
    const nodes: LayoutNode[] = [
      { id: "n0", height: 100 },
      { id: "n1", height: 100 },
      { id: "n2", height: 100 },
      { id: "n3", height: 100 },
    ];
    const out = computeAutoLayout(nodes, []);
    const xs = new Set(out.map((p) => p.x));
    expect(xs.size).toBeGreaterThan(1); // more than one column → a grid.
    // No two share the SAME (x,y) cell.
    const cells = out.map((p) => `${p.x},${p.y}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("disconnected tall blocks in the grid do not overlap within a column", () => {
    const H = 262;
    const nodes: LayoutNode[] = [
      { id: "audioIn", height: H },
      { id: "audioOut", height: H },
      { id: "midiIn", height: H },
      { id: "midiOut", height: H },
    ];
    const out = computeAutoLayout(nodes, [], { rowGap: 20 });
    // Group by column (x); within each column adjacent rows must clear H.
    const byCol = new Map<number, number[]>();
    for (const p of out) {
      const arr = byCol.get(p.x) ?? [];
      arr.push(p.y);
      byCol.set(p.x, arr);
    }
    for (const ys of byCol.values()) {
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(H);
      }
    }
  });

  // ── Aligned grid: same X per column, same Y per row ───────────────────────
  it("aligned grid: all nodes in the same column share identical X", () => {
    // 6 disconnected nodes → 2 cols × 3 rows. Col-0 gets nodes [0,2,4] and
    // col-1 gets [1,3,5] (row-major fill). Every node in col-0 must share one X;
    // every node in col-1 must share a different X.
    const nodes: LayoutNode[] = [
      { id: "n0", height: 100 },
      { id: "n1", height: 100 },
      { id: "n2", height: 100 },
      { id: "n3", height: 100 },
      { id: "n4", height: 100 },
      { id: "n5", height: 100 },
    ];
    const out = computeAutoLayout(nodes, [], { columnGap: 280, rowGap: 40 });
    const m = byId(out);
    // Row-major: sorted order → n0,n1,n2,n3,n4,n5 (uniform heights, no
    // reordering by group). Col = i % 2, so col-0 = {n0,n2,n4}, col-1 = {n1,n3,n5}.
    const col0X = m.get("n0")!.x;
    const col1X = m.get("n1")!.x;
    expect(col0X).not.toBe(col1X);
    expect(m.get("n2")!.x).toBe(col0X);
    expect(m.get("n4")!.x).toBe(col0X);
    expect(m.get("n3")!.x).toBe(col1X);
    expect(m.get("n5")!.x).toBe(col1X);
  });

  it("aligned grid: all nodes in the same ROW share identical Y (baseline alignment)", () => {
    // 4 disconnected nodes with DIFFERENT heights to expose the centering bug:
    // col-0 has a 262px block, col-1 has a 60px block. With the old
    // per-column centering these would float at different Y; the new row-major
    // grid must align them to the SAME topY.
    const nodes: LayoutNode[] = [
      { id: "tallA", height: 262 }, // row 0, col 0
      { id: "shortB", height: 60 }, // row 0, col 1
      { id: "tallC", height: 262 }, // row 1, col 0
      { id: "shortD", height: 60 }, // row 1, col 1
    ];
    const out = computeAutoLayout(nodes, [], { columnGap: 280, rowGap: 40 });
    const m = byId(out);
    // Row 0: tallA and shortB must share the same Y.
    expect(m.get("tallA")!.y).toBe(m.get("shortB")!.y);
    // Row 1: tallC and shortD must share the same Y.
    expect(m.get("tallC")!.y).toBe(m.get("shortD")!.y);
    // Row 1 baseline must be below row 0 baseline by at least the row-0 max
    // height (262) + rowGap (40).
    expect(m.get("tallC")!.y - m.get("tallA")!.y).toBeGreaterThanOrEqual(
      262 + 40,
    );
  });

  it("aligned grid: no AABB overlap when blocks have mixed heights", () => {
    // Default session scenario: 4 tall IO blocks (304px) + 2 small utility
    // blocks (60px). All disconnected (fresh board).
    const H_TALL = 304;
    const H_SMALL = 60;
    const GAP = 40;
    const nodes: LayoutNode[] = [
      { id: "audioIn", height: H_TALL },
      { id: "audioOut", height: H_TALL },
      { id: "midiIn", height: H_TALL },
      { id: "midiOut", height: H_TALL },
      { id: "noteRange", height: H_SMALL },
      { id: "dupBlocker", height: H_SMALL },
    ];
    const out = computeAutoLayout(nodes, [], { rowGap: GAP });
    // Check every pair for AABB non-overlap (using node height from our list).
    const heightMap = new Map(nodes.map((n) => [n.id, n.height!]));
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const aH = heightMap.get(a.id)!;
        const bH = heightMap.get(b.id)!;
        const W = 220; // block width (same for all)
        // AABB overlap check: no overlap iff separated on X or Y axis.
        const overlapX = Math.abs(a.x - b.x) < W;
        const overlapY =
          a.y < b.y + bH && b.y < a.y + aH;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });
});
