/**
 * T5 — node-parameter metadata cache invalidation.
 *
 * A reused UUID after a topology change must not serve stale metadata. Tests the
 * pure cache helpers (peek/invalidate/prune/clear) without the React hook (the
 * hook itself is exercised by the Block integration tests).
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

// nativeGetNodeParameters is not called by the pure helpers, but the module
// imports it — stub the bridge so jsdom doesn't touch window.__JUCE__.
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGetNodeParameters: vi.fn(async () => ({ parameters: [] })),
}));

import {
  peekNodeParamMeta,
  invalidateNodeParamMeta,
  pruneNodeParamMeta,
  _clearNodeParamMetaCache,
} from "../inline/useNodeParamMeta";

// Seed the module cache through a tiny back-door: prime via peek-after-set is
// not exposed, so we drive the cache via the public mutators + a manual set
// using the same Map the module owns. The module exposes invalidate/prune which
// operate on its internal cache; to observe pruning we first populate it by
// calling the (mocked) fetch through the hook is heavy — instead we assert the
// mutators are pure no-throw and the clear resets observable state.

describe("useNodeParamMeta cache helpers", () => {
  beforeEach(() => {
    _clearNodeParamMetaCache();
  });

  it("peek returns undefined for an unfetched node", () => {
    expect(peekNodeParamMeta("node-a")).toBeUndefined();
  });

  it("invalidate is a safe no-op when nothing is cached", () => {
    expect(() => invalidateNodeParamMeta("node-x")).not.toThrow();
    expect(peekNodeParamMeta("node-x")).toBeUndefined();
  });

  it("prune reports nothing when cache is empty", () => {
    expect(pruneNodeParamMeta(["a", "b"])).toEqual([]);
  });
});

// To genuinely test prune behaviour we exercise the real fetch path via the
// hook in a minimal render so the cache is populated, then prune.
import { renderHook, waitFor } from "@testing-library/react";
import { useNodeParamMeta } from "../inline/useNodeParamMeta";
import { nativeGetNodeParameters } from "../../../bridge/nativeGraph";

describe("useNodeParamMeta cache population + prune", () => {
  beforeEach(() => {
    _clearNodeParamMetaCache();
    vi.mocked(nativeGetNodeParameters).mockClear();
    vi.mocked(nativeGetNodeParameters).mockResolvedValue({
      parameters: [
        { index: 0, name: "Gain", value: 0.5, defaultValue: 0.5 },
      ],
    });
  });

  it("fetches once then serves from cache (no second bridge call)", async () => {
    const { result, rerender } = renderHook(() => useNodeParamMeta("node-1", true));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toHaveLength(1);
    expect(peekNodeParamMeta("node-1")).toHaveLength(1);
    rerender();
    expect(vi.mocked(nativeGetNodeParameters)).toHaveBeenCalledTimes(1);
  });

  it("prune drops a node no longer in the live set", async () => {
    const { result } = renderHook(() => useNodeParamMeta("node-2", true));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(peekNodeParamMeta("node-2")).toBeDefined();
    const pruned = pruneNodeParamMeta(["node-other"]);
    expect(pruned).toContain("node-2");
    expect(peekNodeParamMeta("node-2")).toBeUndefined();
  });

  it("does NOT fetch when disabled (chooser-only faces)", async () => {
    const { result } = renderHook(() => useNodeParamMeta("node-3", false));
    await waitFor(() => expect(result.current).toEqual([]));
    expect(vi.mocked(nativeGetNodeParameters)).not.toHaveBeenCalled();
  });
});
