/**
 * Cable.lineStyle — Task 5.4 (research §H/§B).
 *
 * Locks the per-signal-type LINE-STYLE axis layered on top of the signal
 * colour for colour-blind + low-zoom legibility:
 *   audio  → solid  (no stroke-dasharray)
 *   midi   → dashed
 *   value  → dotted
 * The dash is a STATIC attribute per type (NOT animated, NOT per-tick) — the
 * painter guardrail (Cable.painter.test.tsx) proves no banned painter prop is
 * introduced; here we prove the dash actually DIFFERS per signal type and that
 * the sidechain dash still wins.
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

  it("midi → a dashed pattern", () => {
    expect(lineStyleForSignal("midi")).toBe("8 5");
  });

  it("value/CV → a dotted pattern", () => {
    expect(lineStyleForSignal("value")).toBe("2 4");
  });

  it("the three styles are all DISTINCT", () => {
    const a = lineStyleForSignal("audio");
    const m = lineStyleForSignal("midi");
    const v = lineStyleForSignal("value");
    expect(new Set([String(a), String(m), String(v)]).size).toBe(3);
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

  it("midi cable's main stroke is dashed", () => {
    const { container } = render(
      <Cable {...base} data={{ ...base.data, signalType: "midi" }} />,
    );
    expect(mainPathDash(container, "#2BC4C4")).toBe("8 5");
  });

  it("value/CV cable's main stroke is dotted", () => {
    const { container } = render(
      <Cable {...base} data={{ ...base.data, signalType: "value" }} />,
    );
    expect(mainPathDash(container, "#E8A838")).toBe("2 4");
  });

  it("the dasharray DIFFERS across audio / midi / value", () => {
    const audio = render(
      <Cable {...base} data={{ ...base.data, signalType: "audio" }} />,
    );
    const midi = render(
      <Cable {...base} data={{ ...base.data, signalType: "midi" }} />,
    );
    const value = render(
      <Cable {...base} data={{ ...base.data, signalType: "value" }} />,
    );
    const da = String(mainPathDash(audio.container, "#4A90D9")); // "null"
    const dm = String(mainPathDash(midi.container, "#2BC4C4"));
    const dv = String(mainPathDash(value.container, "#E8A838"));
    expect(new Set([da, dm, dv]).size).toBe(3);
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
