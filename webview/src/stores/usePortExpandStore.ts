import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * usePortExpandStore — per-Block "show all ports" flag.
 *
 * Some plugins expose a huge fixed I/O (Kontakt = 64 audio outs; Audio Out = 16)
 * which, rendered one-row-per-port, produces an unusable giant column. Block.tsx
 * CAPS the visible essential-port rows per side (portCap.ts) and offers a
 * "+N more" expander; this store remembers, per node, whether the user revealed
 * the full list — so the choice survives the 60Hz snapshot re-renders and a
 * reload (the host has no such field; this is a pure client UX flag).
 *
 * Mirrors useFacePinStore: a positive opt-in keyed per node id, default false
 * (capped/lean), persisted to localStorage. NOTHING-fake: the flag only governs
 * how many of the node's REAL ports render; every Handle stays mounted so cables
 * never orphan (see portCap.ts rule 2).
 */

interface PortExpandState {
  /** node id → true when the user expanded that Block's full port list. */
  expandedByNode: Record<string, boolean>;
}

interface PortExpandActions {
  /** Toggle (or set) whether a Block shows all its capped ports. */
  setExpanded: (nodeId: string, expanded: boolean) => void;
}

export type PortExpandStore = PortExpandState & PortExpandActions;

export const usePortExpandStore = create<PortExpandStore>()(
  persist(
    (set) => ({
      expandedByNode: {},

      setExpanded: (nodeId, expanded) =>
        set((s) => {
          const has = !!s.expandedByNode[nodeId];
          if (expanded === has) return s; // no-op ⇒ stable reference
          const expandedByNode = { ...s.expandedByNode };
          if (expanded) expandedByNode[nodeId] = true;
          else delete expandedByNode[nodeId];
          return { expandedByNode };
        }),
    }),
    {
      name: "element-port-expand",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ expandedByNode: s.expandedByNode }),
    },
  ),
);

/** Selector: whether a node's full port list is expanded (false default). */
export const selectPortExpanded =
  (nodeId: string) =>
  (s: PortExpandStore): boolean =>
    !!s.expandedByNode[nodeId];
