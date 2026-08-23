/**
 * Tests for <NeuBadge /> — semantic colour + shape badge primitive (ADR-001 / ADR-002).
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NeuBadge } from "../NeuBadge";

describe("<NeuBadge />", () => {
  it("renders provided text", () => {
    render(<NeuBadge text="VST3" />);
    expect(screen.getByText("VST3")).toBeInTheDocument();
  });

  it("defaults to the blue (generator) palette", () => {
    render(<NeuBadge text="AUDIO" />);
    const badge = screen.getByText("AUDIO");
    expect(badge.className).toContain("border-generator");
    expect(badge.className).toContain("text-generator");
  });

  it("applies the orange (modifier) palette", () => {
    render(<NeuBadge text="CV" color="orange" />);
    const badge = screen.getByText("CV");
    expect(badge.className).toContain("border-modifier");
    expect(badge.className).toContain("text-modifier");
  });

  it("applies the teal (logic) palette", () => {
    render(<NeuBadge text="MIDI" color="teal" />);
    const badge = screen.getByText("MIDI");
    expect(badge.className).toContain("border-logic");
    expect(badge.className).toContain("text-logic");
  });

  it("applies the purple (AU plugin) palette", () => {
    render(<NeuBadge text="AU" color="purple" />);
    const badge = screen.getByText("AU");
    expect(badge.className).toContain("border-badge-au");
    expect(badge.className).toContain("text-badge-au");
  });

  it("applies the grey (LV2) palette", () => {
    render(<NeuBadge text="LV2" color="grey" />);
    const badge = screen.getByText("LV2");
    expect(badge.className).toContain("border-badge-lv2");
    expect(badge.className).toContain("text-badge-lv2");
  });

  it("merges caller-provided className", () => {
    render(<NeuBadge text="X" className="ml-2 opacity-50" />);
    const badge = screen.getByText("X");
    expect(badge.className).toContain("ml-2");
    expect(badge.className).toContain("opacity-50");
  });

  it("always renders as a span (inline badge)", () => {
    const { container } = render(<NeuBadge text="X" />);
    expect(container.firstChild?.nodeName).toBe("SPAN");
  });
});
