/**
 * Tests for <QuickAccess /> — perform-mode block roster panel.
 *
 * Mocks: useGraphStore, usePerformStore (no bridge calls in this component).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BlockData } from "../../../data/types";

// ── Mock stores ──────────────────────────────────────────────────────────────
// Use vi.fn() without factory-time variable refs to avoid hoisting TDZ issues.

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn(),
  selectNodes: (s: { nodes: unknown[] }) => s.nodes,
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn(),
  selectSessionName: (s: { sessionName: string }) => s.sessionName,
  selectLiveHealth: (s: { liveHealth: string }) => s.liveHealth,
}));

import { QuickAccess } from "../QuickAccess";
import { useGraphStore } from "../../../stores/useGraphStore";
import { usePerformStore } from "../../../stores/usePerformStore";

function setNodes(nodes: Partial<BlockData>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useGraphStore).mockImplementation((selector: any) =>
    selector({ nodes, edges: [], zoomTier: "normal" }),
  );
}

const defaultHealth = {
  cpu: 5,
  buffer: 256,
  latency: 5.3,
  clock: "00:00:00",
  bpm: 120,
  timecode: "00:00:00:00",
  sampleRateLabel: "48.0 kHz",
  alerts: [],
  ioActivity: "nominal" as const,
  outputPeak: 0,
};

function setSession(name: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(usePerformStore).mockImplementation((selector: any) =>
    selector({ sessionName: name, liveHealth: defaultHealth }),
  );
}

beforeEach(() => {
  setNodes([]);
  setSession("My Project");
});

describe("<QuickAccess />", () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders Quick Access heading", () => {
    render(<QuickAccess />);
    expect(screen.getByText(/quick access/i)).toBeInTheDocument();
  });

  it("renders project name from store", () => {
    setSession("My Project");
    render(<QuickAccess />);
    expect(screen.getByText("My Project")).toBeInTheDocument();
  });

  it("shows empty state when no blocks", () => {
    setNodes([]);
    render(<QuickAccess />);
    expect(
      screen.getByText(/no blocks yet/i),
    ).toBeInTheDocument();
  });

  it("renders block names when nodes present", () => {
    setNodes([
      {
        id: "n1",
        name: "Surge XT",
        category: "instrument",
        position: { x: 0, y: 0 },
      } as BlockData,
      {
        id: "n2",
        name: "Pro-Q 3",
        category: "audiofx",
        position: { x: 100, y: 0 },
      } as BlockData,
    ]);
    render(<QuickAccess />);
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
    expect(screen.getByText("Pro-Q 3")).toBeInTheDocument();
  });

  // ── Ordering ───────────────────────────────────────────────────────────────

  it("orders blocks top-to-bottom by Y position", () => {
    setNodes([
      { id: "b", name: "Bottom", category: "audiofx", position: { x: 0, y: 200 } } as BlockData,
      { id: "t", name: "Top", category: "instrument", position: { x: 0, y: 0 } } as BlockData,
    ]);
    render(<QuickAccess />);
    const items = screen.getAllByText(/Top|Bottom/);
    expect(items[0].textContent).toBe("Top");
    expect(items[1].textContent).toBe("Bottom");
  });

  it("orders blocks left-to-right when Y is equal", () => {
    setNodes([
      { id: "r", name: "Right", category: "audiofx", position: { x: 200, y: 100 } } as BlockData,
      { id: "l", name: "Left", category: "instrument", position: { x: 0, y: 100 } } as BlockData,
    ]);
    render(<QuickAccess />);
    const items = screen.getAllByText(/Left|Right/);
    expect(items[0].textContent).toBe("Left");
    expect(items[1].textContent).toBe("Right");
  });

  // ── Category dots ──────────────────────────────────────────────────────────

  it("applies instrument category dot class", () => {
    setNodes([
      { id: "i", name: "Synth", category: "instrument", position: { x: 0, y: 0 } } as BlockData,
    ]);
    const { container } = render(<QuickAccess />);
    expect(container.querySelector(".bg-instrument")).toBeInTheDocument();
  });

  it("applies audiofx category dot class", () => {
    setNodes([
      { id: "e", name: "EQ", category: "audiofx", position: { x: 0, y: 0 } } as BlockData,
    ]);
    const { container } = render(<QuickAccess />);
    expect(container.querySelector(".bg-audiofx")).toBeInTheDocument();
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("renders without crashing when project name is empty string", () => {
    setSession("");
    expect(() => render(<QuickAccess />)).not.toThrow();
  });

  it("renders unknown category without crashing (fallback dot)", () => {
    setNodes([
      { id: "x", name: "Unknown", category: "modulator" as BlockData["category"], position: { x: 0, y: 0 } } as BlockData,
    ]);
    expect(() => render(<QuickAccess />)).not.toThrow();
  });
});
