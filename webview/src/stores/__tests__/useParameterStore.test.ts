/**
 * Tests for useParameterStore — live parameter value delta channel.
 * Covers applyDeltas, pruneNodes, setLocal, clear, paramKey, selectParamValue.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  useParameterStore,
  paramKey,
  selectParamValue,
} from "../useParameterStore";

function reset() {
  useParameterStore.setState({ values: {} });
}

describe("paramKey", () => {
  it("formats nodeId:paramIndex", () => {
    expect(paramKey("node-1", 3)).toBe("node-1:3");
    expect(paramKey("abc", 0)).toBe("abc:0");
  });
});

describe("useParameterStore.applyDeltas", () => {
  beforeEach(reset);

  it("happy path: applies single delta entry", () => {
    useParameterStore
      .getState()
      .applyDeltas([{ nodeId: "n1", params: [{ i: 0, v: 0.5 }] }]);
    expect(useParameterStore.getState().values["n1:0"]).toBe(0.5);
  });

  it("happy path: applies multiple params in one delta", () => {
    useParameterStore.getState().applyDeltas([
      { nodeId: "n1", params: [{ i: 0, v: 0.1 }, { i: 1, v: 0.9 }] },
    ]);
    const { values } = useParameterStore.getState();
    expect(values["n1:0"]).toBe(0.1);
    expect(values["n1:1"]).toBe(0.9);
  });

  it("happy path: applies multiple nodes in one call", () => {
    useParameterStore.getState().applyDeltas([
      { nodeId: "n1", params: [{ i: 0, v: 0.25 }] },
      { nodeId: "n2", params: [{ i: 0, v: 0.75 }] },
    ]);
    const { values } = useParameterStore.getState();
    expect(values["n1:0"]).toBe(0.25);
    expect(values["n2:0"]).toBe(0.75);
  });

  it("no-op: empty array does not change state reference", () => {
    const before = useParameterStore.getState();
    useParameterStore.getState().applyDeltas([]);
    expect(useParameterStore.getState()).toBe(before);
  });

  it("no-op: value unchanged does not trigger update", () => {
    useParameterStore.setState({ values: { "n1:0": 0.5 } });
    const before = useParameterStore.getState();
    useParameterStore
      .getState()
      .applyDeltas([{ nodeId: "n1", params: [{ i: 0, v: 0.5 }] }]);
    expect(useParameterStore.getState()).toBe(before);
  });

  it("edge: skips null/undefined delta entries", () => {
    // @ts-expect-error intentional bad input
    useParameterStore.getState().applyDeltas([null, undefined]);
    expect(useParameterStore.getState().values).toEqual({});
  });

  it("edge: skips delta with non-string nodeId", () => {
    // @ts-expect-error intentional bad input
    useParameterStore.getState().applyDeltas([{ nodeId: 42, params: [{ i: 0, v: 1 }] }]);
    expect(useParameterStore.getState().values).toEqual({});
  });

  it("edge: skips delta with non-array params", () => {
    // @ts-expect-error intentional bad input
    useParameterStore.getState().applyDeltas([{ nodeId: "n1", params: "bad" }]);
    expect(useParameterStore.getState().values).toEqual({});
  });

  it("edge: skips param entries with wrong types", () => {
    useParameterStore.getState().applyDeltas([
      {
        nodeId: "n1",
        // @ts-expect-error intentional bad input
        params: [{ i: "x", v: 0.5 }, { i: 0, v: "bad" }, { i: 1, v: 0.3 }],
      },
    ]);
    const { values } = useParameterStore.getState();
    expect(values["n1:1"]).toBe(0.3);
    expect(Object.keys(values)).toHaveLength(1);
  });
});

describe("useParameterStore.pruneNodes", () => {
  beforeEach(reset);

  it("removes entries for nodes not in live set", () => {
    useParameterStore.setState({
      values: { "n1:0": 0.1, "n2:0": 0.2, "n3:0": 0.3 },
    });
    useParameterStore.getState().pruneNodes(["n1", "n3"]);
    const { values } = useParameterStore.getState();
    expect(values["n1:0"]).toBe(0.1);
    expect(values["n2:0"]).toBeUndefined();
    expect(values["n3:0"]).toBe(0.3);
  });

  it("no-op: all nodes still live — state reference unchanged", () => {
    useParameterStore.setState({ values: { "n1:0": 0.5 } });
    const before = useParameterStore.getState();
    useParameterStore.getState().pruneNodes(["n1"]);
    expect(useParameterStore.getState()).toBe(before);
  });

  it("accepts Set as liveNodeIds", () => {
    useParameterStore.setState({ values: { "n1:0": 0.1, "n2:0": 0.2 } });
    useParameterStore.getState().pruneNodes(new Set(["n1"]));
    expect(useParameterStore.getState().values["n2:0"]).toBeUndefined();
  });

  it("prunes all when live set is empty", () => {
    useParameterStore.setState({
      values: { "n1:0": 0.1, "n1:1": 0.2 },
    });
    useParameterStore.getState().pruneNodes([]);
    expect(useParameterStore.getState().values).toEqual({});
  });
});

describe("useParameterStore.setLocal", () => {
  beforeEach(reset);

  it("writes optimistic value", () => {
    useParameterStore.getState().setLocal("n1", 2, 0.7);
    expect(useParameterStore.getState().values["n1:2"]).toBe(0.7);
  });

  it("no-op when value is same — state reference unchanged", () => {
    useParameterStore.setState({ values: { "n1:2": 0.7 } });
    const before = useParameterStore.getState();
    useParameterStore.getState().setLocal("n1", 2, 0.7);
    expect(useParameterStore.getState()).toBe(before);
  });
});

describe("useParameterStore.clear", () => {
  beforeEach(reset);

  it("empties all values", () => {
    useParameterStore.setState({ values: { "n1:0": 1, "n2:0": 2 } });
    useParameterStore.getState().clear();
    expect(useParameterStore.getState().values).toEqual({});
  });
});

describe("selectParamValue", () => {
  beforeEach(reset);

  it("returns value when present", () => {
    useParameterStore.setState({ values: { "n1:0": 0.42 } });
    const sel = selectParamValue("n1", 0);
    expect(sel(useParameterStore.getState())).toBe(0.42);
  });

  it("returns undefined when absent", () => {
    const sel = selectParamValue("missing", 0);
    expect(sel(useParameterStore.getState())).toBeUndefined();
  });
});
