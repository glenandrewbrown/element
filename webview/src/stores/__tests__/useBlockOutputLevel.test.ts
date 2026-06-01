/**
 * Tests for useBlockOutputLevel — the Block VU derive-helper.
 *
 * This is the mechanical "nothing-fake" proof for the Block VU meter
 * (Q-VU-PER-BLOCK fast path): the value RmsMeter renders comes from REAL
 * per-cable host levels (useCableMeterStore) routed through this hook, NOT a
 * fabricated/idle constant. The hook returns the MAX live level over a Block's
 * OUTGOING edges, so:
 *   • non-zero signal on an outgoing cable  → level > 0  (meter lights)
 *   • zero signal / no outgoing edges       → 0          (meter stays dark)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useBlockOutputLevel } from "../useCableMeterStore";
import { useCableMeterStore } from "../useCableMeterStore";
import { useGraphStore } from "../useGraphStore";
import type { BlockData, CableData } from "../../data/types";

function block(id: string): BlockData {
  return {
    id,
    name: id,
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  };
}

function cable(id: string, source: string, target: string): CableData {
  return {
    id,
    source,
    sourcePort: "out",
    target,
    targetPort: "in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  };
}

const baseGraph = useGraphStore.getState();

beforeEach(() => {
  useCableMeterStore.setState({ levels: {} });
  // synth → fx → master, so synth+fx have outgoing edges, master does not.
  useGraphStore.setState({
    nodes: [block("synth"), block("fx"), block("master")],
    edges: [cable("e-synth-fx", "synth", "fx"), cable("e-fx-master", "fx", "master")],
  });
});

afterEach(() => {
  useGraphStore.setState({ nodes: baseGraph.nodes, edges: baseGraph.edges });
  useCableMeterStore.setState({ levels: {} });
});

describe("useBlockOutputLevel — Block VU lights on REAL signal", () => {
  it("stays dark (0) when its outgoing cable carries no signal", () => {
    const { result } = renderHook(() => useBlockOutputLevel("synth"));
    expect(result.current).toBe(0);
  });

  it("LIGHTS UP (level > 0) when its outgoing cable carries real signal", () => {
    const { result } = renderHook(() => useBlockOutputLevel("synth"));
    expect(result.current).toBe(0);
    act(() => {
      useCableMeterStore.getState().setCableLevels([
        { id: "e-synth-fx", level: 0.73 },
      ]);
    });
    expect(result.current).toBeCloseTo(0.73);
    expect(result.current).toBeGreaterThan(0);
  });

  it("tracks the MAX across multiple outgoing cables", () => {
    // Give synth a second outgoing cable, then push two different levels.
    act(() => {
      useGraphStore.setState((s) => ({
        edges: [...(s.edges as CableData[]), cable("e-synth-b", "synth", "master")],
      }));
    });
    const { result } = renderHook(() => useBlockOutputLevel("synth"));
    act(() => {
      useCableMeterStore.getState().setCableLevels([
        { id: "e-synth-fx", level: 0.3 },
        { id: "e-synth-b", level: 0.9 },
      ]);
    });
    expect(result.current).toBeCloseTo(0.9); // loudest outgoing cable wins
  });

  it("does NOT borrow an INCOMING cable's level (only outgoing)", () => {
    // master has only an INCOMING cable (e-fx-master); its meter must stay dark
    // even when that cable is hot — master has no OUTGOING edge.
    const { result } = renderHook(() => useBlockOutputLevel("master"));
    act(() => {
      useCableMeterStore.getState().setCableLevels([
        { id: "e-fx-master", level: 0.95 },
      ]);
    });
    expect(result.current).toBe(0);
  });

  it("a Block with zero outgoing edges reads 0 (idle — excluded from nothing-fake)", () => {
    act(() => {
      useGraphStore.setState({ edges: [] });
    });
    const { result } = renderHook(() => useBlockOutputLevel("synth"));
    act(() => {
      useCableMeterStore.getState().setCableLevels([
        { id: "e-synth-fx", level: 0.8 },
      ]);
    });
    expect(result.current).toBe(0);
  });

  it("falls back to dark when signal drops to 0 (no stuck meter)", () => {
    const { result } = renderHook(() => useBlockOutputLevel("synth"));
    act(() => {
      useCableMeterStore.getState().setCableLevels([{ id: "e-synth-fx", level: 0.6 }]);
    });
    expect(result.current).toBeCloseTo(0.6);
    act(() => {
      useCableMeterStore.getState().setCableLevels([{ id: "e-synth-fx", level: 0 }]);
    });
    expect(result.current).toBe(0);
  });
});
