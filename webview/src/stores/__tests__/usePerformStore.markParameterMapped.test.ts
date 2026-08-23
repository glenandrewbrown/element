/**
 * Tests for `usePerformStore.markParameterMapped` — optimistic mapping with
 * bridge rollback (T-P6-9).
 *
 * Covers:
 *   1) Happy path: key is added to `mappedParameters` and bridge is called
 *   2) Bridge returns false: local set is rolled back to prior state
 *   3) Bridge throws: local set is rolled back to prior state
 *
 * `activateScene` is NOT tested here — sceneActivation.test.ts already covers
 * that chain end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock juceBackend BEFORE importing the store so `invokeElementNative` is
// already replaced when usePerformStore initialises.
vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));

// Also mock nativePerform so activateScene calls don't fire real bridge calls.
vi.mock("../../bridge/nativePerform", () => ({
  nativePerformSetActiveScene: vi.fn(async () => true),
}));

import { invokeElementNative } from "../../bridge/juceBackend";
import { usePerformStore } from "../usePerformStore";

const mockInvoke = invokeElementNative as unknown as ReturnType<typeof vi.fn>;

describe("usePerformStore.markParameterMapped", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    usePerformStore.setState({
      mappedParameters: new Set<string>(),
      mapModeActive: false,
    });
  });

  afterEach(() => {
    mockInvoke.mockReset();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("happy path: adds key to mappedParameters and calls the bridge", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    await usePerformStore.getState().markParameterMapped("node-1", 0, true);
    expect(usePerformStore.getState().mappedParameters.has("node-1:0")).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith(
      "elementPerformMarkParameterMapped",
      [{ nodeId: "node-1", paramIndex: 0, mapped: true }],
    );
  });

  it("happy path: removes key when mapped=false", async () => {
    usePerformStore.setState({
      mappedParameters: new Set(["node-1:0"]),
    });
    mockInvoke.mockResolvedValueOnce(true);
    await usePerformStore.getState().markParameterMapped("node-1", 0, false);
    expect(usePerformStore.getState().mappedParameters.has("node-1:0")).toBe(false);
  });

  // ── Bridge returns false → rollback ───────────────────────────────────────

  it("rolls back when bridge returns false", async () => {
    mockInvoke.mockResolvedValueOnce(false);
    await usePerformStore.getState().markParameterMapped("node-2", 1, true);
    expect(usePerformStore.getState().mappedParameters.has("node-2:1")).toBe(false);
  });

  // ── Bridge throws → rollback ──────────────────────────────────────────────

  it("rolls back when bridge throws", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("bridge failure"));
    await usePerformStore.getState().markParameterMapped("node-3", 2, true);
    expect(usePerformStore.getState().mappedParameters.has("node-3:2")).toBe(false);
  });
});
