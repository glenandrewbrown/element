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
   * Wall-clock ms of the last successful save / autosave from the host (G3).
   * The Toolbar fires a non-modal save-pulse when this value increases. 0 means
   * nothing has been saved this session.
   */
  savedAtMs: number;
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
    savedAtMs?: number;
  }) => void;
  markSessionLoaded: () => void;
}

export const useSessionStore = create<SessionState & SessionActions>()(
  (set) => ({
    filePath: "",
    dirty: false,
    recentFiles: [],
    graphs: [],
    savedAtMs: 0,
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
        savedAtMs:
          typeof data.savedAtMs === "number" ? data.savedAtMs : s.savedAtMs,
      })),

    markSessionLoaded: () => set({ sessionLoaded: true }),
  }),
);

export const selectSessionLoaded = (s: SessionState) => s.sessionLoaded;
export const selectSavedAtMs = (s: SessionState) => s.savedAtMs;
export const selectSessionFilePath = (s: SessionState) => s.filePath;
