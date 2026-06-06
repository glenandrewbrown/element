/**
 * T10 — webview gate for "Group selection into a Container".
 * Validates the eligibility + CV-boundary refusals and the bridge handoff.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockData, CableData } from "../../../data/types";

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGroupNodes: vi.fn(async () => ({ ok: true, containerId: "c-1" })),
}));

import { nativeGroupNodes } from "../../../bridge/nativeGraph";
import { useGraphStore } from "../../../stores/useGraphStore";
import { useAppStore } from "../../../stores/useAppStore";
import {
  groupSelectedBlocks,
  groupSelectionWithFeedback,
  isGroupEligible,
} from "../groupSelection";

function block(over: Partial<BlockData>): BlockData {
  return {
    id: "b",
    name: "Test",
    category: "audiofx",
    format: "INT",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...over,
  };
}

function cable(over: Partial<CableData>): CableData {
  return {
    id: "c",
    source: "a",
    sourcePort: "out-0",
    target: "b",
    targetPort: "in-0",
    signalType: "audio",
    channelCount: 1,
    isSidechain: false,
    ...over,
  } as CableData;
}

function seed(nodes: BlockData[], edges: CableData[] = []) {
  useGraphStore.setState({ nodes, edges } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  seed([]);
});

describe("isGroupEligible", () => {
  it("rejects IO device nodes, Containers, Portals; accepts plain blocks", () => {
    expect(isGroupEligible(block({ identifier: "audio.input" }))).toBe(false);
    expect(isGroupEligible(block({ identifier: "midi.output" }))).toBe(false);
    expect(isGroupEligible(block({ containerNodeCount: 3 }))).toBe(false);
    expect(isGroupEligible(block({ isPortal: true }))).toBe(false);
    expect(isGroupEligible(block({ identifier: "element.graph" }))).toBe(false);
    expect(isGroupEligible(block({ identifier: "element.compare" }))).toBe(true);
    expect(isGroupEligible(block({}))).toBe(true);
  });
});

describe("groupSelectedBlocks", () => {
  it("refuses fewer than 2 selected", async () => {
    seed([block({ id: "a" })]);
    expect(await groupSelectedBlocks(["a"])).toEqual({
      ok: false,
      reason: "need-2",
    });
    expect(nativeGroupNodes).not.toHaveBeenCalled();
  });

  it("refuses when selection contains an IO device node", async () => {
    seed([block({ id: "a" }), block({ id: "io", identifier: "audio.input" })]);
    expect(await groupSelectedBlocks(["a", "io"])).toEqual({
      ok: false,
      reason: "ineligible",
    });
    expect(nativeGroupNodes).not.toHaveBeenCalled();
  });

  it("refuses when a CV cable crosses the selection boundary", async () => {
    seed(
      [block({ id: "a" }), block({ id: "b" }), block({ id: "ext" })],
      [cable({ id: "cv", source: "ext", target: "a", signalType: "value" })],
    );
    expect(await groupSelectedBlocks(["a", "b"])).toEqual({
      ok: false,
      reason: "cv-boundary",
    });
    expect(nativeGroupNodes).not.toHaveBeenCalled();
  });

  it("allows an INTERNAL CV cable (both ends selected)", async () => {
    seed(
      [block({ id: "a" }), block({ id: "b" })],
      [cable({ id: "cv", source: "a", target: "b", signalType: "value" })],
    );
    expect(await groupSelectedBlocks(["a", "b"])).toEqual({
      ok: true,
      containerId: "c-1",
    });
    expect(nativeGroupNodes).toHaveBeenCalledWith(["a", "b"]);
  });

  it("hands a clean audio selection to the bridge", async () => {
    seed(
      [block({ id: "a" }), block({ id: "b" }), block({ id: "ext" })],
      [cable({ id: "au", source: "ext", target: "a", signalType: "audio" })],
    );
    expect(await groupSelectedBlocks(["a", "b"])).toEqual({
      ok: true,
      containerId: "c-1",
    });
    expect(nativeGroupNodes).toHaveBeenCalledWith(["a", "b"]);
  });

  it("passes through an engine refusal reason", async () => {
    vi.mocked(nativeGroupNodes).mockResolvedValueOnce({
      ok: false,
      reason: "ineligible",
    });
    seed([block({ id: "a" }), block({ id: "b" })]);
    expect(await groupSelectedBlocks(["a", "b"])).toEqual({
      ok: false,
      reason: "ineligible",
    });
  });
});

describe("groupSelectionWithFeedback (shared chord/menu feedback)", () => {
  it("surfaces a refusal in the status footer, then clears it", async () => {
    vi.useFakeTimers();
    try {
      seed([block({ id: "a" })]); // 1 selected → "need-2" refusal
      groupSelectionWithFeedback(["a"]);
      await vi.advanceTimersByTimeAsync(0); // flush the promise chain
      expect(useAppStore.getState().canvasHint).toBe(
        "Select at least 2 blocks to group",
      );
      await vi.advanceTimersByTimeAsync(3000);
      expect(useAppStore.getState().canvasHint).toBeNull();
    } finally {
      vi.useRealTimers();
      useAppStore.getState().setCanvasHint(null);
    }
  });

  it("sets no hint on success", async () => {
    seed([block({ id: "a" }), block({ id: "b" })]);
    groupSelectionWithFeedback(["a", "b"]);
    await Promise.resolve();
    await Promise.resolve();
    expect(useAppStore.getState().canvasHint).toBeNull();
  });
});
