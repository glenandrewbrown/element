// U11 — Multi-instance store.
//
// Holds the list of live Element plugin instances polled from the C++
// `elementGetInstances` handler, plus the read-only mirror snapshot of a
// selected peer (`elementGetInstanceSnapshot`). Modelled on
// useEngineSnapshotStore: module-level interval handles so polling is a
// singleton, idempotent `startListPolling`, and an idle-tick diff-skip so the
// store never re-renders consumers while the instance list is unchanged.
//
// NOTHING fake: when the bridge returns null (pure dev / no `__JUCE__`) the
// list stays empty and the UI shows the honest single-instance / empty state.
// A dead or scan-only mirror target sets `mirrorUnavailable` so MirrorPanel
// shows the honest "Instance unavailable" empty state rather than stale data.
import { create } from "zustand";
import {
  nativeGetInstances,
  nativeGetInstanceSnapshot,
  type InstanceInfo,
  type GraphSnapshotRaw,
} from "../bridge/nativeInstances";

interface InstancesState {
  /** Live instances in this host OS process (empty == honest standalone). */
  instances: InstanceInfo[];
  /** This webview's own instance id, or −1 when not a plugin instance. */
  selfId: number;
  /** Last time `refreshList()` applied a change (ms epoch); 0 = never. */
  lastUpdated: number;
  /** Whether `refreshList()` ever produced a non-null host payload. */
  hasHostData: boolean;
  /** Currently-mirrored peer id, or null when the mirror is closed. */
  mirrorTargetId: number | null;
  /** Raw read-only snapshot of the mirrored peer (null = none / no data). */
  mirrorSnapshot: GraphSnapshotRaw | null;
  /** True when the mirror target is dead / scan-only (honest empty state). */
  mirrorUnavailable: boolean;
}

interface InstancesActions {
  /** Fetch + apply the instance list (diff-skips when unchanged). */
  refreshList: () => Promise<void>;
  /** Start the 2 Hz list poll. Idempotent singleton; immediate first refresh. */
  startListPolling: (intervalMs?: number) => () => void;
  /** Stop the list poll (no-op if not running). */
  stopListPolling: () => void;
  /** Select / clear the mirror target. Drives the on-demand snapshot poll. */
  setMirrorTarget: (id: number | null) => void;
  /** Fetch + apply the mirror snapshot for the current target (no-op if null). */
  refreshMirror: () => Promise<void>;
}

type InstancesStore = InstancesState & InstancesActions;

// Module-level interval handles so each poll really is a singleton.
let listPollHandle: ReturnType<typeof setInterval> | null = null;
let listPollIntervalMs = 0;
let snapPollHandle: ReturnType<typeof setInterval> | null = null;

const initialState: InstancesState = {
  instances: [],
  selfId: -1,
  lastUpdated: 0,
  hasHostData: false,
  mirrorTargetId: null,
  mirrorSnapshot: null,
  mirrorUnavailable: false,
};

/**
 * True when the freshly-polled list differs from what the store already holds.
 * Compares length + each id/name/hasGraph/isSelf + selfId — exactly the fields
 * the UI renders — so an idle 2 Hz tick where nothing changed skips the set()
 * (and the consumer re-render) entirely.
 */
function listChanged(
  prev: InstancesState,
  next: InstanceInfo[],
  selfId: number,
): boolean {
  if (selfId !== prev.selfId) return true;
  if (next.length !== prev.instances.length) return true;
  for (let i = 0; i < next.length; ++i) {
    const a = next[i];
    const b = prev.instances[i];
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.hasGraph !== b.hasGraph ||
      a.isSelf !== b.isSelf ||
      a.variant !== b.variant
    )
      return true;
  }
  return false;
}

export const useInstancesStore = create<InstancesStore>()((set, get) => ({
  ...initialState,

  refreshList: async () => {
    const result = await nativeGetInstances();
    if (result == null) return; // dev / no bridge — keep honest empty state.
    if (
      get().hasHostData &&
      !listChanged(get(), result.instances, result.selfId)
    )
      return; // idle-tick: nothing changed, skip the re-render.
    set({
      instances: result.instances,
      selfId: result.selfId,
      lastUpdated: Date.now(),
      hasHostData: true,
    });
    // If the mirror target vanished from the live list, drop the mirror so the
    // panel falls to its honest empty state on the next snapshot tick.
    const target = get().mirrorTargetId;
    if (target != null && !result.instances.some((i) => i.id === target))
      get().setMirrorTarget(null);
  },

  startListPolling: (intervalMs = 500) => {
    if (listPollHandle != null && listPollIntervalMs === intervalMs)
      return get().stopListPolling;
    if (listPollHandle != null) {
      clearInterval(listPollHandle);
      listPollHandle = null;
    }
    listPollIntervalMs = intervalMs;
    void get().refreshList(); // immediate first refresh
    listPollHandle = setInterval(() => {
      void get().refreshList();
    }, intervalMs);
    return get().stopListPolling;
  },

  stopListPolling: () => {
    if (listPollHandle != null) {
      clearInterval(listPollHandle);
      listPollHandle = null;
      listPollIntervalMs = 0;
    }
  },

  setMirrorTarget: (id) => {
    // Stop any running snapshot poll first.
    if (snapPollHandle != null) {
      clearInterval(snapPollHandle);
      snapPollHandle = null;
    }
    if (id == null) {
      set({
        mirrorTargetId: null,
        mirrorSnapshot: null,
        mirrorUnavailable: false,
      });
      return;
    }
    // New target: clear the previous snapshot, fetch immediately, then poll at
    // 4 Hz while the mirror is open.
    set({
      mirrorTargetId: id,
      mirrorSnapshot: null,
      mirrorUnavailable: false,
    });
    void get().refreshMirror();
    snapPollHandle = setInterval(() => {
      void get().refreshMirror();
    }, 250);
  },

  refreshMirror: async () => {
    const target = get().mirrorTargetId;
    if (target == null) return;
    const snap = await nativeGetInstanceSnapshot(target);
    // Guard against a target change mid-await (stale response).
    if (get().mirrorTargetId !== target) return;
    if (snap == null) {
      // No bridge / no data — honest unavailable rather than a stale graph.
      set({ mirrorSnapshot: null, mirrorUnavailable: true });
      return;
    }
    set({
      mirrorSnapshot: snap,
      mirrorUnavailable: snap.unavailable === true,
    });
  },
}));

// ── Selectors ──
// Derived array selectors (selectOtherInstances) MUST be read with useShallow
// at call sites — a fresh array each render infinite-loops in Zustand v5.

export const selectInstances = (s: InstancesStore) => s.instances;
export const selectSelfId = (s: InstancesStore) => s.selfId;
export const selectOtherInstances = (s: InstancesStore) =>
  s.instances.filter((i) => !i.isSelf);
export const selectSelfInstance = (s: InstancesStore) =>
  s.instances.find((i) => i.isSelf) ?? null;
export const selectMirrorTargetId = (s: InstancesStore) => s.mirrorTargetId;
export const selectMirrorSnapshot = (s: InstancesStore) => s.mirrorSnapshot;
export const selectMirrorUnavailable = (s: InstancesStore) =>
  s.mirrorUnavailable;
export const selectHasMultipleInstances = (s: InstancesStore) =>
  s.instances.length > 1;
