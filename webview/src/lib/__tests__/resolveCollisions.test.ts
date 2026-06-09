/**
 * Tests for lib/resolveCollisions — Task 2.3 "Blocks must NEVER overlap".
 *
 * Pure, framework-free rectangular collision resolution. Blocks are RECTANGLES
 * at varying collapse-tier heights, so this separates overlapping AABBs (NOT
 * circular forceCollide). Spec acceptance (plan §Task 2.3):
 *   - two overlapping rects → separated by ≥margin
 *   - non-overlapping rects → unchanged
 *   - a node dropped exactly on another → relocates
 *
 * No React Flow / DOM here — the function is a pure transform over plain rects.
 */

import { describe, expect, it } from "vitest";
import {
  resolveCollisions,
  rectsOverlap,
  DEFAULT_COLLISION_MARGIN,
  type CollisionRect,
} from "../resolveCollisions";

const rect = (
  id: string,
  x: number,
  y: number,
  width = 200,
  height = 100,
): CollisionRect => ({ id, x, y, width, height });

/** Edge-to-edge gap between two AABBs on each axis (negative ⇒ overlap depth). */
function gapBetween(a: CollisionRect, b: CollisionRect) {
  // Positive gap on an axis = a separation; if EITHER axis separates, the rects
  // do not overlap. We report the max axis gap (the separating axis).
  const gapX = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const gapY = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.max(gapX, gapY);
}

function byId<T extends { id: string }>(rects: T[]): Map<string, T> {
  return new Map(rects.map((r) => [r.id, r]));
}

/**
 * Merge resolved {id,x,y} positions back onto the original rect dimensions, so
 * geometry assertions (overlap / gap) have full width/height to work with.
 * `resolveCollisions` only returns positions (it never resizes a Block).
 */
function withDims(
  resolved: { id: string; x: number; y: number }[],
  input: CollisionRect[],
): CollisionRect[] {
  const dims = byId(input);
  return resolved.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    width: dims.get(r.id)!.width,
    height: dims.get(r.id)!.height,
  }));
}

describe("resolveCollisions — pure rectangular separation (Task 2.3)", () => {
  it("DEFAULT_COLLISION_MARGIN is 15px (plan default)", () => {
    expect(DEFAULT_COLLISION_MARGIN).toBe(15);
  });

  it("returns one position per input node, preserving ids", () => {
    const input = [rect("a", 0, 0), rect("b", 1000, 1000)];
    const out = resolveCollisions(input);
    expect(out.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("leaves NON-overlapping rects unchanged (already ≥margin apart)", () => {
    // b is far to the right with a clear gutter — nothing to resolve.
    const input = [rect("a", 0, 0), rect("b", 400, 0)];
    const out = byId(resolveCollisions(input, { margin: 15 }));
    expect(out.get("a")).toMatchObject({ x: 0, y: 0 });
    expect(out.get("b")).toMatchObject({ x: 400, y: 0 });
  });

  it("leaves rects that are EXACTLY margin apart unchanged (boundary)", () => {
    // a spans x∈[0,200]; b starts at 215 → exactly a 15px gutter. No nudge.
    const input = [rect("a", 0, 0), rect("b", 215, 0)];
    const out = byId(resolveCollisions(input, { margin: 15 }));
    expect(out.get("b")).toMatchObject({ x: 215, y: 0 });
  });

  it("separates two OVERLAPPING rects to ≥margin apart", () => {
    // a∈[0,200], b∈[100,300] overlap by 100px on X (full overlap on Y).
    const input = [rect("a", 0, 0), rect("b", 100, 0)];
    const out = withDims(resolveCollisions(input, { margin: 15 }), input);
    const a = out.find((r) => r.id === "a")!;
    const b = out.find((r) => r.id === "b")!;
    expect(rectsOverlap(a, b, 15)).toBe(false);
    // The minimum separating-axis gap must be at least the margin.
    expect(gapBetween(a, b)).toBeGreaterThanOrEqual(15 - 1e-6);
  });

  it("relocates a node dropped EXACTLY on top of another (identical position)", () => {
    const input = [rect("a", 50, 50), rect("dropped", 50, 50)];
    const out = withDims(resolveCollisions(input, { margin: 15 }), input);
    const a = out.find((r) => r.id === "a")!;
    const dropped = out.find((r) => r.id === "dropped")!;
    // They no longer occupy the same point — at least one moved.
    const moved = dropped.x !== 50 || dropped.y !== 50 || a.x !== 50 || a.y !== 50;
    expect(moved).toBe(true);
    expect(rectsOverlap(a, dropped, 15)).toBe(false);
  });

  it("honours a `fixed` node — only the OTHER block moves on a drop", () => {
    // The user just dropped `dropped` ON `anchor`; anchor is pinned so the
    // dropped block is the one that gets nudged away.
    const input = [rect("anchor", 0, 0), rect("dropped", 30, 10)];
    const out = byId(
      withDims(
        resolveCollisions(input, { margin: 15, fixed: new Set(["anchor"]) }),
        input,
      ),
    );
    expect(out.get("anchor")).toMatchObject({ x: 0, y: 0 });
    expect(rectsOverlap(out.get("anchor")!, out.get("dropped")!, 15)).toBe(
      false,
    );
  });

  it("resolves a 3-way pile-up so NO pair overlaps", () => {
    const input = [
      rect("a", 0, 0),
      rect("b", 20, 20),
      rect("c", 40, 40),
    ];
    const out = withDims(resolveCollisions(input, { margin: 15 }), input);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        expect(rectsOverlap(out[i], out[j], 15)).toBe(false);
      }
    }
  });

  it("respects per-rect heights (collapse tiers) — a short rect packs tighter", () => {
    // Two stacked rects of DIFFERENT heights overlapping vertically.
    const input = [
      rect("tall", 0, 0, 200, 160),
      rect("short", 0, 40, 200, 40),
    ];
    const out = withDims(resolveCollisions(input, { margin: 15 }), input);
    expect(rectsOverlap(out[0], out[1], 15)).toBe(false);
  });

  it("is deterministic — same input yields the same output", () => {
    const input = [rect("a", 0, 0), rect("b", 50, 30), rect("c", 80, 10)];
    const first = resolveCollisions(input, { margin: 15 });
    const second = resolveCollisions(input, { margin: 15 });
    expect(second).toEqual(first);
  });

  it("does not mutate the input array or its rects", () => {
    const input = [rect("a", 0, 0), rect("b", 30, 0)];
    const snapshot = JSON.parse(JSON.stringify(input));
    resolveCollisions(input, { margin: 15 });
    expect(input).toEqual(snapshot);
  });

  it("empty / single inputs are returned untouched", () => {
    expect(resolveCollisions([])).toEqual([]);
    const single = [rect("only", 5, 5)];
    expect(resolveCollisions(single)).toEqual([{ id: "only", x: 5, y: 5 }]);
  });

  it("de-overlaps TALL multi-port IO blocks at the default-board spacing (overlap-fix)", () => {
    // The live bug: four ~262px-tall IO blocks (16 audio lanes) stacked ~95px
    // apart in one column — every adjacent pair overlaps by >100px. The resolver
    // is height-aware, so it must separate ALL of them with no `fixed` set
    // (every block free to move), exactly as the load-time pass calls it.
    const TALL = 262; // 16*16 + 6 — matches Block.tsx render arithmetic.
    const input: CollisionRect[] = [
      rect("audioIn", 100, 0, 200, TALL),
      rect("audioOut", 100, 95, 200, TALL),
      rect("midiIn", 100, 190, 200, TALL),
      rect("midiOut", 100, 285, 200, TALL),
    ];
    const out = withDims(
      resolveCollisions(input, { margin: DEFAULT_COLLISION_MARGIN }),
      input,
    );
    // No pair overlaps after resolution (the AABB gate the goal demands).
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        expect(rectsOverlap(out[i], out[j], 0)).toBe(false);
      }
    }
  });
});

describe("rectsOverlap — AABB overlap predicate with margin", () => {
  it("rects sharing area overlap (margin 0)", () => {
    expect(rectsOverlap(rect("a", 0, 0), rect("b", 100, 0), 0)).toBe(true);
  });

  it("touching edges do NOT overlap at margin 0", () => {
    // a∈[0,200], b∈[200,400] — edges touch, zero shared area.
    expect(rectsOverlap(rect("a", 0, 0), rect("b", 200, 0), 0)).toBe(false);
  });

  it("a positive margin treats near-but-separate rects as overlapping", () => {
    // 10px gutter < 15px margin → considered too close (overlapping for the
    // purposes of the resolver).
    expect(rectsOverlap(rect("a", 0, 0), rect("b", 210, 0), 15)).toBe(true);
    // 20px gutter ≥ 15px margin → genuinely clear.
    expect(rectsOverlap(rect("a", 0, 0), rect("b", 220, 0), 15)).toBe(false);
  });
});
