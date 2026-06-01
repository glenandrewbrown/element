/**
 * Gap tests for useCableMeterStore.setCableLevels — covers the diff/skip
 * branches not exercised by useCableMeterStore.test.ts.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useCableMeterStore } from "../useCableMeterStore";

function reset() {
  useCableMeterStore.setState({ levels: {} });
}

describe("useCableMeterStore.setCableLevels — diff/skip branches", () => {
  beforeEach(reset);

  it("count mismatch forces update even when values are identical", () => {
    useCableMeterStore.getState().setCableLevels([
      { id: "a", level: 0.5 },
      { id: "b", level: 0.5 },
    ]);
    const before = useCableMeterStore.getState().levels;

    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.5 }]);
    const after = useCableMeterStore.getState().levels;

    expect(after).not.toBe(before);
    expect(Object.keys(after)).toHaveLength(1);
  });

  it("returns the unchanged levels reference when all deltas are below LEVEL_EPSILON", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.5 }]);
    const ref = useCableMeterStore.getState().levels;

    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.5005 }]);
    expect(useCableMeterStore.getState().levels).toBe(ref);
  });

  it("triggers an update when a delta is exactly at LEVEL_EPSILON (0.001)", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.5 }]);
    const ref = useCableMeterStore.getState().levels;

    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.501 }]);
    expect(useCableMeterStore.getState().levels).not.toBe(ref);
    expect(useCableMeterStore.getState().levels["a"]).toBeCloseTo(0.501);
  });

  it("empty items array sets empty levels object via count-mismatch path", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.8 }]);
    useCableMeterStore.getState().setCableLevels([]);
    const { levels } = useCableMeterStore.getState();
    expect(levels).toEqual({});
  });

  it("first call with entries from empty store always updates (prev is empty, count differs)", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "x", level: 0.3 }]);
    expect(useCableMeterStore.getState().levels["x"]).toBe(0.3);
  });

  it("skips update when prev = {a: 0.5} and new = {a: 0.5005} (below epsilon)", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.5 }]);
    const ref = useCableMeterStore.getState().levels;

    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.5005 }]);
    expect(useCableMeterStore.getState().levels).toBe(ref);
    expect(useCableMeterStore.getState().levels["a"]).toBe(0.5);
  });

  it("updates when a key is missing from prev (new cable added within same count)", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "a", level: 0.5 }]);
    const ref = useCableMeterStore.getState().levels;

    useCableMeterStore.getState().setCableLevels([{ id: "b", level: 0.5 }]);
    expect(useCableMeterStore.getState().levels).not.toBe(ref);
    expect(useCableMeterStore.getState().levels["b"]).toBe(0.5);
    expect(useCableMeterStore.getState().levels["a"]).toBeUndefined();
  });
});
