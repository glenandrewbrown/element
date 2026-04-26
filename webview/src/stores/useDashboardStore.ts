import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      widgets: [],
      editing: false,
      selectedId: null,

      addWidget: (kind) =>
        set((s) => {
          const id = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
          const def = KIND_DEFAULTS[kind];
          // Stagger new widgets slightly so they don't all stack at (24, 24)
          const offset = s.widgets.length * 16;
          const x = 24 + (offset % 128);
          const y = 24 + Math.floor(offset / 128) * 20;
          return {
            widgets: [
              ...s.widgets,
              { id, kind, x, y, ...def },
            ],
            selectedId: id,
          };
        }),

      updateWidget: (id, patch) =>
        set((s) => ({
          widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        })),

      removeWidget: (id) =>
        set((s) => ({
          widgets: s.widgets.filter((w) => w.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

      bindWidget: (id, nodeId, paramIndex) =>
        set((s) => ({
          widgets: s.widgets.map((w) =>
            w.id === id ? { ...w, nodeId, paramIndex } : w,
          ),
        })),

      setEditing: (e) => set({ editing: e, selectedId: null }),

      selectWidget: (id) => set({ selectedId: id }),

      clear: () => set({ widgets: [], selectedId: null }),
    }),
    {
      name: "element-dashboard-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// ── Selectors ──

export const selectWidgets = (s: DashboardState) => s.widgets;
export const selectDashEditing = (s: DashboardState) => s.editing;
export const selectDashSelectedId = (s: DashboardState) => s.selectedId;
