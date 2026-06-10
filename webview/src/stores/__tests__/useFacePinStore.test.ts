/**
 * useFacePinStore.test.ts — BUG-1 (Glen 2026-06-10): the Block face must DEFAULT
 * TO ZERO pinned params (a 4096-param Kontakt previously rendered a giant column
 * because the face reused the empty `hiddenParams` hide-list as "all pinned").
 *
 * Covers the dedicated positive face-pin substrate:
 *   - default is EMPTY (no node has pins) → zero params on the face;
 *   - pin / unpin toggles a single id;
 *   - clearing the last pin drops the node key (no empty-array litter);
 *   - FACE_PIN_CAP is the documented overflow cap.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  useFacePinStore,
  selectFacePins,
  FACE_PIN_CAP,
} from "../useFacePinStore";

const reset = () => useFacePinStore.setState({ pinnedByNode: {} });

describe("useFacePinStore", () => {
  beforeEach(() => {
    localStorage.clear();
    reset();
  });

  it("DEFAULTS to zero pinned params for any node", () => {
    expect(selectFacePins("nodeA")(useFacePinStore.getState())).toEqual([]);
    expect(useFacePinStore.getState().pinnedByNode).toEqual({});
  });

  it("pins and unpins a single param id", () => {
    const { setPinned } = useFacePinStore.getState();
    setPinned("nodeA", "p1", true);
    expect(selectFacePins("nodeA")(useFacePinStore.getState())).toEqual(["p1"]);

    setPinned("nodeA", "p2", true);
    expect(selectFacePins("nodeA")(useFacePinStore.getState())).toEqual([
      "p1",
      "p2",
    ]);

    setPinned("nodeA", "p1", false);
    expect(selectFacePins("nodeA")(useFacePinStore.getState())).toEqual(["p2"]);
  });

  it("drops the node key when the last pin is removed (no empty-array litter)", () => {
    const { setPinned } = useFacePinStore.getState();
    setPinned("nodeA", "p1", true);
    setPinned("nodeA", "p1", false);
    expect("nodeA" in useFacePinStore.getState().pinnedByNode).toBe(false);
  });

  it("a redundant toggle is a no-op (stable reference)", () => {
    const { setPinned } = useFacePinStore.getState();
    setPinned("nodeA", "p1", true);
    const before = useFacePinStore.getState().pinnedByNode;
    setPinned("nodeA", "p1", true); // already pinned
    expect(useFacePinStore.getState().pinnedByNode).toBe(before);
  });

  it("setPinnedSet replaces the whole set and empties cleanly", () => {
    const { setPinnedSet } = useFacePinStore.getState();
    setPinnedSet("nodeA", ["a", "b", "c"]);
    expect(selectFacePins("nodeA")(useFacePinStore.getState())).toEqual([
      "a",
      "b",
      "c",
    ]);
    setPinnedSet("nodeA", []);
    expect("nodeA" in useFacePinStore.getState().pinnedByNode).toBe(false);
  });

  it("exposes a sane overflow cap", () => {
    expect(FACE_PIN_CAP).toBeGreaterThan(0);
    expect(FACE_PIN_CAP).toBeLessThanOrEqual(32);
  });
});
