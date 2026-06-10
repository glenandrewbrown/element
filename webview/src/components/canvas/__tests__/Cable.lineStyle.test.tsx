/**
 * Cable.lineStyle — connected-cable solidity (T11, 2026-06-10 feedback).
 *
 * Glen: "The Midi cable when connected should be a solid line, as per the
 * audio cable." ALL connected cables are now SOLID regardless of signal type
 * — the signal colour identifies the type; a dash on a real wire reads as
 * "broken". The per-type dash axis (midi dashed, value dotted) lives ONLY on
 * GhostEdge (pending/suggested cables). The sidechain "6 4" dash is a separate
 * semantic marker and still wins (covered below). Supersedes the Task 5.4
 * line-style axis for CONNECTED cables.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Position } from "@xyflow/react";

// ── Hoisted mutable store values (mirror Cable.branches.test wiring) ──────────

const { mockLevel, mockRouting, mockBusCables, mockNodes } = vi.hoisted(() => ({
  mockLevel: { value: 0 },
  mockRouting: { value: "bezier" as string },
  mockBusCables: { value: {} as Record<string, string> },
  mockNodes: {
    value: [] as Array<{ id: string; ports: Array<{ id: string; direction: string }> }>,
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

import { Cable, lineStyleForSignal } from "../Cable";

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

// The MAIN visible cable path carries the signal colour + line-style dash.
// Identify it by its `react-flow__edge-path` class and the signal stroke
// (the interactive hit-path has no stroke colour; the pulse overlay only
// mounts above the activity threshold, which these idle cables stay below).
function mainPathDash(container: HTMLElement, color: string): string | null {
  const paths = Array.from(
    container.querySelectorAll<SVGPathElement>("path.react-flow__edge-path"),
  );
  const main = paths.find((p) => {
    const s = (p.getAttribute("style") ?? "") + (p.style?.stroke ?? "");
    return (
      s.includes(color) ||
      s.toLowerCase().includes(color.toLowerCase()) ||
      s.toLowerCase().includes("rgb(")
    );
  });
  const el = main ?? paths[0];
  if (!el) return null;
  // jsdom keeps strokeDasharray on the inline style map.
  return el.style.strokeDasharray || null;
}

describe("lineStyleForSignal (Task 5.4 pure mapping)", () => {
  it("audio → solid (undefined dash)", () => {
    expect(lineStyleForSignal("audio")).toBeUndefined();
  });

  it("midi → solid when connected (T11)", () => {
    expect(lineStyleForSignal("midi")).toBeUndefined();
  });

  it("value/CV → solid when connected (T11)", () => {
    expect(lineStyleForSignal("value")).toBeUndefined();
  });

  it("all three connected styles are solid (no dash axis on real wires)", () => {
    expect(lineStyleForSignal("audio")).toBeUndefined();
    expect(lineStyleForSignal("midi")).toBeUndefined();
    expect(lineStyleForSignal("value")).toBeUndefined();
  });

  it("unknown/missing type falls back to solid (audio)", () => {
    expect(lineStyleForSignal(undefined)).toBeUndefined();
    expect(lineStyleForSignal("nonsense")).toBeUndefined();
  });
});

describe("Cable line-style axis on the rendered main stroke", () => {
  it("audio cable's main stroke is solid (no dasharray)", () => {
    const { container } = render(
      <Cable {...base} data={{ ...base.data, signalType: "audio" }} />,
    );
    // Solid ⇒ no dasharray on the main path.
    expect(mainPathDash(container, "#4A90D9")).toBeNull();
  });

  it("midi cable's main stroke is solid (T11)", () => {
    const { container } = render(
      <Cable {...base} data={{ ...base.data, signalType: "midi" }} />,
    );
    expect(mainPathDash(container, "#2BC4C4")).toBeNull();
  });

  it("value/CV cable's main stroke is solid (T11)", () => {
    const { container } = render(
      <Cable {...base} data={{ ...base.data, signalType: "value" }} />,
    );
    expect(mainPathDash(container, "#E8A838")).toBeNull();
  });

  it("all connected signal types render solid main strokes", () => {
    const audio = render(
      <Cable {...base} data={{ ...base.data, signalType: "audio" }} />,
    );
    const midi = render(
      <Cable {...base} data={{ ...base.data, signalType: "midi" }} />,
    );
    const value = render(
      <Cable {...base} data={{ ...base.data, signalType: "value" }} />,
    );
    expect(mainPathDash(audio.container, "#4A90D9")).toBeNull();
    expect(mainPathDash(midi.container, "#2BC4C4")).toBeNull();
    expect(mainPathDash(value.container, "#E8A838")).toBeNull();
  });

  it("sidechain dash ('6 4') OVERRIDES the signal-type line-style", () => {
    // A sidechain audio cable would be solid by type, but the sidechain
    // semantic wins and keeps the dedicated "6 4" dash.
    const { container } = render(
      <Cable
        {...base}
        data={{ ...base.data, signalType: "audio", isSidechain: true }}
      />,
    );
    expect(mainPathDash(container, "#4A90D9")).toBe("6 4");
  });
});
