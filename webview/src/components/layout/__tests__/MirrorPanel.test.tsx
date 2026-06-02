// Tests for MirrorPanel.tsx (U11).
//
// Verifies the three honest states (no target → nothing; unavailable →
// EmptyState; snapshot → real summary), and that the component imports NO
// mutation bridge fns (strictly read-only mirror).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { MirrorPanel } from "../MirrorPanel";

const mockSetMirrorTarget = vi.fn();
const mockUseInstancesStore = vi.fn() as any;
// getState used in a type-only position by MirrorBody; provide a stub.
mockUseInstancesStore.getState = () => ({ mirrorSnapshot: null });

vi.mock("../../../stores/useInstancesStore", () => ({
  useInstancesStore: Object.assign(
    (selector?: (s: any) => any) => mockUseInstancesStore(selector),
    { getState: () => ({ mirrorSnapshot: null }) },
  ),
  selectMirrorTargetId: (s: any) => s.mirrorTargetId,
  selectMirrorSnapshot: (s: any) => s.mirrorSnapshot,
  selectMirrorUnavailable: (s: any) => s.mirrorUnavailable,
  selectOtherInstances: (s: any) => s.instances.filter((i: any) => !i.isSelf),
}));

vi.mock("zustand/react/shallow", () => ({
  useShallow: (fn: any) => fn,
}));

function setupStore(partial: Record<string, unknown>) {
  const state = {
    mirrorTargetId: null,
    mirrorSnapshot: null,
    mirrorUnavailable: false,
    instances: [
      { id: 2, name: "Project B", variant: 1, isSelf: false, hasGraph: true },
    ],
    setMirrorTarget: mockSetMirrorTarget,
    ...partial,
  };
  mockUseInstancesStore.mockImplementation((selector?: (s: any) => any) =>
    selector ? selector(state) : state,
  );
}

const SNAPSHOT = {
  schema: 2,
  session: { name: "Project B" },
  breadcrumbs: ["Root", "Synth Rack"],
  blocks: [
    { id: "n1", name: "Massive", category: "instrument" },
    { id: "n2", name: "Reverb", category: "audiofx" },
  ],
  cables: [{ id: "c1" }],
  engine: { isPlaying: true },
};

describe("MirrorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when there is no mirror target", () => {
    setupStore({ mirrorTargetId: null });
    const { container } = render(<MirrorPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the honest 'Instance unavailable' empty state", () => {
    setupStore({ mirrorTargetId: 99, mirrorUnavailable: true });
    render(<MirrorPanel />);
    expect(screen.getByText("Instance unavailable")).toBeInTheDocument();
  });

  it("shows the unavailable empty state when the snapshot is null", () => {
    setupStore({ mirrorTargetId: 2, mirrorSnapshot: null });
    render(<MirrorPanel />);
    expect(screen.getByText("Instance unavailable")).toBeInTheDocument();
  });

  it("renders peer name + READ ONLY badge + real block/cable counts", () => {
    setupStore({ mirrorTargetId: 2, mirrorSnapshot: SNAPSHOT });
    render(<MirrorPanel />);
    // Peer name in the header.
    expect(screen.getAllByText("Project B").length).toBeGreaterThan(0);
    // Read-only badge.
    expect(screen.getByText(/MIRROR/i)).toBeInTheDocument();
    // Real counts from the snapshot (2 blocks, 1 cable).
    expect(screen.getByText("2")).toBeInTheDocument(); // blocks
    expect(screen.getByText("1")).toBeInTheDocument(); // cables
    // Block names from the real snapshot.
    expect(screen.getByText("Massive")).toBeInTheDocument();
    expect(screen.getByText("Reverb")).toBeInTheDocument();
    // Active board = last breadcrumb.
    expect(screen.getByText("Synth Rack")).toBeInTheDocument();
  });

  it("is strictly read-only — imports NO mutation bridge fns", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../MirrorPanel.tsx"),
      "utf8",
    );
    // No graph-mutation bridge imports/calls (the mirror must never edit a peer).
    expect(src).not.toMatch(/nativeGraph/);
    expect(src).not.toMatch(/nativeSession/);
    expect(src).not.toMatch(/elementGraph/);
  });
});
