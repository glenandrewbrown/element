/**
 * Tests for <NeuFader /> — linear fader primitive (horizontal + vertical).
 *
 * Pointer-capture and getBoundingClientRect are jsdom-incompatible, so they
 * are stubbed at the prototype level.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NeuFader } from "../NeuFader";

beforeEach(() => {
  if (!(HTMLElement.prototype as { setPointerCapture?: unknown })
    .setPointerCapture) {
    (HTMLElement.prototype as unknown as {
      setPointerCapture: (id: number) => void;
    }).setPointerCapture = () => {};
  }
});

const HORIZONTAL_RECT = {
  left: 0,
  top: 0,
  right: 100,
  bottom: 10,
  width: 100,
  height: 10,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

const VERTICAL_RECT = {
  left: 0,
  top: 0,
  right: 32,
  bottom: 100,
  width: 32,
  height: 100,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

function stubRect(rect: DOMRect) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    rect as DOMRect,
  );
}

describe("<NeuFader />", () => {
  it("renders the percentage value and label (horizontal)", () => {
    render(<NeuFader value={42} label="GAIN" />);
    expect(screen.getByText("GAIN")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("renders the percentage value and label (vertical)", () => {
    render(<NeuFader value={75} label="VOL" orientation="vertical" />);
    expect(screen.getByText("VOL")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("uses cursor-ew-resize on the horizontal track when interactive", () => {
    const { container } = render(
      <NeuFader value={0} label="X" onChange={() => {}} />,
    );
    const track = container.querySelector(".cursor-ew-resize");
    expect(track).not.toBeNull();
  });

  it("uses cursor-ns-resize on the vertical track when interactive", () => {
    const { container } = render(
      <NeuFader
        value={0}
        label="X"
        orientation="vertical"
        onChange={() => {}}
      />,
    );
    const track = container.querySelector(".cursor-ns-resize");
    expect(track).not.toBeNull();
  });

  it("does not set a cursor class when read-only", () => {
    const { container } = render(<NeuFader value={50} />);
    expect(container.querySelector(".cursor-ew-resize")).toBeNull();
  });

  it("fires onChange on horizontal pointerDown at the click x position", () => {
    stubRect(HORIZONTAL_RECT as DOMRect);
    const onChange = vi.fn();
    const { container } = render(
      <NeuFader value={0} label="X" onChange={onChange} />,
    );
    const track = container.querySelector(".cursor-ew-resize") as HTMLElement;
    // clientX = 30 inside a 100-wide track -> 30%
    fireEvent.pointerDown(track, { clientX: 30, clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it("fires onChange on vertical pointerDown with inverted Y axis (top=100%)", () => {
    stubRect(VERTICAL_RECT as DOMRect);
    const onChange = vi.fn();
    const { container } = render(
      <NeuFader
        value={0}
        label="X"
        orientation="vertical"
        onChange={onChange}
      />,
    );
    const track = container.querySelector(".cursor-ns-resize") as HTMLElement;
    // clientY = 25 inside 100-tall track -> ratio = 1 - 0.25 = 0.75 -> 75%
    fireEvent.pointerDown(track, { clientX: 0, clientY: 25, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it("emits onChange on pointerMove while dragging", () => {
    stubRect(HORIZONTAL_RECT as DOMRect);
    const onChange = vi.fn();
    const { container } = render(
      <NeuFader value={0} label="X" onChange={onChange} />,
    );
    const track = container.querySelector(".cursor-ew-resize") as HTMLElement;
    fireEvent.pointerDown(track, { clientX: 10, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 80, clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(80);
  });

  it("clamps the value to [0, 100]", () => {
    stubRect(HORIZONTAL_RECT as DOMRect);
    const onChange = vi.fn();
    const { container } = render(
      <NeuFader value={0} label="X" onChange={onChange} />,
    );
    const track = container.querySelector(".cursor-ew-resize") as HTMLElement;
    fireEvent.pointerDown(track, { clientX: 250, clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(100);
    fireEvent.pointerDown(track, { clientX: -50, clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("does not emit pointerMove updates after pointerUp", () => {
    stubRect(HORIZONTAL_RECT as DOMRect);
    const onChange = vi.fn();
    const { container } = render(
      <NeuFader value={0} label="X" onChange={onChange} />,
    );
    const track = container.querySelector(".cursor-ew-resize") as HTMLElement;
    fireEvent.pointerDown(track, { clientX: 20, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(track, { pointerId: 1 });
    onChange.mockClear();
    fireEvent.pointerMove(track, { clientX: 90, clientY: 0, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores pointer events entirely when no onChange handler is supplied", () => {
    const { container } = render(<NeuFader value={50} />);
    const track = container.querySelector("div.flex-1") as HTMLElement;
    expect(() =>
      fireEvent.pointerDown(track, { clientX: 10, pointerId: 1 }),
    ).not.toThrow();
  });
});
