/**
 * Tests for `useAppStore` — application-level UI state.
 *
 * Covers:
 *   1) `toggleMode` flips edit↔perform AND increments `refreshNonce`
 *   2) `markHostReady` sets `hostReady` to true (T-P6-5)
 *   3) `togglePanel` cycles each panel's open/closed state
 *   4) `requestGraphStateRefresh` increments `refreshNonce` independently
 *   5) Observer/selector shape — `selectMode` and `selectIsEditMode` return
 *      correct derived values after mutations.
 *
 * The sceneActivation chain (setScene → activateScene → bridge) is already
 * pinned by sceneActivation.test.ts and is NOT re-tested here.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installJuceBridgeMock, type JuceBridgeMock } from "../../test/mockJuceBridge";
import {
  selectIsEditMode,
  selectIsPerformMode,
  selectMode,
  useAppStore,
} from "../useAppStore";

describe("useAppStore", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    // Reset to a known initial state before every test.
    useAppStore.setState({
      mode: "edit",
      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelOpen: true,
      virtualKeyboardOpen: false,
      activeScene: 0,
      openBlockTabs: [],
      spatialBookmarks: {},
      cableRouting: "manhattan",
      hostReady: false,
      refreshNonce: 0,
    });
  });

  afterEach(() => {
    bridge.uninstall();
  });

  // ── toggleMode ────────────────────────────────────────────────────────────
  // QUARANTINE: toggleMode is a deliberate no-op (decision D3, 2026-05-30).
  // Perform mode is shelved from MVP UI. Restore when Perform mode is revived.

  it.skip("toggleMode flips mode from edit to perform", () => {
    useAppStore.getState().toggleMode();
    expect(useAppStore.getState().mode).toBe("perform");
  });

  it.skip("toggleMode increments refreshNonce", () => {
    expect(useAppStore.getState().refreshNonce).toBe(0);
    useAppStore.getState().toggleMode();
    expect(useAppStore.getState().refreshNonce).toBe(1);
    useAppStore.getState().toggleMode();
    expect(useAppStore.getState().refreshNonce).toBe(2);
  });

  it.skip("toggleMode toggles back to edit on second call", () => {
    useAppStore.getState().toggleMode();
    useAppStore.getState().toggleMode();
    expect(useAppStore.getState().mode).toBe("edit");
  });

  // ── markHostReady ─────────────────────────────────────────────────────────

  it("markHostReady flips hostReady from false to true", () => {
    expect(useAppStore.getState().hostReady).toBe(false);
    useAppStore.getState().markHostReady();
    expect(useAppStore.getState().hostReady).toBe(true);
  });

  it("markHostReady is idempotent — repeated calls stay true", () => {
    useAppStore.getState().markHostReady();
    useAppStore.getState().markHostReady();
    expect(useAppStore.getState().hostReady).toBe(true);
  });

  // ── togglePanel ───────────────────────────────────────────────────────────

  it("togglePanel closes the left panel", () => {
    expect(useAppStore.getState().leftPanelOpen).toBe(true);
    useAppStore.getState().togglePanel("left");
    expect(useAppStore.getState().leftPanelOpen).toBe(false);
  });

  it("togglePanel closes and re-opens the right panel", () => {
    useAppStore.getState().togglePanel("right");
    expect(useAppStore.getState().rightPanelOpen).toBe(false);
    useAppStore.getState().togglePanel("right");
    expect(useAppStore.getState().rightPanelOpen).toBe(true);
  });

  it("togglePanel handles bottom panel independently", () => {
    useAppStore.getState().togglePanel("bottom");
    expect(useAppStore.getState().bottomPanelOpen).toBe(false);
    expect(useAppStore.getState().leftPanelOpen).toBe(true);
    expect(useAppStore.getState().rightPanelOpen).toBe(true);
  });

  // ── requestGraphStateRefresh ──────────────────────────────────────────────

  it("requestGraphStateRefresh increments refreshNonce without toggling mode", () => {
    const before = useAppStore.getState().refreshNonce;
    useAppStore.getState().requestGraphStateRefresh();
    expect(useAppStore.getState().refreshNonce).toBe(before + 1);
    expect(useAppStore.getState().mode).toBe("edit");
  });

  // ── Selectors (observer-fired shape) ─────────────────────────────────────
  // QUARANTINE: these selector tests exercise toggleMode which is a no-op (D3).
  // Restore when Perform mode is revived.

  it.skip("selectMode returns current mode string", () => {
    expect(selectMode(useAppStore.getState())).toBe("edit");
    useAppStore.getState().toggleMode();
    expect(selectMode(useAppStore.getState())).toBe("perform");
  });

  it.skip("selectIsEditMode / selectIsPerformMode derive correctly", () => {
    expect(selectIsEditMode(useAppStore.getState())).toBe(true);
    expect(selectIsPerformMode(useAppStore.getState())).toBe(false);
    useAppStore.getState().toggleMode();
    expect(selectIsEditMode(useAppStore.getState())).toBe(false);
    expect(selectIsPerformMode(useAppStore.getState())).toBe(true);
  });
});
