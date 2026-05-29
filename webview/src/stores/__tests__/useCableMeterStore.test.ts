/**
 * Tests for useCableMeterStore — per-cable signal level keyed by edge id.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useCableMeterStore } from "../useCableMeterStore";

function reset() {
  useCableMeterStore.setState({ levels: {} });
}

describe("useCableMeterStore.setCableLevels", () => {
  beforeEach(reset);

  it("happy path: sets a single cable level", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "edge-1", level: 0.8 }]);
    expect(useCableMeterStore.getState().levels["edge-1"]).toBe(0.8);
  });

  it("happy path: sets multiple cable levels", () => {
    useCableMeterStore.getState().setCableLevels([
      { id: "edge-1", level: 0.2 },
      { id: "edge-2", level: 0.6 },
      { id: "edge-3", level: 1.0 },
    ]);
    const { levels } = useCableMeterStore.getState();
    expect(levels["edge-1"]).toBe(0.2);
    expect(levels["edge-2"]).toBe(0.6);
    expect(levels["edge-3"]).toBe(1.0);
  });

  it("replaces all previous levels on each call (no merge)", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "edge-1", level: 0.5 }]);
    useCableMeterStore.getState().setCableLevels([{ id: "edge-2", level: 0.9 }]);
    const { levels } = useCableMeterStore.getState();
    expect(levels["edge-1"]).toBeUndefined();
    expect(levels["edge-2"]).toBe(0.9);
  });

  it("edge: empty array clears all levels", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "edge-1", level: 0.5 }]);
    useCableMeterStore.getState().setCableLevels([]);
    expect(useCableMeterStore.getState().levels).toEqual({});
  });

  it("edge: level 0 is stored (not filtered)", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "silent", level: 0 }]);
    expect(useCableMeterStore.getState().levels["silent"]).toBe(0);
  });

  it("edge: duplicate ids — last entry wins", () => {
    useCableMeterStore.getState().setCableLevels([
      { id: "e1", level: 0.1 },
      { id: "e1", level: 0.9 },
    ]);
    expect(useCableMeterStore.getState().levels["e1"]).toBe(0.9);
  });

  it("initial state has empty levels", () => {
    expect(useCableMeterStore.getState().levels).toEqual({});
  });
});
