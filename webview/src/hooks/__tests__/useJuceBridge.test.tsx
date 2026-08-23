/**
 * Phase H-cov-3 — pins 5 critical execution paths in `useJuceBridge`:
 *   1. Boot IIFE happy path — snapshot hydrates stores, markHostReady fires.
 *   2. Boot IIFE error path — bridge throw → hostReady still true, sessionLoaded stays false.
 *   3. Plugin-scan retry-poll — bounded retries stop after the 5-timer cap.
 *   4. Session-load retry-poll — bounded retries stop after the 5-timer cap.
 *   5. refreshNonce subscriber — incrementing nonce re-issues elementGetGraphState.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { useJuceBridge } from "../useJuceBridge";
import { useAppStore } from "../../stores/useAppStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";

const MINIMAL_GRAPH_SNAPSHOT = {
  blocks: [],
  cables: [],
  session: { filePath: "/test.elg", dirty: false },
};

const PLUGIN_LIST_RESPONSE = {
  plugins: [
    {
      identifier: "au:Test/Plug",
      name: "TestPlug",
      descriptiveName: "Test Plugin",
      manufacturer: "TestCo",
      format: "AU",
      category: "Synth",
    },
  ],
  favoriteIdentifiers: [],
  recentIdentifiers: [],
};

async function flushAsync(hops = 20): Promise<void> {
  for (let i = 0; i < hops; i++) {
    await Promise.resolve();
  }
}

function resetStores() {
  useAppStore.setState({
    hostReady: false,
    refreshNonce: 0,
    activeScene: 0,
    mode: "edit",
    leftPanelOpen: true,
    rightPanelOpen: true,
    bottomPanelOpen: true,
    virtualKeyboardOpen: false,
    openBlockTabs: [],
    spatialBookmarks: {},
    cableRouting: "manhattan",
  });
  useSessionStore.setState({
    sessionLoaded: false,
    filePath: "",
    dirty: false,
    recentFiles: [],
    graphs: [],
  });
  useGraphStore.setState({ nodes: [], edges: [], commentBoxes: [] });
  usePluginBrowserStore.setState({
    plugins: [],
    favoriteIdentifiers: new Set<string>(),
    recentIdentifiers: [],
  });
  useEngineSnapshotStore.getState().stopPolling();
}

describe("useJuceBridge", () => {
  let bridge: JuceBridgeMock;
  let consoleSpy: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    bridge = installJuceBridgeMock();
    resetStores();
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    useEngineSnapshotStore.getState().stopPolling();
    bridge.uninstall();
    vi.useRealTimers();
    consoleSpy.mockRestore();
  });

  it("boot IIFE happy path — hydrates stores and marks hostReady + sessionLoaded", async () => {
    bridge.mock.mockResolvedValueOnce(MINIMAL_GRAPH_SNAPSHOT);
    bridge.mock.mockResolvedValueOnce(PLUGIN_LIST_RESPONSE);
    bridge.mock.mockResolvedValue(undefined);

    await act(async () => {
      renderHook(() => useJuceBridge());
      useEngineSnapshotStore.getState().stopPolling();
      await flushAsync();
    });

    expect(useAppStore.getState().hostReady).toBe(true);
    expect(useSessionStore.getState().sessionLoaded).toBe(true);
    expect(bridge.callsOf("elementGetGraphState").length).toBeGreaterThanOrEqual(1);
    expect(bridge.callsOf("elementGetPluginList").length).toBeGreaterThanOrEqual(1);
  });

  it("boot IIFE error path — bridge throws → hostReady true but sessionLoaded false", async () => {
    bridge.mock.mockRejectedValueOnce(new Error("bridge unavailable"));
    bridge.mock.mockResolvedValue(undefined);

    await act(async () => {
      renderHook(() => useJuceBridge());
      useEngineSnapshotStore.getState().stopPolling();
      await flushAsync();
    });

    expect(useAppStore.getState().hostReady).toBe(true);
    expect(useSessionStore.getState().sessionLoaded).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[bridge:useJuceBridge.bootEffect]"),
      expect.anything(),
    );
  });

  it("plugin-scan retry-poll — bounded to exactly 5 retry timers", async () => {
    bridge.mock.mockResolvedValue(undefined);

    await act(async () => {
      renderHook(() => useJuceBridge());
      useEngineSnapshotStore.getState().stopPolling();
      await flushAsync();
    });

    expect(usePluginBrowserStore.getState().plugins).toHaveLength(0);

    const callsBefore = bridge.callsOf("elementGetPluginList").length;

    // pluginPollDelays = [1500, 3000, 5000, 8000, 12000]; advance past all 5
    await act(async () => {
      await vi.advanceTimersByTimeAsync(13000);
    });

    expect(bridge.callsOf("elementGetPluginList").length - callsBefore).toBe(5);

    // No further timers registered beyond the 5-element cap
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(bridge.callsOf("elementGetPluginList").length - callsBefore).toBe(5);
  });

  it("session-load retry-poll — retries while sessionLoaded is false, stops after cap", async () => {
    bridge.mock.mockResolvedValue(undefined);

    await act(async () => {
      renderHook(() => useJuceBridge());
      useEngineSnapshotStore.getState().stopPolling();
      await flushAsync();
    });

    expect(useSessionStore.getState().sessionLoaded).toBe(false);

    const callsBoot = bridge.callsOf("elementGetGraphState").length;

    // sessionPollDelays = [500, 1500, 3000, 6000, 10000]; advance past all 5
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11000);
    });

    expect(bridge.callsOf("elementGetGraphState").length - callsBoot).toBe(5);

    // No further timers registered beyond the 5-element cap
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(bridge.callsOf("elementGetGraphState").length - callsBoot).toBe(5);
  });

  it("refreshNonce increment triggers re-fetch of elementGetGraphState", async () => {
    bridge.mock.mockResolvedValueOnce(MINIMAL_GRAPH_SNAPSHOT);
    bridge.mock.mockResolvedValue(undefined);

    await act(async () => {
      renderHook(() => useJuceBridge());
      useEngineSnapshotStore.getState().stopPolling();
      await flushAsync();
    });

    const callsAfterBoot = bridge.callsOf("elementGetGraphState").length;

    bridge.mock.mockResolvedValueOnce({
      ...MINIMAL_GRAPH_SNAPSHOT,
      session: { filePath: "/refreshed.elg", dirty: true },
    });

    await act(async () => {
      useAppStore.getState().requestGraphStateRefresh();
      await flushAsync();
    });

    expect(bridge.callsOf("elementGetGraphState").length).toBe(callsAfterBoot + 1);
    expect(useSessionStore.getState().filePath).toBe("/refreshed.elg");
  });
});
