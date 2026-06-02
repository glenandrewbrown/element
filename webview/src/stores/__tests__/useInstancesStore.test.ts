/**
 * Tests for `useInstancesStore` — U11 multi-instance registry + read-only
 * mirror. Mocks the JUCE backend (`invokeElementNative`) and verifies:
 *   1) refreshList() maps the host payload → instances + selfId
 *   2) idle-tick diff-skip (unchanged list does not bump lastUpdated)
 *   3) setMirrorTarget(id) fetches a snapshot + sets mirrorUnavailable
 *   4) setMirrorTarget(null) stops the snapshot poll
 *   5) startListPolling is an idempotent singleton + stop teardown
 *   6) null host payload (dev / no bridge) keeps the honest empty state
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useInstancesStore,
  selectOtherInstances,
  selectHasMultipleInstances,
} from "../useInstancesStore";

vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));
import { invokeElementNative } from "../../bridge/juceBackend";

const mockInvoke = invokeElementNative as unknown as ReturnType<typeof vi.fn>;

const TWO_INSTANCES = {
  selfId: 1,
  instances: [
    { id: 1, name: "Project A", variant: 0, isSelf: true, hasGraph: true },
    { id: 2, name: "Project B", variant: 1, isSelf: false, hasGraph: false },
  ],
};

const SNAPSHOT = {
  schema: 2,
  session: { name: "Project B" },
  breadcrumbs: ["Root"],
  blocks: [{ id: "n1", name: "Reverb", category: "audiofx" }],
  cables: [],
  engine: { isPlaying: false },
};

describe("useInstancesStore", () => {
  beforeEach(() => {
    useInstancesStore.getState().stopListPolling();
    useInstancesStore.getState().setMirrorTarget(null);
    useInstancesStore.setState({
      instances: [],
      selfId: -1,
      lastUpdated: 0,
      hasHostData: false,
      mirrorTargetId: null,
      mirrorSnapshot: null,
      mirrorUnavailable: false,
    });
    mockInvoke.mockReset();
  });

  afterEach(() => {
    useInstancesStore.getState().stopListPolling();
    useInstancesStore.getState().setMirrorTarget(null);
  });

  it("refreshList() maps the host payload to instances + selfId", async () => {
    mockInvoke.mockResolvedValueOnce(JSON.stringify(TWO_INSTANCES));
    await useInstancesStore.getState().refreshList();
    const s = useInstancesStore.getState();
    expect(s.instances).toHaveLength(2);
    expect(s.selfId).toBe(1);
    expect(s.instances[1]).toMatchObject({ id: 2, name: "Project B" });
    expect(s.hasHostData).toBe(true);
    expect(selectHasMultipleInstances(s)).toBe(true);
    expect(selectOtherInstances(s)).toHaveLength(1);
    expect(selectOtherInstances(s)[0].id).toBe(2);
  });

  it("refreshList() accepts an already-parsed object payload", async () => {
    mockInvoke.mockResolvedValueOnce(TWO_INSTANCES);
    await useInstancesStore.getState().refreshList();
    expect(useInstancesStore.getState().instances).toHaveLength(2);
  });

  it("idle-tick diff-skip: unchanged list does not bump lastUpdated", async () => {
    mockInvoke.mockResolvedValue(JSON.stringify(TWO_INSTANCES));
    await useInstancesStore.getState().refreshList();
    const firstUpdated = useInstancesStore.getState().lastUpdated;
    expect(firstUpdated).toBeGreaterThan(0);
    // Second identical poll → diff-skip, lastUpdated unchanged.
    await useInstancesStore.getState().refreshList();
    expect(useInstancesStore.getState().lastUpdated).toBe(firstUpdated);
  });

  it("refreshList() does nothing when host returns null (dev / no bridge)", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await useInstancesStore.getState().refreshList();
    const s = useInstancesStore.getState();
    expect(s.instances).toHaveLength(0);
    expect(s.hasHostData).toBe(false);
    expect(selectHasMultipleInstances(s)).toBe(false);
  });

  it("setMirrorTarget(id) fetches a snapshot and sets it", async () => {
    mockInvoke.mockResolvedValueOnce(JSON.stringify(SNAPSHOT));
    useInstancesStore.getState().setMirrorTarget(2);
    // setMirrorTarget kicks an immediate async refreshMirror — await a tick.
    await vi.waitFor(() =>
      expect(useInstancesStore.getState().mirrorSnapshot).not.toBeNull(),
    );
    const s = useInstancesStore.getState();
    expect(s.mirrorTargetId).toBe(2);
    expect(s.mirrorUnavailable).toBe(false);
    expect(s.mirrorSnapshot?.session?.name).toBe("Project B");
  });

  it("setMirrorTarget(id) flags unavailable from the payload", async () => {
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify({ schema: 2, graphs: [], unavailable: true }),
    );
    useInstancesStore.getState().setMirrorTarget(99);
    await vi.waitFor(() =>
      expect(useInstancesStore.getState().mirrorUnavailable).toBe(true),
    );
    expect(useInstancesStore.getState().mirrorTargetId).toBe(99);
  });

  it("setMirrorTarget(null) clears target + snapshot + stops the snapshot poll", async () => {
    vi.useFakeTimers();
    try {
      mockInvoke.mockResolvedValue(JSON.stringify(SNAPSHOT));
      useInstancesStore.getState().setMirrorTarget(2);
      // Immediate fetch (1 call). Clearing the target must stop further polls.
      useInstancesStore.getState().setMirrorTarget(null);
      const callsAfterClose = mockInvoke.mock.calls.length;
      vi.advanceTimersByTime(1000); // 4 ticks would fire if poll still running
      expect(mockInvoke.mock.calls.length).toBe(callsAfterClose);
      const s = useInstancesStore.getState();
      expect(s.mirrorTargetId).toBeNull();
      expect(s.mirrorSnapshot).toBeNull();
      expect(s.mirrorUnavailable).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("startListPolling() is an idempotent singleton", () => {
    vi.useFakeTimers();
    try {
      mockInvoke.mockResolvedValue(JSON.stringify(TWO_INSTANCES));
      const stop1 = useInstancesStore.getState().startListPolling(500);
      const stop2 = useInstancesStore.getState().startListPolling(500);
      expect(typeof stop1).toBe("function");
      expect(typeof stop2).toBe("function");
      // 1 immediate refresh + 2 ticks over 1050ms (500ms interval).
      vi.advanceTimersByTime(1050);
      expect(mockInvoke).toHaveBeenCalledTimes(3);
      useInstancesStore.getState().stopListPolling();
      vi.advanceTimersByTime(1050);
      expect(mockInvoke).toHaveBeenCalledTimes(3); // stopped — no more calls
    } finally {
      useInstancesStore.getState().stopListPolling();
      vi.useRealTimers();
    }
  });

  it("refreshList() drops a mirror target that vanished from the list", async () => {
    // Start mirroring id 2, then poll a list that no longer contains it.
    mockInvoke.mockResolvedValueOnce(JSON.stringify(SNAPSHOT)); // setMirrorTarget fetch
    useInstancesStore.getState().setMirrorTarget(2);
    await vi.waitFor(() =>
      expect(useInstancesStore.getState().mirrorTargetId).toBe(2),
    );
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify({
        selfId: 1,
        instances: [
          { id: 1, name: "Project A", variant: 0, isSelf: true, hasGraph: true },
        ],
      }),
    );
    await useInstancesStore.getState().refreshList();
    expect(useInstancesStore.getState().mirrorTargetId).toBeNull();
  });
});
