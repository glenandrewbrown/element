/**
 * Tests for useNodeChannelMeterStore — the per-channel (surround) meter path
 * (G3-B item 2). Each value is REAL per-channel engine output RMS keyed by node
 * UUID, NOT a fabricated/idle constant:
 *   • per-channel array pushed for a node → useNodeChannelLevels returns it
 *   • silent / unknown node               → [] (no fake lanes)
 * Also locks the 60Hz epsilon-diff (steady push keeps the same reference so
 * subscribers don't re-render).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import {
  useNodeChannelMeterStore,
  useNodeChannelLevels,
} from "../useNodeChannelMeterStore";

beforeEach(() => {
  useNodeChannelMeterStore.setState({ levels: {} });
});

afterEach(() => {
  useNodeChannelMeterStore.setState({ levels: {} });
});

describe("useNodeChannelLevels — per-channel VU from REAL per-lane output RMS", () => {
  it("returns [] for a node with no reported channels", () => {
    const { result } = renderHook(() => useNodeChannelLevels("bus-src"));
    expect(result.current).toEqual([]);
  });

  it("returns the full per-channel array the host reported", () => {
    const { result } = renderHook(() => useNodeChannelLevels("bus-src"));
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "bus-src", ch: [0.6, 0.0, 0.3, 0.9, 0.1, 0.2] }]);
    });
    expect(result.current).toEqual([0.6, 0.0, 0.3, 0.9, 0.1, 0.2]);
    // Lanes must be DISTINCT — proves we are not collapsing to one scalar.
    expect(new Set(result.current).size).toBeGreaterThan(1);
  });

  it("returns [] for a node not present in the latest snapshot", () => {
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "a", ch: [0.5, 0.5] }]);
    });
    const { result } = renderHook(() => useNodeChannelLevels("ghost"));
    expect(result.current).toEqual([]);
  });

  it("degrades a mono (1-channel) node to a single lane", () => {
    const { result } = renderHook(() => useNodeChannelLevels("mono"));
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "mono", ch: [0.7] }]);
    });
    expect(result.current).toEqual([0.7]);
  });
});

describe("useNodeChannelMeterStore.setNodeChannelLevels — 60Hz epsilon-diff", () => {
  it("keeps the SAME levels reference when nothing moved past epsilon", () => {
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "a", ch: [0.5, 0.4] }]);
    });
    const ref1 = useNodeChannelMeterStore.getState().levels;
    act(() => {
      // sub-epsilon change on each lane → must NOT swap the reference
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "a", ch: [0.5004, 0.4003] }]);
    });
    const ref2 = useNodeChannelMeterStore.getState().levels;
    expect(ref2).toBe(ref1);
  });

  it("swaps the reference when a lane moves past epsilon", () => {
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "a", ch: [0.5, 0.4] }]);
    });
    const ref1 = useNodeChannelMeterStore.getState().levels;
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "a", ch: [0.5, 0.8] }]);
    });
    const ref2 = useNodeChannelMeterStore.getState().levels;
    expect(ref2).not.toBe(ref1);
    expect(ref2["a"]).toEqual([0.5, 0.8]);
  });

  it("swaps the reference when the channel COUNT changes", () => {
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "a", ch: [0.5, 0.4] }]);
    });
    const ref1 = useNodeChannelMeterStore.getState().levels;
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "a", ch: [0.5, 0.4, 0.3] }]);
    });
    expect(useNodeChannelMeterStore.getState().levels).not.toBe(ref1);
  });

  it("swaps the reference when the node SET changes (different length)", () => {
    act(() => {
      useNodeChannelMeterStore
        .getState()
        .setNodeChannelLevels([{ id: "a", ch: [0.5] }]);
    });
    const ref1 = useNodeChannelMeterStore.getState().levels;
    act(() => {
      useNodeChannelMeterStore.getState().setNodeChannelLevels([
        { id: "a", ch: [0.5] },
        { id: "b", ch: [0.1] },
      ]);
    });
    expect(useNodeChannelMeterStore.getState().levels).not.toBe(ref1);
  });
});
