/**
 * Gap tests for useSessionStore — edge cases in hydrateFromEngine type guards
 * and markSessionLoaded idempotence not covered by useSessionStore.test.ts.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { selectSessionLoaded, useSessionStore } from "../useSessionStore";

function reset() {
  useSessionStore.setState({
    filePath: "",
    dirty: false,
    recentFiles: [],
    graphs: [],
    sessionLoaded: false,
  });
}

describe("useSessionStore.hydrateFromEngine — type-guard branches", () => {
  beforeEach(reset);

  it("keeps existing filePath when supplied value is not a string", () => {
    useSessionStore.setState({ filePath: "my-project.els" });
    // @ts-expect-error intentionally testing bad input type
    useSessionStore.getState().hydrateFromEngine({ filePath: 42 });
    expect(useSessionStore.getState().filePath).toBe("my-project.els");
  });

  it("keeps existing dirty when supplied value is not a boolean", () => {
    useSessionStore.setState({ dirty: true });
    // @ts-expect-error intentionally testing bad input type
    useSessionStore.getState().hydrateFromEngine({ dirty: "true" });
    expect(useSessionStore.getState().dirty).toBe(true);
  });

  it("keeps existing recentFiles when supplied value is not an array", () => {
    useSessionStore.setState({ recentFiles: ["a.els", "b.els"] });
    // @ts-expect-error intentionally testing bad input type
    useSessionStore.getState().hydrateFromEngine({ recentFiles: null });
    expect(useSessionStore.getState().recentFiles).toEqual(["a.els", "b.els"]);
  });

  it("filters recentFiles to strings only when array contains mixed types", () => {
    useSessionStore.getState().hydrateFromEngine({
      // @ts-expect-error intentionally testing bad array entries
      recentFiles: ["good.els", 99, null, "also-good.els"],
    });
    expect(useSessionStore.getState().recentFiles).toEqual([
      "good.els",
      "also-good.els",
    ]);
  });

  it("keeps existing graphs when supplied graphs is null", () => {
    const existing = [{ id: "g1", name: "Graph 1", index: 0, active: true }];
    useSessionStore.setState({ graphs: existing });
    // @ts-expect-error intentionally testing bad input type
    useSessionStore.getState().hydrateFromEngine({ graphs: null });
    expect(useSessionStore.getState().graphs).toEqual(existing);
  });

  it("sets filePath when supplied value is a valid string", () => {
    useSessionStore.getState().hydrateFromEngine({ filePath: "new.els" });
    expect(useSessionStore.getState().filePath).toBe("new.els");
  });

  it("sets dirty when supplied value is a boolean false", () => {
    useSessionStore.setState({ dirty: true });
    useSessionStore.getState().hydrateFromEngine({ dirty: false });
    expect(useSessionStore.getState().dirty).toBe(false);
  });
});

describe("useSessionStore.markSessionLoaded", () => {
  beforeEach(reset);

  it("transitions sessionLoaded from false to true", () => {
    expect(useSessionStore.getState().sessionLoaded).toBe(false);
    useSessionStore.getState().markSessionLoaded();
    expect(useSessionStore.getState().sessionLoaded).toBe(true);
  });

  it("is idempotent — calling again keeps sessionLoaded true", () => {
    useSessionStore.getState().markSessionLoaded();
    useSessionStore.getState().markSessionLoaded();
    expect(useSessionStore.getState().sessionLoaded).toBe(true);
  });
});

describe("selectSessionLoaded", () => {
  beforeEach(reset);

  it("returns false before markSessionLoaded is called", () => {
    expect(selectSessionLoaded(useSessionStore.getState())).toBe(false);
  });

  it("returns true after markSessionLoaded is called", () => {
    useSessionStore.getState().markSessionLoaded();
    expect(selectSessionLoaded(useSessionStore.getState())).toBe(true);
  });
});
