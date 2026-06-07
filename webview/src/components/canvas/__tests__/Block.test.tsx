/**
 * Tests for <Block /> — React Flow node component representing one audio plugin.
 *
 * Stubs:
 *   - @xyflow/react  → Handle renders as a div; Position enum provided.
 *   - useGraphStore  → selectZoomTier / selectEdges
 *   - useBusStore    → cableBus map
 *   - BlockEmbed     → renders nothing (visual only)
 *
 * NOTE: Because BlockComponent is the *default* export wrapped in memo(),
 * we test it via the named `Block` export which is the memo wrapper.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mock React Flow ──────────────────────────────────────────────────────────
vi.mock("@xyflow/react", () => ({
  Handle: ({
    children,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) => (
    <div data-testid={`handle-${rest.id ?? "port"}`}>{children}</div>
  ),
  Position: { Left: "left", Right: "right" },
}));

// ── Mock stores ──────────────────────────────────────────────────────────────
vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      nodes: [],
      edges: [],
      zoomTier: "normal",
      selectNode: vi.fn(),
    })
  ),
  selectZoomTier: (s: { zoomTier: string }) => s.zoomTier,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

vi.mock("../../../stores/useBusStore", () => ({
  useBusStore: vi.fn(() => ({})),
}));

// ── Mock BlockEmbed ───────────────────────────────────────────────────────────
vi.mock("../BlockEmbed", () => ({ BlockEmbed: () => null }));

import type { BlockData } from "../../../data/types";
import { Block } from "../Block";

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
  // NodeProps shape required by React Flow
  return render(
    <Block
      id={data.id ?? "block-1"}
      data={makeData(data)}
      selected={selected}
      // Minimal no-op NodeProps fields
      type="block"
      zIndex={0}
      isConnectable={true}
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      dragging={false}
      draggable={true}
      selectable={true}
      deletable={true}
    />
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("<Block />", () => {
  // ── Happy path ──────────────────────────────────────────────────────────

  it("renders block name", () => {
    renderBlock({ name: "Surge XT" });
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
  });

  it("renders format string in block header", () => {
    renderBlock({ format: "VST3" });
    expect(screen.getByText("VST3")).toBeInTheDocument();
  });

  it("renders INT format string for built-in blocks", () => {
    // Block header always shows format — there is no INT suppression at this level
    renderBlock({ format: "INT" });
    expect(screen.getByText("INT")).toBeInTheDocument();
  });

  it("renders input and output port handles", () => {
    renderBlock({
      ports: [
        { id: "in-0", label: "L", direction: "input", type: "audio", connected: false },
        { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
    expect(screen.getByTestId("handle-out-0")).toBeInTheDocument();
  });

  // ── Meter gating is PORT-derived, not category-derived (Glen QA 2026-06-06) ──
  // The ballistic feed reads audio OUTPUT RMS, so only blocks with ≥1 audio
  // output may show a VU. Covers the MIDI-input-device-as-"instrument"
  // miscategorisation from blockcategory.hpp's name heuristic.

  it("never shows a VU on a MIDI-only node, even when categorised instrument", () => {
    renderBlock({
      category: "instrument", // miscategorised hardware MIDI input
      ports: [
        { id: "out-m", label: "MIDI", direction: "output", type: "midi", connected: false },
      ],
    });
    expect(screen.queryAllByTestId("rms-meter")).toHaveLength(0);
  });

  it("shows VU meters when the block has an audio output", () => {
    renderBlock({
      category: "instrument",
      ports: [
        { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.getAllByTestId("rms-meter").length).toBeGreaterThan(0);
  });

  it("never shows a VU on an audio-output-device shape (audio INPUTS only)", () => {
    // Output device: audio ins, no audio outs — the output-RMS feed has no
    // data for it, so an honest face shows no meter (input-side RMS bridge is
    // the named follow-up).
    renderBlock({
      category: "audiofx",
      ports: [
        { id: "in-0", label: "L", direction: "input", type: "audio", connected: true },
        { id: "in-1", label: "R", direction: "input", type: "audio", connected: true },
      ],
    });
    expect(screen.queryAllByTestId("rms-meter")).toHaveLength(0);
  });

  it("MIDI-only node renders the status row instead of meters", () => {
    renderBlock({
      category: "midifx",
      ports: [
        { id: "out-m", label: "MIDI", direction: "output", type: "midi", connected: false },
      ],
    });
    expect(screen.getByText("Pass-through")).toBeInTheDocument();
    expect(screen.queryAllByTestId("rms-meter")).toHaveLength(0);
  });

  // ── Bypass / mute states ────────────────────────────────────────────────

  it("shows BYPASSED overlay when bypassed=true", () => {
    // State overlays now carry a glance-readable label (grey BYPASSED /
    // red MUTED) instead of a bare style wash.
    renderBlock({ bypassed: true });
    expect(screen.getByText("BYPASSED")).toBeInTheDocument();
  });

  it("does not show BYPASSED overlay when bypassed=false", () => {
    renderBlock({ bypassed: false });
    expect(screen.queryByText("BYPASSED")).toBeNull();
  });

  it("shows MUTED overlay when muted=true", () => {
    renderBlock({ muted: true });
    expect(screen.getByText("MUTED")).toBeInTheDocument();
  });

  it("muted (red) overlay outranks bypassed when both set", () => {
    renderBlock({ muted: true, bypassed: true });
    expect(screen.getByText("MUTED")).toBeInTheDocument();
    expect(screen.queryByText("BYPASSED")).toBeNull();
  });

  // ── Wave-0.4 perf guardrail: NO backdrop-filter on a bypassed Block ─────────
  // Locks architect-perf-plan §0.4 (and the neumorphic design law banning
  // backdrop-blur). A bypassed block must use a FLAT dark wash — never a
  // backdrop-filter, which forces a per-frame WKWebView read-back-blur stall.
  it("bypassed Block renders NO backdrop-filter (§0.4 + design law)", () => {
    const { container } = renderBlock({ bypassed: true });
    // BYPASSED overlay must be present...
    expect(screen.getByText("BYPASSED")).toBeInTheDocument();
    // ...but nothing in the rendered markup may carry a backdrop filter (React
    // serialises `backdropFilter`/`WebkitBackdropFilter` to `backdrop-filter` /
    // `-webkit-backdrop-filter` in the inline style attribute).
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain("backdrop-filter");
    expect(html).not.toContain("backdropfilter");
  });

  // ── Error state ─────────────────────────────────────────────────────────

  it("renders error indicator when error=true", () => {
    const { container } = renderBlock({ error: true });
    // Error state renders a className ring with NO text (Block.tsx:435-436):
    // `ring-1 ring-error/60`. Match the className, not text.
    const ring = container.querySelector('[class*="ring-error"]');
    expect(ring).not.toBeNull();
  });

  // ── Category colour coding ───────────────────────────────────────────────
  // Accent colour now drives the gradient header (inline `background`) +
  // port/knob hues. Match the category hex anywhere in the rendered markup,
  // case-insensitively (jsdom may normalise hex case in gradient values).

  it("applies instrument (blue) accent for category=instrument", () => {
    const { container } = renderBlock({ category: "instrument" });
    expect(container.innerHTML).toContain("rgb(74, 144, 217)");
  });

  it("applies audiofx (orange) accent for category=audiofx", () => {
    const { container } = renderBlock({ category: "audiofx" });
    expect(container.innerHTML).toContain("rgb(232, 168, 56)");
  });

  it("applies midifx (teal) accent for category=midifx", () => {
    const { container } = renderBlock({ category: "midifx" });
    expect(container.innerHTML).toContain("rgb(43, 196, 196)");
  });

  it("applies modulator (purple) accent for category=modulator", () => {
    const { container } = renderBlock({ category: "modulator" });
    expect(container.innerHTML).toContain("rgb(168, 127, 224)");
  });

  // ── hostColor ────────────────────────────────────────────────────────────
  // hostColourOutline feeds an inline `borderColor` (Block.tsx:424); jsdom
  // normalises `#1A2B3C` → `rgb(26, 43, 60)`, so match the rgb form.

  it("strips ARGB prefix from JUCE Colour::toString() (#AARRGGBB → #RRGGBB)", () => {
    const { container } = renderBlock({ hostColor: "#FF1A2B3C" });
    // hostColourOutline maps #FF1A2B3C → #1A2B3C → rgb(26, 43, 60)
    const el = container.querySelector('[style*="rgb(26, 43, 60)"]');
    expect(el).not.toBeNull();
  });

  it("uses 7-char hex colour directly", () => {
    const { container } = renderBlock({ hostColor: "#1A2B3C" });
    const el = container.querySelector('[style*="rgb(26, 43, 60)"]');
    expect(el).not.toBeNull();
  });

  // ── Container / Portal labels ─────────────────────────────────────────────

  it("shows the honest real child-count affordance for Container blocks (P3-B)", () => {
    // The old fake 2×2 "NODE_A…NODE_D" placeholder grid was a NOTHING-fake
    // violation (invented identities) and is gone. A Container now shows its
    // REAL child count (engine getNumNodes() → containerNodeCount) and an
    // "open to edit" affordance — the dive opens the actual nested Board.
    renderBlock({ containerNodeCount: 4 });
    expect(screen.getByText("4 Blocks — open to edit")).toBeInTheDocument();
    // No fabricated per-child labels remain.
    expect(screen.queryByText("NODE_A")).toBeNull();
  });

  it("pluralises the child count honestly (1 Block, not 1 Blocks)", () => {
    renderBlock({ containerNodeCount: 1 });
    expect(screen.getByText("1 Block — open to edit")).toBeInTheDocument();
  });

  it("shows an Empty affordance for a Container with zero children", () => {
    renderBlock({ containerNodeCount: 0 });
    expect(screen.getByText("Empty — open to edit")).toBeInTheDocument();
  });

  it("labels a Container with its REAL name + (Nested) — never a raw UUID", () => {
    renderBlock({ containerNodeCount: 2, name: "Synth Layer" });
    expect(screen.getByText("Synth Layer (Nested)")).toBeInTheDocument();
  });

  it("falls back to 'Container (Nested)' (never bare ' (Nested)' or 'Graph') when unnamed", () => {
    renderBlock({ containerNodeCount: 2, name: "" });
    expect(screen.getByText("Container (Nested)")).toBeInTheDocument();
    expect(screen.queryByText(/^\s*\(Nested\)$/)).toBeNull();
    expect(screen.queryByText(/GRAPH \(NESTED\)/i)).toBeNull();
  });

  it("shows PORTAL label for portal blocks", () => {
    renderBlock({ isPortal: true });
    expect(screen.getByText("External Portal")).toBeInTheDocument();
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("handles empty name gracefully", () => {
    // Should render without crashing
    expect(() => renderBlock({ name: "" })).not.toThrow();
  });

  it("handles unknown category without crashing", () => {
    // Falls back to generator config
    expect(() =>
      renderBlock({ category: "unknown" as BlockData["category"] })
    ).not.toThrow();
  });

  it("renders with zero ports without crashing", () => {
    expect(() => renderBlock({ ports: [] })).not.toThrow();
  });

  it("shows cpu load in the header (always visible, no hover reflow)", () => {
    // CPU moved into the header (Glen — more visible) and is always shown when
    // > 0, so the block never changes shape on hover.
    renderBlock({ cpuLoad: 42 });
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });
});

// ── PortShape sub-component (pure renderer) ──────────────────────────────────
// We exercise hostColourOutline() logic directly via integration through Block.
// Pure visual internals (SVG shapes) are verified via the host colour tests above.

describe("hostColourOutline (via Block)", () => {
  it("returns undefined for undefined input → no border style", () => {
    const { container } = renderBlock({ hostColor: undefined });
    // Should not have a hostColor-derived border
    expect(container.innerHTML).not.toContain("border-color");
  });

  it("ignores malformed hex strings", () => {
    expect(() => renderBlock({ hostColor: "notacolor" })).not.toThrow();
  });
});
