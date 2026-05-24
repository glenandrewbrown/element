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

  it("applies the shift-key fine sensitivity (0.2x)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NeuKnob value={50} label="X" onChange={onChange} />,
    );
    const body = container.querySelector('[style*="width: 64px"]') as HTMLElement;

    fireEvent.pointerDown(body, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(body, { clientY: 80, pointerId: 1, shiftKey: true });
    // deltaY 20 * 0.2 = 4 -> 54
    expect(onChange).toHaveBeenCalledWith(54);
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
