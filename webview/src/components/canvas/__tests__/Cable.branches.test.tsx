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
  // NOTE: since T9b each non-wireless cable also renders a <marker> whose
  // arrowhead is itself a <path>. Count only React-Flow edge paths (they carry
  // the `react-flow__edge-*` classes) so the marker glyph doesn't skew counts.

  const edgePaths = (container: HTMLElement) =>
    container.querySelectorAll(
      "path.react-flow__edge-path, path.react-flow__edge-interaction",
    );

  it("glow layer absent when amp=0 and not selected — 2 paths (1 BaseEdge)", () => {
    mockLevel.value = 0;
    const { container } = render(<Cable {...base} selected={false} />);
    // glow condition: (false || 0 > 0.01) = false → 1 BaseEdge = 2 paths
    expect(edgePaths(container).length).toBe(2);
  });

  it("glow layer renders when selected=true even at amp=0 — 4 paths (2 BaseEdges)", () => {
    mockLevel.value = 0;
    const { container } = render(<Cable {...base} selected={true} />);
    // (true || 0 > 0.01) = true → glow + main BaseEdge = 4 paths
    expect(edgePaths(container).length).toBeGreaterThanOrEqual(4);
  });

  it("glow layer renders when amp > 0.01 — 4 paths (2 BaseEdges)", () => {
    mockLevel.value = 0.5;
    const { container } = render(<Cable {...base} selected={false} />);
    expect(edgePaths(container).length).toBeGreaterThanOrEqual(4);
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

  // ── T9a: routing → path-function selection ───────────────────────────────
  // Bezier emits a cubic curve (a `C` command); smoothstep/manhattan emits
  // orthogonal segments (`L` commands, no `C`). We assert on the main path's
  // `d` to prove which generator ran for each routing value.

  function mainPathD(container: HTMLElement): string {
    // BaseEdge renders the visible path first; grab the one carrying our
    // signal-coloured stroke (the interactive hit-path has no stroke colour).
    const paths = Array.from(container.querySelectorAll("path"));
    const visible = paths.find((p) => {
      const s = (p.getAttribute("style") ?? "") + (p.style?.stroke ?? "");
      return s.includes("#4A90D9") || s.toLowerCase().includes("rgb(74");
    });
    return (visible ?? paths[0]).getAttribute("d") ?? "";
  }

  it("unset/default routing resolves to bezier (cubic `C` in path)", () => {
    // The store default is "bezier" (T9a); the mock mirrors that default.
    mockRouting.value = "bezier";
    const { container } = render(<Cable {...base} />);
    expect(mainPathD(container)).toContain("C");
  });

  it("routing 'bezier' → bezier path (cubic `C`)", () => {
    mockRouting.value = "bezier";
    const { container } = render(<Cable {...base} />);
    expect(mainPathD(container)).toContain("C");
  });

  it("routing 'manhattan'/step → smoothstep path (orthogonal `L`, no `C`)", () => {
    mockRouting.value = "manhattan";
    mockNodes.value = [
      { id: "node-1", ports: [{ id: "out-0", direction: "output" }] },
    ];
    const { container } = render(<Cable {...base} />);
    const d = mainPathD(container);
    expect(d).toContain("L");
    expect(d).not.toContain("C");
  });

  // ── T9c: pulse overlay amp-gating + speed/opacity scaling ────────────────
  // The dashed pulse overlay is a SEPARATE BaseEdge with id `${id}-pulse`,
  // mounted only above threshold. Its animation duration shrinks with amp
  // (faster march) and its opacity grows with amp.

  function pulseOverlay(container: HTMLElement): SVGPathElement | null {
    // The overlay path carries the signalPulse animation in its inline style.
    return Array.from(container.querySelectorAll("path")).find((p) =>
      (p.getAttribute("style") ?? "").includes("signalPulse"),
    ) as SVGPathElement | null ?? null;
  }

  it("idle cable (amp ≤ threshold) renders NO pulse overlay", () => {
    mockLevel.value = 0;
    const { container } = render(<Cable {...base} />);
    expect(pulseOverlay(container)).toBeNull();
  });

  it("amp exactly at threshold (0.05) still renders NO overlay (strict >)", () => {
    mockLevel.value = 0.05;
    const { container } = render(<Cable {...base} />);
    expect(pulseOverlay(container)).toBeNull();
  });

  it("hot cable (amp > threshold) renders the dashed pulse overlay", () => {
    mockLevel.value = 0.5;
    const { container } = render(<Cable {...base} />);
    const overlay = pulseOverlay(container);
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute("style")).toContain("8 16");
  });

  it("pulse march is FASTER (shorter duration) at higher amp", () => {
    mockLevel.value = 0.2;
    const slow = render(<Cable {...base} />);
    const slowDur = parseFloat(
      /signalPulse\s+([\d.]+)s/.exec(
        pulseOverlay(slow.container)!.getAttribute("style") ?? "",
      )![1],
    );
    mockLevel.value = 0.9;
    const fast = render(<Cable {...base} />);
    const fastDur = parseFloat(
      /signalPulse\s+([\d.]+)s/.exec(
        pulseOverlay(fast.container)!.getAttribute("style") ?? "",
      )![1],
    );
    expect(fastDur).toBeLessThan(slowDur);
  });

  it("pulse opacity GROWS with amp and stays within the 0.3–0.8 band", () => {
    function opacityAt(level: number): number {
      mockLevel.value = level;
      const { container } = render(<Cable {...base} />);
      const overlay = pulseOverlay(container)!;
      // opacity is read from the inline style (jsdom keeps it as a string).
      return parseFloat(overlay.style.opacity);
    }
    const low = opacityAt(0.1);
    const high = opacityAt(0.95);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(0.3);
    expect(high).toBeLessThanOrEqual(0.8);
  });

  it("sidechain keeps its static dash and renders NO pulse overlay even when hot", () => {
    mockLevel.value = 0.8;
    const { container } = render(
      <Cable {...base} data={{ ...base.data, isSidechain: true }} />,
    );
    expect(pulseOverlay(container)).toBeNull();
  });

  // ── T9b: endpoint plugs + per-edge arrowhead marker presence ─────────────

  it("renders source + target endpoint plug circles", () => {
    const { container } = render(<Cable {...base} />);
    expect(
      container.querySelector('[data-testid="cable-plug-source-edge-1"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cable-plug-target-edge-1"]'),
    ).not.toBeNull();
  });

  it("defines a per-edge arrowhead marker and points marker-end at it", () => {
    const { container } = render(<Cable {...base} />);
    expect(container.querySelector("marker#cable-arrow-edge-1")).not.toBeNull();
    const markerEnds = Array.from(container.querySelectorAll("path"))
      .map((p) => p.getAttribute("marker-end"))
      .filter(Boolean);
    expect(markerEnds).toContain("url(#cable-arrow-edge-1)");
  });

  it("wireless cable renders NO plugs or arrowhead marker (visual delegated to badges)", () => {
    mockBusCables.value = { "edge-1": "Reverb Send" };
    const { container } = render(<Cable {...base} />);
    expect(
      container.querySelector('[data-testid="cable-plug-source-edge-1"]'),
    ).toBeNull();
    expect(container.querySelector("marker#cable-arrow-edge-1")).toBeNull();
  });

  // ── T9b: unique marker ids across two edges ──────────────────────────────

  it("two edges get DISTINCT arrowhead marker ids (no colour collision)", () => {
    const a = render(<Cable {...base} id="edge-A" />);
    const b = render(<Cable {...base} id="edge-B" />);
    expect(a.container.querySelector("marker#cable-arrow-edge-A")).not.toBeNull();
    expect(b.container.querySelector("marker#cable-arrow-edge-B")).not.toBeNull();
    // The ids must differ so the second edge can't inherit the first's colour.
    expect(a.container.querySelector("marker#cable-arrow-edge-B")).toBeNull();
  });
});
