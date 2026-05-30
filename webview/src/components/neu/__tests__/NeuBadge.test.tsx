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

  it("defaults to the blue (accent-blue) palette", () => {
    render(<NeuBadge text="AUDIO" />);
    const badge = screen.getByText("AUDIO");
    expect(badge.className).toContain("border-accent-blue");
    expect(badge.className).toContain("text-accent-blue");
  });

  it("applies the orange (accent-orange) palette", () => {
    render(<NeuBadge text="CV" color="orange" />);
    const badge = screen.getByText("CV");
    expect(badge.className).toContain("border-accent-orange");
    expect(badge.className).toContain("text-accent-orange");
  });

  it("applies the teal (accent-teal) palette", () => {
    render(<NeuBadge text="MIDI" color="teal" />);
    const badge = screen.getByText("MIDI");
    expect(badge.className).toContain("border-accent-teal");
    expect(badge.className).toContain("text-accent-teal");
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
