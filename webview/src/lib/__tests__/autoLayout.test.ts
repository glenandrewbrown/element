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
});
