/**
 * Cable.painter — Wave-1 perf guardrails (architect-perf-plan §5a, §5c).
 *
 * These lock the painter wins PERMANENTLY: a future regression that re-adds a
 * per-tick inline `filter: blur()` / `drop-shadow()` or an `animation:`
 * shorthand whose duration is interpolated into the style string (instead of
 * the static `.cable-pulse` class + `--pd` custom property) will fail here even
 * though tsc stays green. Also pins the amp → bucket quantisation map.
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

import { Cable, ampToBucket, AMP_BUCKETS } from "../Cable";

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

// ── §5a: no banned painter props in the rendered markup at a mid amp ──────────

describe("Cable painter guardrail (§5a)", () => {
  it("a mid-amp cable renders NO inline blur() / drop-shadow() / animation: shorthand", () => {
    mockLevel.value = 0.5; // mid amp → glow + main + pulse all mounted
    const { container } = render(<Cable {...base} />);
    // Scan every element's inline style attribute (the painter mutation lived in
    // inline styles — the whole point of Wave-1 is to get it OUT of there).
    const inlineStyles = Array.from(container.querySelectorAll<HTMLElement>("[style]"))
      .map((el) => el.getAttribute("style") ?? "")
      .join(" | ");

    expect(inlineStyles).not.toContain("blur(");
    expect(inlineStyles).not.toContain("drop-shadow(");
    // No `animation:` shorthand in inline style — the march is a CSS class.
    expect(inlineStyles).not.toMatch(/animation:/);
    // And it must NOT interpolate the duration into an inline animation string.
    expect(inlineStyles).not.toContain("signalPulse");
  });

  it("the painter styling is routed through `.cbl-*` / `.cable-pulse` classes + `--pd`", () => {
    mockLevel.value = 0.5;
    const { container } = render(<Cable {...base} />);
    // Main path carries a bucket class; glow carries a glow-bucket class.
    expect(container.querySelector("path.cbl-a4")).not.toBeNull(); // round(0.5*8)=4
    expect(container.querySelector("path.cbl-glow-a4")).not.toBeNull();
    // Pulse overlay carries the static march class + a `--pd` duration var.
    const pulse = container.querySelector<HTMLElement>("path.cable-pulse");
    expect(pulse).not.toBeNull();
    expect(pulse!.style.getPropertyValue("--pd")).not.toBe("");
  });

  it("an idle cable still renders NO banned painter props (regression floor)", () => {
    mockLevel.value = 0;
    const { container } = render(<Cable {...base} />);
    const inlineStyles = Array.from(container.querySelectorAll<HTMLElement>("[style]"))
      .map((el) => el.getAttribute("style") ?? "")
      .join(" | ");
    expect(inlineStyles).not.toContain("blur(");
    expect(inlineStyles).not.toContain("drop-shadow(");
    expect(inlineStyles).not.toMatch(/animation:/);
  });
});

// ── §5c: amp → bucket quantisation map ────────────────────────────────────────

describe("ampToBucket mapping (§5c)", () => {
  it("amp 0 maps to bucket 0 (→ `.cbl-a0`)", () => {
    expect(ampToBucket(0)).toBe(0);
  });

  it("amp 1 maps to the top bucket (→ `.cbl-a8`)", () => {
    expect(ampToBucket(1)).toBe(AMP_BUCKETS);
    expect(AMP_BUCKETS).toBe(8);
  });

  it("rounds to the nearest bucket (0.5 → 4; half-a-bucket 0.0625 → 1; 0.06 → 0)", () => {
    expect(ampToBucket(0.5)).toBe(4);
    // amp*8: 0.0625*8 = 0.5 → Math.round(0.5) = 1 (JS rounds .5 up).
    expect(ampToBucket(0.0625)).toBe(1);
    // 0.06*8 = 0.48 → rounds down to 0.
    expect(ampToBucket(0.06)).toBe(0);
    // Just over the top edge of bucket 7: 0.9375*8 = 7.5 → 8.
    expect(ampToBucket(0.9375)).toBe(8);
  });

  it("clamps out-of-range amp into [0, 8]", () => {
    expect(ampToBucket(-0.5)).toBe(0);
    expect(ampToBucket(2.5)).toBe(AMP_BUCKETS);
  });
});
