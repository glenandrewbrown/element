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

  it("parks non-IO DISCONNECTED nodes in one loose ROW (not a stacked column)", () => {
    // Four disconnected non-IO blocks (no edges, no io role). Under the new
    // model they park in a single loose bottom row → distinct X, shared Y.
    const nodes: LayoutNode[] = [
      { id: "n0", height: 100 },
      { id: "n1", height: 100 },
      { id: "n2", height: 100 },
      { id: "n3", height: 100 },
    ];
    const out = computeAutoLayout(nodes, []);
    const xs = new Set(out.map((p) => p.x));
    const ys = new Set(out.map((p) => p.y));
    expect(xs.size).toBe(nodes.length); // every parked block on its own X.
    expect(ys.size).toBe(1); // one flat row → a single shared baseline Y.
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

  // ── IO-anchor model: inputs far-left, outputs far-right, parked along bottom ──
  // (Glen 2026-06-10 — replaces the rejected parallel-column "aligned grid".)
  it("IO inputs anchor far LEFT of IO outputs by ≥ the anchor span", () => {
    // The default-session blocks: 2 inputs, 2 outputs (all disconnected).
    const nodes: LayoutNode[] = [
      { id: "audioIn", height: 200, io: "input" },
      { id: "midiIn", height: 200, io: "input" },
      { id: "audioOut", height: 200, io: "output" },
      { id: "midiOut", height: 200, io: "output" },
    ];
    const anchorSpan = 960;
    const out = computeAutoLayout(nodes, [], { anchorSpan });
    const m = byId(out);
    // Both inputs share the far-left X; both outputs share the far-right X.
    expect(m.get("audioIn")!.x).toBe(m.get("midiIn")!.x);
    expect(m.get("audioOut")!.x).toBe(m.get("midiOut")!.x);
    // Outputs sit at least `anchorSpan` to the right of the inputs (wide-open
    // middle workspace for the user's chain).
    const span = m.get("audioOut")!.x - m.get("audioIn")!.x;
    expect(span).toBeGreaterThanOrEqual(anchorSpan);
  });

  it("stacked IO anchors do not overlap (generous vertical gap)", () => {
    const H = 262;
    const nodes: LayoutNode[] = [
      { id: "audioIn", height: H, io: "input" },
      { id: "midiIn", height: H, io: "input" },
      { id: "audioOut", height: H, io: "output" },
      { id: "midiOut", height: H, io: "output" },
    ];
    const out = computeAutoLayout(nodes, []);
    // Group by X column; within each column adjacent rows must clear H.
    const byCol = new Map<number, number[]>();
    for (const p of out) {
      const arr = byCol.get(p.x) ?? [];
      arr.push(p.y);
      byCol.set(p.x, arr);
    }
    expect(byCol.size).toBe(2); // exactly two anchor columns (left + right).
    for (const ys of byCol.values()) {
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(H);
      }
    }
  });

  it("non-IO disconnected blocks park along the BOTTOM, below the IO line", () => {
    // 2 IO inputs + 2 IO outputs + 2 loose utility blocks (all disconnected).
    const H = 200;
    const nodes: LayoutNode[] = [
      { id: "audioIn", height: H, io: "input" },
      { id: "midiIn", height: H, io: "input" },
      { id: "audioOut", height: H, io: "output" },
      { id: "midiOut", height: H, io: "output" },
      { id: "util0", height: 60 },
      { id: "util1", height: 60 },
    ];
    const out = computeAutoLayout(nodes, []);
    const m = byId(out);
    // The two parked blocks share ONE flat baseline row (same Y, distinct X).
    expect(m.get("util0")!.y).toBe(m.get("util1")!.y);
    expect(m.get("util0")!.x).not.toBe(m.get("util1")!.x);
    // That parked row sits BELOW the bottom of every IO anchor block.
    const ioBottom = Math.max(
      m.get("audioIn")!.y + H,
      m.get("midiIn")!.y + H,
      m.get("audioOut")!.y + H,
      m.get("midiOut")!.y + H,
    );
    expect(m.get("util0")!.y).toBeGreaterThan(ioBottom);
    expect(m.get("util1")!.y).toBeGreaterThan(ioBottom);
  });

  it("no parallel-column grid: disconnected blocks only stack in the 2 IO anchors", () => {
    // The exact arrangement Glen rejected was unconnected blocks in adjacent
    // PARALLEL columns. The new model permits stacking ONLY in the two IO anchor
    // columns (far-left inputs, far-right outputs); every other disconnected
    // block (parked) sits alone on its own X (a flat row, never a column pile).
    const nodes: LayoutNode[] = [
      { id: "audioIn", height: 304, io: "input" },
      { id: "midiIn", height: 304, io: "input" },
      { id: "audioOut", height: 304, io: "output" },
      { id: "midiOut", height: 304, io: "output" },
      { id: "util0", height: 60 },
      { id: "util1", height: 60 },
    ];
    const out = computeAutoLayout(nodes, []);
    // Count how many blocks sit at each X. Only the 2 IO anchor X's may hold
    // more than one block; any other X (parked) must hold exactly one.
    const countByX = new Map<number, number>();
    for (const p of out) countByX.set(p.x, (countByX.get(p.x) ?? 0) + 1);
    const stackedColumns = [...countByX.values()].filter((c) => c > 1);
    expect(stackedColumns.length).toBeLessThanOrEqual(2); // ≤ the 2 IO anchors.
    // The two parked utility blocks must not stack on each other (a flat row).
    const m = byId(out);
    expect(m.get("util0")!.x).not.toBe(m.get("util1")!.x);
  });

  it("no AABB overlap when blocks have mixed heights (IO-anchor + parked)", () => {
    // Default session scenario: 4 tall IO blocks (304px) + 2 small utility
    // blocks (60px). All disconnected (fresh board).
    const H_TALL = 304;
    const H_SMALL = 60;
    const nodes: LayoutNode[] = [
      { id: "audioIn", height: H_TALL, io: "input" },
      { id: "audioOut", height: H_TALL, io: "output" },
      { id: "midiIn", height: H_TALL, io: "input" },
      { id: "midiOut", height: H_TALL, io: "output" },
      { id: "noteRange", height: H_SMALL },
      { id: "dupBlocker", height: H_SMALL },
    ];
    const out = computeAutoLayout(nodes, []);
    // Check every pair for AABB non-overlap (using node height from our list).
    const heightMap = new Map(nodes.map((n) => [n.id, n.height!]));
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const aH = heightMap.get(a.id)!;
        const bH = heightMap.get(b.id)!;
        const W = 200; // block width (same for all)
        // AABB overlap check: no overlap iff separated on X or Y axis.
        const overlapX = Math.abs(a.x - b.x) < W;
        const overlapY = a.y < b.y + bH && b.y < a.y + aH;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  // ── Vertical mode transposes the model: inputs top, outputs bottom, parked right ──
  it("vertical mode: IO inputs anchor ABOVE outputs; parked blocks to the right", () => {
    const H = 200;
    const nodes: LayoutNode[] = [
      { id: "audioIn", height: H, io: "input" },
      { id: "midiIn", height: H, io: "input" },
      { id: "audioOut", height: H, io: "output" },
      { id: "midiOut", height: H, io: "output" },
      { id: "util0", height: 60 },
    ];
    const out = computeAutoLayout(nodes, [], { direction: "vertical" });
    const m = byId(out);
    // Inputs share one Y (top row); outputs share a lower Y (bottom row).
    expect(m.get("audioIn")!.y).toBe(m.get("midiIn")!.y);
    expect(m.get("audioOut")!.y).toBe(m.get("midiOut")!.y);
    expect(m.get("audioOut")!.y).toBeGreaterThan(m.get("audioIn")!.y);
    // The parked block (horizontal "bottom row") transposes to the RIGHT —
    // its X is greater than both IO anchor columns' X.
    const anchorMaxX = Math.max(m.get("audioIn")!.x, m.get("audioOut")!.x);
    expect(m.get("util0")!.x).toBeGreaterThan(anchorMaxX);
  });
});
