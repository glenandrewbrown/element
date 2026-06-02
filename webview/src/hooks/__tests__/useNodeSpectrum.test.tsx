/**
 * Tests for useNodeSpectrum (G3-B item 1) — the opt-in FFT polling hook.
 *
 *   • mounting active   → subscribes via nativeSetNodeSpectrumWanted(id,true)
 *   • unmounting        → unsubscribes via nativeSetNodeSpectrumWanted(id,false)
 *   • inactive / no id  → does NOT subscribe; returns []
 *   • returns []        until the host yields a frame, then the real bins
 *
 * The opt-in subscribe/unsubscribe is what guarantees zero idle CPU on the
 * audio thread — so it is the most important behaviour to lock down.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useNodeSpectrum } from "../useNodeSpectrum";
import {
  nativeGetNodeSpectrum,
  nativeSetNodeSpectrumWanted,
} from "../../bridge/nativeNodeSpectrum";

vi.mock("../../bridge/nativeNodeSpectrum", () => ({
  nativeGetNodeSpectrum: vi.fn(async () => null),
  nativeSetNodeSpectrumWanted: vi.fn(async () => true),
}));

const mockGet = nativeGetNodeSpectrum as ReturnType<typeof vi.fn>;
const mockSetWanted = nativeSetNodeSpectrumWanted as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue(null);
  mockSetWanted.mockReset();
  mockSetWanted.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useNodeSpectrum", () => {
  it("returns [] and does NOT subscribe when inactive", () => {
    const { result } = renderHook(() => useNodeSpectrum("node-1", false));
    expect(result.current).toEqual([]);
    expect(mockSetWanted).not.toHaveBeenCalled();
  });

  it("returns [] and does NOT subscribe when nodeId is undefined", () => {
    const { result } = renderHook(() => useNodeSpectrum(undefined, true));
    expect(result.current).toEqual([]);
    expect(mockSetWanted).not.toHaveBeenCalled();
  });

  it("subscribes (id,true) on active mount and starts polling", async () => {
    renderHook(() => useNodeSpectrum("node-1", true));
    await waitFor(() =>
      expect(mockSetWanted).toHaveBeenCalledWith("node-1", true),
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("node-1"));
  });

  it("unsubscribes (id,false) on unmount", async () => {
    const { unmount } = renderHook(() => useNodeSpectrum("node-1", true));
    await waitFor(() =>
      expect(mockSetWanted).toHaveBeenCalledWith("node-1", true),
    );
    unmount();
    await waitFor(() =>
      expect(mockSetWanted).toHaveBeenCalledWith("node-1", false),
    );
  });

  it("returns the real bins once the host yields a frame", async () => {
    mockGet.mockResolvedValue({
      bins: [0.1, 0.7, 0.3],
      fftSize: 2048,
      sampleRate: 48000,
    });
    const { result } = renderHook(() => useNodeSpectrum("node-1", true));
    await waitFor(() => expect(result.current).toEqual([0.1, 0.7, 0.3]));
  });

  it("stays [] while the host has no frame (honest, no fabricated bins)", async () => {
    mockGet.mockResolvedValue(null);
    const { result } = renderHook(() => useNodeSpectrum("node-1", true));
    // Give the poll loop a chance to run a couple of iterations.
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
