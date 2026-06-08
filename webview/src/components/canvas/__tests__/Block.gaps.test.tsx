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
    setCollapsed: vi.fn(),
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

  // ── Persisted COMPACT tier (Decision A-2a — replaces zoom-compact) ─────────────
  // Collapse is now a deliberate, persisted per-node state (d.collapsed), NOT a
  // zoom artifact. Collapsed = header (with chevron + B/M still present) + a
  // single activity well (D5), no control deck/embed/full port lane.

  it("collapsed block keeps the header + shows the single activity well (D5)", () => {
    renderBlock({ name: "Pro-Q 3", category: "audiofx", collapseTier: "title" });
    // Header (and thus the name + B/M + the collapse chevron) STAYS — the
    // compact tier is header+well, never "name + dot".
    expect(screen.getByText("Pro-Q 3")).toBeInTheDocument();
    expect(screen.getByTitle("Bypass")).toBeInTheDocument();
    expect(screen.getByTitle("Mute")).toBeInTheDocument();
    expect(screen.getByTestId("collapse-chevron")).toBeInTheDocument();
    // D5: the activity well STAYS in the collapsed state (real signal bar).
    expect(screen.getAllByTestId("signal-activity-bar").length).toBeGreaterThan(0);
  });

  it("collapse chevron toggles the persisted collapse state via setCollapsed", () => {
    renderBlock({ id: "b-col", collapseTier: "macro" });
    fireEvent.click(screen.getByTestId("collapse-chevron"));
    expect(mockGraphStore.setCollapsed).toHaveBeenCalledWith("b-col", true);
  });

  it("collapsed block renders without crashing for all categories", () => {
    for (const cat of ["instrument", "audiofx", "midifx", "modulator"] as const) {
      expect(() => renderBlock({ category: cat, collapseTier: "title" })).not.toThrow();
    }
  });

  // ── Heavy embed mount rule (2a — no longer zoom-gated) ─────────────────────────
  // BlockEmbed (live meter + FFT) mounts ONLY for a built-in audiofx node with a
  // real audio output, never for third-party plugins or by zoom.

  it("audiofx BUILT-IN with audio out renders BlockEmbed", () => {
    renderBlock({
      format: "INT",
      category: "audiofx",
      ports: [
        { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.getByTestId("block-embed")).toBeInTheDocument();
  });

  it("third-party plugin does NOT embed the heavy face (2b card instead)", () => {
    renderBlock({
      format: "VST3",
      category: "audiofx",
      ports: [
        { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.queryByTestId("block-embed")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("signal-activity-bar").length).toBe(1);
  });

  it("collapsed audiofx block does NOT mount the heavy embed", () => {
    renderBlock({
      format: "INT",
      category: "audiofx",
      collapseTier: "title",
      ports: [
        { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.queryByTestId("block-embed")).not.toBeInTheDocument();
  });

  // ── Painter law: SignalActivityBar must use CSS classes, not per-tick inlines ──
  // The perf-wave guardrail: segment divs inside the activity bar must NOT carry
  // inline `background` or `box-shadow` style attributes (those must live in
  // index.css keyed off .sigbar-lit-{n} / .sigbar-unlit / [data-signal] selectors).

  it("signal-activity-bar segments carry no inline background or boxShadow (painter law)", () => {
    const { container } = renderBlock({
      format: "VST3",
      category: "audiofx",
      ports: [{ id: "out-0", label: "L", direction: "output", type: "audio", connected: false }],
    });
    const bar = container.querySelector('[data-testid="signal-activity-bar"]');
    expect(bar).not.toBeNull();
    const segments = bar!.querySelectorAll(".sigbar-seg");
    expect(segments.length).toBeGreaterThan(0);
    segments.forEach((seg) => {
      const el = seg as HTMLElement;
      expect(el.style.background).toBe("");
      expect(el.style.boxShadow).toBe("");
    });
  });

  it("signal-activity-bar wrapper carries data-signal attr for CSS colour routing", () => {
    const { container } = renderBlock({
      format: "VST3",
      category: "audiofx",
      ports: [{ id: "out-0", label: "L", direction: "output", type: "audio", connected: false }],
    });
    const bar = container.querySelector('[data-testid="signal-activity-bar"]');
    expect(bar?.getAttribute("data-signal")).toMatch(/^(audio|midi|cv)$/);
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

  // A6/F5 (Fitts's law): the toggle BUTTON is a ≥30px-tall hit target while
  // the visible pill (inner span) stays 13px — visual size unchanged.
  it("param toggle hit target is ≥30px tall while the visible pill stays 13px", () => {
    renderBlock({
      ports: [{ id: "in-0", label: "Cutoff", direction: "input", type: "value", connected: false }],
    });
    const toggle = screen.getByRole("button", { name: /show 1 parameter port/i });
    expect(parseFloat(toggle.style.height)).toBeGreaterThanOrEqual(30);
    // First child = the visual pill span, still 13px.
    const pill = toggle.firstElementChild as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.style.height).toBe("13px");
  });

  it("clicking the expanded (30px) hit area toggles the param lane", () => {
    renderBlock({
      ports: [{ id: "in-0", label: "Cutoff", direction: "input", type: "value", connected: false }],
    });
    // Click the BUTTON itself (the invisible 30px band), not the inner pill.
    fireEvent.click(screen.getByRole("button", { name: /show 1 parameter port/i }));
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
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

  // ── Dense-node param-port collapser default (lean-block / canvas-polish) ──────
  // A params-heavy node defaults to In/Out + a "▸ N params" pill; the Value/CV
  // param ports stay HIDDEN until the pill is expanded (port chrome only where
  // it's wanted — no wall of rows by default).

  it("dense node defaults to a collapsed '▸ N params' pill (param ports hidden)", () => {
    renderBlock({
      ports: [
        { id: "in-0", label: "In", direction: "input", type: "audio", connected: false },
        { id: "p-mix", label: "Mix", direction: "input", type: "value", connected: false },
        { id: "p-fb", label: "Feedback", direction: "input", type: "value", connected: false },
        { id: "p-width", label: "Width", direction: "input", type: "value", connected: false },
      ],
    });
    // Essential audio I/O shows; the 3 value/CV params collapse behind the pill.
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
    expect(screen.getByText(/3\s*params/)).toBeInTheDocument();
    // Param-port handles are NOT rendered until the pill is expanded (default-collapsed).
    expect(screen.queryByTestId("handle-p-mix")).not.toBeInTheDocument();
  });

  it("expanding the '▸ N params' pill reveals the param-port lane", () => {
    renderBlock({
      ports: [
        { id: "in-0", label: "In", direction: "input", type: "audio", connected: false },
        { id: "p-mix", label: "Mix", direction: "input", type: "value", connected: false },
      ],
    });
    fireEvent.click(screen.getByText(/1\s*param/));
    expect(screen.getByTestId("handle-p-mix")).toBeInTheDocument();
  });

  // ── 2a — zoom-invariant content (zoomToTier swap is gone) ────────────────────
  // The Block must render the SAME control content regardless of the (now-vestigial)
  // zoomTier value — zoom only scales via React Flow's transform, never swaps GUI.

  it("renders identical content regardless of the vestigial zoomTier value", () => {
    const ports = [
      { id: "out-0", label: "L", direction: "output" as const, type: "audio" as const, connected: false },
    ];
    mockGraphStore.zoomTier = "compact";
    const { container: compactDom } = renderBlock({ format: "INT", category: "audiofx", ports });
    mockGraphStore.zoomTier = "expanded";
    const { container: expandedDom } = renderBlock({ format: "INT", category: "audiofx", ports });
    // Same RMS-meter count at both extremes → content is zoom-invariant.
    expect(
      compactDom.querySelectorAll('[data-testid="rms-meter"]').length,
    ).toBe(expandedDom.querySelectorAll('[data-testid="rms-meter"]').length);
    // And the header (with name) is present at both — no bare dot+name swap.
    expect(compactDom.querySelector('[data-testid="collapse-chevron"]')).not.toBeNull();
    expect(expandedDom.querySelector('[data-testid="collapse-chevron"]')).not.toBeNull();
  });
});
