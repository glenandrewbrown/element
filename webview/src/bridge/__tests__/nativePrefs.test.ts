/**
 * Tests for bridge/nativePrefs.ts.
 *
 * Covers nativeAudioApplySetup, nativeOscApplyHost, nativeMappingSetLearning,
 * nativeMappingRemoveMap, nativeHideAllPluginWindows, nativeHostShowAllPluginWindows,
 * and void wrappers (nativeWebDismissOverlay, nativeOpenLuaConsole, nativeOpenGraphMixer).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import type { AudioSetupSnapshot, OscHostSnapshot } from "../../stores/useHostExtrasStore";
import {
  nativeAudioApplySetup,
  nativeHideAllPluginWindows,
  nativeHostShowAllPluginWindows,
  nativeMappingRemoveMap,
  nativeMappingSetLearning,
  nativeMidiApplySetup,
  nativeOpenGraphMixer,
  nativeOpenLuaConsole,
  nativeOscApplyHost,
  nativeWebDismissOverlay,
} from "../nativePrefs";

describe("nativeAudioApplySetup", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true and passes setup object to host", async () => {
    const setup: Partial<AudioSetupSnapshot> = {
      sampleRate: 48000,
      bufferSize: 512,
    };
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeAudioApplySetup(setup)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementAudioApplySetup", [setup]);
  });

  it("error path: returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeAudioApplySetup({})).toBe(false);
  });
});

describe("nativeOscApplyHost", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true and forwards enabled + port", async () => {
    const osc: OscHostSnapshot = { enabled: true, port: 9000 };
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeOscApplyHost(osc)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementOscApplyHost", [
      true,
      9000,
    ]);
  });

  it("error path: returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(
      await nativeOscApplyHost({ enabled: false, port: 0 }),
    ).toBe(false);
  });
});

describe("nativeMidiApplySetup", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true and passes the setup payload to host", async () => {
    const setup = {
      inputEnables: [{ identifier: "midi-in-1", enabled: true }],
      defaultOutputId: "midi-out-2",
    };
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeMidiApplySetup(setup)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementMidiApplySetup", [setup]);
  });

  it("input-only payload: forwards just inputEnables", async () => {
    const setup = {
      inputEnables: [{ identifier: "midi-in-1", enabled: false }],
    };
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeMidiApplySetup(setup)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementMidiApplySetup", [setup]);
  });

  it("default-output-only payload: forwards just defaultOutputId", async () => {
    const setup = { defaultOutputId: "midi-out-2" };
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeMidiApplySetup(setup)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementMidiApplySetup", [setup]);
  });

  it("error path: returns false only when host does NOT return true", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeMidiApplySetup({ defaultOutputId: "x" })).toBe(false);
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeMidiApplySetup({ defaultOutputId: "x" })).toBe(false);
  });
});

describe("nativeMappingSetLearning", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeMappingSetLearning(true)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementMappingSetLearning", [
      true,
    ]);
  });

  it("error path: returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeMappingSetLearning(false)).toBe(false);
  });
});

describe("nativeMappingRemoveMap", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true and forwards index", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeMappingRemoveMap(3)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementMappingRemoveMap", [3]);
  });

  it("error path: returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeMappingRemoveMap(0)).toBe(false);
  });
});

describe("nativeHideAllPluginWindows", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeHideAllPluginWindows()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith(
      "elementHideAllPluginWindows",
      [],
    );
  });

  it("error path: returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeHideAllPluginWindows()).toBe(false);
  });
});

describe("nativeHostShowAllPluginWindows", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativeHostShowAllPluginWindows()).toBe(true);
  });

  it("error path: returns false when no active graph", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeHostShowAllPluginWindows()).toBe(false);
  });
});

describe("void wrappers", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("nativeWebDismissOverlay calls host and resolves void", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeWebDismissOverlay()).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementWebDismissOverlay", []);
  });

  it("nativeOpenLuaConsole calls host and resolves void", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeOpenLuaConsole()).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementOpenLuaConsole", []);
  });

  it("nativeOpenGraphMixer calls host and resolves void", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    expect(await nativeOpenGraphMixer()).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith("elementOpenGraphMixer", []);
  });
});
