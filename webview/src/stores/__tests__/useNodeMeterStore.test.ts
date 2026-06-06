/**
 * Tests for useNodeMeterStore — the CORRECTNESS Block-VU path (Q-VU-PER-BLOCK,
 * Pillar-2 D1). The value comes from REAL per-node host output levels keyed by
 * node UUID, NOT a fabricated/idle constant:
 *   • non-zero level pushed for a node      → useBlockNodeLevel > 0 (meter lights)
 *   • silent / unknown node                 → 0                    (meter dark)
 *   • terminal / unconnected node           → STILL lights (unlike the cable path)
 * Also locks the 60Hz epsilon-diff (steady push keeps the same reference so
 * subscribers don't re-render).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import {
  useNodeMeterStore,
  useBlockNodeLevel,
} from "../useNodeMeterStore";

beforeEach(() => {
  useNodeMeterStore.setState({ levels: {} });
});

afterEach(() => {
  useNodeMeterStore.setState({ levels: {} });
});

describe("useBlockNodeLevel — Block VU from REAL per-node output level", () => {
  it("stays dark (0) for a node with no reported level", () => {
    const { result } = renderHook(() => useBlockNodeLevel("synth"));
    expect(result.current).toBe(0);
  });

  it("LIGHTS UP (> 0) when the host reports real signal for that node", () => {
    const { result } = renderHook(() => useBlockNodeLevel("synth"));
    expect(result.current).toBe(0);
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "synth", level: 0.64 }]);
    });
    expect(result.current).toBeCloseTo(0.64);
    expect(result.current).toBeGreaterThan(0);
  });

  it("lights a TERMINAL/unconnected node (no outgoing cable needed)", () => {
    // The cable-derived path leaves an output-only block dark; the per-node
    // path reads the node's OWN output RMS, so "master" lights here.
    const { result } = renderHook(() => useBlockNodeLevel("master"));
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "master", level: 0.42 }]);
    });
    expect(result.current).toBeCloseTo(0.42);
  });

  it("returns 0 for a node not present in the latest snapshot", () => {
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "synth", level: 0.5 }]);
    });
    const { result } = renderHook(() => useBlockNodeLevel("ghost"));
    expect(result.current).toBe(0);
  });
});

describe("useNodeMeterStore.setNodeLevels — 60Hz epsilon-diff", () => {
  it("keeps the SAME levels reference when nothing moved past epsilon", () => {
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.5 }]);
    });
    const ref1 = useNodeMeterStore.getState().levels;
    act(() => {
      // sub-epsilon change (< 0.001) → must NOT swap the reference
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.5004 }]);
    });
    const ref2 = useNodeMeterStore.getState().levels;
    expect(ref2).toBe(ref1);
  });

  it("swaps the reference when a level moves past epsilon", () => {
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.5 }]);
    });
    const ref1 = useNodeMeterStore.getState().levels;
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.8 }]);
    });
    const ref2 = useNodeMeterStore.getState().levels;
    expect(ref2).not.toBe(ref1);
    expect(ref2["a"]).toBeCloseTo(0.8);
  });

  it("swaps the reference when the node SET changes (different length)", () => {
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.5 }]);
    });
    const ref1 = useNodeMeterStore.getState().levels;
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([
        { id: "a", level: 0.5 },
        { id: "b", level: 0.1 },
      ]);
    });
    expect(useNodeMeterStore.getState().levels).not.toBe(ref1);
  });
});

// ── Ledger #5/#6: fingerprint fast-path (skip rebuild on a repeat frame) ──────
describe("useNodeMeterStore.setNodeLevels — fingerprint fast-path", () => {
  it("an EXACT-repeat frame returns the same reference (fast-path hit)", () => {
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([
        { id: "a", level: 0.5 },
        { id: "b", level: 0.25 },
      ]);
    });
    const ref1 = useNodeMeterStore.getState().levels;
    act(() => {
      // Identical values + ids → fast-path returns the existing reference.
      useNodeMeterStore.getState().setNodeLevels([
        { id: "a", level: 0.5 },
        { id: "b", level: 0.25 },
      ]);
    });
    expect(useNodeMeterStore.getState().levels).toBe(ref1);
  });

  it("does NOT mask a real change (fast-path only confirms unchanged)", () => {
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.5 }]);
    });
    const ref1 = useNodeMeterStore.getState().levels;
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.7 }]);
    });
    const ref2 = useNodeMeterStore.getState().levels;
    expect(ref2).not.toBe(ref1);
    expect(ref2["a"]).toBeCloseTo(0.7);
  });

  it("self-heals after an out-of-band reset (setState) — next frame still lands", () => {
    act(() => {
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.42 }]);
    });
    // Reset levels out of band WITHOUT touching the fingerprint, then re-push
    // the same frame: the key-count guard must force the slow path so the value
    // is rebuilt (never returns the stale empty map).
    act(() => {
      useNodeMeterStore.setState({ levels: {} });
      useNodeMeterStore.getState().setNodeLevels([{ id: "a", level: 0.42 }]);
    });
    expect(useNodeMeterStore.getState().levels["a"]).toBeCloseTo(0.42);
  });
});
