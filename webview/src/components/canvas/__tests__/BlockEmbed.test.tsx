/**
 * BlockEmbed — coverage for the in-Block instrument panel.
 *
 * Tests: compact early-return, per-category rendering, the REAL output meter
 * (lit on signal / dark at 0), and the honest spectrum (live canvas on real
 * bins, "No spectrum" placeholder otherwise).
 *
 * NOTE — the generic GAIN/PAN/MIX/FREQ/Q `ParamStripEmbed`/`MiniFader` strip was
 * removed (Glen, 2026-06-03): it synthesised parameter NAMES from a hardcoded
 * fallback list, so it misreported every hosted plugin's real controls. Its
 * tests went with it; a regression assertion below locks in that the fabricated
 * names never come back.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlockEmbed, MeterEmbed, SpectrumEmbed } from "../BlockEmbed";

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

  // ── Regression: the fabricated-name param strip stays GONE (nothing-fake) ──
  // The removed strip sliced hardcoded fallback names ("Gain"→"Gai", "Pan",
  // "Mix"…) into 3-char labels. None of those must ever render again, for any
  // category, because they lied about the hosted plugin's real parameters.
  it("never renders the removed fabricated param-name labels (Gai/Pan/Mix/Freq/Q)", () => {
    for (const category of ["instrument", "audiofx", "midifx", "modulator"] as const) {
      const { container, unmount } = render(
        <BlockEmbed nodeId="n1" category={category} />,
      );
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\bGai\b/);
      expect(text).not.toMatch(/\bPan\b/);
      expect(text).not.toMatch(/\bFreq\b/);
      unmount();
    }
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
    // "80%". L + R level bars lit.
    const lit = container.querySelectorAll<HTMLElement>("div[style*='height: 80%']");
    expect(lit.length).toBeGreaterThanOrEqual(2);
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
