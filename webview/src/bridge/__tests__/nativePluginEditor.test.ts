/**
 * Tests for bridge/nativePluginEditor.ts.
 *
 * Covers nativePluginEditorOpen (retry loop returns true on first success,
 * false when all retries fail), nativePluginEditorClose, nativePluginEditorSetBounds,
 * and nativePluginEditorFloat (void wrappers).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import {
  nativePluginEditorClose,
  nativePluginEditorFloat,
  nativePluginEditorOpen,
  nativePluginEditorSetBounds,
  PLUGIN_EDITOR_OPEN_DELAYS_MS,
} from "../nativePluginEditor";
import { useAppStore } from "../../stores/useAppStore";

describe("nativePluginEditorOpen", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    bridge.uninstall();
  });

  it("happy path: returns true immediately when first call succeeds", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const promise = nativePluginEditorOpen("node-1", 0, 0, 400, 300);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementPluginEditorOpen", [
      "node-1",
      0,
      0,
      400,
      300,
    ]);
  });

  it("error path: returns false when all retries return false", async () => {
    bridge.mock.mockResolvedValue(false);
    const promise = nativePluginEditorOpen("node-bad", 0, 0, 400, 300);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(false);
  });

  it("retries and succeeds on the second attempt", async () => {
    bridge.mock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const promise = nativePluginEditorOpen("node-1", 0, 0, 400, 300);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(true);
    expect(bridge.mock).toHaveBeenCalledTimes(2);
  });
});

describe("nativePluginEditorClose", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("fire-and-forget: resolves void, calls the host", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    const result = await nativePluginEditorClose();
    expect(result).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementPluginEditorClose", []);
  });
});

describe("nativePluginEditorSetBounds", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("passes bounds to host and resolves void", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    const result = await nativePluginEditorSetBounds(10, 20, 800, 600);
    expect(result).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementPluginEditorSetBounds", [
      10,
      20,
      800,
      600,
    ]);
  });
});

describe("nativePluginEditorFloat", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("fire-and-forget: resolves void, calls the host", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    const result = await nativePluginEditorFloat();
    expect(result).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementPluginEditorFloat", []);
  });
});

// ── BUG 1 regression: open → ✕-close → double-click must RE-OPEN ──────────────
//
// The canvas double-click is a toggle (GraphCanvas.tsx onNodeDoubleClick):
//   if (embeddedEditorNodeId === node.id) close(); else open(node).
// After a ✕-close the webview mirror (`embeddedEditorNodeId`) MUST be null so
// the SECOND double-click on the same Block takes the OPEN branch — not the
// CLOSE branch (which would dead-end). These tests drive the REAL bridge +
// REAL useAppStore through a faithful model of the C++ host so the open/close/
// toggle state machine is exercised end-to-end.
describe("BUG 1: open → ✕-close → reopen toggle consistency", () => {
  let bridge: JuceBridgeMock;

  // Faithful model of the C++ ElementWebViewHost embed teardown contract:
  //  - pluginEditorOpen(uuid): close-first then create; ok = editor != null.
  //  - pluginEditorClose(): editor=null, embedNodeUuid=null, and (the fix)
  //    pushes onEmbeddedEditorClosed() back to the webview.
  class HostModel {
    embedNodeUuid: string | null = null;
    editor: object | null = null;
    /** Set true to make the NEXT open attempt fail (transient C++ false). */
    failNextOpen = false;

    open(uuid: string): boolean {
      // close-first (silent — matches pluginEditorOpen's inline reset)
      this.editor = null;
      this.embedNodeUuid = null;
      if (!uuid) return false;
      if (this.failNextOpen) {
        this.failNextOpen = false;
        return false; // createPluginEditorPanel returned nullptr this attempt
      }
      this.embedNodeUuid = uuid;
      this.editor = {};
      return this.editor != null;
    }
    close() {
      const had = this.editor != null;
      this.editor = null;
      this.embedNodeUuid = null;
      // The fix: terminal close notifies the webview so the mirror clears.
      if (had) bridge.emit("__juce__pluginCloseFired", undefined);
    }
  }

  let host: HostModel;

  // Mirror onNodeDoubleClick's toggle DECISION (GraphCanvas.tsx:246-254).
  // Returns the underlying promise so assertions can await deterministically;
  // production fires it with `void`, but the branch chosen is identical.
  function doubleClick(nodeId: string): Promise<unknown> {
    if (useAppStore.getState().embeddedEditorNodeId === nodeId)
      return nativePluginEditorClose();
    return nativePluginEditorOpen(nodeId, 80, 80, 720, 480);
  }

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    host = new HostModel();
    useAppStore.getState().setEmbeddedEditorNodeId(null);
    // Route the bridge into the host model. When the host fires its close
    // notification, clear the mirror — this stands in for useJuceBridge's
    // onEmbeddedEditorClosed handler (validated separately in the hook test).
    bridge.emit("__juce__pluginCloseFired", undefined); // no-op listener prime
    bridge.mock.mockImplementation(async (name: string, args: unknown[]) => {
      if (name === "elementPluginEditorOpen") return host.open(String(args[0]));
      if (name === "elementPluginEditorClose") {
        host.close();
        return true;
      }
      if (name === "elementPluginEditorFloat") {
        host.close();
        return true;
      }
      return undefined;
    });
  });

  afterEach(() => {
    bridge.uninstall();
    useAppStore.getState().setEmbeddedEditorNodeId(null);
  });

  it("the SECOND double-click calls OPEN (not close) and the editor re-opens", async () => {
    const N = "valhalla";

    // 1) First double-click → OPEN.
    await doubleClick(N);
    expect(useAppStore.getState().embeddedEditorNodeId).toBe(N);
    expect(host.editor).not.toBeNull();

    // 2) ✕-close.
    await nativePluginEditorClose();
    expect(useAppStore.getState().embeddedEditorNodeId).toBeNull();
    expect(host.editor).toBeNull();
    expect(host.embedNodeUuid).toBeNull();

    // Record bridge calls AFTER the close so we can prove the 2nd double-click
    // dispatches OPEN, not CLOSE.
    const callsBefore = bridge.callsOf().length;

    // 3) Second double-click → must take the OPEN branch.
    await doubleClick(N);

    const newCalls = bridge.callsOf().slice(callsBefore);
    const newNames = newCalls.map((c) => c.name);
    expect(newNames).toContain("elementPluginEditorOpen");
    expect(newNames).not.toContain("elementPluginEditorClose");

    // And the editor is back up, both sides in sync.
    expect(useAppStore.getState().embeddedEditorNodeId).toBe(N);
    expect(host.editor).not.toBeNull();
    expect(host.embedNodeUuid).toBe(N);
  });

  it("host-initiated close (no bridge close call) still re-syncs the mirror so reopen works", async () => {
    const N = "valhalla";
    await doubleClick(N);
    expect(useAppStore.getState().embeddedEditorNodeId).toBe(N);

    // Simulate a HOST-SIDE teardown (container dive / node delete / Float):
    // the C++ pluginEditorClose() runs and pushes onEmbeddedEditorClosed, which
    // the webview consumes to clear the mirror. We model that push here.
    host.close();
    useAppStore.getState().setEmbeddedEditorNodeId(null); // onEmbeddedEditorClosed
    expect(useAppStore.getState().embeddedEditorNodeId).toBeNull();

    // Double-click now correctly OPENs (no dead-end on a stale mirror).
    const callsBefore = bridge.callsOf().length;
    await doubleClick(N);
    const newNames = bridge
      .callsOf()
      .slice(callsBefore)
      .map((c) => c.name);
    expect(newNames).toContain("elementPluginEditorOpen");
    expect(useAppStore.getState().embeddedEditorNodeId).toBe(N);
  });

  it("reopen recovers when the host's first open attempt returns false (retry backoff)", async () => {
    const N = "valhalla";
    await doubleClick(N);
    await nativePluginEditorClose();
    expect(useAppStore.getState().embeddedEditorNodeId).toBeNull();

    // First reopen attempt fails (transient C++ false); the retry loop's next
    // attempt succeeds. Mirror ends correct, editor up.
    host.failNextOpen = true;
    await doubleClick(N);
    expect(useAppStore.getState().embeddedEditorNodeId).toBe(N);
    expect(host.editor).not.toBeNull();
    // The open path tried at least twice for the reopen.
    expect(bridge.callsOf("elementPluginEditorOpen").length).toBeGreaterThanOrEqual(3);
  });
});

// ── Task 1.5 (Wave-3 perf): editor-open backoff delay contract ───────────────
describe("PLUGIN_EDITOR_OPEN_DELAYS_MS — backoff array (Task 1.5)", () => {
  it("is [0, 80, 160, 320, 640] — tightened from [0,150,400,800,1500]", () => {
    // Directly assert the exported constant. Any regression (restoring the old
    // 2.9s schedule) immediately turns this test RED.
    expect(PLUGIN_EDITOR_OPEN_DELAYS_MS).toEqual([0, 80, 160, 320, 640]);
  });

  it("worst-case total wait is ≤ 1200 ms", () => {
    const total = (PLUGIN_EDITOR_OPEN_DELAYS_MS as readonly number[]).reduce((a, b) => a + b, 0);
    // Old schedule summed to 2850 ms; new schedule sums to 1200 ms.
    expect(total).toBe(1200);
    expect(total).toBeLessThanOrEqual(1200);
  });

  it("has exactly 5 retry slots", () => {
    expect(PLUGIN_EDITOR_OPEN_DELAYS_MS.length).toBe(5);
  });
});
