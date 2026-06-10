import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * useFacePinStore — per-Block "pinned to the Macro face" param set.
 *
 * BUG-1 fix (Glen 2026-06-10): the Block face must DEFAULT TO ZERO pinned params.
 * Previously the face reused the node's `hiddenParams` hide-list and treated
 * `pinned = !hidden`; an empty hide-list (the default) therefore meant EVERY
 * Value/CV param was surfaced on the Macro face — a Kontakt with 4096 params
 * rendered a 4096-row column that "totally destroyed the size and proportions".
 *
 * This is a SEPARATE, POSITIVE opt-in substrate from `hiddenParams`:
 *   - `hiddenParams` (Configure Parameters… popover) governs whether a param
 *     renders at all in the expanded `▸ N params` lane. Untouched.
 *   - the face-pin set governs which params surface on the always-visible Macro
 *     face. Empty by default ⇒ nothing on the face until the user pins it.
 *
 * Persisted client-side (localStorage, keyed per node id) so deliberate pins
 * survive reload without a C++/bridge round-trip — the host has no face-pin
 * field, and the Inspector list stays the one place to pin. NOTHING-fake: a
 * pin only ever references a real Value/CV param port id; rendering still reads
 * the live port set, so a stale id for a removed port simply matches nothing.
 */

/** Hard cap on how many params a Block face may surface (see PinnedParamFace's
 *  overflow "+N more"). A safety net so a pathological persisted/imported state
 *  can never again blow out the block's proportions. */
export const FACE_PIN_CAP = 16;

interface FacePinState {
  /** node id → ordered array of pinned param-port ids. Absent ⇒ none pinned. */
  pinnedByNode: Record<string, string[]>;
}

interface FacePinActions {
  /** Pin or unpin a single param port on a Block's Macro face. */
  setPinned: (nodeId: string, portId: string, pinned: boolean) => void;
  /** Replace the full pinned set for a node (e.g. a future "pin all" / clear). */
  setPinnedSet: (nodeId: string, portIds: string[]) => void;
}

export type FacePinStore = FacePinState & FacePinActions;

export const useFacePinStore = create<FacePinStore>()(
  persist(
    (set) => ({
      pinnedByNode: {},

      setPinned: (nodeId, portId, pinned) =>
        set((s) => {
          const cur = s.pinnedByNode[nodeId] ?? [];
          const has = cur.includes(portId);
          if (pinned === has) return s; // no-op ⇒ stable reference
          const next = pinned
            ? [...cur, portId]
            : cur.filter((id) => id !== portId);
          const pinnedByNode = { ...s.pinnedByNode };
          if (next.length === 0) delete pinnedByNode[nodeId];
          else pinnedByNode[nodeId] = next;
          return { pinnedByNode };
        }),

      setPinnedSet: (nodeId, portIds) =>
        set((s) => {
          const pinnedByNode = { ...s.pinnedByNode };
          if (portIds.length === 0) delete pinnedByNode[nodeId];
          else pinnedByNode[nodeId] = [...portIds];
          return { pinnedByNode };
        }),
    }),
    {
      name: "element-face-pins",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ pinnedByNode: s.pinnedByNode }),
    },
  ),
);

// Shared frozen empty array so the selector returns a STABLE reference when a
// node has no pins — a fresh `[]` per render would make useSyncExternalStore see
// a changed snapshot every tick and loop ("Maximum update depth exceeded").
const EMPTY: readonly string[] = Object.freeze([]);

/** Selector: the pinned param-port ids for a node (stable empty array when none). */
export const selectFacePins =
  (nodeId: string) =>
  (s: FacePinStore): string[] =>
    s.pinnedByNode[nodeId] ?? (EMPTY as string[]);
