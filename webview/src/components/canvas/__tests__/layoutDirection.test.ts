/**
 * T12 — auto-layout flow DIRECTION (horizontal ↔ vertical) + the IO-spacing
 * column gap.
 *
 * computeAutoLayout lays signal flow into left-to-right COLUMNS by default
 * (x = layer axis, y = within-layer order). The vertical option transposes the
 * result so flow runs top-to-bottom (downstream blocks sit BELOW, not right of,
 * their sources). These tests cover the pure direction core in isolation (no
 * React / store / bridge) plus the app-store direction toggle + persistence.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeAutoLayout,
  type LayoutEdge,
  type LayoutNode,
} from "../../../lib/autoLayout";

// A simple linear signal chain a → b → c (a upstream, c downstream).
const NODES: LayoutNode[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
const EDGES: LayoutEdge[] = [
  { source: "a", target: "b" },
  { source: "b", target: "c" },
];

const byId = (pos: Array<{ id: string; x: number; y: number }>) =>
  new Map(pos.map((p) => [p.id, p]));

describe("computeAutoLayout — direction (T12)", () => {
  it("horizontal (default): downstream blocks sit to the RIGHT of their sources", () => {
    const pos = byId(computeAutoLayout(NODES, EDGES));
    const a = pos.get("a")!;
    const b = pos.get("b")!;
    const c = pos.get("c")!;
    // X increases downstream; Y stays roughly aligned along the flow.
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.x).toBeGreaterThan(b.x);
    expect(Math.abs(b.y - a.y)).toBeLessThan(1);
    expect(Math.abs(c.y - a.y)).toBeLessThan(1);
  });

  it("vertical: downstream blocks sit BELOW their sources (top-to-bottom flow)", () => {
    const pos = byId(
      computeAutoLayout(NODES, EDGES, { direction: "vertical" }),
    );
    const a = pos.get("a")!;
    const b = pos.get("b")!;
    const c = pos.get("c")!;
    // Y increases downstream; X stays roughly aligned along the flow.
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
    expect(Math.abs(b.x - a.x)).toBeLessThan(1);
    expect(Math.abs(c.x - a.x)).toBeLessThan(1);
  });

  it("vertical is a pure transpose of horizontal about the origin", () => {
    const origin = { originX: 80, originY: 80 };
    const h = byId(computeAutoLayout(NODES, EDGES, origin));
    const v = byId(computeAutoLayout(NODES, EDGES, { ...origin, direction: "vertical" }));
    for (const id of ["a", "b", "c"]) {
      const ph = h.get(id)!;
      const pv = v.get(id)!;
      // Transpose: v.x = originX + (h.y - originY); v.y = originY + (h.x - originX).
      expect(pv.x).toBeCloseTo(origin.originX + (ph.y - origin.originY), 5);
      expect(pv.y).toBeCloseTo(origin.originY + (ph.x - origin.originX), 5);
    }
  });

  it("explicit direction='horizontal' equals the default", () => {
    const def = computeAutoLayout(NODES, EDGES);
    const explicit = computeAutoLayout(NODES, EDGES, {
      direction: "horizontal",
    });
    expect(explicit).toEqual(def);
  });

  it("a wider columnGap spaces the flow columns further apart (room to insert)", () => {
    const tight = byId(computeAutoLayout(NODES, EDGES, { columnGap: 280 }));
    const wide = byId(computeAutoLayout(NODES, EDGES, { columnGap: 420 }));
    const gapTight = tight.get("b")!.x - tight.get("a")!.x;
    const gapWide = wide.get("b")!.x - wide.get("a")!.x;
    expect(gapWide).toBeGreaterThan(gapTight);
    expect(gapWide).toBe(420);
  });

  it("empty graph yields an empty layout in either direction", () => {
    expect(computeAutoLayout([], [])).toEqual([]);
    expect(computeAutoLayout([], [], { direction: "vertical" })).toEqual([]);
  });
});

describe("useAppStore — layoutDirection toggle + persistence (T12)", () => {
  beforeEach(async () => {
    localStorage.clear();
    const { useAppStore } = await import("../../../stores/useAppStore");
    useAppStore.setState({ layoutDirection: "horizontal" });
  });

  it("defaults to horizontal", async () => {
    const { useAppStore } = await import("../../../stores/useAppStore");
    expect(useAppStore.getState().layoutDirection).toBe("horizontal");
  });

  it("toggleLayoutDirection flips horizontal → vertical → horizontal", async () => {
    const { useAppStore } = await import("../../../stores/useAppStore");
    useAppStore.getState().toggleLayoutDirection();
    expect(useAppStore.getState().layoutDirection).toBe("vertical");
    useAppStore.getState().toggleLayoutDirection();
    expect(useAppStore.getState().layoutDirection).toBe("horizontal");
  });

  it("setLayoutDirection sets the direction explicitly", async () => {
    const { useAppStore } = await import("../../../stores/useAppStore");
    useAppStore.getState().setLayoutDirection("vertical");
    expect(useAppStore.getState().layoutDirection).toBe("vertical");
  });

  it("persists layoutDirection to localStorage (element-app-ui)", async () => {
    const { useAppStore } = await import("../../../stores/useAppStore");
    useAppStore.getState().setLayoutDirection("vertical");
    const raw = localStorage.getItem("element-app-ui");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.layoutDirection).toBe("vertical");
  });
});
