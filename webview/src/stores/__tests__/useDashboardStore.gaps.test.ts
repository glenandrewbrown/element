/**
 * useDashboardStore — gap coverage.
 *
 * Uncovered branches (lines 56, 134-139, 144):
 *   1. _scheduleSave hydrating guard — save debounce skipped during loadDashboardLayoutFromHost
 *   2. bindWidget — links widget to a nodeId + paramIndex
 *   3. selectWidget — sets selectedId
 *   4. loadDashboardLayoutFromHost — non-array response leaves widgets unchanged
 *   5. loadDashboardLayoutFromHost — always sets dashboardLoaded=true even on error
 *   6. removeWidget — clears selectedId when removing the selected widget
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  useDashboardStore,
  loadDashboardLayoutFromHost,
  selectDashboardLoaded,
  selectWidgets,
  selectDashEditing,
  selectDashSelectedId,
} from "../useDashboardStore";
import type { DashboardWidget } from "../useDashboardStore";

function resetStore() {
  useDashboardStore.setState({
    widgets: [],
    editing: false,
    selectedId: null,
    dashboardLoaded: false,
  });
}

const W1: DashboardWidget = { id: "w1", kind: "knob", x: 0, y: 0, w: 64, h: 80, color: "blue" };
const W2: DashboardWidget = { id: "w2", kind: "fader", x: 100, y: 0, w: 36, h: 140, color: "orange" };

// ── bindWidget ───────────────────────────────────────────────────────────────

describe("useDashboardStore.bindWidget", () => {
  beforeEach(() => {
    resetStore();
    useDashboardStore.setState({ widgets: [W1, W2] });
    mockInvoke.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("sets nodeId and paramIndex on the matched widget", () => {
    useDashboardStore.getState().bindWidget("w1", "node-synth", 3);
    const w = useDashboardStore.getState().widgets.find((x) => x.id === "w1");
    expect(w?.nodeId).toBe("node-synth");
    expect(w?.paramIndex).toBe(3);
  });

  it("does not mutate other widgets", () => {
    useDashboardStore.getState().bindWidget("w1", "n1", 0);
    const w2 = useDashboardStore.getState().widgets.find((x) => x.id === "w2");
    expect(w2?.nodeId).toBeUndefined();
  });

  it("schedules a save via invokeElementNative after binding", async () => {
    vi.useFakeTimers();
    useDashboardStore.getState().bindWidget("w1", "n1", 1);
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(mockInvoke).toHaveBeenCalledWith(
      "elementDashboardSetLayout",
      expect.arrayContaining([expect.objectContaining({ widgets: expect.any(Array) })]),
    );
    vi.useRealTimers();
  });
});

// ── selectWidget ─────────────────────────────────────────────────────────────

describe("useDashboardStore.selectWidget", () => {
  beforeEach(() => { resetStore(); useDashboardStore.setState({ widgets: [W1, W2] }); });

  it("sets selectedId to the given id", () => {
    useDashboardStore.getState().selectWidget("w2");
    expect(useDashboardStore.getState().selectedId).toBe("w2");
  });

  it("sets selectedId to null to deselect", () => {
    useDashboardStore.setState({ selectedId: "w1" });
    useDashboardStore.getState().selectWidget(null);
    expect(useDashboardStore.getState().selectedId).toBeNull();
  });
});

// ── removeWidget — selectedId clearing ───────────────────────────────────────

describe("useDashboardStore.removeWidget — selectedId clearing", () => {
  beforeEach(() => {
    resetStore();
    useDashboardStore.setState({ widgets: [W1, W2], selectedId: "w1" });
    mockInvoke.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("clears selectedId when removing the currently selected widget", () => {
    useDashboardStore.getState().removeWidget("w1");
    expect(useDashboardStore.getState().selectedId).toBeNull();
  });

  it("keeps selectedId when removing a different widget", () => {
    useDashboardStore.getState().removeWidget("w2");
    expect(useDashboardStore.getState().selectedId).toBe("w1");
  });
});

// ── loadDashboardLayoutFromHost — hydrating guard ────────────────────────────

describe("loadDashboardLayoutFromHost — hydrating guard prevents re-save", () => {
  beforeEach(() => {
    resetStore();
    mockInvoke.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("does not fire save debounce while hydrating", async () => {
    vi.useFakeTimers();
    const incoming: DashboardWidget[] = [W1, W2];
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "elementDashboardGetLayout") return incoming;
      return undefined;
    });

    await loadDashboardLayoutFromHost();

    // Advance timer — save debounce should NOT fire (hydrating=true during setState)
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    const saveCalls = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === "elementDashboardSetLayout",
    );
    expect(saveCalls).toHaveLength(0);
    vi.useRealTimers();
  });

  it("sets dashboardLoaded=true after successful load", async () => {
    mockInvoke.mockResolvedValueOnce([W1]);
    await loadDashboardLayoutFromHost();
    expect(selectDashboardLoaded(useDashboardStore.getState())).toBe(true);
  });

  it("sets dashboardLoaded=true even when bridge returns non-array", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    await loadDashboardLayoutFromHost();
    expect(selectDashboardLoaded(useDashboardStore.getState())).toBe(true);
    expect(useDashboardStore.getState().widgets).toEqual([]);
  });

  it("sets dashboardLoaded=true even when bridge throws", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("bridge fail"));
    // try-finally propagates the rejection — swallow it; side effect is what matters
    await loadDashboardLayoutFromHost().catch(() => {});
    expect(selectDashboardLoaded(useDashboardStore.getState())).toBe(true);
  });

  it("replaces widget list with array returned from host", async () => {
    const incoming: DashboardWidget[] = [W1, W2];
    mockInvoke.mockResolvedValueOnce(incoming);
    await loadDashboardLayoutFromHost();
    expect(useDashboardStore.getState().widgets).toEqual(incoming);
  });
});

// ── selectors ────────────────────────────────────────────────────────────────

describe("useDashboardStore selectors", () => {
  beforeEach(resetStore);

  it("selectWidgets reflects widget list", () => {
    useDashboardStore.setState({ widgets: [W1] });
    expect(selectWidgets(useDashboardStore.getState())).toEqual([W1]);
  });

  it("selectDashEditing reflects editing flag", () => {
    useDashboardStore.getState().setEditing(true);
    expect(selectDashEditing(useDashboardStore.getState())).toBe(true);
  });

  it("selectDashSelectedId reflects selectedId", () => {
    useDashboardStore.setState({ selectedId: "w2" });
    expect(selectDashSelectedId(useDashboardStore.getState())).toBe("w2");
  });
});
