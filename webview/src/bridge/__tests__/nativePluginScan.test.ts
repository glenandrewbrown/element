/**
 * Tests for bridge/nativePluginScan.ts.
 *
 * Exercises parsePayload (via the public API), all 7 exported async
 * functions, and boolean-result coercion (r === true contract).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import {
  nativeScanPlugins,
  nativeRescanPlugins,
  nativeGetScanStatus,
  nativeGetPluginPaths,
  nativeAddPluginPath,
  nativeRemovePluginPath,
  nativeGetPluginFormatsEnabled,
  nativeSetPluginFormatEnabled,
} from "../nativePluginScan";

describe("nativeScanPlugins", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => { bridge = installJuceBridgeMock(); });
  afterEach(() => bridge.uninstall());

  it("returns true when host confirms scan issued", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeScanPlugins()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementScanPlugins", []);
  });

  it("passes format array when formats provided", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    await nativeScanPlugins(["VST3", "AU"]);
    expect(bridge.mock).toHaveBeenCalledWith("elementScanPlugins", [["VST3", "AU"]]);
  });

  it("passes no args when formats is empty array", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    await nativeScanPlugins([]);
    expect(bridge.mock).toHaveBeenCalledWith("elementScanPlugins", []);
  });

  it("returns false when host returns false (scan already running)", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeScanPlugins()).toBe(false);
  });

  it("returns false for non-true host response", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeScanPlugins()).toBe(false);
  });
});

describe("nativeRescanPlugins", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => { bridge = installJuceBridgeMock(); });
  afterEach(() => bridge.uninstall());

  it("calls elementRescanPlugins with empty args", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeRescanPlugins()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementRescanPlugins", []);
  });

  it("returns false on host rejection", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeRescanPlugins()).toBe(false);
  });
});

describe("nativeGetScanStatus", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => { bridge = installJuceBridgeMock(); });
  afterEach(() => bridge.uninstall());

  it("returns parsed status from object response", async () => {
    bridge.mock.mockResolvedValueOnce({
      scanning: true,
      currentPlugin: "SurgXT.vst3",
      pluginCount: 42,
    });
    const status = await nativeGetScanStatus();
    expect(status).toEqual({ scanning: true, currentPlugin: "SurgXT.vst3", pluginCount: 42 });
    expect(bridge.mock).toHaveBeenCalledWith("elementGetScanStatus", []);
  });

  it("parses JSON string response", async () => {
    bridge.mock.mockResolvedValueOnce(
      JSON.stringify({ scanning: false, currentPlugin: "", pluginCount: 7 })
    );
    const status = await nativeGetScanStatus();
    expect(status.scanning).toBe(false);
    expect(status.pluginCount).toBe(7);
  });

  it("returns empty status on null response", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    const status = await nativeGetScanStatus();
    expect(status).toEqual({ scanning: false, currentPlugin: "", pluginCount: 0 });
  });

  it("returns empty status on malformed JSON string", async () => {
    bridge.mock.mockResolvedValueOnce("{ bad json");
    const status = await nativeGetScanStatus();
    expect(status).toEqual({ scanning: false, currentPlugin: "", pluginCount: 0 });
  });
});

describe("nativeGetPluginPaths", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => { bridge = installJuceBridgeMock(); });
  afterEach(() => bridge.uninstall());

  it("returns parsed paths snapshot from host", async () => {
    bridge.mock.mockResolvedValueOnce({
      paths: { VST3: ["/Library/Audio/Plug-Ins/VST3"] },
      enabled: { VST3: true, AU: false },
      formats: ["VST3", "AU"],
    });
    const snap = await nativeGetPluginPaths();
    expect(snap.paths.VST3).toEqual(["/Library/Audio/Plug-Ins/VST3"]);
    expect(snap.enabled.AU).toBe(false);
    expect(snap.formats).toEqual(["VST3", "AU"]);
    expect(bridge.mock).toHaveBeenCalledWith("elementGetPluginPaths", []);
  });

  it("fills missing fields with empty defaults", async () => {
    bridge.mock.mockResolvedValueOnce({});
    const snap = await nativeGetPluginPaths();
    expect(snap.paths).toEqual({});
    expect(snap.enabled).toEqual({});
    expect(snap.formats).toEqual([]);
  });

  it("returns empty snapshot on null response", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    const snap = await nativeGetPluginPaths();
    expect(snap).toEqual({ paths: {}, enabled: {}, formats: [] });
  });
});

describe("nativeAddPluginPath", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => { bridge = installJuceBridgeMock(); });
  afterEach(() => bridge.uninstall());

  it("passes format and path, returns true on success", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const ok = await nativeAddPluginPath("VST3", "/usr/local/lib/vst3");
    expect(ok).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementAddPluginPath", ["VST3", "/usr/local/lib/vst3"]);
  });

  it("returns false when host rejects (path already exists or format unsupported)", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeAddPluginPath("AU", "/bad/path")).toBe(false);
  });
});

describe("nativeRemovePluginPath", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => { bridge = installJuceBridgeMock(); });
  afterEach(() => bridge.uninstall());

  it("passes format and path, returns true when removed", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const ok = await nativeRemovePluginPath("CLAP", "/some/clap/dir");
    expect(ok).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementRemovePluginPath", ["CLAP", "/some/clap/dir"]);
  });

  it("returns false when path not present", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeRemovePluginPath("LV2", "/not/here")).toBe(false);
  });
});

describe("nativeGetPluginFormatsEnabled", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => { bridge = installJuceBridgeMock(); });
  afterEach(() => bridge.uninstall());

  it("returns enabled map from host", async () => {
    bridge.mock.mockResolvedValueOnce({ VST3: true, AU: false, CLAP: true });
    const enabled = await nativeGetPluginFormatsEnabled();
    expect(enabled).toEqual({ VST3: true, AU: false, CLAP: true });
    expect(bridge.mock).toHaveBeenCalledWith("elementGetPluginFormatsEnabled", []);
  });

  it("returns empty object on null response", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeGetPluginFormatsEnabled()).toEqual({});
  });
});

describe("nativeSetPluginFormatEnabled", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => { bridge = installJuceBridgeMock(); });
  afterEach(() => bridge.uninstall());

  it("enables a format — passes true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const ok = await nativeSetPluginFormatEnabled("VST3", true);
    expect(ok).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSetPluginFormatEnabled", ["VST3", true]);
  });

  it("disables a format — passes false", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    await nativeSetPluginFormatEnabled("AU", false);
    expect(bridge.mock).toHaveBeenCalledWith("elementSetPluginFormatEnabled", ["AU", false]);
  });

  it("returns false for unsupported format", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeSetPluginFormatEnabled("LV2", true)).toBe(false);
  });
});
