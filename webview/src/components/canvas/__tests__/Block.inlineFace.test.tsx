/**
 * T5 — Block integration: a built-in (INT) compare/logic Block renders the
 * curated inline face; everything else stays on the generic deck unchanged.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@xyflow/react", () => ({
  Handle: ({
    children,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) => (
    <div data-testid={`handle-${rest.id ?? "port"}`}>{children}</div>
  ),
  Position: { Left: "left", Right: "right" },
}));

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      nodes: [],
      edges: [],
      zoomTier: "normal",
      selectNode: vi.fn(),
      toggleBypass: vi.fn(),
      toggleMute: vi.fn(),
    }),
  ),
  selectZoomTier: (s: { zoomTier: string }) => s.zoomTier,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

vi.mock("../../../stores/useBusStore", () => ({
  useBusStore: vi.fn(() => ({})),
}));

vi.mock("../BlockEmbed", () => ({ BlockEmbed: () => null }));

// Chooser-only faces never fetch metadata; stub the bridge anyway so jsdom
// doesn't touch window.__JUCE__.
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGetNodeParameters: vi.fn(async () => ({ parameters: [] })),
  nativeSetNodeParameter: vi.fn(async () => true),
  nativeNodeSetIntMode: vi.fn(async () => true),
}));

import type { BlockData } from "../../../data/types";
import { Block } from "../Block";

function makeData(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "node-1",
    name: "Comparator",
    category: "modulator",
    format: "INT",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    // The curated inline face lives in the control deck → the EXPANDED tier
    // (Task 2.4: macro/title show only the lean activity well, no deck).
    collapseTier: "expanded",
    ...overrides,
  };
}

function renderBlock(data: Partial<BlockData> = {}) {
  return render(
    <Block
      id={data.id ?? "node-1"}
      data={makeData(data)}
      selected={false}
      type="block"
      zIndex={0}
      isConnectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      dragging={false}
      draggable
      selectable
      deletable
    />,
  );
}

describe("<Block /> inline face integration", () => {
  it("renders the curated chooser face for an INT element.compare block", () => {
    renderBlock({ identifier: "element.compare", intMode: 4 });
    expect(screen.getByTestId("inline-face")).toBeInTheDocument();
    expect(screen.getByTestId("inline-chooser")).toHaveAttribute(
      "data-value",
      "4",
    );
    expect(screen.getByText("==")).toBeInTheDocument();
  });

  it("renders the curated chooser face for an INT element.logic block", () => {
    renderBlock({
      identifier: "element.logic",
      name: "Logic Gate",
      intMode: 1,
    });
    expect(screen.getByTestId("inline-face")).toBeInTheDocument();
    expect(screen.getByText("OR")).toBeInTheDocument();
  });

  it("does NOT render an inline face for a non-curated INT block", () => {
    renderBlock({ identifier: "element.constant", name: "Constant" });
    expect(screen.queryByTestId("inline-face")).not.toBeInTheDocument();
  });

  it("does NOT render an inline face for a third-party (VST3) block", () => {
    renderBlock({
      identifier: "element.compare", // identifier present but format wrong
      format: "VST3",
    });
    expect(screen.queryByTestId("inline-face")).not.toBeInTheDocument();
  });

  it("does NOT render an inline face when identifier is absent", () => {
    renderBlock({ identifier: undefined });
    expect(screen.queryByTestId("inline-face")).not.toBeInTheDocument();
  });
});
