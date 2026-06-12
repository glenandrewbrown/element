import { describe, expect, it } from "vitest";
import {
  computeOptionDragPlan,
  computeDragDelta,
  computeGhostRects,
  type OriginalPositionMap,
} from "../optionDragDuplicate";

describe("computeDragDelta", () => {
  it("computes delta from the first matching dragged node", () => {
    const originals: OriginalPositionMap = {
      "a": { x: 100, y: 200 },
      "b": { x: 400, y: 300 },
    };
    const finalPositions = {
      "a": { x: 150, y: 250 },
      "b": { x: 450, y: 350 },
    };
    const delta = computeDragDelta(originals, ["a", "b"], finalPositions);
    expect(delta).toEqual({ dx: 50, dy: 50 });
  });

  it("returns zero delta when no dragged ids match", () => {
    const originals: OriginalPositionMap = { "a": { x: 100, y: 200 } };
    const delta = computeDragDelta(originals, ["x"], { "x": { x: 200, y: 300 } });
    expect(delta).toEqual({ dx: 0, dy: 0 });
  });

  it("uses the first matching id even if a later one also matches", () => {
    const originals: OriginalPositionMap = {
      "a": { x: 0, y: 0 },
      "b": { x: 10, y: 10 },
    };
    const finalPositions = {
      "a": { x: 30, y: 40 },
      "b": { x: 70, y: 80 },
    };
    // First dragged id is "a" → delta from "a"
    const delta = computeDragDelta(originals, ["a", "b"], finalPositions);
    expect(delta).toEqual({ dx: 30, dy: 40 });
  });

  it("returns zero delta when finalPositions is empty", () => {
    const originals: OriginalPositionMap = { "a": { x: 50, y: 60 } };
    const delta = computeDragDelta(originals, ["a"], {});
    expect(delta).toEqual({ dx: 0, dy: 0 });
  });
});

describe("computeOptionDragPlan", () => {
  it("places each duplicate at original + delta (single node)", () => {
    const originals: OriginalPositionMap = { "a": { x: 100, y: 200 } };
    const delta = { dx: 50, dy: -30 };
    const moves = computeOptionDragPlan(originals, delta, ["dup-a"], ["a"]);
    expect(moves).toEqual([{ id: "dup-a", x: 150, y: 170 }]);
  });

  it("places each duplicate at original + delta (multi-node)", () => {
    const originals: OriginalPositionMap = {
      "a": { x: 100, y: 200 },
      "b": { x: 300, y: 400 },
    };
    const delta = { dx: 80, dy: 20 };
    const moves = computeOptionDragPlan(
      originals,
      delta,
      ["dup-a", "dup-b"],
      ["a", "b"],
    );
    expect(moves).toEqual([
      { id: "dup-a", x: 180, y: 220 },
      { id: "dup-b", x: 380, y: 420 },
    ]);
  });

  it("rounds to whole pixels", () => {
    const originals: OriginalPositionMap = { "a": { x: 100.7, y: 200.3 } };
    const delta = { dx: 10.6, dy: 5.4 };
    const moves = computeOptionDragPlan(originals, delta, ["dup-a"], ["a"]);
    // Math.round(111.3) = 111, Math.round(205.7) = 206
    expect(moves[0].x).toBe(111);
    expect(moves[0].y).toBe(206);
  });

  it("skips entries where draggedId has no original", () => {
    const originals: OriginalPositionMap = { "a": { x: 10, y: 20 } };
    const delta = { dx: 5, dy: 5 };
    // "b" has no original → skipped
    const moves = computeOptionDragPlan(originals, delta, ["dup-a", "dup-b"], ["a", "b"]);
    expect(moves).toHaveLength(1);
    expect(moves[0].id).toBe("dup-a");
  });

  it("handles empty inputs gracefully", () => {
    const moves = computeOptionDragPlan({}, { dx: 10, dy: 10 }, [], []);
    expect(moves).toEqual([]);
  });

  it("stops at the shorter of newIds/draggedIds", () => {
    const originals: OriginalPositionMap = {
      "a": { x: 0, y: 0 },
      "b": { x: 10, y: 0 },
    };
    // Only 1 new id but 2 dragged → only 1 move
    const moves = computeOptionDragPlan(originals, { dx: 5, dy: 5 }, ["dup-a"], ["a", "b"]);
    expect(moves).toHaveLength(1);
    expect(moves[0].id).toBe("dup-a");
  });
});

describe("computeGhostRects", () => {
  it("returns one rect per dragged id using measured size", () => {
    const originals: OriginalPositionMap = { "a": { x: 100, y: 200 } };
    const measured = { "a": { width: 220, height: 140 } };
    const rects = computeGhostRects(originals, ["a"], measured);
    expect(rects).toEqual([{ id: "a", x: 100, y: 200, width: 220, height: 140 }]);
  });

  it("falls back to default size (200×100) when node is not yet measured", () => {
    const originals: OriginalPositionMap = { "a": { x: 50, y: 60 } };
    const rects = computeGhostRects(originals, ["a"], {});
    expect(rects).toEqual([{ id: "a", x: 50, y: 60, width: 200, height: 100 }]);
  });

  it("returns multiple rects for a multi-node option-drag", () => {
    const originals: OriginalPositionMap = {
      "a": { x: 0, y: 0 },
      "b": { x: 300, y: 100 },
    };
    const measured = {
      "a": { width: 200, height: 120 },
      "b": { width: 180, height: 90 },
    };
    const rects = computeGhostRects(originals, ["a", "b"], measured);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ id: "a", x: 0, y: 0, width: 200, height: 120 });
    expect(rects[1]).toEqual({ id: "b", x: 300, y: 100, width: 180, height: 90 });
  });

  it("skips dragged ids that have no entry in originals", () => {
    const originals: OriginalPositionMap = { "a": { x: 10, y: 20 } };
    const measured = { "a": { width: 200, height: 100 } };
    // "b" is in draggedIds but not in originals → skipped
    const rects = computeGhostRects(originals, ["a", "b"], measured);
    expect(rects).toHaveLength(1);
    expect(rects[0].id).toBe("a");
  });

  it("returns empty array for empty inputs", () => {
    const rects = computeGhostRects({}, [], {});
    expect(rects).toEqual([]);
  });
});
