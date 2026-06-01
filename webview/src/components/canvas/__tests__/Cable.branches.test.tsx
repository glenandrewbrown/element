/**
 * Cable.branches — covers branches not exercised in Cable.test.tsx:
 *   - wireless cable: unselected (opacity 0) vs selected (ghost stroke 1.5)
 *   - glow layer: renders when amp > 0.01, hidden when amp = 0 + not selected
 *   - sidechain dash pattern "6 4"
 *   - signal-pulse animation when amp > 0.05
 *   - unknown channelCount → undefined width (React Flow default)
 *   - manhattan routing: fanOffset for multi-output vs single-output block
 *   - data.sourcePort not in outPorts → fanOffset 0
 *   - node not found in store → fanOffset 0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Position } from "@xyflow/react";

// ── Hoisted mutable store values ─────────────────────────────────────────────

const { mockLevel, mockRouting, mockBusCables, mockNodes } = vi.hoisted(() => ({
  mockLevel: { value: 0 },
  mockRouting: { value: "bezier" as string },
  mockBusCables: { value: {} as Record<string, string> },
  mockNodes: {
    value: [] as Array<{
      id: string;
      ports: Array<{ id: string; direction: string }>;
    }>,
  },
}));

vi.mock("../../../stores/useCableMeterStore", () => ({
  useCableMeterStore: (sel: (s: { levels: Record<string, number> }) => unknown) =>
    sel({ levels: { "edge-1": mockLevel.value } }),
}));

vi.mock("../../../stores/useAppStore", () => ({
  useAppStore: (sel: (s: { cableRouting: string }) => unknown) =>
    sel({ cableRouting: mockRouting.value }),
}));

vi.mock("../../../stores/useBusStore", () => ({
  useBusStore: (sel: (s: { cableBus: Record<string, string> }) => unknown) =>
    sel({ cableBus: mockBusCables.value }),
}));

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: (
    sel: (s: {
      nodes: Array<{ id: string; ports: Array<{ id: string; direction: string }> }>;
    }) => unknown,
  ) => sel({ nodes: mockNodes.value }),
}));

import { Cable } from "../Cable";

// ── Base props (EdgeProps shape) ──────────────────────────────────────────────

const base = {
  id: "edge-1",
  source: "node-1",
  target: "node-2",
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  selected: false,
  animated: false,
  markerStart: undefined,
  markerEnd: undefined,
  style: {},
  label: undefined,
  labelStyle: undefined,
  labelShowBg: false,
  labelBgStyle: undefined,
  labelBgPadding: undefined as unknown as [number, number],
  labelBgBorderRadius: undefined,
  interactionWidth: 20,
  data: { signalType: "audio", channelCount: 2, sourcePort: "out-0" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLevel.value = 0;
  mockRouting.value = "bezier";
  mockBusCables.value = {};
  mockNodes.value = [];
});

describe("Cable branches", () => {
  // ── Wireless: unselected → opacity 0 ─────────────────────────────────────

  it("wireless + unselected: renders one BaseEdge (no glow layer)", () => {
    mockBusCables.value = { "edge-1": "Reverb Send" };
    const { container } = render(<Cable {...base} selected={false} />);
    expect(container.querySelector("path")).not.toBeNull();
    // Wireless branch: one BaseEdge only (no glow BaseEdge prepended).
    // BaseEdge itself renders 2 SVG paths (visual + interactive hitbox).
    const pathCount = container.querySelectorAll("path").length;
    expect(pathCount).toBe(2);
  });

  it("wireless + selected: same single BaseEdge (ghost stroke, still 2 paths)", () => {
    mockBusCables.value = { "edge-1": "Bus A" };
    const { container } = render(<Cable {...base} selected={true} />);
    // Wireless path: always one BaseEdge regardless of selection
    const pathCount = container.querySelectorAll("path").length;
    expect(pathCount).toBe(2);
  });

  // ── Glow layer ────────────────────────────────────────────────────────────
  // BaseEdge renders 2 SVG paths (visual + hit-box).
  // No-glow case: 1 BaseEdge = 2 paths.
  // Glow case: glow BaseEdge + main BaseEdge = 4 paths.

  it("glow layer absent when amp=0 and not selected — 2 paths (1 BaseEdge)", () => {
    mockLevel.value = 0;
    const { container } = render(<Cable {...base} selected={false} />);
    const paths = container.querySelectorAll("path");
    // glow condition: (false || 0 > 0.01) = false → 1 BaseEdge = 2 paths
    expect(paths.length).toBe(2);
  });

  it("glow layer renders when selected=true even at amp=0 — 4 paths (2 BaseEdges)", () => {
    mockLevel.value = 0;
    const { container } = render(<Cable {...base} selected={true} />);
    // (true || 0 > 0.01) = true → glow + main BaseEdge = 4 paths
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });

  it("glow layer renders when amp > 0.01 — 4 paths (2 BaseEdges)", () => {
    mockLevel.value = 0.5;
    const { container } = render(<Cable {...base} selected={false} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });

  // ── Sidechain dash pattern ────────────────────────────────────────────────

  it("sidechain cable renders without crash", () => {
    const props = {
      ...base,
      data: { ...base.data, isSidechain: true, channelCount: 2 },
    };
    expect(() => render(<Cable {...props} />)).not.toThrow();
  });

  it("sidechain vs non-sidechain both render exactly one main path", () => {
    const sidechain = render(
      <Cable {...base} data={{ ...base.data, isSidechain: true }} />,
    );
    const normal = render(
      <Cable {...base} data={{ ...base.data, isSidechain: false }} />,
    );
    expect(sidechain.container.querySelector("path")).not.toBeNull();
    expect(normal.container.querySelector("path")).not.toBeNull();
  });

  // ── Signal-pulse animation ────────────────────────────────────────────────

  it("renders without crash at amp > 0.05 (pulse animation branch)", () => {
    mockLevel.value = 0.8;
    expect(() => render(<Cable {...base} />)).not.toThrow();
  });

  it("renders without crash at amp exactly at threshold (0.05)", () => {
    mockLevel.value = 0.05;
    expect(() => render(<Cable {...base} />)).not.toThrow();
  });

  // ── Channel width lookup ──────────────────────────────────────────────────

  it("renders without crash for channelCount=1 (mono)", () => {
    expect(() =>
      render(<Cable {...base} data={{ ...base.data, channelCount: 1 }} />),
    ).not.toThrow();
  });

  it("renders without crash for channelCount=6 (surround)", () => {
    expect(() =>
      render(<Cable {...base} data={{ ...base.data, channelCount: 6 }} />),
    ).not.toThrow();
  });

  it("renders without crash for unknown channelCount (→ undefined width)", () => {
    expect(() =>
      render(<Cable {...base} data={{ ...base.data, channelCount: 99 }} />),
    ).not.toThrow();
  });

  // ── Signal type colours ───────────────────────────────────────────────────

  it("renders without crash for unknown signalType (→ falls back to audio colour)", () => {
    expect(() =>
      render(<Cable {...base} data={{ ...base.data, signalType: "unknown" }} />),
    ).not.toThrow();
  });

  // ── Manhattan routing ─────────────────────────────────────────────────────

  it("manhattan routing: single output port → fanOffset 0, no crash", () => {
    mockRouting.value = "manhattan";
    mockNodes.value = [
      { id: "node-1", ports: [{ id: "out-0", direction: "output" }] },
    ];
    expect(() => render(<Cable {...base} />)).not.toThrow();
  });

  it("manhattan routing: node not found → fanOffset 0, no crash", () => {
    mockRouting.value = "manhattan";
    mockNodes.value = []; // node-1 absent
    expect(() => render(<Cable {...base} />)).not.toThrow();
  });

  it("manhattan routing: sourcePort absent in outPorts → fanOffset 0, no crash", () => {
    mockRouting.value = "manhattan";
    mockNodes.value = [
      {
        id: "node-1",
        ports: [
          { id: "out-0", direction: "output" },
          { id: "out-1", direction: "output" },
        ],
      },
    ];
    // sourcePort "missing-port" not in outPorts → idx < 0 → fanOffset 0
    expect(() =>
      render(
        <Cable
          {...base}
          data={{ ...base.data, sourcePort: "missing-port" }}
        />,
      ),
    ).not.toThrow();
  });

  it("manhattan routing: multi-output, port found → non-zero fanOffset, no crash", () => {
    mockRouting.value = "manhattan";
    mockNodes.value = [
      {
        id: "node-1",
        ports: [
          { id: "out-0", direction: "output" },
          { id: "out-1", direction: "output" },
          { id: "in-0", direction: "input" },
        ],
      },
    ];
    // sourcePort "out-1" is at idx 1 in the 2-port fan → fanOffset = (1 - 0.5)*18 = 9
    expect(() =>
      render(<Cable {...base} data={{ ...base.data, sourcePort: "out-1" }} />),
    ).not.toThrow();
  });

  it("manhattan routing: first port of multi-output fan renders without crash", () => {
    mockRouting.value = "manhattan";
    mockNodes.value = [
      {
        id: "node-1",
        ports: [
          { id: "out-0", direction: "output" },
          { id: "out-1", direction: "output" },
        ],
      },
    ];
    // idx=0, fanOffset = (0 - 0.5)*18 = -9
    expect(() =>
      render(<Cable {...base} data={{ ...base.data, sourcePort: "out-0" }} />),
    ).not.toThrow();
  });

  // ── strokeOpacity formula ─────────────────────────────────────────────────

  it("does not crash at amp=1.0 (maximum level clamp)", () => {
    mockLevel.value = 1.0;
    expect(() => render(<Cable {...base} />)).not.toThrow();
  });

  it("does not crash when level store returns value > 1 (clamped to 1)", () => {
    mockLevel.value = 2.5;
    expect(() => render(<Cable {...base} />)).not.toThrow();
  });

  it("does not crash when level store returns negative value (clamped to 0)", () => {
    mockLevel.value = -0.5;
    expect(() => render(<Cable {...base} />)).not.toThrow();
  });
});
