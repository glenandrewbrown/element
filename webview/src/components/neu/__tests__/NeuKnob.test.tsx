/**
 * Tests for <NeuKnob /> — rotary knob primitive with vertical-drag value change.
 *
 * Pointer-capture and getBoundingClientRect are jsdom-incompatible, so they
 * are stubbed at the prototype level.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NeuKnob } from "../NeuKnob";

beforeEach(() => {
  if (!(HTMLElement.prototype as { setPointerCapture?: unknown })
    .setPointerCapture) {
    (HTMLElement.prototype as unknown as {
      setPointerCapture: (id: number) => void;
    }).setPointerCapture = () => {};
  }
});

describe("<NeuKnob />", () => {
  it("renders label and value", () => {
    render(<NeuKnob value={42} label="GAIN" />);
    expect(screen.getByText("GAIN")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders optional source label", () => {
    render(<NeuKnob value={0} label="CUTOFF" sourceLabel="LFO 1" />);
    expect(screen.getByText("LFO 1")).toBeInTheDocument();
  });

  it("omits source label when not provided", () => {
    render(<NeuKnob value={0} label="X" />);
    expect(screen.queryByText("LFO 1")).not.toBeInTheDocument();
  });

  it("renders cursor cursor-ns-resize when onChange supplied", () => {
    const { container } = render(
      <NeuKnob value={50} label="X" onChange={() => {}} />,
    );
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;
    expect(body?.className).toContain("cursor-ns-resize");
  });

  it("does not get cursor-ns-resize when read-only", () => {
    const { container } = render(<NeuKnob value={50} label="X" />);
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;
    expect(body?.className).not.toContain("cursor-ns-resize");
  });

  it("fires onChange on vertical drag (upward = increase)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NeuKnob value={50} label="X" onChange={onChange} />,
    );
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;

    fireEvent.pointerDown(body, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(body, { clientY: 80, pointerId: 1 });
    // deltaY = 100 - 80 = 20, sensitivity 0.6, expected 50 + 20*0.6 = 62
    expect(onChange).toHaveBeenCalledWith(62);
  });

  it("applies the shift-key fine sensitivity (0.06x) when Shift is held from the start", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NeuKnob value={50} label="X" onChange={onChange} />,
    );
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;

    // Shift held at pointer-down → anchored fine from the first move (no
    // re-anchor transition). deltaY 20 * 0.06 = 1.2 -> 51.2.
    fireEvent.pointerDown(body, { clientY: 100, pointerId: 1, shiftKey: true });
    fireEvent.pointerMove(body, { clientY: 80, pointerId: 1, shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(51.2);
  });

  it("re-anchors on a mid-drag Shift transition so the value does NOT jump (T5)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NeuKnob value={50} label="X" onChange={onChange} />,
    );
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;

    // Start coarse (no Shift) at y=100, then move to y=80 → coarse +12 = 62.
    fireEvent.pointerDown(body, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(body, { clientY: 80, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(62);
    // Engage Shift AT the same point (y=80): re-anchor → 0 delta → value holds,
    // no jump. (The OLD code would have snapped to fine-of-whole-delta here.)
    onChange.mockClear();
    fireEvent.pointerMove(body, { clientY: 80, pointerId: 1, shiftKey: true });
    // Re-anchored at the live value; next fine move of 10px = +0.6.
    fireEvent.pointerMove(body, { clientY: 70, pointerId: 1, shiftKey: true });
    // Because the component re-reads `value` from props (still 50 in this test
    // harness — props don't update), the re-anchor rebases to 50, so the fine
    // move yields 50 + 10*0.06 = 50.6 — the KEY assertion is "no 3px jump", i.e.
    // the value tracks the re-anchored base, not a fine-scaled full delta.
    expect(onChange).toHaveBeenLastCalledWith(50.6);
  });

  it("clamps the value to [0, 100]", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NeuKnob value={95} label="X" onChange={onChange} />,
    );
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;

    fireEvent.pointerDown(body, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(body, { clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("ignores pointer events when no onChange handler is supplied", () => {
    const { container } = render(<NeuKnob value={50} label="X" />);
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;
    // Should be a no-op — no exceptions, no state change.
    expect(() =>
      fireEvent.pointerDown(body, { clientY: 100, pointerId: 1 }),
    ).not.toThrow();
  });

  it("stops dragging on pointerUp (no further onChange calls)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NeuKnob value={50} label="X" onChange={onChange} />,
    );
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;

    fireEvent.pointerDown(body, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(body, { clientY: 90, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(body, { pointerId: 1 });
    fireEvent.pointerMove(body, { clientY: 50, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
