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
    category: "generator",
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

  // ── Bypass / mute states ────────────────────────────────────────────────

  it("shows bypass overlay when bypassed=true", () => {
    const { container } = renderBlock({ bypassed: true });
    // Bypass overlay uses an inline repeating-linear-gradient background.
    // We check an element with style containing "repeating-linear-gradient"
    const overlay = container.querySelector(
      '[style*="repeating-linear-gradient"]'
    );
    expect(overlay).not.toBeNull();
  });

  it("does not show bypass overlay when bypassed=false", () => {
    const { container } = renderBlock({ bypassed: false });
    const overlay = container.querySelector(
      '[style*="repeating-linear-gradient"]'
    );
    expect(overlay).toBeNull();
  });

  it("shows mute overlay when muted=true", () => {
    const { container } = renderBlock({ muted: true });
    // Mute overlay background is rgba(0,0,0,0.38) (Block.tsx:260). jsdom
    // serializes inline rgba with spaces, so match the spaced form.
    const overlay = container.querySelector('[style*="rgba(0, 0, 0, 0.38)"]');
    expect(overlay).not.toBeNull();
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
  // Accent colours moved to Tailwind arbitrary-value classes `bg-[#hex]`
  // (Block.tsx:20,26,32) rather than inline rgba. jsdom preserves class
  // attributes verbatim but normalises inline hex → rgb()/rgba(), so we
  // query the className.

  it("applies generator (blue) accent for category=generator", () => {
    const { container } = renderBlock({ category: "generator" });
    const el = container.querySelector('[class*="bg-[#4A90D9]"]');
    expect(el).not.toBeNull();
  });

  it("applies modifier (orange) accent for category=modifier", () => {
    const { container } = renderBlock({ category: "modifier" });
    const el = container.querySelector('[class*="bg-[#E8A838]"]');
    expect(el).not.toBeNull();
  });

  it("applies logic (teal) accent for category=logic", () => {
    const { container } = renderBlock({ category: "logic" });
    const el = container.querySelector('[class*="bg-[#2BC4C4]"]');
    expect(el).not.toBeNull();
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

  it("shows nested placeholder blocks for Container blocks", () => {
    renderBlock({ containerNodeCount: 4 });
    // Container renders NODE_A…NODE_D placeholder labels (capped at 4)
    expect(screen.getByText("NODE_A")).toBeInTheDocument();
    expect(screen.getByText("NODE_D")).toBeInTheDocument();
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

  it("renders cpu load label", () => {
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
