/**
 * usePluginScanStore — branch gap coverage.
 *
 * Uncovered branches (lines 74-78, 90-92):
 *   1. stopPolling when pollHandle is null → no-op (the if-null false-branch)
 *   2. wasScanning && !status.scanning → scan-complete triggers refreshPaths + browser refresh
 *   3. startPolling when already polling → early return (re-entrant guard)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNativeScan = vi.fn();
const mockNativeRescan = vi.fn();
const mockGetScanStatus = vi.fn();
const mockGetPluginPaths = vi.fn();
const mockAddPath = vi.fn();
const mockRemovePath = vi.fn();
const mockSetFormatEnabled = vi.fn();
const mockBrowserRefresh = vi.fn();

vi.mock("../../bridge/nativePluginScan", () => ({
  nativeScanPlugins: (...a: unknown[]) => mockNativeScan(...a),
  nativeRescanPlugins: (...a: unknown[]) => mockNativeRescan(...a),
  nativeGetScanStatus: (...a: unknown[]) => mockGetScanStatus(...a),
  nativeGetPluginPaths: (...a: unknown[]) => mockGetPluginPaths(...a),
  nativeAddPluginPath: (...a: unknown[]) => mockAddPath(...a),
  nativeRemovePluginPath: (...a: unknown[]) => mockRemovePath(...a),
  nativeSetPluginFormatEnabled: (...a: unknown[]) => mockSetFormatEnabled(...a),
}));

vi.mock("../../stores/usePluginBrowserStore", () => ({
  usePluginBrowserStore: {
    getState: () => ({ refresh: mockBrowserRefresh }),
  },
}));

import { usePluginScanStore } from "../usePluginScanStore";

const IDLE_STATUS = { scanning: false, currentPlugin: "", pluginCount: 0 };
const SCANNING_STATUS = { scanning: true, currentPlugin: "SomePlugin.vst3", pluginCount: 5 };

const EMPTY_PATHS = { paths: {}, enabled: {}, formats: [] as string[] };

function resetStore() {
  usePluginScanStore.setState({
    scanning: false,
    currentPlugin: "",
    pluginCount: 0,
    paths: {},
    enabled: {},
    formats: [],
    pathsLoaded: false,
  });
  mockGetScanStatus.mockReset();
  mockGetPluginPaths.mockReset();
  mockBrowserRefresh.mockReset();
  mockNativeScan.mockReset();
  mockNativeRescan.mockReset();
}

// ── stopPolling no-op when not polling ────────────────────────────────────────

describe("usePluginScanStore — refreshStatus when not scanning (no poll active)", () => {
  beforeEach(resetStore);
  afterEach(() => vi.useRealTimers());

  it("refreshStatus when store is idle does not throw", async () => {
    mockGetScanStatus.mockResolvedValueOnce(IDLE_STATUS);
    await expect(usePluginScanStore.getState().refreshStatus()).resolves.toBeUndefined();
  });

  it("idle → idle transition does NOT trigger browser refresh", async () => {
    mockGetScanStatus.mockResolvedValueOnce(IDLE_STATUS);
    await usePluginScanStore.getState().refreshStatus();
    expect(mockBrowserRefresh).not.toHaveBeenCalled();
  });
});

// ── scan-complete → refresh path ──────────────────────────────────────────────

describe("usePluginScanStore — scan complete triggers browser refresh + refreshPaths", () => {
  beforeEach(() => {
    resetStore();
    mockGetPluginPaths.mockResolvedValue(EMPTY_PATHS);
    mockBrowserRefresh.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("wasScanning=true + status.scanning=false → calls browser refresh", async () => {
    // Seed the store as already scanning
    usePluginScanStore.setState({ scanning: true });

    mockGetScanStatus.mockResolvedValueOnce(IDLE_STATUS);
    await usePluginScanStore.getState().refreshStatus();

    expect(mockBrowserRefresh).toHaveBeenCalledTimes(1);
  });

  it("scan-complete also calls refreshPaths (nativeGetPluginPaths)", async () => {
    usePluginScanStore.setState({ scanning: true });

    mockGetScanStatus.mockResolvedValueOnce(IDLE_STATUS);
    await usePluginScanStore.getState().refreshStatus();

    expect(mockGetPluginPaths).toHaveBeenCalledTimes(1);
  });

  it("scanning → scanning does NOT trigger browser refresh", async () => {
    usePluginScanStore.setState({ scanning: true });

    mockGetScanStatus.mockResolvedValueOnce(SCANNING_STATUS);
    await usePluginScanStore.getState().refreshStatus();

    expect(mockBrowserRefresh).not.toHaveBeenCalled();
  });

  it("idle → scanning does NOT trigger browser refresh", async () => {
    usePluginScanStore.setState({ scanning: false });

    mockGetScanStatus.mockResolvedValueOnce(SCANNING_STATUS);
    await usePluginScanStore.getState().refreshStatus();

    expect(mockBrowserRefresh).not.toHaveBeenCalled();
    expect(usePluginScanStore.getState().scanning).toBe(true);
  });
});

// ── startPolling re-entrant guard ─────────────────────────────────────────────

describe("usePluginScanStore — scan() does not double-poll", () => {
  beforeEach(() => {
    resetStore();
    mockNativeScan.mockResolvedValue(undefined);
    mockGetScanStatus.mockResolvedValue(SCANNING_STATUS);
    mockGetPluginPaths.mockResolvedValue(EMPTY_PATHS);
    mockBrowserRefresh.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    mockNativeScan.mockReset();
    mockGetScanStatus.mockReset();
  });

  it("calling scan() twice does not start multiple poll intervals", async () => {
    vi.useFakeTimers();

    void usePluginScanStore.getState().scan();
    void usePluginScanStore.getState().scan();

    vi.advanceTimersByTime(600);
    await Promise.resolve();

    // 2 calls max: one per 333ms tick in 600ms window. If two intervals were
    // running we'd see at least 4 calls.
    expect(mockGetScanStatus.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

// ── refreshPaths populates store ──────────────────────────────────────────────

describe("usePluginScanStore.refreshPaths", () => {
  beforeEach(resetStore);

  it("sets pathsLoaded=true after refresh", async () => {
    mockGetPluginPaths.mockResolvedValueOnce({
      paths: { VST3: ["/Library/Audio/Plug-Ins/VST3"] },
      enabled: { VST3: true },
      formats: ["VST3"],
    });
    await usePluginScanStore.getState().refreshPaths();
    expect(usePluginScanStore.getState().pathsLoaded).toBe(true);
    expect(usePluginScanStore.getState().formats).toEqual(["VST3"]);
  });
});
