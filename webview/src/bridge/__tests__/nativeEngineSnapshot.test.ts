/**
 * Tests for bridge/nativeEngineSnapshot.ts — nativeGetEngineSnapshot.
 *
 * Covers happy path (object response), JSON-string parse path,
 * parse failure (logBridgeError invoked), and null dev-mode fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { logBridgeError } from "../bridgeError";
import { nativeGetEngineSnapshot } from "../nativeEngineSnapshot";

vi.mock("../bridgeError", () => ({ logBridgeError: vi.fn() }));
const mockLogBridgeError = logBridgeError as ReturnType<typeof vi.fn>;

describe("nativeGetEngineSnapshot", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path (object): returns parsed EngineSnapshot", async () => {
    bridge.mock.mockResolvedValueOnce({
      cpu: 0.25,
      engineRunning: true,
      sampleRate: 48000,
      bufferSize: 512,
      deviceName: "Built-in Output",
      deviceLatencyInputMs: 5,
      deviceLatencyOutputMs: 5,
      transportPlaying: false,
      transportRecording: false,
      tempoBpm: 120,
      timeSig: [4, 4],
      transportFrame: 0,
      transportTimecode: "1.1.0",
    });
    const snap = await nativeGetEngineSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.cpu).toBe(0.25);
    expect(snap?.engineRunning).toBe(true);
    expect(snap?.sampleRate).toBe(48000);
    expect(snap?.deviceName).toBe("Built-in Output");
    expect(snap?.timeSig).toEqual([4, 4]);
  });

  it("happy path (JSON string): parses and returns EngineSnapshot", async () => {
    const payload = {
      cpu: 0.1,
      engineRunning: false,
      sampleRate: 44100,
      bufferSize: 256,
      deviceName: "",
      deviceLatencyInputMs: 0,
      deviceLatencyOutputMs: 0,
      transportPlaying: false,
      transportRecording: false,
      tempoBpm: 120,
      timeSig: [3, 4],
      transportFrame: 0,
      transportTimecode: "1.1.0",
    };
    bridge.mock.mockResolvedValueOnce(JSON.stringify(payload));
    const snap = await nativeGetEngineSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.sampleRate).toBe(44100);
    expect(snap?.timeSig).toEqual([3, 4]);
  });

  it("returns null when host returns null (dev-mode fallback)", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    const snap = await nativeGetEngineSnapshot();
    expect(snap).toBeNull();
    expect(mockLogBridgeError).not.toHaveBeenCalled();
  });

  it("returns null and calls logBridgeError on invalid JSON string", async () => {
    bridge.mock.mockResolvedValueOnce("{bad json}}}");
    const snap = await nativeGetEngineSnapshot();
    expect(snap).toBeNull();
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeGetEngineSnapshot.parse",
    );
  });

  it("returns null and calls logBridgeError when invokeElementNative throws", async () => {
    bridge.mock.mockRejectedValueOnce(new Error("bridge transport error"));
    const snap = await nativeGetEngineSnapshot();
    expect(snap).toBeNull();
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeGetEngineSnapshot.invoke",
    );
  });
});
