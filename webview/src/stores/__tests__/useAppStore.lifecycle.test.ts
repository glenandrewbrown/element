/**
 * useAppStore — lifecycle action gaps not covered elsewhere.
 *
 * Covers:
 *   markHostReady — sets hostReady: true
 *   requestGraphStateRefresh — increments refreshNonce
 *   toggleMode — cycles edit↔perform AND increments refreshNonce
 *   toggleMode — selector helpers (selectIsEditMode / selectIsPerformMode) reflect change
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installJuceBridgeMock, type JuceBridgeMock } from "../../test/mockJuceBridge";
import {
  useAppStore,
  selectMode,
  selectIsEditMode,
  selectIsPerformMode,
} from "../useAppStore";

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

describe("useAppStore — lifecycle", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    useAppStore.setState(INITIAL, false);
  });

  afterEach(() => {
    bridge.uninstall();
  });

  // ── markHostReady ──────────────────────────────────────────────────────────

  it("markHostReady sets hostReady to true", () => {
    expect(useAppStore.getState().hostReady).toBe(false);
    useAppStore.getState().markHostReady();
    expect(useAppStore.getState().hostReady).toBe(true);
  });

  it("markHostReady is idempotent", () => {
    useAppStore.getState().markHostReady();
    useAppStore.getState().markHostReady();
    expect(useAppStore.getState().hostReady).toBe(true);
  });

  // ── requestGraphStateRefresh ───────────────────────────────────────────────

  it("requestGraphStateRefresh increments refreshNonce by 1", () => {
    const before = useAppStore.getState().refreshNonce;
    useAppStore.getState().requestGraphStateRefresh();
    expect(useAppStore.getState().refreshNonce).toBe(before + 1);
  });

  it("requestGraphStateRefresh increments on each call", () => {
    useAppStore.getState().requestGraphStateRefresh();
    useAppStore.getState().requestGraphStateRefresh();
    useAppStore.getState().requestGraphStateRefresh();
    expect(useAppStore.getState().refreshNonce).toBe(3);
  });

  // ── toggleMode ─────────────────────────────────────────────────────────────

  it("toggleMode switches edit → perform", () => {
    useAppStore.setState({ mode: "edit" });
    useAppStore.getState().toggleMode();
    expect(useAppStore.getState().mode).toBe("perform");
  });

  it("toggleMode switches perform → edit", () => {
    useAppStore.setState({ mode: "perform" });
    useAppStore.getState().toggleMode();
    expect(useAppStore.getState().mode).toBe("edit");
  });

  it("toggleMode increments refreshNonce", () => {
    const before = useAppStore.getState().refreshNonce;
    useAppStore.getState().toggleMode();
    expect(useAppStore.getState().refreshNonce).toBe(before + 1);
  });

  it("toggleMode increments refreshNonce on each call", () => {
    useAppStore.getState().toggleMode(); // edit→perform, nonce=1
    useAppStore.getState().toggleMode(); // perform→edit, nonce=2
    expect(useAppStore.getState().refreshNonce).toBe(2);
    expect(useAppStore.getState().mode).toBe("edit");
  });

  // ── mode selectors ─────────────────────────────────────────────────────────

  it("selectMode returns current mode", () => {
    expect(selectMode(useAppStore.getState())).toBe("edit");
    useAppStore.getState().toggleMode();
    expect(selectMode(useAppStore.getState())).toBe("perform");
  });

  it("selectIsEditMode is true in edit mode, false in perform", () => {
    expect(selectIsEditMode(useAppStore.getState())).toBe(true);
    useAppStore.getState().toggleMode();
    expect(selectIsEditMode(useAppStore.getState())).toBe(false);
  });

  it("selectIsPerformMode is false in edit mode, true in perform", () => {
    expect(selectIsPerformMode(useAppStore.getState())).toBe(false);
    useAppStore.getState().toggleMode();
    expect(selectIsPerformMode(useAppStore.getState())).toBe(true);
  });
});
