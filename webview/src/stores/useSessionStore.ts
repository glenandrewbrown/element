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
}

interface SessionActions {
  hydrateFromEngine: (data: {
    filePath?: string;
    dirty?: boolean;
    recentFiles?: string[];
    graphs?: SessionGraphRow[];
  }) => void;
}

export const useSessionStore = create<SessionState & SessionActions>()(
  (set) => ({
    filePath: "",
    dirty: false,
    recentFiles: [],
    graphs: [],

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
  }),
);
