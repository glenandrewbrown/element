import { create } from "zustand";
import { invokeElementNative } from "../bridge/juceBackend";

export type WidgetKind = "knob" | "fader" | "button" | "meter";

export interface DashboardWidget {
  id: string;
  kind: WidgetKind;
  x: number;
  y: number;
  w: number;
  h: number;
  nodeId?: string;
  paramIndex?: number;
  label?: string;
  color?: "blue" | "orange" | "teal" | "red";
}

interface DashboardState {
  widgets: DashboardWidget[];
  editing: boolean;
  selectedId: string | null;
  /**
   * True once `loadDashboardLayoutFromHost()` has run to completion at
   * least once, regardless of whether widgets were returned. Mirror of
   * `useSessionStore.sessionLoaded`. Consumers gate "is dashboard
   * still hydrating?" UI on this. (T-P6-6)
   */
  dashboardLoaded: boolean;
  addWidget: (kind: WidgetKind) => void;
  updateWidget: (id: string, patch: Partial<DashboardWidget>) => void;
  removeWidget: (id: string) => void;
  bindWidget: (id: string, nodeId: string, paramIndex: number) => void;
  setEditing: (e: boolean) => void;
  selectWidget: (id: string | null) => void;
  clear: () => void;
}

const KIND_DEFAULTS: Record<
  WidgetKind,
  { w: number; h: number; color: DashboardWidget["color"] }
> = {
  knob: { w: 64, h: 80, color: "blue" },
  fader: { w: 36, h: 140, color: "orange" },
  button: { w: 72, h: 36, color: "teal" },
  meter: { w: 32, h: 100, color: "blue" },
};

// ── Bridge persistence helpers ──

/** True while hydrating from host — prevents the save debounce from firing. */
let _hydrating = false;

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function _scheduleSave(widgets: DashboardWidget[]): void {
  if (_hydrating) return;
  if (_saveTimer !== null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    void invokeElementNative("elementDashboardSetLayout", [{ widgets }]);
  }, 200);
}

/**
 * Load dashboard widget layout from the host ValueTree and replace the store's
 * widget list. Sets _hydrating while applying so the debounced save does not
 * re-fire and overwrite.
 */
export async function loadDashboardLayoutFromHost(): Promise<void> {
  try {
    const raw = await invokeElementNative("elementDashboardGetLayout", []);
    if (Array.isArray(raw)) {
      const widgets = raw as DashboardWidget[];
      _hydrating = true;
      try {
        useDashboardStore.setState({ widgets });
      } finally {
        _hydrating = false;
      }
    }
  } finally {
    useDashboardStore.setState({ dashboardLoaded: true });
  }
}

export const selectDashboardLoaded = (
  s: { dashboardLoaded: boolean },
): boolean => s.dashboardLoaded;

export const useDashboardStore = create<DashboardState>()((set) => ({
  widgets: [],
  editing: false,
  selectedId: null,
  dashboardLoaded: false,

  addWidget: (kind) =>
    set((s) => {
      const id = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const def = KIND_DEFAULTS[kind];
      // Stagger new widgets slightly so they don't all stack at (24, 24)
      const offset = s.widgets.length * 16;
      const x = 24 + (offset % 128);
      const y = 24 + Math.floor(offset / 128) * 20;
      const next = {
        widgets: [
          ...s.widgets,
          { id, kind, x, y, ...def },
        ],
        selectedId: id,
      };
      _scheduleSave(next.widgets);
      return next;
    }),

  updateWidget: (id, patch) =>
    set((s) => {
      const next = s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w));
      _scheduleSave(next);
      return { widgets: next };
    }),

  removeWidget: (id) =>
    set((s) => {
      const next = s.widgets.filter((w) => w.id !== id);
      _scheduleSave(next);
      return {
        widgets: next,
        selectedId: s.selectedId === id ? null : s.selectedId,
      };
    }),

  bindWidget: (id, nodeId, paramIndex) =>
    set((s) => {
      const next = s.widgets.map((w) =>
        w.id === id ? { ...w, nodeId, paramIndex } : w,
      );
      _scheduleSave(next);
      return { widgets: next };
    }),

  setEditing: (e) => set({ editing: e, selectedId: null }),

  selectWidget: (id) => set({ selectedId: id }),

  clear: () => {
    _scheduleSave([]);
    set({ widgets: [], selectedId: null });
  },
}));

// ── Selectors ──

export const selectWidgets = (s: DashboardState) => s.widgets;
export const selectDashEditing = (s: DashboardState) => s.editing;
export const selectDashSelectedId = (s: DashboardState) => s.selectedId;
