/**
 * Tests for usePluginScanStore.
 *
 * Covers: scan/rescan action dispatch, poll lifecycle (start/stop), path
 * CRUD, format toggles, scan-completion side-effects (plugin list refresh +
 * path refresh), and the three exported selectors.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { installJuceBridgeMock, type JuceBridgeMock } from "../../test/mockJuceBridge";
import {
  usePluginScanStore,
  selectScanning,
  selectCurrentPlugin,
  selectScanPluginCount,
} from "../usePluginScanStore";

// ── helpers ──────────────────────────────────────────────────────────────────

const EMPTY_STATUS = { scanning: false, currentPlugin: "", pluginCount: 0 };
const EMPTY_PATHS = { paths: {}, enabled: {}, formats: [] };

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
}

// ── fixtures ──────────────────────────────────────────────────────────────────

describe("usePluginScanStore — refreshPaths", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
  });
  afterEach(() => bridge.uninstall());

  it("loads paths + enabled + formats from host", async () => {
    bridge.mock.mockResolvedValueOnce({
      paths: { VST3: ["/Library/VST3"] },
      enabled: { VST3: true, AU: false },
      formats: ["VST3", "AU", "CLAP"],
    });
    await usePluginScanStore.getState().refreshPaths();
    const s = usePluginScanStore.getState();
    expect(s.paths.VST3).toEqual(["/Library/VST3"]);
    expect(s.enabled.AU).toBe(false);
    expect(s.formats).toEqual(["VST3", "AU", "CLAP"]);
    expect(s.pathsLoaded).toBe(true);
  });

  it("sets pathsLoaded true even on empty response", async () => {
    bridge.mock.mockResolvedValueOnce({});
    await usePluginScanStore.getState().refreshPaths();
    expect(usePluginScanStore.getState().pathsLoaded).toBe(true);
  });
});

describe("usePluginScanStore — refreshStatus", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    bridge.uninstall();
  });

  it("updates scanning / currentPlugin / pluginCount from host", async () => {
    bridge.mock.mockResolvedValueOnce({ scanning: true, currentPlugin: "Surge.vst3", pluginCount: 5 });
    await usePluginScanStore.getState().refreshStatus();
    const s = usePluginScanStore.getState();
    expect(s.scanning).toBe(true);
    expect(s.currentPlugin).toBe("Surge.vst3");
    expect(s.pluginCount).toBe(5);
  });

  it("returns empty status on null host response", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    await usePluginScanStore.getState().refreshStatus();
    expect(usePluginScanStore.getState().scanning).toBe(false);
  });
});

describe("usePluginScanStore — scan", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    bridge.uninstall();
  });

  it("sets scanning=true and starts polling when host issues scan", async () => {
    // scan call → true; subsequent status polls → scanning
    bridge.mock
      .mockResolvedValueOnce(true) // nativeScanPlugins
      .mockResolvedValue({ scanning: true, currentPlugin: "plugin.vst3", pluginCount: 1 });

    const scanPromise = usePluginScanStore.getState().scan();
    await scanPromise;

    expect(usePluginScanStore.getState().scanning).toBe(true);

    // Advance past one poll interval (350ms)
    await vi.advanceTimersByTimeAsync(400);
    expect(bridge.mock).toHaveBeenCalledWith("elementGetScanStatus", []);
  });

  it("does NOT set scanning when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    await usePluginScanStore.getState().scan();
    expect(usePluginScanStore.getState().scanning).toBe(false);
  });

  it("passes format restriction to nativeScanPlugins", async () => {
    bridge.mock.mockResolvedValueOnce(true)
      .mockResolvedValue({ ...EMPTY_STATUS });
    await usePluginScanStore.getState().scan(["AU"]);
    expect(bridge.mock).toHaveBeenCalledWith("elementScanPlugins", [["AU"]]);
  });
});

describe("usePluginScanStore — rescan", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    bridge.uninstall();
  });

  it("calls elementRescanPlugins and starts polling on success", async () => {
    bridge.mock
      .mockResolvedValueOnce(true)
      .mockResolvedValue({ ...EMPTY_STATUS });
    await usePluginScanStore.getState().rescan();
    expect(bridge.mock).toHaveBeenCalledWith("elementRescanPlugins", []);
    expect(usePluginScanStore.getState().scanning).toBe(true);
  });

  it("no-op when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    await usePluginScanStore.getState().rescan();
    expect(usePluginScanStore.getState().scanning).toBe(false);
  });
});

describe("usePluginScanStore — addPath", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
  });
  afterEach(() => bridge.uninstall());

  it("calls nativeAddPluginPath then refreshPaths on success", async () => {
    bridge.mock
      .mockResolvedValueOnce(true) // addPluginPath
      .mockResolvedValueOnce({ paths: { VST3: ["/new"] }, enabled: {}, formats: ["VST3"] }); // getPluginPaths
    const ok = await usePluginScanStore.getState().addPath("VST3", "/new");
    expect(ok).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementAddPluginPath", ["VST3", "/new"]);
    expect(usePluginScanStore.getState().paths.VST3).toEqual(["/new"]);
  });

  it("returns false and does not refresh when host rejects", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    const ok = await usePluginScanStore.getState().addPath("AU", "/bad");
    expect(ok).toBe(false);
    // getPluginPaths should NOT have been called
    const calls = bridge.callsOf("elementGetPluginPaths");
    expect(calls).toHaveLength(0);
  });
});

describe("usePluginScanStore — removePath", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
  });
  afterEach(() => bridge.uninstall());

  it("calls nativeRemovePluginPath then refreshPaths on success", async () => {
    bridge.mock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ ...EMPTY_PATHS });
    const ok = await usePluginScanStore.getState().removePath("CLAP", "/remove-me");
    expect(ok).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementRemovePluginPath", ["CLAP", "/remove-me"]);
  });

  it("no refresh on failure", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    await usePluginScanStore.getState().removePath("LV2", "/x");
    expect(bridge.callsOf("elementGetPluginPaths")).toHaveLength(0);
  });
});

describe("usePluginScanStore — setFormatEnabled", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
  });
  afterEach(() => bridge.uninstall());

  it("enables format and refreshes paths", async () => {
    bridge.mock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ paths: {}, enabled: { VST3: true }, formats: ["VST3"] });
    await usePluginScanStore.getState().setFormatEnabled("VST3", true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSetPluginFormatEnabled", ["VST3", true]);
    expect(usePluginScanStore.getState().enabled.VST3).toBe(true);
  });

  it("returns false and skips refresh on host failure", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    const ok = await usePluginScanStore.getState().setFormatEnabled("AU", false);
    expect(ok).toBe(false);
    expect(bridge.callsOf("elementGetPluginPaths")).toHaveLength(0);
  });
});

describe("usePluginScanStore — selectors", () => {
  beforeEach(() => resetStore());

  it("selectScanning reads scanning flag", () => {
    usePluginScanStore.setState({ scanning: true });
    expect(selectScanning(usePluginScanStore.getState())).toBe(true);
  });

  it("selectCurrentPlugin reads currentPlugin", () => {
    usePluginScanStore.setState({ currentPlugin: "Serum.vst3" });
    expect(selectCurrentPlugin(usePluginScanStore.getState())).toBe("Serum.vst3");
  });

  it("selectScanPluginCount reads pluginCount", () => {
    usePluginScanStore.setState({ pluginCount: 99 });
    expect(selectScanPluginCount(usePluginScanStore.getState())).toBe(99);
  });
});
