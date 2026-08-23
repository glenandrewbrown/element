/**
 * Tests for `useSessionStore` — session state and engine hydration.
 *
 * Covers:
 *   1) `markSessionLoaded` flips `sessionLoaded` from false to true (T-P6-1)
 *   2) `hydrateFromEngine` merges a partial payload, only updating supplied keys
 *   3) `selectSessionLoaded` selector returns the current flag value
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installJuceBridgeMock, type JuceBridgeMock } from "../../test/mockJuceBridge";
import { selectSessionLoaded, useSessionStore } from "../useSessionStore";

describe("useSessionStore", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    useSessionStore.setState({
      filePath: "",
      dirty: false,
      recentFiles: [],
      graphs: [],
      sessionLoaded: false,
    });
  });

  afterEach(() => {
    bridge.uninstall();
  });

  // ── markSessionLoaded ─────────────────────────────────────────────────────

  it("markSessionLoaded flips sessionLoaded to true", () => {
    expect(useSessionStore.getState().sessionLoaded).toBe(false);
    useSessionStore.getState().markSessionLoaded();
    expect(useSessionStore.getState().sessionLoaded).toBe(true);
  });

  it("markSessionLoaded is idempotent", () => {
    useSessionStore.getState().markSessionLoaded();
    useSessionStore.getState().markSessionLoaded();
    expect(useSessionStore.getState().sessionLoaded).toBe(true);
  });

  // ── hydrateFromEngine ─────────────────────────────────────────────────────

  it("hydrateFromEngine updates only the supplied keys", () => {
    useSessionStore.setState({ filePath: "old.els", dirty: false });
    useSessionStore.getState().hydrateFromEngine({ filePath: "new.els", dirty: true });
    const s = useSessionStore.getState();
    expect(s.filePath).toBe("new.els");
    expect(s.dirty).toBe(true);
    // Unsupplied keys stay unchanged
    expect(s.recentFiles).toEqual([]);
    expect(s.graphs).toEqual([]);
  });

  it("hydrateFromEngine does not clobber existing recentFiles when not supplied", () => {
    useSessionStore.setState({ recentFiles: ["a.els", "b.els"] });
    useSessionStore.getState().hydrateFromEngine({ filePath: "c.els" });
    expect(useSessionStore.getState().recentFiles).toEqual(["a.els", "b.els"]);
  });

  it("hydrateFromEngine replaces graphs when supplied", () => {
    const graphs = [{ id: "g1", name: "Graph 1", index: 0, active: true }];
    useSessionStore.getState().hydrateFromEngine({ graphs });
    expect(useSessionStore.getState().graphs).toEqual(graphs);
  });

  // ── Selector (observer-fired shape) ──────────────────────────────────────

  it("selectSessionLoaded returns false before mark, true after", () => {
    expect(selectSessionLoaded(useSessionStore.getState())).toBe(false);
    useSessionStore.getState().markSessionLoaded();
    expect(selectSessionLoaded(useSessionStore.getState())).toBe(true);
  });
});
