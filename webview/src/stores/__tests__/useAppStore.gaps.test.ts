/**
 * useAppStore.gaps.test.ts — covers actions NOT tested in useAppStore.test.ts.
 *
 * Missing coverage (60.4% → target 80%+):
 *   openBlockTab / closeBlockTab
 *   saveSpatialBookmark / getSpatialBookmark
 *   toggleCableRouting / setCableRouting / selectCableRouting
 *   toggleVirtualKeyboard / selectVirtualKeyboardOpen
 *   setScene (cross-store: appStore.activeScene + performStore.activateScene)
 *   selectOpenBlockTabs / selectActiveScene selectors
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installJuceBridgeMock, type JuceBridgeMock } from "../../test/mockJuceBridge";
import {
  selectCableRouting,
  selectActiveScene,
  selectOpenBlockTabs,
  selectVirtualKeyboardOpen,
  useAppStore,
} from "../useAppStore";
import { usePerformStore } from "../usePerformStore";

// A partial state seed — zustand's setState merges partials, so we omit the
// action members (which are not reset between tests). `as const` keeps the
// literal union types (mode, cableRouting); the seed is applied via the
// non-replace setState overload below.
const INITIAL = {
  mode: "edit" as const,
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  virtualKeyboardOpen: false,
  activeScene: 0,
  openBlockTabs: [] as string[],
  spatialBookmarks: {},
  cableRouting: "manhattan" as const,
  hostReady: false,
  refreshNonce: 0,
};

describe("useAppStore — gap coverage", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    // Non-replace overload (replace=false) merges the partial seed, so the
    // omitted action members are preserved instead of being type-required.
    useAppStore.setState(INITIAL, false);
    // Reset perform store so activateScene side-effect is predictable
    usePerformStore.setState((s) => ({
      ...s,
      activeSceneIndex: 0,
      scenes: [],
    }));
  });

  afterEach(() => {
    bridge.uninstall();
  });

  // ── openBlockTab ───────────────────────────────────────────────────────────

  it("openBlockTab appends a new block ID", () => {
    useAppStore.getState().openBlockTab("block-1");
    expect(useAppStore.getState().openBlockTabs).toEqual(["block-1"]);
  });

  it("openBlockTab is idempotent — duplicate IDs not added", () => {
    useAppStore.getState().openBlockTab("block-1");
    useAppStore.getState().openBlockTab("block-1");
    expect(useAppStore.getState().openBlockTabs).toHaveLength(1);
  });

  it("openBlockTab can hold multiple distinct IDs", () => {
    useAppStore.getState().openBlockTab("block-a");
    useAppStore.getState().openBlockTab("block-b");
    expect(useAppStore.getState().openBlockTabs).toEqual(["block-a", "block-b"]);
  });

  // ── closeBlockTab ──────────────────────────────────────────────────────────

  it("closeBlockTab removes the specified block ID", () => {
    useAppStore.setState({ openBlockTabs: ["block-1", "block-2"] });
    useAppStore.getState().closeBlockTab("block-1");
    expect(useAppStore.getState().openBlockTabs).toEqual(["block-2"]);
  });

  it("closeBlockTab is a no-op when ID not present", () => {
    useAppStore.setState({ openBlockTabs: ["block-1"] });
    useAppStore.getState().closeBlockTab("nonexistent");
    expect(useAppStore.getState().openBlockTabs).toEqual(["block-1"]);
  });

  it("closeBlockTab on empty list stays empty", () => {
    useAppStore.getState().closeBlockTab("any");
    expect(useAppStore.getState().openBlockTabs).toHaveLength(0);
  });

  // ── selectOpenBlockTabs selector ───────────────────────────────────────────

  it("selectOpenBlockTabs returns current tabs array", () => {
    useAppStore.setState({ openBlockTabs: ["x", "y"] });
    expect(selectOpenBlockTabs(useAppStore.getState())).toEqual(["x", "y"]);
  });

  // ── saveSpatialBookmark / getSpatialBookmark ───────────────────────────────

  it("saveSpatialBookmark stores a bookmark under the given slot key", () => {
    useAppStore.getState().saveSpatialBookmark("0", { x: 10, y: 20, zoom: 1.5 });
    expect(useAppStore.getState().spatialBookmarks["0"]).toEqual({ x: 10, y: 20, zoom: 1.5 });
  });

  it("getSpatialBookmark retrieves a stored bookmark", () => {
    useAppStore.getState().saveSpatialBookmark("slot-A", { x: 100, y: 200, zoom: 2 });
    const bm = useAppStore.getState().getSpatialBookmark("slot-A");
    expect(bm).toEqual({ x: 100, y: 200, zoom: 2 });
  });

  it("getSpatialBookmark returns undefined for unknown slot", () => {
    expect(useAppStore.getState().getSpatialBookmark("missing")).toBeUndefined();
  });

  it("saveSpatialBookmark overwrites an existing slot", () => {
    useAppStore.getState().saveSpatialBookmark("1", { x: 0, y: 0, zoom: 1 });
    useAppStore.getState().saveSpatialBookmark("1", { x: 99, y: 88, zoom: 3 });
    expect(useAppStore.getState().getSpatialBookmark("1")).toEqual({ x: 99, y: 88, zoom: 3 });
  });

  it("saveSpatialBookmark preserves other bookmarks", () => {
    useAppStore.getState().saveSpatialBookmark("A", { x: 1, y: 2, zoom: 1 });
    useAppStore.getState().saveSpatialBookmark("B", { x: 3, y: 4, zoom: 2 });
    expect(useAppStore.getState().spatialBookmarks["A"]).toEqual({ x: 1, y: 2, zoom: 1 });
    expect(useAppStore.getState().spatialBookmarks["B"]).toEqual({ x: 3, y: 4, zoom: 2 });
  });

  // ── toggleCableRouting ─────────────────────────────────────────────────────

  it("toggleCableRouting switches from manhattan to bezier", () => {
    useAppStore.getState().toggleCableRouting();
    expect(useAppStore.getState().cableRouting).toBe("bezier");
  });

  it("toggleCableRouting switches back from bezier to manhattan", () => {
    useAppStore.setState({ cableRouting: "bezier" });
    useAppStore.getState().toggleCableRouting();
    expect(useAppStore.getState().cableRouting).toBe("manhattan");
  });

  it("toggleCableRouting is a toggle (repeated calls cycle)", () => {
    useAppStore.getState().toggleCableRouting(); // bezier
    useAppStore.getState().toggleCableRouting(); // manhattan
    useAppStore.getState().toggleCableRouting(); // bezier
    expect(useAppStore.getState().cableRouting).toBe("bezier");
  });

  // ── setCableRouting ────────────────────────────────────────────────────────

  it("setCableRouting sets bezier directly", () => {
    useAppStore.getState().setCableRouting("bezier");
    expect(useAppStore.getState().cableRouting).toBe("bezier");
  });

  it("setCableRouting sets manhattan directly", () => {
    useAppStore.setState({ cableRouting: "bezier" });
    useAppStore.getState().setCableRouting("manhattan");
    expect(useAppStore.getState().cableRouting).toBe("manhattan");
  });

  // ── selectCableRouting selector ────────────────────────────────────────────

  it("selectCableRouting returns current routing value", () => {
    expect(selectCableRouting(useAppStore.getState())).toBe("manhattan");
    useAppStore.getState().setCableRouting("bezier");
    expect(selectCableRouting(useAppStore.getState())).toBe("bezier");
  });

  // ── toggleVirtualKeyboard ──────────────────────────────────────────────────

  it("toggleVirtualKeyboard opens the keyboard when closed", () => {
    expect(useAppStore.getState().virtualKeyboardOpen).toBe(false);
    useAppStore.getState().toggleVirtualKeyboard();
    expect(useAppStore.getState().virtualKeyboardOpen).toBe(true);
  });

  it("toggleVirtualKeyboard closes the keyboard when open", () => {
    useAppStore.setState({ virtualKeyboardOpen: true });
    useAppStore.getState().toggleVirtualKeyboard();
    expect(useAppStore.getState().virtualKeyboardOpen).toBe(false);
  });

  it("selectVirtualKeyboardOpen reflects current state", () => {
    expect(selectVirtualKeyboardOpen(useAppStore.getState())).toBe(false);
    useAppStore.getState().toggleVirtualKeyboard();
    expect(selectVirtualKeyboardOpen(useAppStore.getState())).toBe(true);
  });

  // ── setScene ───────────────────────────────────────────────────────────────

  it("setScene updates appStore.activeScene", () => {
    useAppStore.getState().setScene(3);
    expect(useAppStore.getState().activeScene).toBe(3);
  });

  it("selectActiveScene reflects setScene call", () => {
    useAppStore.getState().setScene(2);
    expect(selectActiveScene(useAppStore.getState())).toBe(2);
  });

  it("setScene(0) stays at 0 (boundary)", () => {
    useAppStore.getState().setScene(5);
    useAppStore.getState().setScene(0);
    expect(useAppStore.getState().activeScene).toBe(0);
  });

  // ── edge: multiple rapid toggles don't lose state ────────────────────────

  it("rapid togglePanel calls each panel independently", () => {
    useAppStore.getState().togglePanel("left");
    useAppStore.getState().togglePanel("right");
    useAppStore.getState().togglePanel("bottom");
    const s = useAppStore.getState();
    expect(s.leftPanelOpen).toBe(false);
    expect(s.rightPanelOpen).toBe(false);
    expect(s.bottomPanelOpen).toBe(false);
  });
});
