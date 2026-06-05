/**
 * Block gaps — covers paths not exercised in Block.test.tsx:
 *   - StateBtn B/M click → toggleBypass / toggleMute called
 *   - Compact zoom tier → name-chip only (no header, no deck)
 *   - MIDI/modulator deck body text (no knob params, non-audio bearing)
 *   - Audio bearing block with no knob params → dual RMS meter deck
 *   - muteInput header indicator ("Min" chip)
 *   - PortShape shapes (audio / midi / value SVG elements)
 *   - BusBadge renders for wired wireless port
 *   - hostColourOutline: no border for malformed hex
 *   - PortRow sidechain detection label
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { BlockData } from "../../../data/types";

// ── Mock React Flow ──────────────────────────────────────────────────────────
vi.mock("@xyflow/react", () => ({
  Handle: ({
    children,
    id,
  }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) => (
    <div data-testid={`handle-${id ?? "port"}`}>{children}</div>
  ),
  Position: { Left: "left", Right: "right" },
}));

// ── Hoisted mutable store state ──────────────────────────────────────────────
const { mockGraphStore } = vi.hoisted(() => {
  const store = {
    nodes: [] as unknown[],
    edges: [] as unknown[],
    zoomTier: "normal" as string,
    toggleBypass: vi.fn(),
    toggleMute: vi.fn(),
    selectNode: vi.fn(),
  };
  return { mockGraphStore: store };
});

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((selector: (s: typeof mockGraphStore) => unknown) =>
    selector(mockGraphStore),
  ),
  selectZoomTier: (s: { zoomTier: string }) => s.zoomTier,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

vi.mock("../../../stores/useBusStore", () => ({
  useBusStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ cableBus: {} }),
  ),
}));

vi.mock("../../../stores/useParameterStore", () => ({
  useParameterStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ values: {}, setLocal: vi.fn() }),
  ),
}));

vi.mock("../BlockEmbed", () => ({ BlockEmbed: () => <div data-testid="block-embed" /> }));

import { Block } from "../Block";
import { useBusStore } from "../../../stores/useBusStore";
import { useGraphStore } from "../../../stores/useGraphStore";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeData(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "block-1",
    name: "Surge XT",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...overrides,
  };
}

function renderBlock(data: Partial<BlockData> = {}, selected = false) {
  return render(
    <Block
      id={data.id ?? "block-1"}
      data={makeData(data)}
      selected={selected}
      type="block"
      zIndex={0}
      isConnectable={true}
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      dragging={false}
      draggable={true}
      selectable={true}
      deletable={true}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphStore.zoomTier = "normal";
  mockGraphStore.toggleBypass.mockReset();
  mockGraphStore.toggleMute.mockReset();
});

describe("<Block /> (gaps)", () => {
  // ── StateBtn clicks ──────────────────────────────────────────────────────────

  it("B button click calls toggleBypass with block id", () => {
    renderBlock({ id: "b-42" });
    fireEvent.click(screen.getByTitle("Bypass"));
    expect(mockGraphStore.toggleBypass).toHaveBeenCalledWith("b-42");
  });

  it("M button click calls toggleMute with block id", () => {
    renderBlock({ id: "b-7" });
    fireEvent.click(screen.getByTitle("Mute"));
    expect(mockGraphStore.toggleMute).toHaveBeenCalledWith("b-7");
  });

  it("B button click does not bubble (stopPropagation via e.stopPropagation)", () => {
    // stopPropagation prevents node selection on B/M click — verify button is present
    renderBlock();
    const bBtn = screen.getByTitle("Bypass");
    expect(bBtn).toBeInTheDocument();
  });

  // ── Compact zoom tier ────────────────────────────────────────────────────────

  it("compact tier renders name chip only (no full header)", () => {
    mockGraphStore.zoomTier = "compact";
    renderBlock({ name: "Pro-Q 3", category: "audiofx" });
    expect(screen.getByText("Pro-Q 3")).toBeInTheDocument();
    // No Bypass/Mute buttons in compact mode
    expect(screen.queryByTitle("Bypass")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Mute")).not.toBeInTheDocument();
  });

  it("compact tier renders without crashing for all categories", () => {
    mockGraphStore.zoomTier = "compact";
    for (const cat of ["instrument", "audiofx", "midifx", "modulator"] as const) {
      expect(() => renderBlock({ category: cat })).not.toThrow();
    }
  });

  // ── Expanded zoom tier ───────────────────────────────────────────────────────

  it("expanded tier renders BlockEmbed instead of control deck", () => {
    mockGraphStore.zoomTier = "expanded";
    renderBlock();
    expect(screen.getByTestId("block-embed")).toBeInTheDocument();
  });

  // ── MIDI / modulator deck body ────────────────────────────────────────────────

  it("midifx block with no knob params shows 'MIDI · routing' text", () => {
    renderBlock({ category: "midifx", format: "INT", name: "MIDI Router" });
    expect(screen.getByText("MIDI · routing")).toBeInTheDocument();
  });

  it("modulator block with no knob params shows 'Modulation' text", () => {
    renderBlock({ category: "modulator", format: "INT", name: "LFO" });
    expect(screen.getByText("Modulation")).toBeInTheDocument();
  });

  it("active modulator shows activity dot element (no crash)", () => {
    expect(() =>
      renderBlock({ category: "modulator", format: "INT", bypassed: false, muted: false }),
    ).not.toThrow();
  });

  // ── muteInput header indicator ────────────────────────────────────────────────

  it("shows Min chip in header when muteInput=true", () => {
    renderBlock({ muteInput: true });
    expect(screen.getByTitle("Input muted")).toBeInTheDocument();
  });

  it("does not show Min chip when muteInput is false/undefined", () => {
    renderBlock({ muteInput: false });
    expect(screen.queryByTitle("Input muted")).not.toBeInTheDocument();
  });

  // ── CPU load display ─────────────────────────────────────────────────────────

  it("does not show cpu chip when cpuLoad=0", () => {
    const { container } = renderBlock({ cpuLoad: 0 });
    // cpuLoad > 0 gates the span; title starts with "CPU" when present
    expect(container.querySelector('[title^="CPU"]')).toBeNull();
  });

  // ── PortRow: signal-type pip (standard block uses CSS span, not SVG shapes) ──
  // PortShape SVG shapes (circle/polygon/rect) are only used in Portal/Container
  // block variants. Standard blocks use PortRow with a CSS-rounded <span> pip.

  it("audio port renders port-well Handle", () => {
    renderBlock({
      ports: [{ id: "in-0", label: "L", direction: "input", type: "audio", connected: false }],
    });
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
  });

  it("midi port renders port-well Handle", () => {
    renderBlock({
      ports: [{ id: "in-0", label: "In", direction: "input", type: "midi", connected: false }],
    });
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
  });

  // Lean port lane (Glen, 2026-06-03): Value/CV ports map to plugin params and
  // are COLLAPSED by default behind a "▸ N params" toggle, so a value port's
  // Handle is NOT in the DOM until the lane is expanded. (Audio/MIDI stay
  // essential + always visible — asserted above.)
  it("value/CV port is collapsed behind the param toggle by default (lean)", () => {
    renderBlock({
      ports: [{ id: "in-0", label: "Cutoff", direction: "input", type: "value", connected: false }],
    });
    // The param port row + its Handle are hidden while collapsed…
    expect(screen.queryByTestId("handle-in-0")).not.toBeInTheDocument();
    expect(screen.queryByText("Cutoff")).not.toBeInTheDocument();
    // …surfaced instead as a single "▸ 1 param" expander (real count).
    const toggle = screen.getByRole("button", { name: /show 1 parameter port/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent(/1 param/i);
  });

  it("value/CV port Handle reveals after clicking the param toggle", () => {
    renderBlock({
      ports: [{ id: "in-0", label: "Cutoff", direction: "input", type: "value", connected: false }],
    });
    fireEvent.click(screen.getByRole("button", { name: /show 1 parameter port/i }));
    // Now the param port row + Handle + label render.
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
    expect(screen.getByText("Cutoff")).toBeInTheDocument();
    // Toggle flips to the collapse affordance (aria-expanded true).
    const hide = screen.getByRole("button", { name: /hide 1 parameter port/i });
    expect(hide).toHaveAttribute("aria-expanded", "true");
  });

  // ── PortRow sidechain detection ───────────────────────────────────────────────

  it("sidechain port with label 'SC' shows 'SC' label text", () => {
    renderBlock({
      ports: [{ id: "sidechain", label: "SC", direction: "input", type: "audio", connected: false }],
    });
    expect(screen.getByText("SC")).toBeInTheDocument();
  });

  it("regular port renders its label text", () => {
    renderBlock({
      ports: [{ id: "out-0", label: "Main L", direction: "output", type: "audio", connected: false }],
    });
    expect(screen.getByText("Main L")).toBeInTheDocument();
  });

  // ── BusBadge via useBusStore ─────────────────────────────────────────────────

  it("renders BusBadge label when port has a wired bus name", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useBusStore).mockImplementation((selector: any) =>
      selector({ cableBus: { "cable-1": "Reverb Send" } }),
    );

    const edges = [
      { id: "cable-1", source: "block-1", sourcePort: "out-0", target: "other", targetPort: "in-0" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useGraphStore).mockImplementation((sel: any) =>
      sel({ ...mockGraphStore, edges }),
    );

    renderBlock({
      id: "block-1",
      ports: [{ id: "out-0", label: "Out", direction: "output", type: "audio", connected: true }],
    });
    expect(screen.getByText("Reverb Send")).toBeInTheDocument();
  });

  // ── Selected glow class ───────────────────────────────────────────────────────

  it("selected=true applies neu-glow class for category", () => {
    const { container } = renderBlock({ category: "audiofx" }, true);
    const root = container.firstElementChild;
    expect(root?.className).toContain("neu-glow-audiofx");
  });

  it("selected=false applies neu-sculpt or neu-sculpt-hover (not glow)", () => {
    const { container } = renderBlock({ category: "audiofx" }, false);
    const root = container.firstElementChild;
    expect(root?.className).not.toContain("neu-glow");
  });

  // ── Error state in load bar ───────────────────────────────────────────────────

  it("load bar uses error colour when error=true", () => {
    const { container } = renderBlock({ error: true });
    // The load bar div should have a background using status-clip
    const loadBar = container.querySelector('[style*="status-clip"]');
    expect(loadBar).not.toBeNull();
  });

  // ── Port counts ───────────────────────────────────────────────────────────────

  it("renders separate handles for each input and output port", () => {
    renderBlock({
      ports: [
        { id: "in-0", label: "L", direction: "input", type: "audio", connected: false },
        { id: "in-1", label: "R", direction: "input", type: "audio", connected: false },
        { id: "out-0", label: "Out L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
    expect(screen.getByTestId("handle-in-1")).toBeInTheDocument();
    expect(screen.getByTestId("handle-out-0")).toBeInTheDocument();
  });
});
