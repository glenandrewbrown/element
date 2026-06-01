/**
 * MacroDashboard tests — tab switching, FX bypass panel, Map Mode toggle,
 * VuMeter render, and PanicButton click.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MacroDashboard, PanicButton } from "../MacroDashboard";
import { usePerformStore } from "../../../stores/usePerformStore";
import { useGraphStore } from "../../../stores/useGraphStore";

// Stub Icon — tests are shape-agnostic
vi.mock("../../neu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../neu")>();
  return {
    ...actual,
    Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
  };
});

// Stub SceneLauncher — tested separately
vi.mock("../SceneLauncher", () => ({
  SceneLauncher: () => <div data-testid="scene-launcher" />,
}));

// Stub nativeTransportPanic
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeTransportPanic: vi.fn().mockResolvedValue(undefined),
}));

import { nativeTransportPanic } from "../../../bridge/nativeGraph";

// ── store helpers ─────────────────────────────────────────────────────────────

function resetStores() {
  usePerformStore.setState((s) => ({
    ...s,
    macros: [],
    liveHealth: {
      ...s.liveHealth,
      outputPeak: 0,
      bpm: 120,
      timecode: "00:00:00:00",
    },
    mapMode: false,
  }));
  useGraphStore.setState((s) => ({ ...s, nodes: [] }));
}

beforeEach(resetStores);

// ── tab rendering ─────────────────────────────────────────────────────────────

describe("MacroDashboard tabs", () => {
  it("renders all three tab labels", () => {
    render(<MacroDashboard />);
    expect(screen.getByText("Macro Controls")).toBeInTheDocument();
    expect(screen.getByText("Scene Launch")).toBeInTheDocument();
    expect(screen.getByText("Performance FX")).toBeInTheDocument();
  });

  it("defaults to macros tab — VU meter container visible", () => {
    render(<MacroDashboard />);
    // BPM clock is only rendered in macros tab
    expect(screen.getByText("Global Master")).toBeInTheDocument();
  });

  it("clicking Scene Launch tab shows SceneLauncher stub", () => {
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Scene Launch"));
    expect(screen.getByTestId("scene-launcher")).toBeInTheDocument();
  });

  it("clicking Performance FX tab hides macros content", () => {
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Performance FX"));
    expect(screen.queryByText("Global Master")).not.toBeInTheDocument();
  });

  it("clicking Macro Controls tab restores macros content", () => {
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Performance FX"));
    fireEvent.click(screen.getByText("Macro Controls"));
    expect(screen.getByText("Global Master")).toBeInTheDocument();
  });
});

// ── FX tab — empty state ──────────────────────────────────────────────────────

describe("FX tab empty state", () => {
  it("shows empty-state message when no effect blocks exist", () => {
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Performance FX"));
    expect(screen.getByText(/no effects on the board/i)).toBeInTheDocument();
  });
});

// ── FX tab — block list ───────────────────────────────────────────────────────

describe("FX tab block list", () => {
  beforeEach(() => {
    useGraphStore.setState((s) => ({
      ...s,
      nodes: [
        {
          id: "block-1",
          name: "Valhalla Reverb",
          category: "audiofx" as const,
          format: "VST3" as const,
          position: { x: 0, y: 0 },
          ports: [],
          cpuLoad: 0,
          latencyMs: 0,
          bypassed: false,
          error: false,
          isMacroTagged: false,
        },
        {
          id: "block-2",
          name: "LFO Mod",
          category: "modulator" as const,
          format: "INT" as const,
          position: { x: 0, y: 0 },
          ports: [],
          cpuLoad: 0,
          latencyMs: 0,
          bypassed: true,
          error: false,
          isMacroTagged: false,
        },
        {
          id: "block-3",
          name: "Surge XT",
          category: "instrument" as const,
          format: "VST3" as const,
          position: { x: 0, y: 0 },
          ports: [],
          cpuLoad: 0,
          latencyMs: 0,
          bypassed: false,
          error: false,
          isMacroTagged: false,
        },
      ],
    }));
  });

  it("shows non-instrument block names in FX tab", () => {
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Performance FX"));
    expect(screen.getByText("Valhalla Reverb")).toBeInTheDocument();
    expect(screen.getByText("LFO Mod")).toBeInTheDocument();
  });

  it("does not show instrument blocks in FX tab", () => {
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Performance FX"));
    expect(screen.queryByText("Surge XT")).not.toBeInTheDocument();
  });

  it("shows 'Active' for non-bypassed blocks", () => {
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Performance FX"));
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows 'Bypassed' for bypassed blocks", () => {
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Performance FX"));
    expect(screen.getByText("Bypassed")).toBeInTheDocument();
  });
});

// ── Map Mode toggle ───────────────────────────────────────────────────────────

describe("Map Mode", () => {
  it("Map Mode label is visible in toolbar", () => {
    render(<MacroDashboard />);
    expect(screen.getByText("Map Mode")).toBeInTheDocument();
  });

  it("clicking Map Mode label calls toggleMapMode", () => {
    const toggle = vi.fn();
    usePerformStore.setState((s) => ({ ...s, toggleMapMode: toggle }));
    render(<MacroDashboard />);
    fireEvent.click(screen.getByText("Map Mode"));
    expect(toggle).toHaveBeenCalledOnce();
  });
});

// ── Macros tab — BPM clock ────────────────────────────────────────────────────

describe("macros tab BPM clock", () => {
  it("displays bpm from liveHealth", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, bpm: 140, outputPeak: 0, timecode: "00:00:00:00" },
    }));
    render(<MacroDashboard />);
    expect(screen.getByText("140.00")).toBeInTheDocument();
  });

  it("displays timecode from liveHealth", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, bpm: 120, outputPeak: 0, timecode: "01:02:03:04" },
    }));
    render(<MacroDashboard />);
    expect(screen.getByText("01:02:03:04")).toBeInTheDocument();
  });
});

// ── PanicButton ───────────────────────────────────────────────────────────────

describe("PanicButton", () => {
  it("renders PANIC label", () => {
    render(<PanicButton />);
    expect(screen.getByText(/panic/i)).toBeInTheDocument();
  });

  it("clicking panic button calls nativeTransportPanic", () => {
    render(<PanicButton />);
    fireEvent.click(screen.getByRole("button"));
    expect(nativeTransportPanic).toHaveBeenCalledOnce();
  });
});
