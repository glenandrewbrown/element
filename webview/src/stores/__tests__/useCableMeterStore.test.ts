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

// ── Ledger #5/#6: fingerprint fast-path (skip rebuild on a repeat frame) ──────
describe("useCableMeterStore.setCableLevels — fingerprint fast-path", () => {
  beforeEach(() => {
    useCableMeterStore.setState({ levels: {}, values: {}, peaks: {} });
  });

  it("an EXACT-repeat frame returns the same level/value/peak references", () => {
    useCableMeterStore.getState().setCableLevels([
      { id: "e1", level: 0.5, v: -0.2, pk: 0.6 },
      { id: "e2", level: 0.3 },
    ]);
    const lvl = useCableMeterStore.getState().levels;
    const val = useCableMeterStore.getState().values;
    const pk = useCableMeterStore.getState().peaks;

    useCableMeterStore.getState().setCableLevels([
      { id: "e1", level: 0.5, v: -0.2, pk: 0.6 },
      { id: "e2", level: 0.3 },
    ]);
    expect(useCableMeterStore.getState().levels).toBe(lvl);
    expect(useCableMeterStore.getState().values).toBe(val);
    expect(useCableMeterStore.getState().peaks).toBe(pk);
  });

  it("does NOT mask a change to the signed value v", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "e1", level: 0.5, v: 0.1 }]);
    const val1 = useCableMeterStore.getState().values;
    useCableMeterStore.getState().setCableLevels([{ id: "e1", level: 0.5, v: 0.9 }]);
    expect(useCableMeterStore.getState().values).not.toBe(val1);
    expect(useCableMeterStore.getState().values["e1"]).toBeCloseTo(0.9);
  });

  it("does NOT mask a change to the peak pk", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "e1", level: 0.5, pk: 0.2 }]);
    const pk1 = useCableMeterStore.getState().peaks;
    useCableMeterStore.getState().setCableLevels([{ id: "e1", level: 0.5, pk: 0.95 }]);
    expect(useCableMeterStore.getState().peaks).not.toBe(pk1);
    expect(useCableMeterStore.getState().peaks["e1"]).toBeCloseTo(0.95);
  });

  it("does NOT mask a level change even when v/pk stay the same", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "e1", level: 0.2 }]);
    const lvl1 = useCableMeterStore.getState().levels;
    useCableMeterStore.getState().setCableLevels([{ id: "e1", level: 0.8 }]);
    expect(useCableMeterStore.getState().levels).not.toBe(lvl1);
    expect(useCableMeterStore.getState().levels["e1"]).toBeCloseTo(0.8);
  });
});
