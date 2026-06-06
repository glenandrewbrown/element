import { create } from "zustand";

/**
 * Live AudioProcessorParameter values streamed from the C++ host at ~15 Hz.
 * Keys are `${nodeUuid}:${paramIndex}`. Values are normalised 0–1 (the same
 * representation `setNodeParameterValue` writes back through the bridge).
 *
 * The store updates only changed entries (delta channel) and prunes stale
 * node entries when `pruneNodes` is called with the current set of node UUIDs.
 */

export type ParameterDelta = {
  nodeId: string;
  params: Array<{ i: number; v: number }>;
};

interface ParameterState {
  values: Record<string, number>;
  applyDeltas: (deltas: ParameterDelta[]) => void;
  /** Drop entries for any nodeId not in the supplied set — call after graph topology change. */
  pruneNodes: (liveNodeIds: Iterable<string>) => void;
  /** Optimistic local update — call before bridge write so UI reflects the change immediately. */
  setLocal: (nodeId: string, paramIndex: number, value: number) => void;
  clear: () => void;
}

export const paramKey = (nodeId: string, paramIndex: number): string =>
  `${nodeId}:${paramIndex}`;

export const useParameterStore = create<ParameterState>()((set) => ({
  values: {},

  applyDeltas: (deltas) =>
    set((st) => {
      if (!Array.isArray(deltas) || deltas.length === 0) return st;
      // Defer the map copy until a delta ACTUALLY changes a value (ledger #7).
      // The host pushes deltas ~15Hz; a no-op/unchanged push must not spread-
      // copy the whole values map. `next` stays the old reference until the
      // first real change, then becomes a single fresh copy reused thereafter.
      let next = st.values;
      for (const d of deltas) {
        if (!d || typeof d.nodeId !== "string" || !Array.isArray(d.params))
          continue;
        for (const p of d.params) {
          if (!p || typeof p.i !== "number" || typeof p.v !== "number")
            continue;
          const k = paramKey(d.nodeId, p.i);
          if (st.values[k] !== p.v) {
            if (next === st.values) next = { ...st.values }; // copy once, lazily
            next[k] = p.v;
          }
        }
      }
      return next === st.values ? st : { values: next };
    }),

  pruneNodes: (liveNodeIds) =>
    set((st) => {
      const liveSet = new Set<string>();
      for (const id of liveNodeIds) liveSet.add(id);
      const next: Record<string, number> = {};
      let pruned = false;
      for (const k of Object.keys(st.values)) {
        const colon = k.indexOf(":");
        const nid = colon >= 0 ? k.slice(0, colon) : k;
        if (liveSet.has(nid)) next[k] = st.values[k];
        else pruned = true;
      }
      return pruned ? { values: next } : st;
    }),

  setLocal: (nodeId, paramIndex, value) =>
    set((st) => {
      const k = paramKey(nodeId, paramIndex);
      if (st.values[k] === value) return st;
      return { values: { ...st.values, [k]: value } };
    }),

  clear: () => set({ values: {} }),
}));

/** Selector helper: subscribe to a single parameter value. */
export const selectParamValue =
  (nodeId: string, paramIndex: number) =>
  (st: ParameterState): number | undefined =>
    st.values[paramKey(nodeId, paramIndex)];
