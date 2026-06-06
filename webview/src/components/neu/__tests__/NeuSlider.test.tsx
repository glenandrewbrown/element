/**
 * Tests for <NeuSlider /> — compact neumorphic parameter slider (G3).
 *
 * Pointer-capture and getBoundingClientRect are jsdom-incompatible, so they
 * are stubbed at the prototype level (same approach as NeuFader tests).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NeuSlider } from "../NeuSlider";

beforeEach(() => {
  if (!(HTMLElement.prototype as { setPointerCapture?: unknown })
    .setPointerCapture) {
    (HTMLElement.prototype as unknown as {
      setPointerCapture: (id: number) => void;
    }).setPointerCapture = () => {};
  }
});

const TRACK_RECT = {
  left: 0,
  top: 0,
  right: 100,
  bottom: 6,
  width: 100,
  height: 6,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

function stubRect() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    TRACK_RECT as DOMRect,
  );
}

describe("<NeuSlider />", () => {
  it("renders an accessible slider with aria value state", () => {
    render(<NeuSlider value={0.25} ariaLabel="Gain" onChange={() => {}} />);
    const slider = screen.getByRole("slider", { name: "Gain" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "1");
    expect(slider).toHaveAttribute("aria-valuenow", "0.25");
  });

  it("exposes aria-valuetext when provided", () => {
    render(
      <NeuSlider
        value={0.5}
        ariaLabel="Gain"
        ariaValueText="−6.0 dB"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("slider", { name: "Gain" })).toHaveAttribute(
      "aria-valuetext",
      "−6.0 dB",
    );
  });

  it("is read-only (not focusable, aria-disabled) without onChange", () => {
    render(<NeuSlider value={0.5} ariaLabel="Gain" />);
    const slider = screen.getByRole("slider", { name: "Gain" });
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
  });

  it("clamps value into 0–1 for aria-valuenow", () => {
    render(<NeuSlider value={1.5} ariaLabel="Gain" onChange={() => {}} />);
    expect(screen.getByRole("slider", { name: "Gain" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
  });

  it("pointer-down on the track maps x-position to a 0–1 value", () => {
    stubRect();
    const onChange = vi.fn();
    render(<NeuSlider value={0} ariaLabel="Gain" onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Gain" });
    fireEvent.pointerDown(slider, { clientX: 75, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(0.75);
  });

  it("ArrowRight nudges up by the default 0.01", () => {
    const onChange = vi.fn();
    render(<NeuSlider value={0.5} ariaLabel="Gain" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Gain" }), {
      key: "ArrowRight",
    });
    expect(onChange).toHaveBeenCalledWith(0.51);
  });

  it("ArrowLeft nudges down; Home/End jump to extremes", () => {
    const onChange = vi.fn();
    render(<NeuSlider value={0.5} ariaLabel="Gain" onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Gain" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(0.49);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("stepped slider snaps keyboard nudges to the step grid", () => {
    const onChange = vi.fn();
    // 5 positions (min 0 max 4) → step 0.25
    render(
      <NeuSlider value={0.5} step={0.25} ariaLabel="Mode" onChange={onChange} />,
    );
    fireEvent.keyDown(screen.getByRole("slider", { name: "Mode" }), {
      key: "ArrowRight",
    });
    expect(onChange).toHaveBeenCalledWith(0.75);
  });

  it("stepped slider snaps pointer position to the step grid", () => {
    stubRect();
    const onChange = vi.fn();
    render(
      <NeuSlider value={0} step={0.25} ariaLabel="Mode" onChange={onChange} />,
    );
    fireEvent.pointerDown(screen.getByRole("slider", { name: "Mode" }), {
      clientX: 60, // raw 0.6 → nearest step 0.5
      pointerId: 1,
    });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });
});
