/**
 * useAppStore.panels.test.ts — Task 3.B: persist + unify the collapse rails.
 *
 * Covers the panel-layout state added for owner feedback #8 ("both panels
 * collapsible, lean, max canvas"):
 *   - partialize PERSISTS {left/right/bottomOpen, leftWidth, rightWidth,
 *     inspectorUserCollapsed} to localStorage (today it persisted nothing).
 *   - a re-mount of the persisted store re-hydrates the collapsed state (set
 *     collapsed → re-hydrate → still collapsed) — the brief §4.4 prescription.
 *   - hideAllPanels / restorePanels round-trip the prior layout (Cmd+. support).
 *   - togglePanel('right') tracks inspectorUserCollapsed (selection-driven
 *     auto-expand must respect a deliberate collapse).
 *   - requestFocusBrowserSearch bumps the nonce (Cmd+F store-driven focus).
 *   - session-only signals (focusBrowserSearch, panelsHiddenSnapshot) are NOT
 *     persisted.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installJuceBridgeMock, type JuceBridgeMock } from "../../test/mockJuceBridge";
import {
  selectFocusBrowserSearch,
  selectInspectorUserCollapsed,
  selectLeftWidth,
  selectPanelsHidden,
  selectRightWidth,
  useAppStore,
} from "../useAppStore";

const STORAGE_KEY = "element-app-ui";

function persistedState(): Record<string, unknown> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  // zustand/persist wraps payload as { state, version }.
  return (JSON.parse(raw).state ?? null) as Record<string, unknown> | null;
}

/**
 * Write a persisted payload DIRECTLY to localStorage (bypassing the store's own
 * setState, which would trigger a fresh persist write and clobber what we want
 * to re-hydrate). This models the on-disk state a brand-new page load reads at
 * store-construction time.
 */
function seedPersisted(state: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 0 }));
}

describe("useAppStore — panel layout (Task 3.B)", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    localStorage.clear();
    useAppStore.setState(
      {
        leftPanelOpen: true,
        rightPanelOpen: true,
        bottomPanelOpen: true,
        leftWidth: 260,
        rightWidth: 280,
        inspectorUserCollapsed: false,
        focusBrowserSearch: 0,
        panelsHiddenSnapshot: null,
      },
      false,
    );
  });

  afterEach(() => {
    bridge.uninstall();
    localStorage.clear();
  });

  // ── persistence ────────────────────────────────────────────────────────────

  it("persists panel open/width/collapse fields to localStorage", () => {
    useAppStore.setState({ leftPanelOpen: false, rightWidth: 320 });
    // zustand/persist writes synchronously on set in jsdom.
    const state = persistedState();
    expect(state).not.toBeNull();
    expect(state).toMatchObject({
      leftPanelOpen: false,
      rightPanelOpen: true,
      bottomPanelOpen: true,
      leftWidth: 260,
      rightWidth: 320,
      inspectorUserCollapsed: false,
    });
  });

  it("does NOT persist the session-only signals (focusBrowserSearch, panelsHiddenSnapshot)", () => {
    useAppStore.getState().requestFocusBrowserSearch();
    useAppStore.getState().hideAllPanels();
    const state = persistedState()!;
    expect(state).not.toHaveProperty("focusBrowserSearch");
    expect(state).not.toHaveProperty("panelsHiddenSnapshot");
  });

  it("a live collapse is written through to storage (the persist payload)", () => {
    // The store WRITE side: collapsing the left panel + the inspector lands the
    // collapsed booleans in the persisted payload (so a future reload can read
    // them). The READ side is covered by the re-hydrate test below.
    useAppStore.getState().togglePanel("left"); // leftPanelOpen → false
    useAppStore.getState().togglePanel("right"); // rightPanelOpen → false, userCollapsed → true
    expect(persistedState()).toMatchObject({
      leftPanelOpen: false,
      rightPanelOpen: false,
      inspectorUserCollapsed: true,
    });
  });

  it("re-mount re-hydrates collapsed state (persisted collapsed → re-hydrate → still collapsed)", async () => {
    // Model a brand-new page load: the on-disk payload already says collapsed,
    // and the freshly-constructed store starts at the "open" defaults. A page
    // reload reads storage at construction; here we seed storage directly (so
    // it is NOT clobbered by a setState write) and drive `persist.rehydrate()`,
    // which is exactly what zustand runs on init. The merge must pull the
    // collapsed booleans back FROM storage.
    seedPersisted({
      leftPanelOpen: false,
      rightPanelOpen: false,
      bottomPanelOpen: true,
      leftWidth: 260,
      rightWidth: 280,
      inspectorUserCollapsed: true,
    });
    // Live store currently at open defaults (from beforeEach).
    expect(useAppStore.getState().leftPanelOpen).toBe(true);

    await useAppStore.persist.rehydrate();

    const s = useAppStore.getState();
    expect(s.leftPanelOpen).toBe(false);
    expect(s.rightPanelOpen).toBe(false);
    expect(s.inspectorUserCollapsed).toBe(true);
    // mode is always coerced back to "edit" by the merge (Perform shelved).
    expect(s.mode).toBe("edit");
  });

  it("re-hydrate restores persisted widths", async () => {
    seedPersisted({
      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelOpen: true,
      leftWidth: 220,
      rightWidth: 340,
      inspectorUserCollapsed: false,
    });
    await useAppStore.persist.rehydrate();
    expect(selectLeftWidth(useAppStore.getState())).toBe(220);
    expect(selectRightWidth(useAppStore.getState())).toBe(340);
  });

  it("legacy persisted mode:'perform' is coerced back to edit on re-hydrate", async () => {
    // The merge guard (Perform shelved) must survive the new partialize.
    seedPersisted({
      mode: "perform",
      leftPanelOpen: false,
      rightPanelOpen: true,
      bottomPanelOpen: true,
      leftWidth: 260,
      rightWidth: 280,
      inspectorUserCollapsed: false,
    });
    await useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect(s.mode).toBe("edit");
    expect(s.leftPanelOpen).toBe(false); // panel state still restored
  });

  // ── hideAllPanels / restorePanels ────────────────────────────────────────

  it("hideAllPanels closes every panel and snapshots the prior layout", () => {
    useAppStore.setState({
      leftPanelOpen: true,
      rightPanelOpen: false,
      bottomPanelOpen: true,
    });
    useAppStore.getState().hideAllPanels();
    const s = useAppStore.getState();
    expect(s.leftPanelOpen).toBe(false);
    expect(s.rightPanelOpen).toBe(false);
    expect(s.bottomPanelOpen).toBe(false);
    expect(selectPanelsHidden(useAppStore.getState())).toBe(true);
  });

  it("restorePanels puts the EXACT prior layout back", () => {
    useAppStore.setState({
      leftPanelOpen: true,
      rightPanelOpen: false,
      bottomPanelOpen: true,
    });
    useAppStore.getState().hideAllPanels();
    useAppStore.getState().restorePanels();
    const s = useAppStore.getState();
    expect(s.leftPanelOpen).toBe(true);
    expect(s.rightPanelOpen).toBe(false); // was closed before hide — stays closed
    expect(s.bottomPanelOpen).toBe(true);
    expect(selectPanelsHidden(useAppStore.getState())).toBe(false);
  });

  it("hideAllPanels is idempotent — a second call does not overwrite the snapshot", () => {
    useAppStore.setState({
      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelOpen: false,
    });
    useAppStore.getState().hideAllPanels();
    // A repeat (held key / double fire) must NOT capture the all-hidden layout.
    useAppStore.getState().hideAllPanels();
    useAppStore.getState().restorePanels();
    const s = useAppStore.getState();
    expect(s.leftPanelOpen).toBe(true);
    expect(s.rightPanelOpen).toBe(true);
    expect(s.bottomPanelOpen).toBe(false);
  });

  it("restorePanels is a no-op when nothing was hidden", () => {
    useAppStore.setState({ leftPanelOpen: true, rightPanelOpen: true });
    useAppStore.getState().restorePanels();
    const s = useAppStore.getState();
    expect(s.leftPanelOpen).toBe(true);
    expect(s.rightPanelOpen).toBe(true);
  });

  it("an explicit togglePanel clears the hide-all snapshot", () => {
    useAppStore.getState().hideAllPanels();
    expect(selectPanelsHidden(useAppStore.getState())).toBe(true);
    useAppStore.getState().togglePanel("left");
    expect(selectPanelsHidden(useAppStore.getState())).toBe(false);
  });

  // ── inspectorUserCollapsed tracking ──────────────────────────────────────

  it("togglePanel('right') closing the inspector sets inspectorUserCollapsed", () => {
    useAppStore.setState({ rightPanelOpen: true, inspectorUserCollapsed: false });
    useAppStore.getState().togglePanel("right"); // close
    expect(selectInspectorUserCollapsed(useAppStore.getState())).toBe(true);
  });

  it("togglePanel('right') opening the inspector clears inspectorUserCollapsed", () => {
    useAppStore.setState({ rightPanelOpen: false, inspectorUserCollapsed: true });
    useAppStore.getState().togglePanel("right"); // open
    expect(selectInspectorUserCollapsed(useAppStore.getState())).toBe(false);
  });

  // ── focusBrowserSearch nonce ─────────────────────────────────────────────

  it("requestFocusBrowserSearch increments the nonce monotonically", () => {
    const before = selectFocusBrowserSearch(useAppStore.getState());
    useAppStore.getState().requestFocusBrowserSearch();
    useAppStore.getState().requestFocusBrowserSearch();
    expect(selectFocusBrowserSearch(useAppStore.getState())).toBe(before + 2);
  });

  // ── setPanelWidth ──────────────────────────────────────────────────────────

  it("setPanelWidth writes the correct side", () => {
    useAppStore.getState().setPanelWidth("left", 300);
    expect(useAppStore.getState().leftWidth).toBe(300);
    expect(useAppStore.getState().rightWidth).toBe(280);
    useAppStore.getState().setPanelWidth("right", 360);
    expect(useAppStore.getState().rightWidth).toBe(360);
  });
});
