/**
 * Tests for bridge/nativeNodeSpectrum.ts — nativeGetNodeSpectrum +
 * nativeSetNodeSpectrumWanted (G3-B item 1).
 *
 * Covers happy path (object + JSON-string), null dev-mode fallback, empty-bins
 * honest-degraded, parse failure, invoke throw, and the subscribe/unsubscribe
 * write path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { logBridgeError } from "../bridgeError";
import {
  nativeGetNodeSpectrum,
  nativeSetNodeSpectrumWanted,
} from "../nativeNodeSpectrum";

vi.mock("../bridgeError", () => ({ logBridgeError: vi.fn() }));
const mockLogBridgeError = logBridgeError as ReturnType<typeof vi.fn>;

describe("nativeGetNodeSpectrum", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path (object): returns parsed NodeSpectrum", async () => {
    bridge.mock.mockResolvedValueOnce({
      bins: [0.1, 0.5, 0.9, 0.2],
      fftSize: 2048,
      sampleRate: 48000,
    });
    const spec = await nativeGetNodeSpectrum("node-1");
    expect(spec).not.toBeNull();
    expect(spec?.bins).toEqual([0.1, 0.5, 0.9, 0.2]);
    expect(spec?.fftSize).toBe(2048);
    expect(spec?.sampleRate).toBe(48000);
    expect(bridge.mock).toHaveBeenCalledWith("elementGetNodeSpectrum", ["node-1"]);
  });

  it("happy path (JSON string): parses and returns NodeSpectrum", async () => {
    bridge.mock.mockResolvedValueOnce(
      JSON.stringify({ bins: [0.2, 0.4], fftSize: 1024, sampleRate: 44100 }),
    );
    const spec = await nativeGetNodeSpectrum("node-2");
    expect(spec).not.toBeNull();
    expect(spec?.bins).toEqual([0.2, 0.4]);
    expect(spec?.sampleRate).toBe(44100);
  });

  it("returns null when host returns null (dev-mode / no frame yet)", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    const spec = await nativeGetNodeSpectrum("node-3");
    expect(spec).toBeNull();
    expect(mockLogBridgeError).not.toHaveBeenCalled();
  });

  it("returns null when bins are empty (honest-degraded, no fake curve)", async () => {
    bridge.mock.mockResolvedValueOnce({ bins: [], fftSize: 2048, sampleRate: 48000 });
    const spec = await nativeGetNodeSpectrum("node-4");
    expect(spec).toBeNull();
    expect(mockLogBridgeError).not.toHaveBeenCalled();
  });

  it("returns null and logs on invalid JSON string", async () => {
    bridge.mock.mockResolvedValueOnce("{bad json}}}");
    const spec = await nativeGetNodeSpectrum("node-5");
    expect(spec).toBeNull();
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe("nativeGetNodeSpectrum.parse");
  });

  it("returns null and logs when invokeElementNative throws", async () => {
    bridge.mock.mockRejectedValueOnce(new Error("bridge transport error"));
    const spec = await nativeGetNodeSpectrum("node-6");
    expect(spec).toBeNull();
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe("nativeGetNodeSpectrum.invoke");
  });
});

describe("nativeSetNodeSpectrumWanted", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("subscribe: calls the host with (uuid,true) and returns true on r===true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const ok = await nativeSetNodeSpectrumWanted("node-1", true);
    expect(ok).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementSetNodeSpectrumWanted", [
      "node-1",
      true,
    ]);
  });

  it("unsubscribe: calls the host with (uuid,false)", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    await nativeSetNodeSpectrumWanted("node-1", false);
    expect(bridge.mock).toHaveBeenCalledWith("elementSetNodeSpectrumWanted", [
      "node-1",
      false,
    ]);
  });

  it("returns false when the host does not return true (dev-mode undefined)", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    const ok = await nativeSetNodeSpectrumWanted("node-1", true);
    expect(ok).toBe(false);
  });

  it("returns false and logs when invoke throws", async () => {
    bridge.mock.mockRejectedValueOnce(new Error("boom"));
    const ok = await nativeSetNodeSpectrumWanted("node-1", true);
    expect(ok).toBe(false);
    expect(mockLogBridgeError).toHaveBeenCalledOnce();
    expect(mockLogBridgeError.mock.calls[0][0]).toBe(
      "nativeSetNodeSpectrumWanted.invoke",
    );
  });
});

// ── §0.3b/c v2 compact payload roundtrip ─────────────────────────────────────
describe("nativeGetNodeSpectrum — v2 compact payload (§0.3b/c)", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    mockLogBridgeError.mockReset();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  function buildV2Payload(
    floatBins: number[],
    fftSize: number,
    sampleRate: number,
  ): string {
    const bytes = floatBins.map((b) => Math.round(b * 255));
    const binary = String.fromCharCode(...bytes);
    const binsB64 = btoa(binary);
    return JSON.stringify({ v: 2, fftSize, sampleRate, binsB64 });
  }

  it("v2 string payload: decodes binsB64 back to float bins within ±1/255 tolerance", async () => {
    const original = [0.0, 0.25, 0.5, 0.75, 1.0];
    const payload = buildV2Payload(original, 2048, 48000);
    bridge.mock.mockResolvedValueOnce(payload);
    const spec = await nativeGetNodeSpectrum("node-v2");
    expect(spec).not.toBeNull();
    expect(spec?.fftSize).toBe(2048);
    expect(spec?.sampleRate).toBe(48000);
    expect(spec?.bins).toHaveLength(original.length);
    const tolerance = 1 / 255 + 1e-9;
    for (let i = 0; i < original.length; ++i) {
      expect(Math.abs((spec?.bins[i] ?? 0) - original[i])).toBeLessThanOrEqual(tolerance);
    }
  });

  it("v2 payload: 1024-bin roundtrip (realistic FFT frame size)", async () => {
    const bins = Array.from({ length: 1024 }, (_, i) => (i % 256) / 255);
    const payload = buildV2Payload(bins, 2048, 44100);
    bridge.mock.mockResolvedValueOnce(payload);
    const spec = await nativeGetNodeSpectrum("node-v2-large");
    expect(spec?.bins).toHaveLength(1024);
    expect(spec?.bins[0]).toBeCloseTo(0, 5);
    expect(spec?.bins[255]).toBeCloseTo(1, 1);
  });

  it("v2 payload: empty binsB64 returns null (honest no-data)", async () => {
    const payload = JSON.stringify({ v: 2, fftSize: 2048, sampleRate: 48000, binsB64: "" });
    bridge.mock.mockResolvedValueOnce(payload);
    const spec = await nativeGetNodeSpectrum("node-v2-empty");
    expect(spec).toBeNull();
    expect(mockLogBridgeError).not.toHaveBeenCalled();
  });

  it("v2 payload: invalid base64 returns null without crashing", async () => {
    const payload = JSON.stringify({ v: 2, fftSize: 2048, sampleRate: 48000, binsB64: "!!!not-valid-b64!!!" });
    bridge.mock.mockResolvedValueOnce(payload);
    const spec = await nativeGetNodeSpectrum("node-v2-bad-b64");
    expect(spec).toBeNull();
  });

  it("v2 and legacy shapes both produce the same public NodeSpectrum interface", async () => {
    bridge.mock.mockResolvedValueOnce({ bins: [0.1, 0.5, 0.9], fftSize: 1024, sampleRate: 44100 });
    const legacy = await nativeGetNodeSpectrum("node-legacy");
    bridge.mock.mockResolvedValueOnce(buildV2Payload([0.1, 0.5, 0.9], 1024, 44100));
    const v2 = await nativeGetNodeSpectrum("node-v2-compat");
    expect(legacy).toHaveProperty("bins");
    expect(legacy).toHaveProperty("fftSize");
    expect(legacy).toHaveProperty("sampleRate");
    expect(v2).toHaveProperty("bins");
    expect(v2).toHaveProperty("fftSize");
    expect(v2).toHaveProperty("sampleRate");
    expect(v2?.bins).toHaveLength(3);
  });
});
