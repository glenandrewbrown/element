/**
 * Tests for `useDashboardStore` — dashboard widget layout state (T-P6-6).
 *
 * Covers:
 *   1) `markDashboardLoaded` (via `loadDashboardLayoutFromHost`) sets
 *      `dashboardLoaded` true
 *   2) `addWidget` creates a widget with KIND_DEFAULTS dimensions
 *   3) `updateWidget` patches a widget by id without touching others
 *   4) `removeWidget` deletes a widget by id
 *   5) `loadDashboardLayoutFromHost` happy path replaces widgets and sets
 *      `dashboardLoaded=true`; `_hydrating` prevents save during load
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the JUCE backend BEFORE importing any module that references it.
vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));

import { invokeElementNative } from "../../bridge/juceBackend";
import {
  loadDashboardLayoutFromHost,
  selectDashboardLoaded,
  selectWidgets,
  useDashboardStore,
  type DashboardWidget,
} from "../useDashboardStore";

const mockInvoke = invokeElementNative as unknown as ReturnType<typeof vi.fn>;

describe("useDashboardStore", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useDashboardStore.setState({
      widgets: [],
      editing: false,
      selectedId: null,
      dashboardLoaded: false,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mockInvoke.mockReset();
  });

  // ── addWidget ─────────────────────────────────────────────────────────────

  it("addWidget creates a knob widget with KIND_DEFAULTS dimensions (w=64, h=80)", () => {
    useDashboardStore.getState().addWidget("knob");
    const widgets = useDashboardStore.getState().widgets;
    expect(widgets).toHaveLength(1);
    const w = widgets[0];
    expect(w.kind).toBe("knob");
    expect(w.w).toBe(64);
    expect(w.h).toBe(80);
    expect(w.color).toBe("blue");
    expect(typeof w.id).toBe("string");
    expect(w.id.length).toBeGreaterThan(0);
  });

  it("addWidget creates a fader widget with KIND_DEFAULTS dimensions (w=36, h=140)", () => {
    useDashboardStore.getState().addWidget("fader");
    const w = useDashboardStore.getState().widgets[0];
    expect(w.kind).toBe("fader");
    expect(w.w).toBe(36);
    expect(w.h).toBe(140);
    expect(w.color).toBe("orange");
  });

  it("addWidget sets selectedId to the new widget's id", () => {
    useDashboardStore.getState().addWidget("button");
    const { widgets, selectedId } = useDashboardStore.getState();
    expect(selectedId).toBe(widgets[0].id);
  });

  // ── updateWidget ──────────────────────────────────────────────────────────

  it("updateWidget patches a widget by id and does not touch others", () => {
    useDashboardStore.getState().addWidget("knob");
    useDashboardStore.getState().addWidget("meter");
    const [first, second] = useDashboardStore.getState().widgets;
    useDashboardStore.getState().updateWidget(first.id, { label: "Volume", x: 100 });
    const updated = useDashboardStore.getState().widgets;
    expect(updated[0].label).toBe("Volume");
    expect(updated[0].x).toBe(100);
    expect(updated[1].id).toBe(second.id);
    expect(updated[1].label).toBeUndefined();
  });

  // ── removeWidget ──────────────────────────────────────────────────────────

  it("removeWidget deletes the widget by id", () => {
    useDashboardStore.getState().addWidget("knob");
    useDashboardStore.getState().addWidget("fader");
    const idToRemove = useDashboardStore.getState().widgets[0].id;
    useDashboardStore.getState().removeWidget(idToRemove);
    const widgets = useDashboardStore.getState().widgets;
    expect(widgets).toHaveLength(1);
    expect(widgets.every((w: DashboardWidget) => w.id !== idToRemove)).toBe(true);
  });

  it("removeWidget clears selectedId when the selected widget is removed", () => {
    useDashboardStore.getState().addWidget("knob");
    const id = useDashboardStore.getState().widgets[0].id;
    useDashboardStore.setState({ selectedId: id });
    useDashboardStore.getState().removeWidget(id);
    expect(useDashboardStore.getState().selectedId).toBeNull();
  });

  // ── loadDashboardLayoutFromHost ───────────────────────────────────────────

  it("loadDashboardLayoutFromHost replaces widgets and sets dashboardLoaded=true", async () => {
    const hostWidgets: DashboardWidget[] = [
      { id: "hw1", kind: "knob", x: 10, y: 20, w: 64, h: 80 },
    ];
    mockInvoke.mockResolvedValueOnce(hostWidgets);
    await loadDashboardLayoutFromHost();
    expect(useDashboardStore.getState().widgets).toEqual(hostWidgets);
    expect(useDashboardStore.getState().dashboardLoaded).toBe(true);
  });

  it("loadDashboardLayoutFromHost sets dashboardLoaded=true even when host returns non-array", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    await loadDashboardLayoutFromHost();
    expect(useDashboardStore.getState().dashboardLoaded).toBe(true);
    expect(useDashboardStore.getState().widgets).toEqual([]);
  });

  it("_hydrating prevents save debounce from firing during loadDashboardLayoutFromHost", async () => {
    const hostWidgets: DashboardWidget[] = [
      { id: "hw2", kind: "fader", x: 0, y: 0, w: 36, h: 140 },
    ];
    mockInvoke.mockResolvedValueOnce(hostWidgets);
    await loadDashboardLayoutFromHost();
    // Advance timers past debounce window to confirm no save was scheduled
    vi.advanceTimersByTime(400);
    const setCalls = mockInvoke.mock.calls.filter(
      (c: [string, unknown[]]) => c[0] === "elementDashboardSetLayout",
    );
    expect(setCalls).toHaveLength(0);
  });

  // ── Selector (observer-fired shape) ──────────────────────────────────────

  it("selectDashboardLoaded returns false initially, true after load", async () => {
    expect(selectDashboardLoaded(useDashboardStore.getState())).toBe(false);
    mockInvoke.mockResolvedValueOnce([]);
    await loadDashboardLayoutFromHost();
    expect(selectDashboardLoaded(useDashboardStore.getState())).toBe(true);
  });

  it("selectWidgets returns the current widget array", () => {
    useDashboardStore.getState().addWidget("button");
    const widgets = selectWidgets(useDashboardStore.getState());
    expect(widgets).toHaveLength(1);
    expect(widgets[0].kind).toBe("button");
  });
});
