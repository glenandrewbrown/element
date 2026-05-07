/**
 * Snapshot tests for the canonical <Icon /> component (Phase F.0.6).
 *
 * Covers default render + each semantic tone variant. Verifies the SVG
 * comes back from lucide-react with the expected stroke width / colour /
 * a11y attrs.
 */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "../Icon";

describe("<Icon />", () => {
  it("renders default size 16 with stroke 1.5 and aria-hidden", () => {
    const { container } = render(<Icon name="AudioWaveform" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
    expect(svg?.getAttribute("stroke-width")).toBe("1.5");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("applies the audio tone (#4A90D9)", () => {
    const { container } = render(
      <Icon name="AudioWaveform" tone="audio" aria-label="Audio waveform" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("#4A90D9");
    expect(svg?.getAttribute("aria-label")).toBe("Audio waveform");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("applies the midi tone (#2BC4C4)", () => {
    const { container } = render(
      <Icon name="Music" tone="midi" aria-label="MIDI signal" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("#2BC4C4");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("applies the cv tone (#E8A838)", () => {
    const { container } = render(
      <Icon name="Activity" tone="cv" aria-label="CV signal" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("#E8A838");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("applies the primary tone (#E5E5EA) and accepts custom size", () => {
    const { container } = render(
      <Icon name="Settings" tone="primary" size={24} aria-label="Settings" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("#E5E5EA");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("falls back to <HelpCircle /> on unknown name and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container, rerender } = render(
      <Icon name="ThisIconDoesNotExist" />,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("ThisIconDoesNotExist");
    // SVG still renders (the HelpCircle fallback).
    expect(container.querySelector("svg")).not.toBeNull();

    // Re-rendering the same unknown name does NOT re-warn (deduped).
    rerender(<Icon name="ThisIconDoesNotExist" />);
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it("respects an explicit aria-hidden=false when an aria-label is set", () => {
    const { container } = render(
      <Icon
        name="Power"
        aria-label="Power"
        aria-hidden={false}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("false");
    expect(svg?.getAttribute("aria-label")).toBe("Power");
  });
});
