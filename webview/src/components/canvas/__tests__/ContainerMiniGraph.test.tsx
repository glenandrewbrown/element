/**
 * ContainerMiniGraph — unit tests.
 *
 * Covers:
 *   - Pure render at macro/expanded/title tiers
 *   - Mini-graph SVG branch (preview data present, ≤ threshold)
 *   - Density-bar fallback (preview data present, > threshold)
 *   - Neutral bar fallback (no preview, count ≤ threshold)
 *   - Empty container (count 0)
 *   - Portal variant: teal badge + filename row
 *   - Muted filter
 *   - Bypassed filter + hint
 *   - Title tier hides the entire thumbnail
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ContainerMiniGraph,
  MINI_GRAPH_THRESHOLD,
  THUMBNAIL_H,
  type ContainerPreview,
} from "../ContainerMiniGraph";
import type { ContainerMiniGraphProps } from "../ContainerMiniGraph";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePreview(count: number): ContainerPreview {
  const children = Array.from({ length: count }, (_, i) => ({
    category: (["instrument", "audiofx", "midifx", "modulator"] as const)[
      i % 4
    ],
    x: (i + 0.5) / count,
    y: 0.5,
  }));
  const cables =
    count > 1
      ? Array.from({ length: count - 1 }, (_, i) => ({ from: i, to: i + 1 }))
      : [];
  return { children, cables };
}

function renderGraph(props: Partial<ContainerMiniGraphProps> = {}) {
  const defaults: ContainerMiniGraphProps = {
    nodeId: "c1",
    name: "My Container",
    category: "instrument",
    containerNodeCount: 3,
    isPortal: false,
    collapseTier: "macro",
  };
  return render(<ContainerMiniGraph {...defaults} {...props} />);
}

// ── Render basics ─────────────────────────────────────────────────────────────

describe("ContainerMiniGraph — render basics", () => {
  it("renders without crashing at macro tier", () => {
    expect(() => renderGraph()).not.toThrow();
  });

  it("renders without crashing at expanded tier", () => {
    expect(() => renderGraph({ collapseTier: "expanded" })).not.toThrow();
  });

  it("renders the outer wrapper data-testid", () => {
    renderGraph();
    expect(screen.getByTestId("container-mini-graph")).toBeInTheDocument();
  });

  it("renders the thumbnail region at macro tier", () => {
    renderGraph({ collapseTier: "macro" });
    expect(screen.getByTestId("mini-graph-thumbnail")).toBeInTheDocument();
  });

  it("renders the thumbnail region at expanded tier", () => {
    renderGraph({ collapseTier: "expanded" });
    expect(screen.getByTestId("mini-graph-thumbnail")).toBeInTheDocument();
  });

  it("thumbnail has correct height constant", () => {
    // THUMBNAIL_H is exported — callers import it for estimateBlockHeight
    expect(THUMBNAIL_H).toBe(96);
  });

  it("exports MINI_GRAPH_THRESHOLD = 12", () => {
    expect(MINI_GRAPH_THRESHOLD).toBe(12);
  });
});

// ── Title tier suppression ────────────────────────────────────────────────────

describe("ContainerMiniGraph — title tier", () => {
  it("returns null (renders nothing) at the title tier", () => {
    const { container } = renderGraph({ collapseTier: "title" });
    // Nothing rendered — the component returns null at title tier.
    expect(container.firstChild).toBeNull();
  });
});

// ── Mini-graph SVG branch ─────────────────────────────────────────────────────

describe("ContainerMiniGraph — mini-graph SVG branch", () => {
  it("renders a mini-graph SVG when preview data is present and count ≤ threshold", () => {
    const preview = makePreview(4);
    const { container } = renderGraph({
      containerNodeCount: 4,
      containerPreview: preview,
    });
    const svg = container.querySelector(
      "[data-testid='mini-graph-thumbnail'] svg[viewBox='0 0 100 96']",
    );
    expect(svg).not.toBeNull();
  });

  it("renders pill rects (one per child node) in the mini-graph SVG", () => {
    const preview = makePreview(4);
    const { container } = renderGraph({
      containerNodeCount: 4,
      containerPreview: preview,
    });
    // The mini-graph SVG has a viewBox attribute; other decorative SVGs do not.
    // Each node is a <rect> inside this viewBox SVG.
    const miniSvg = container.querySelector(
      "[data-testid='mini-graph-thumbnail'] svg[viewBox]",
    );
    expect(miniSvg).not.toBeNull();
    const rects = miniSvg!.querySelectorAll("rect");
    expect(rects.length).toBe(4);
  });

  it("renders cable paths (one per cable) in the mini-graph SVG", () => {
    const preview = makePreview(4); // 3 cables for 4 nodes
    const { container } = renderGraph({
      containerNodeCount: 4,
      containerPreview: preview,
    });
    // Scope to the mini-graph SVG only (viewBox="0 0 100 96")
    const miniSvg = container.querySelector(
      "[data-testid='mini-graph-thumbnail'] svg[viewBox='0 0 100 96']",
    );
    expect(miniSvg).not.toBeNull();
    const paths = miniSvg!.querySelectorAll("path");
    expect(paths.length).toBe(3);
  });

  it("does NOT render density bars when mini-graph is active", () => {
    const preview = makePreview(5);
    renderGraph({ containerNodeCount: 5, containerPreview: preview });
    expect(screen.queryByTestId("container-density-bars")).toBeNull();
  });

  it("does NOT render neutral bar when mini-graph is active", () => {
    const preview = makePreview(5);
    renderGraph({ containerNodeCount: 5, containerPreview: preview });
    expect(screen.queryByTestId("container-neutral-bar")).toBeNull();
  });

  it("still uses mini-graph at exactly the threshold (12 nodes)", () => {
    const preview = makePreview(MINI_GRAPH_THRESHOLD);
    const { container } = renderGraph({
      containerNodeCount: MINI_GRAPH_THRESHOLD,
      containerPreview: preview,
    });
    // MiniGraphSVG uses viewBox="0 0 100 96" — this is the discriminating selector.
    const miniGraphSvg = container.querySelector(
      "[data-testid='mini-graph-thumbnail'] svg[viewBox='0 0 100 96']",
    );
    expect(miniGraphSvg).not.toBeNull();
    expect(screen.queryByTestId("container-density-bars")).toBeNull();
  });
});

// ── Density-bar fallback (>threshold) ────────────────────────────────────────

describe("ContainerMiniGraph — density-bar fallback", () => {
  it("renders density bars when preview children count > threshold", () => {
    const preview = makePreview(MINI_GRAPH_THRESHOLD + 1);
    renderGraph({
      containerNodeCount: MINI_GRAPH_THRESHOLD + 1,
      containerPreview: preview,
    });
    expect(screen.getByTestId("container-density-bars")).toBeInTheDocument();
  });

  it("renders density bars when containerNodeCount > threshold (no preview)", () => {
    renderGraph({ containerNodeCount: MINI_GRAPH_THRESHOLD + 5 });
    expect(screen.getByTestId("container-density-bars")).toBeInTheDocument();
  });

  it("does NOT render mini-graph SVG when density bars are shown", () => {
    const preview = makePreview(MINI_GRAPH_THRESHOLD + 1);
    const { container } = renderGraph({
      containerNodeCount: MINI_GRAPH_THRESHOLD + 1,
      containerPreview: preview,
    });
    // The mini-graph SVG uses viewBox="0 0 100 96" (W=100, H=96). The DiveHint
    // SVG uses "0 0 9 9" and is unrelated. Only the full "0 0 100 96" viewBox
    // identifies the MiniGraphSVG component.
    const miniGraphSvg = container.querySelector(
      "[data-testid='mini-graph-thumbnail'] svg[viewBox='0 0 100 96']",
    );
    expect(miniGraphSvg).toBeNull();
  });
});

// ── Neutral bar fallback (no preview, count ≤ threshold) ─────────────────────

describe("ContainerMiniGraph — neutral bar fallback", () => {
  it("renders neutral bar when no preview and count ≤ threshold", () => {
    renderGraph({ containerNodeCount: 4, containerPreview: undefined });
    expect(screen.getByTestId("container-neutral-bar")).toBeInTheDocument();
  });

  it("shows the block count text in the neutral bar", () => {
    renderGraph({ containerNodeCount: 4 });
    expect(screen.getByText("4 Blocks")).toBeInTheDocument();
  });

  it("shows singular 'Block' for count 1", () => {
    renderGraph({ containerNodeCount: 1 });
    expect(screen.getByText("1 Block")).toBeInTheDocument();
  });

  it("shows 'Empty — open to edit' when count is 0", () => {
    renderGraph({ containerNodeCount: 0 });
    expect(screen.getByText("Empty — open to edit")).toBeInTheDocument();
  });
});

// ── Portal variant ────────────────────────────────────────────────────────────

describe("ContainerMiniGraph — Portal variant", () => {
  it("renders without crashing for a Portal block", () => {
    expect(() =>
      renderGraph({ isPortal: true, containerNodeCount: 3 }),
    ).not.toThrow();
  });

  it("renders the filename row when portalFilename is provided", () => {
    renderGraph({
      isPortal: true,
      portalFilename: "/boards/reverb-chain.elboard",
    });
    expect(screen.getByText("reverb-chain.elboard")).toBeInTheDocument();
  });

  it("does NOT render the filename row when portalFilename is absent", () => {
    const { container } = renderGraph({ isPortal: true });
    // No anchor/text that looks like a filename
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("shows the full path as title tooltip on the filename span", () => {
    renderGraph({
      isPortal: true,
      portalFilename: "/boards/reverb-chain.elboard",
    });
    expect(
      screen.getByTitle("/boards/reverb-chain.elboard"),
    ).toBeInTheDocument();
  });
});

// ── Muted / Bypassed state filters ───────────────────────────────────────────

describe("ContainerMiniGraph — muted/bypassed states", () => {
  it("applies saturate/brightness filter when muted=true", () => {
    renderGraph({ muted: true });
    const thumb = screen.getByTestId("mini-graph-thumbnail") as HTMLElement;
    expect(thumb.style.filter).toContain("saturate");
    expect(thumb.style.filter).toContain("brightness");
  });

  it("applies saturate(0) filter when bypassed=true", () => {
    renderGraph({ bypassed: true });
    const thumb = screen.getByTestId("mini-graph-thumbnail") as HTMLElement;
    expect(thumb.style.filter).toContain("saturate(0)");
  });

  it("shows 'signal passes through' hint when bypassed", () => {
    renderGraph({ bypassed: true });
    expect(
      screen.getByText(/signal passes through/i),
    ).toBeInTheDocument();
  });

  it("does NOT apply filter when neither muted nor bypassed", () => {
    renderGraph({ muted: false, bypassed: false });
    const thumb = screen.getByTestId("mini-graph-thumbnail") as HTMLElement;
    expect(thumb.style.filter ?? "").toBe("");
  });
});

// ── All categories render cleanly ─────────────────────────────────────────────

describe("ContainerMiniGraph — all categories", () => {
  for (const cat of ["instrument", "audiofx", "midifx", "modulator"] as const) {
    it(`renders without crashing for category=${cat}`, () => {
      expect(() => renderGraph({ category: cat })).not.toThrow();
    });
  }
});
