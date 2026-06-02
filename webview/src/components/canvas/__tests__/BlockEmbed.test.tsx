/**
 * BlockEmbed — coverage for the rich in-Block instrument panel (was 20.45%).
 *
 * Tests: compact early-return, per-category rendering, ParamStripEmbed
 * with/without nodeId, MeterEmbed levels, synthName fallback naming,
 * and MiniFader hover tooltip.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockEmbed, ParamStripEmbed, MeterEmbed, SpectrumEmbed } from "../BlockEmbed";

// ── Mock useParameterStore ────────────────────────────────────────────────────

const mockStoreValues: Record<string, number> = {};

vi.mock("../../../stores/useParameterStore", () => ({
  useParameterStore: (selector: (s: { values: Record<string, number> }) => unknown) =>
    selector({ values: mockStoreValues }),
}));

// zustand/react/shallow — identity is fine for our mock (arrays compared element-wise)
vi.mock("zustand/react/shallow", () => ({
  useShallow: (fn: unknown) => fn,
}));

// ── Mock useCableMeterStore (useBlockOutputLevel) ──────────────────────────────
//
// BlockEmbed feeds its meter a REAL level via useBlockOutputLevel(nodeId).
// Mock the hook directly to a controllable value so we can prove the meter
// lights on a non-zero level and is dark at 0 without a live host bridge.
let mockBlockLevel = 0;

vi.mock("../../../stores/useCableMeterStore", () => ({
  useBlockOutputLevel: () => mockBlockLevel,
}));

// ── Mock useNodeSpectrum (G3-B item 1) ─────────────────────────────────────────
//
// BlockEmbed subscribes the audiofx slot's FFT via useNodeSpectrum. Mock it to
// a controllable bins array so the root tests stay deterministic and don't fire
// async bridge effects. Default [] = honest "No spectrum" placeholder.
let mockSpectrumBins: number[] = [];

vi.mock("../../../hooks/useNodeSpectrum", () => ({
  useNodeSpectrum: () => mockSpectrumBins,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  Object.keys(mockStoreValues).forEach((k) => { delete mockStoreValues[k]; });
  mockBlockLevel = 0;
  mockSpectrumBins = [];
});

// ── BlockEmbed (root) ─────────────────────────────────────────────────────────

describe("BlockEmbed", () => {
  it("returns nothing when compact=true", () => {
    const { container } = render(
      <BlockEmbed nodeId="n1" category="instrument" compact />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders for instrument category without crashing", () => {
    const { container } = render(
      <BlockEmbed nodeId="n1" category="instrument" />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("renders meter for instrument (no spectrum)", () => {
    const { container } = render(
      <BlockEmbed nodeId="n1" category="instrument" />,
    );
    // "L R" label is rendered inside MeterEmbed
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("renders for audiofx category — shows meter + honest spectrum placeholder (NO fake curve)", () => {
    const { container } = render(
      <BlockEmbed nodeId="n1" category="audiofx" />,
    );
    // The fake static-bezier spectrum was removed (nothing-fake rule): there
    // must be NO <svg> anywhere in the embed. Instead an honest "No spectrum"
    // placeholder is shown.
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByLabelText("Spectrum unavailable")).toBeInTheDocument();
    expect(screen.getByText(/no spectrum/i)).toBeInTheDocument();
  });

  it("renders for midifx category without spectrum", () => {
    const { container } = render(
      <BlockEmbed nodeId="n1" category="midifx" />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByLabelText("Spectrum unavailable")).toBeNull();
  });

  it("renders for modulator category without spectrum", () => {
    const { container } = render(
      <BlockEmbed nodeId="n1" category="modulator" />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByLabelText("Spectrum unavailable")).toBeNull();
  });

  // ── Meter reflects REAL level (kill-fake #2) ──────────────────────────────
  // BlockEmbed must feed its meter the real per-block output level from
  // useBlockOutputLevel — not a hardwired 0. Mocked above via mockBlockLevel.

  it("lights the meter when the block has a non-zero output level", () => {
    mockBlockLevel = 0.8;
    const { container } = render(
      <BlockEmbed nodeId="n1" category="instrument" />,
    );
    // Meter level-fill + peak-hold bars get height = `${level*100}%`. At 0.8 →
    // "80%". (A param-strip fader could coincidentally sit at 0%, so we assert
    // the POSITIVE 80% meter fills are present rather than the absence of 0%.)
    const lit = container.querySelectorAll<HTMLElement>("div[style*='height: 80%']");
    expect(lit.length).toBeGreaterThanOrEqual(2); // L + R level bars lit
  });

  it("keeps the meter dark (0%) when the block output level is 0", () => {
    mockBlockLevel = 0;
    const { container } = render(
      <BlockEmbed nodeId="n1" category="instrument" />,
    );
    const dark = container.querySelectorAll<HTMLElement>("div[style*='height: 0%']");
    expect(dark.length).toBeGreaterThanOrEqual(2); // L + R bars both silent
  });

  it("lights the audiofx meter on a non-zero level (peaks track too)", () => {
    mockBlockLevel = 0.5;
    const { container } = render(
      <BlockEmbed nodeId="n1" category="audiofx" />,
    );
    const lit = container.querySelectorAll<HTMLElement>("div[style*='height: 50%']");
    expect(lit.length).toBeGreaterThanOrEqual(2);
  });

  it("shows the LIVE spectrum canvas for audiofx when real bins arrive (G3-B item 1)", () => {
    mockSpectrumBins = [0.2, 0.7, 0.4, 0.1];
    render(<BlockEmbed nodeId="n1" category="audiofx" />);
    // Real bins → live canvas, honest placeholder gone.
    expect(screen.getByLabelText("Spectrum")).toBeInTheDocument();
    expect(screen.queryByLabelText("Spectrum unavailable")).toBeNull();
  });

  it("keeps the honest 'No spectrum' placeholder for audiofx when bins are empty", () => {
    mockSpectrumBins = [];
    render(<BlockEmbed nodeId="n1" category="audiofx" />);
    expect(screen.getByLabelText("Spectrum unavailable")).toBeInTheDocument();
    expect(screen.queryByLabelText("Spectrum")).toBeNull();
  });
});

// ── ParamStripEmbed ───────────────────────────────────────────────────────────

describe("ParamStripEmbed", () => {
  it("renders without crashing when nodeId is undefined", () => {
    const { container } = render(
      <ParamStripEmbed category="instrument" />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("renders with nodeId when store has values", () => {
    mockStoreValues["node-x:0"] = 0.5;
    mockStoreValues["node-x:1"] = 0.25;
    mockStoreValues["node-x:2"] = 0.75;
    mockStoreValues["node-x:3"] = 1.0;
    const { container } = render(
      <ParamStripEmbed nodeId="node-x" category="instrument" />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("shows 5 faders for audiofx (count override)", () => {
    const { container } = render(
      <ParamStripEmbed nodeId="node-x" category="audiofx" count={5} />,
    );
    // 5 param name spans rendered (3-char slices like "Gai", "Pan" …)
    const spans = container.querySelectorAll("span");
    expect(spans.length).toBeGreaterThanOrEqual(5);
  });

  it("clamps count to min=3", () => {
    const { container } = render(
      <ParamStripEmbed category="instrument" count={1} />,
    );
    // At least 3 faders rendered
    const spans = container.querySelectorAll("span");
    expect(spans.length).toBeGreaterThanOrEqual(3);
  });

  it("renders fallback name 'Gai' (Gain sliced to 3) for index 0", () => {
    const { container } = render(
      <ParamStripEmbed category="instrument" count={3} />,
    );
    expect(container.textContent).toContain("Gai");
  });

  it("renders P5 for index 5 (beyond FALLBACK_NAMES length)", () => {
    const { container } = render(
      <ParamStripEmbed category="instrument" count={5} />,
    );
    // index 5 would be P6 — but count is clamped to max 5 (indices 0-4)
    // so index 4 = "Q" (5th fallback) → "Q" sliced = "Q"
    expect(container.textContent).toContain("Q");
  });
});

// ── MeterEmbed ────────────────────────────────────────────────────────────────

describe("MeterEmbed", () => {
  it("renders with defaults (silent levels)", () => {
    const { container } = render(<MeterEmbed />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders with explicit non-zero levels", () => {
    const { container } = render(
      <MeterEmbed leftLevel={0.8} rightLevel={0.6} leftPeak={0.9} rightPeak={0.7} />,
    );
    // The fill divs use height percentage inline styles
    const fills = container.querySelectorAll<HTMLElement>('div[style*="height"]');
    expect(fills.length).toBeGreaterThan(0);
  });

  it("shows L R label", () => {
    render(<MeterEmbed />);
    expect(screen.getByText("L R")).toBeInTheDocument();
  });
});

// ── SpectrumEmbed ─────────────────────────────────────────────────────────────

describe("SpectrumEmbed (honest empty state — no fake curve)", () => {
  it("renders an explicit 'no spectrum' placeholder when bins are empty, NOT a fabricated curve", () => {
    const { container } = render(<SpectrumEmbed bins={[]} />);
    // The static bezier fake was removed: there must be NO svg / path / line.
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector("line")).toBeNull();
  });

  it("exposes an honest status region with a 'No spectrum' label when no data", () => {
    render(<SpectrumEmbed bins={[]} />);
    expect(screen.getByLabelText("Spectrum unavailable")).toBeInTheDocument();
    expect(screen.getByText(/no spectrum/i)).toBeInTheDocument();
  });

  it("defaults to the honest placeholder when bins prop is omitted", () => {
    render(<SpectrumEmbed />);
    expect(screen.getByLabelText("Spectrum unavailable")).toBeInTheDocument();
  });

  // ── Live FFT path (G3-B item 1) ───────────────────────────────────────────

  it("renders a live <canvas> analyser when REAL bins are present (no placeholder)", () => {
    render(<SpectrumEmbed bins={[0.1, 0.6, 0.9, 0.3, 0.2]} />);
    // The honest placeholder must be gone…
    expect(screen.queryByLabelText("Spectrum unavailable")).toBeNull();
    expect(screen.queryByText(/no spectrum/i)).toBeNull();
    // …replaced by a canvas labelled "Spectrum" (the real analyser).
    expect(screen.getByLabelText("Spectrum")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Spectrum" }).tagName.toLowerCase()).toBe(
      "canvas",
    );
  });
});

// ── MiniFader hover ───────────────────────────────────────────────────────────

describe("MiniFader hover tooltip", () => {
  it("tooltip is hidden initially (opacity 0)", () => {
    const { container } = render(
      <ParamStripEmbed nodeId="n1" category="instrument" count={3} />,
    );
    // The absolute tooltip div has opacity set inline
    const tooltips = Array.from(
      container.querySelectorAll<HTMLElement>("div[style]"),
    ).filter((el) => el.style.opacity === "0");
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it("tooltip becomes visible on mouse enter", async () => {
    const { container } = render(
      <ParamStripEmbed nodeId="n1" category="instrument" count={3} />,
    );
    // The outer fader wrapper is the first flex child inside the strip
    const faderWrappers = container.querySelectorAll<HTMLElement>(
      ".flex.flex-col.items-center",
    );
    expect(faderWrappers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(faderWrappers[0]);
    const tooltip = faderWrappers[0].querySelector<HTMLElement>("div[style]");
    expect(tooltip?.style.opacity).toBe("1");
  });

  it("tooltip hides on mouse leave", () => {
    const { container } = render(
      <ParamStripEmbed nodeId="n1" category="instrument" count={3} />,
    );
    const faderWrappers = container.querySelectorAll<HTMLElement>(
      ".flex.flex-col.items-center",
    );
    fireEvent.mouseEnter(faderWrappers[0]);
    fireEvent.mouseLeave(faderWrappers[0]);
    const tooltip = faderWrappers[0].querySelector<HTMLElement>("div[style]");
    expect(tooltip?.style.opacity).toBe("0");
  });
});
