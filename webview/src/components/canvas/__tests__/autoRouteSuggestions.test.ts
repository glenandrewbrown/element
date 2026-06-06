/**
 * autoRouteSuggestions — unit tests for the pure auto-route suggestion engine
 * (the ported JUCE updateAutoConnectSuggestions logic).
 *
 * These cover the testable core in isolation (no React / store / bridge):
 *   - proximity filter (150px centre distance)
 *   - signal-type compatibility (audio/midi/value, same-type only)
 *   - free-port filtering (already-connected ports excluded)
 *   - cycle rejection (no feedback loops)
 *   - dedupe (one suggestion per ordered node pair)
 *   - signal-flow direction (left = upstream)
 *   - no-duplicate-of-existing-cable
 *
 * The drag interaction itself (onNodeDrag throttling, ghost rendering, accept
 * gestures) is left to live verification — it needs a real React Flow canvas.
 */

import { describe, it, expect } from "vitest";
import type { BlockData, CableData, Port, SignalType } from "../../../data/types";
import {
  computeRouteSuggestions,
  wouldCreateCycle,
  blockDistance,
  boundsOf,
  PROXIMITY_THRESHOLD,
  BLOCK_REF_WIDTH,
  BLOCK_REF_HEIGHT,
} from "../autoRouteSuggestions";

// ── Test factories ──

function port(
  id: string,
  type: SignalType,
  direction: "input" | "output",
  connected = false,
): Port {
  return { id, type, direction, label: id, connected };
}

function block(
  id: string,
  x: number,
  y: number,
  ports: Port[],
): BlockData {
  return {
    id,
    name: id,
    category: "audiofx",
    format: "VST3",
    position: { x, y },
    ports,
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  };
}

function cable(
  id: string,
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
  signalType: SignalType = "audio",
): CableData {
  return {
    id,
    source,
    sourcePort,
    target,
    targetPort,
    signalType,
    channelCount: 2,
    isSidechain: false,
  };
}

// Two blocks side by side, well within proximity, audio out → audio in.
function nearbyPair() {
  const a = block("a", 0, 0, [port("a-out", "audio", "output")]);
  const b = block("b", 80, 0, [port("b-in", "audio", "input")]);
  return { a, b };
}

// ── blockDistance / boundsOf ──

describe("boundsOf", () => {
  it("uses reference size when unmeasured", () => {
    const b = block("x", 10, 20, []);
    expect(boundsOf(b)).toEqual({
      x: 10,
      y: 20,
      width: BLOCK_REF_WIDTH,
      height: BLOCK_REF_HEIGHT,
    });
  });

  it("prefers measured size when supplied", () => {
    const b = block("x", 10, 20, []);
    const measured = new Map([["x", { width: 300, height: 50 }]]);
    expect(boundsOf(b, measured)).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 50,
    });
  });
});

describe("blockDistance (edge-to-edge gap — T8 live QA 2026-06-06)", () => {
  // Centre-to-centre made the 150px threshold unreachable for non-overlapping
  // ~200-260px-wide blocks (ghosts only fired on full overlap). The distance
  // is now the gap between bounding-box edges.
  it("is the horizontal gap between edges", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 180, y: 0, width: 100, height: 100 }; // 80px gap
    expect(blockDistance(a, b)).toBe(80);
  });

  it("is zero when blocks touch", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 100, y: 0, width: 100, height: 100 };
    expect(blockDistance(a, b)).toBe(0);
  });

  it("is zero when blocks overlap", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 20, width: 100, height: 100 };
    expect(blockDistance(a, b)).toBe(0);
  });

  it("is the diagonal gap when separated on both axes", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 130, y: 140, width: 100, height: 100 }; // gaps 30, 40
    expect(blockDistance(a, b)).toBe(50);
  });

  it("two adjacent full-size blocks within the threshold now suggest (regression)", () => {
    // The live-QA repro shape: two ~200px blocks side by side, 100px apart —
    // centre-to-centre this was 300px (> threshold, never fired); edge-gap
    // it is 100px (< 150 threshold).
    const a = { x: 0, y: 0, width: 200, height: 100 };
    const b = { x: 300, y: 0, width: 200, height: 100 };
    expect(blockDistance(a, b)).toBeLessThan(150);
  });

  it("is zero for coincident bounds", () => {
    const a = { x: 5, y: 5, width: 40, height: 40 };
    expect(blockDistance(a, a)).toBe(0);
  });
});

// ── wouldCreateCycle ──

describe("wouldCreateCycle", () => {
  it("rejects a self-edge", () => {
    expect(wouldCreateCycle(new Map(), "a", "a")).toBe(true);
  });

  it("allows an edge with no existing path back", () => {
    // a → b already exists; proposing b → c is fine.
    const adj = new Map<string, Set<string>>([["a", new Set(["b"])]]);
    expect(wouldCreateCycle(adj, "b", "c")).toBe(false);
  });

  it("rejects an edge that closes a loop", () => {
    // a → b → c exists; proposing c → a would close a cycle.
    const adj = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
    ]);
    expect(wouldCreateCycle(adj, "c", "a")).toBe(true);
  });

  it("rejects a direct back-edge (a→b exists, propose b→a)", () => {
    const adj = new Map<string, Set<string>>([["a", new Set(["b"])]]);
    expect(wouldCreateCycle(adj, "b", "a")).toBe(true);
  });

  it("handles a diamond without false positives", () => {
    // a→b, a→c, b→d, c→d. Proposing d→e is acyclic.
    const adj = new Map<string, Set<string>>([
      ["a", new Set(["b", "c"])],
      ["b", new Set(["d"])],
      ["c", new Set(["d"])],
    ]);
    expect(wouldCreateCycle(adj, "d", "e")).toBe(false);
    // but d→a would close two loops
    expect(wouldCreateCycle(adj, "d", "a")).toBe(true);
  });
});

// ── computeRouteSuggestions: happy path ──

describe("computeRouteSuggestions — proximity", () => {
  it("suggests a cable between two nearby compatible blocks", () => {
    const { a, b } = nearbyPair();
    const out = computeRouteSuggestions("a", [a, b], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source: "a",
      sourcePort: "a-out",
      target: "b",
      targetPort: "b-in",
      signalType: "audio",
    });
  });

  it("does NOT suggest when blocks are beyond the proximity threshold", () => {
    const a = block("a", 0, 0, [port("a-out", "audio", "output")]);
    // Place b far enough that centre distance exceeds the threshold.
    const farX = BLOCK_REF_WIDTH + PROXIMITY_THRESHOLD + 50;
    const b = block("b", farX, 0, [port("b-in", "audio", "input")]);
    const out = computeRouteSuggestions("a", [a, b], []);
    expect(out).toHaveLength(0);
  });

  it("returns nothing when the dragged block id is unknown", () => {
    const { a, b } = nearbyPair();
    expect(computeRouteSuggestions("missing", [a, b], [])).toHaveLength(0);
  });

  it("ranks the closest pair first", () => {
    const dragged = block("d", 0, 0, [port("d-out", "audio", "output")]);
    const near = block("near", 60, 0, [port("near-in", "audio", "input")]);
    const farther = block("far", 120, 0, [port("far-in", "audio", "input")]);
    const out = computeRouteSuggestions("d", [dragged, near, farther], []);
    expect(out).toHaveLength(2);
    expect(out[0].target).toBe("near");
    expect(out[1].target).toBe("far");
  });
});

// ── compatibility ──

describe("computeRouteSuggestions — signal-type compatibility", () => {
  it("does NOT connect audio-out to midi-in", () => {
    const a = block("a", 0, 0, [port("a-out", "audio", "output")]);
    const b = block("b", 80, 0, [port("b-in", "midi", "input")]);
    expect(computeRouteSuggestions("a", [a, b], [])).toHaveLength(0);
  });

  it("connects matching midi ports", () => {
    const a = block("a", 0, 0, [port("a-out", "midi", "output")]);
    const b = block("b", 80, 0, [port("b-in", "midi", "input")]);
    const out = computeRouteSuggestions("a", [a, b], []);
    expect(out).toHaveLength(1);
    expect(out[0].signalType).toBe("midi");
  });

  it("connects matching value/CV ports", () => {
    const a = block("a", 0, 0, [port("a-out", "value", "output")]);
    const b = block("b", 80, 0, [port("b-in", "value", "input")]);
    const out = computeRouteSuggestions("a", [a, b], []);
    expect(out).toHaveLength(1);
    expect(out[0].signalType).toBe("value");
  });

  it("picks the first compatible pair when multiple types are present", () => {
    const a = block("a", 0, 0, [
      port("a-midi-out", "midi", "output"),
      port("a-audio-out", "audio", "output"),
    ]);
    const b = block("b", 80, 0, [
      port("b-midi-in", "midi", "input"),
      port("b-audio-in", "audio", "input"),
    ]);
    const out = computeRouteSuggestions("a", [a, b], []);
    // One suggestion per node pair — the first compatible (midi, by port order).
    expect(out).toHaveLength(1);
    expect(out[0].sourcePort).toBe("a-midi-out");
    expect(out[0].targetPort).toBe("b-midi-in");
  });
});

// ── direction (signal flow) ──

describe("computeRouteSuggestions — signal-flow direction", () => {
  it("treats the LEFT block as upstream regardless of which is dragged", () => {
    // dragged is on the RIGHT; the other (left) must be the source.
    const left = block("left", 0, 0, [port("left-out", "audio", "output")]);
    const right = block("right", 80, 0, [
      port("right-in", "audio", "input"),
      port("right-out", "audio", "output"),
    ]);
    // Drag the right block — left should still be upstream.
    const out = computeRouteSuggestions("right", [left, right], []);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("left");
    expect(out[0].target).toBe("right");
  });

  it("skips pairs whose centres share the same X (ambiguous direction)", () => {
    // Identical X (stacked vertically) → strict < comparison yields nothing.
    const a = block("a", 0, 0, [port("a-out", "audio", "output")]);
    const b = block("b", 0, 40, [port("b-in", "audio", "input")]);
    expect(computeRouteSuggestions("a", [a, b], [])).toHaveLength(0);
  });
});

// ── free ports ──

describe("computeRouteSuggestions — free-port filtering", () => {
  it("does NOT reuse an output port already carrying a cable", () => {
    const a = block("a", 0, 0, [port("a-out", "audio", "output")]);
    const b = block("b", 80, 0, [port("b-in", "audio", "input")]);
    // a-out already connects somewhere else → not free.
    const existing = [cable("c1", "a", "a-out", "other", "other-in")];
    expect(computeRouteSuggestions("a", [a, b], existing)).toHaveLength(0);
  });

  it("does NOT reuse an input port already carrying a cable", () => {
    const a = block("a", 0, 0, [port("a-out", "audio", "output")]);
    const b = block("b", 80, 0, [port("b-in", "audio", "input")]);
    // b-in is already fed by something else → not free.
    const existing = [cable("c1", "src", "src-out", "b", "b-in")];
    expect(computeRouteSuggestions("a", [a, b], existing)).toHaveLength(0);
  });

  it("falls through to the NEXT free port when the first is taken", () => {
    const a = block("a", 0, 0, [
      port("a-out1", "audio", "output"),
      port("a-out2", "audio", "output"),
    ]);
    const b = block("b", 80, 0, [port("b-in", "audio", "input")]);
    const existing = [cable("c1", "a", "a-out1", "other", "other-in")];
    const out = computeRouteSuggestions("a", [a, b], existing);
    expect(out).toHaveLength(1);
    expect(out[0].sourcePort).toBe("a-out2");
  });
});

// ── no duplicate of an existing cable ──

describe("computeRouteSuggestions — no duplicate cable", () => {
  it("does NOT re-suggest an existing exact connection", () => {
    const { a, b } = nearbyPair();
    const existing = [cable("c1", "a", "a-out", "b", "b-in")];
    // a-out and b-in are now both "used" (and the exact cable exists) → none.
    expect(computeRouteSuggestions("a", [a, b], existing)).toHaveLength(0);
  });
});

// ── cycle rejection (integration through computeRouteSuggestions) ──

describe("computeRouteSuggestions — cycle rejection", () => {
  it("rejects a suggestion that would create a feedback loop", () => {
    // b → a already exists (b upstream of a). Dragging a next to b puts a on
    // the right (downstream) ... but a also has an output and b an input, so
    // the only direction the matcher could propose is a(left?)→b. Construct it
    // so the LEFT/upstream is a, and a→b would close the b→a loop.
    const a = block("a", 0, 0, [
      port("a-out", "audio", "output"),
      port("a-in", "audio", "input"),
    ]);
    const b = block("b", 80, 0, [
      port("b-in", "audio", "input"),
      port("b-out", "audio", "output"),
    ]);
    // Existing edge b → a (so adjacency has b→a).
    const existing = [cable("c1", "b", "b-out", "a", "a-in")];
    // a is left/upstream → proposes a-out → b-in, but that closes a↔b loop.
    const out = computeRouteSuggestions("a", [a, b], existing);
    expect(out).toHaveLength(0);
  });

  it("allows a forward suggestion that does not loop", () => {
    // a → b chain; dragging c (rightmost) near b suggests b → c (acyclic).
    const a = block("a", 0, 0, [port("a-out", "audio", "output")]);
    const b = block("b", 80, 0, [
      port("b-in", "audio", "input"),
      port("b-out", "audio", "output"),
    ]);
    const c = block("c", 160, 0, [port("c-in", "audio", "input")]);
    const existing = [cable("c1", "a", "a-out", "b", "b-in")];
    const out = computeRouteSuggestions("c", [a, b, c], existing);
    // b (left of c, within range) → c is the only valid forward suggestion.
    // a is out of range of c (centre distance > threshold).
    expect(out.some((s) => s.source === "b" && s.target === "c")).toBe(true);
  });
});

// ── dedupe (one per ordered node pair) ──

describe("computeRouteSuggestions — dedupe", () => {
  it("emits at most one suggestion per ordered node pair", () => {
    // Multiple compatible free pairs between a and b, but only ONE ghost.
    const a = block("a", 0, 0, [
      port("a-out1", "audio", "output"),
      port("a-out2", "audio", "output"),
    ]);
    const b = block("b", 80, 0, [
      port("b-in1", "audio", "input"),
      port("b-in2", "audio", "input"),
    ]);
    const out = computeRouteSuggestions("a", [a, b], []);
    expect(out).toHaveLength(1);
  });

  it("produces a stable, unique ghost id", () => {
    const { a, b } = nearbyPair();
    const out = computeRouteSuggestions("a", [a, b], []);
    expect(out[0].id).toBe("ghost:a:a-out->b:b-in");
  });
});

// ── multiple neighbours ──

describe("computeRouteSuggestions — multiple neighbours", () => {
  it("suggests cables to several distinct nearby blocks", () => {
    const dragged = block("d", 100, 0, [
      port("d-out", "audio", "output"),
      port("d-in", "audio", "input"),
    ]);
    // left neighbour (upstream → feeds d), right neighbour (d feeds it)
    const left = block("l", 0, 0, [port("l-out", "audio", "output")]);
    const right = block("r", 200, 0, [port("r-in", "audio", "input")]);
    const out = computeRouteSuggestions("d", [dragged, left, right], []);
    // l → d  and  d → r
    expect(out.some((s) => s.source === "l" && s.target === "d")).toBe(true);
    expect(out.some((s) => s.source === "d" && s.target === "r")).toBe(true);
    expect(out).toHaveLength(2);
  });
});
