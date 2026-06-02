/**
 * useGraphStore — gap coverage for async bridge rollback paths.
 *
 * The existing useGraphStore.test.ts tests optimistic updates by NOT
 * awaiting the toggle calls. These tests await them with controlled bridge
 * return values to exercise the rollback branches.
 *
 * Gaps covered:
 *   1. toggleBypass rolls back on bridge `false` return
 *   2. toggleBypass rolls back on bridge throw
 *   3. toggleMute rolls back on bridge `false` return
 *   4. toggleMute rolls back on bridge throw
 *   5. toggleMuteInput rolls back on bridge `false` return
 *   6. toggleMuteInput rolls back on bridge throw
 *   7. hydrateFromEngine with empty breadcrumbs → falls back to "Main Project"
 *   8. hydrateFromEngine with undefined breadcrumbs → falls back to "Main Project"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Default: bridge succeeds (returns true) so optimistic update is kept.
// Individual rollback tests override with mockResolvedValueOnce(false)
// or mockRejectedValueOnce(err).
const {
  mockSetBypass,
  mockSetMute,
  mockSetMuteInput,
  mockMoveNodes,
} = vi.hoisted(() => ({
  mockSetBypass: vi.fn(async () => true as boolean | undefined),
  mockSetMute: vi.fn(async () => true as boolean | undefined),
  mockSetMuteInput: vi.fn(async () => true as boolean | undefined),
  mockMoveNodes: vi.fn(async () => 0),
}));

vi.mock("../../bridge/nativeGraph", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp = (fn: (...a: any[]) => any) => (...a: any[]) => fn(...a);
  return {
    nativeGraphSetBypass: sp(mockSetBypass),
    nativeGraphSetMute: sp(mockSetMute),
    nativeGraphSetMuteInput: sp(mockSetMuteInput),
    nativeGraphMoveNodes: sp(mockMoveNodes),
  };
});

import type { BlockData } from "../../data/types";
import { useGraphStore } from "../useGraphStore";
import { useBusStore } from "../useBusStore";

const makeBlock = (id: string, bypassed = false, muted = false, muteInput = false): BlockData => ({
  id,
  name: `Block ${id}`,
  category: "audiofx",
  format: "VST3",
  position: { x: 0, y: 0 },
  ports: [],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed,
  muted,
  muteInput,
  error: false,
  isMacroTagged: false,
});

function resetStore() {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    breadcrumbStack: ["Main Project"],
    commentBoxes: [],
    minimapVisible: true,
    zoomTier: "standard",
  });
  useBusStore.setState({ cableBus: {} });
}

// ── toggleBypass rollback ────────────────────────────────────────────────────

describe("toggleBypass — async rollback paths", () => {
  beforeEach(() => {
    resetStore();
    useGraphStore.setState({ nodes: [makeBlock("n1")] });
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockSetBypass.mockImplementation(async () => true);
  });

  it("keeps bypassed=true when bridge confirms (returns true)", async () => {
    mockSetBypass.mockResolvedValueOnce(true);
    await useGraphStore.getState().toggleBypass("n1");
    expect(useGraphStore.getState().nodes[0].bypassed).toBe(true);
  });

  it("rolls back to bypassed=false when bridge returns false", async () => {
    mockSetBypass.mockResolvedValueOnce(false);
    await useGraphStore.getState().toggleBypass("n1");
    expect(useGraphStore.getState().nodes[0].bypassed).toBe(false);
  });

  it("rolls back to bypassed=false when bridge throws", async () => {
    mockSetBypass.mockRejectedValueOnce(new Error("bridge crash"));
    await useGraphStore.getState().toggleBypass("n1");
    expect(useGraphStore.getState().nodes[0].bypassed).toBe(false);
  });

  it("rolls back from bypassed=true to false when bridge rejects on second toggle", async () => {
    // Pre-set to already bypassed
    useGraphStore.setState({ nodes: [makeBlock("n1", true)] });
    mockSetBypass.mockResolvedValueOnce(false);
    await useGraphStore.getState().toggleBypass("n1");
    // Was true, optimistically set to false, rolled back to true... wait:
    // prev=true, optimistic: !true = false, rollback: prev=true
    expect(useGraphStore.getState().nodes[0].bypassed).toBe(true);
  });
});

// ── toggleMute rollback ──────────────────────────────────────────────────────

describe("toggleMute — async rollback paths", () => {
  beforeEach(() => {
    resetStore();
    useGraphStore.setState({ nodes: [makeBlock("n1")] });
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockSetMute.mockImplementation(async () => true);
  });

  it("keeps muted=true when bridge confirms", async () => {
    mockSetMute.mockResolvedValueOnce(true);
    await useGraphStore.getState().toggleMute("n1");
    expect(useGraphStore.getState().nodes[0].muted).toBe(true);
  });

  it("rolls back to muted=false when bridge returns false", async () => {
    mockSetMute.mockResolvedValueOnce(false);
    await useGraphStore.getState().toggleMute("n1");
    expect(useGraphStore.getState().nodes[0].muted).toBe(false);
  });

  it("rolls back to muted=false when bridge throws", async () => {
    mockSetMute.mockRejectedValueOnce(new Error("host unavailable"));
    await useGraphStore.getState().toggleMute("n1");
    expect(useGraphStore.getState().nodes[0].muted).toBe(false);
  });
});

// ── toggleMuteInput rollback ─────────────────────────────────────────────────

describe("toggleMuteInput — async rollback paths", () => {
  beforeEach(() => {
    resetStore();
    useGraphStore.setState({ nodes: [makeBlock("n1")] });
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockSetMuteInput.mockImplementation(async () => true);
  });

  it("keeps muteInput=true when bridge confirms", async () => {
    mockSetMuteInput.mockResolvedValueOnce(true);
    await useGraphStore.getState().toggleMuteInput("n1");
    expect(useGraphStore.getState().nodes[0].muteInput).toBe(true);
  });

  it("rolls back to muteInput=false when bridge returns false", async () => {
    mockSetMuteInput.mockResolvedValueOnce(false);
    await useGraphStore.getState().toggleMuteInput("n1");
    expect(useGraphStore.getState().nodes[0].muteInput).toBe(false);
  });

  it("rolls back to muteInput=false when bridge throws", async () => {
    mockSetMuteInput.mockRejectedValueOnce(new Error("timeout"));
    await useGraphStore.getState().toggleMuteInput("n1");
    expect(useGraphStore.getState().nodes[0].muteInput).toBe(false);
  });
});

// ── hydrateFromEngine breadcrumb fallback ────────────────────────────────────

describe("hydrateFromEngine — breadcrumb edge cases", () => {
  beforeEach(resetStore);

  it("falls back to ['Main Project'] when breadcrumbs is empty array", () => {
    useGraphStore.getState().hydrateFromEngine({
      nodes: [],
      edges: [],
      breadcrumbs: [],
    });
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
  });

  it("falls back to ['Main Project'] when breadcrumbs is undefined", () => {
    useGraphStore.getState().hydrateFromEngine({
      nodes: [],
      edges: [],
      // breadcrumbs omitted
    });
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Main Project"]);
  });

  it("uses supplied breadcrumbs when non-empty (regression guard)", () => {
    useGraphStore.getState().hydrateFromEngine({
      nodes: [],
      edges: [],
      breadcrumbs: ["Root", "Sub Board"],
    });
    expect(useGraphStore.getState().breadcrumbStack).toEqual(["Root", "Sub Board"]);
  });
});
