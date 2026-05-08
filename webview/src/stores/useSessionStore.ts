import { create } from "zustand";

export type SessionGraphRow = {
  id: string;
  name: string;
  index: number;
  active: boolean;
};

interface SessionState {
  filePath: string;
  dirty: boolean;
  recentFiles: string[];
  graphs: SessionGraphRow[];
  /**
   * True once `applySnapshot` has run with a non-null payload at least
   * once. Consumers (e.g. graph canvas, browser panels) can gate render
   * on this to avoid the empty-state flash that occurs while the
   * `elementGetGraphState` round-trip is in flight (T-P6-1).
   */
  sessionLoaded: boolean;
}

interface SessionActions {
  hydrateFromEngine: (data: {
    filePath?: string;
    dirty?: boolean;
    recentFiles?: string[];
    graphs?: SessionGraphRow[];
  }) => void;
  markSessionLoaded: () => void;
}

export const useSessionStore = create<SessionState & SessionActions>()(
  (set) => ({
    filePath: "",
    dirty: false,
    recentFiles: [],
    graphs: [],
    sessionLoaded: false,

    hydrateFromEngine: (data) =>
      set((s) => ({
        filePath:
          typeof data.filePath === "string" ? data.filePath : s.filePath,
        dirty: typeof data.dirty === "boolean" ? data.dirty : s.dirty,
        recentFiles: Array.isArray(data.recentFiles)
          ? data.recentFiles.filter((p) => typeof p === "string")
          : s.recentFiles,
        graphs: Array.isArray(data.graphs) ? data.graphs : s.graphs,
      })),

    markSessionLoaded: () => set({ sessionLoaded: true }),
  }),
);

export const selectSessionLoaded = (s: SessionState) => s.sessionLoaded;
