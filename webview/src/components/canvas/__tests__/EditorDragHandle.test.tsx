import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the bridge so the drag never hits the real (absent) JUCE host. Each
// wrapper resolves immediately; we assert against the SetBounds spy.
vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorSetBounds: vi.fn().mockResolvedValue(undefined),
  nativePluginEditorFloat: vi.fn().mockResolvedValue(undefined),
  nativePluginEditorClose: vi.fn().mockResolvedValue(undefined),
}));

import {
  nativePluginEditorSetBounds,
  nativePluginEditorFloat,
  nativePluginEditorClose,
} from "../../../bridge/nativePluginEditor";
import { EditorDragHandle, EDITOR_HANDLE_HEIGHT } from "../EditorDragHandle";

const setBounds = vi.mocked(nativePluginEditorSetBounds);
const float = vi.mocked(nativePluginEditorFloat);
const close = vi.mocked(nativePluginEditorClose);

// jsdom doesn't implement the Pointer Capture API; stub it on the handle so
// setPointerCapture/hasPointerCapture/releasePointerCapture are no-ops.
function stubPointerCapture(el: HTMLElement) {
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  el.hasPointerCapture = vi.fn().mockReturnValue(true);
}

const W = 720;
const H = 480;

describe("EditorDragHandle (Task 4.3 — draggable docked editor)", () => {
  beforeEach(() => {
    setBounds.mockClear();
    float.mockClear();
    close.mockClear();
  });

  it("repositions the overlay live during a header drag (updated x/y, size kept)", () => {
    const onCommit = vi.fn();
    render(
      <EditorDragHandle
        title="Serum"
        bounds={{ x: 100, y: 200, w: W, h: H }}
        onCommit={onCommit}
      />,
    );
    const handle = screen.getByTestId("editor-drag-handle");
    stubPointerCapture(handle);

    // Grab the header at a point inside the overlay's x/y origin.
    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 1,
      clientX: 120,
      clientY: 210,
    });
    // No bridge call yet on grab alone.
    expect(setBounds).not.toHaveBeenCalled();

    // Drag right+down by (40, 30): pointer 120→160, 210→240. The grab offset
    // (20, 10) is preserved, so the overlay moves to (140, 230).
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 160, clientY: 240 });
    expect(setBounds).toHaveBeenCalledWith(140, 230, W, H);

    // A second move streams another live update; width/height never change.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 200, clientY: 260 });
    expect(setBounds).toHaveBeenLastCalledWith(180, 250, W, H);

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 200, clientY: 260 });
    // Final bounds committed exactly once on release.
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(180, 250);
  });

  it("does NOT re-render per pointer-move — the bridge stream is the only side effect, parent untouched until pointerup", () => {
    let renderCount = 0;
    function Probe() {
      renderCount += 1;
      return (
        <EditorDragHandle
          title="Pro-Q 4"
          bounds={{ x: 0, y: 100, w: W, h: H }}
          onCommit={() => {}}
        />
      );
    }
    render(<Probe />);
    const handle = screen.getByTestId("editor-drag-handle");
    stubPointerCapture(handle);
    const rendersBeforeDrag = renderCount;

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 7,
      clientX: 10,
      clientY: 110,
    });
    // Stream 10 moves — a stand-in for a 60 Hz pointermove burst.
    for (let i = 1; i <= 10; i += 1) {
      fireEvent.pointerMove(handle, {
        pointerId: 7,
        clientX: 10 + i * 5,
        clientY: 110 + i * 5,
      });
    }

    // Component never re-rendered across the whole move stream (uncontrolled
    // during drag — perf rule). Bridge fired once per move instead.
    expect(renderCount).toBe(rendersBeforeDrag);
    expect(setBounds).toHaveBeenCalledTimes(10);

    // The handle tracked the drag via direct DOM writes (no React state).
    // Grab at clientX/Y (10,110) over origin (0,100) → grab offset (10,10).
    // Final pointer (60,160) − offset = overlay top-left (50,150).
    expect(handle.style.left).toBe("50px");
    expect(handle.style.top).toBe(`${150 - EDITOR_HANDLE_HEIGHT}px`);
  });

  it("ignores non-primary buttons (no drag begins)", () => {
    render(
      <EditorDragHandle
        title="x"
        bounds={{ x: 0, y: 0, w: W, h: H }}
        onCommit={() => {}}
      />,
    );
    const handle = screen.getByTestId("editor-drag-handle");
    stubPointerCapture(handle);
    fireEvent.pointerDown(handle, { button: 2, pointerId: 9 });
    fireEvent.pointerMove(handle, { pointerId: 9, clientX: 50, clientY: 50 });
    expect(setBounds).not.toHaveBeenCalled();
  });

  it("exposes pop-out-to-float and close as explicit opt-ins that don't start a drag", () => {
    render(
      <EditorDragHandle
        title="Reverb"
        bounds={{ x: 0, y: 0, w: W, h: H }}
        onCommit={() => {}}
      />,
    );
    const floatBtn = screen.getByTestId("editor-float-button");
    const closeBtn = screen.getByTestId("editor-close-button");

    // pointerdown on a button stops propagation → no drag-grab; click fires the
    // bridge.
    fireEvent.pointerDown(floatBtn, { button: 0, pointerId: 3 });
    fireEvent.click(floatBtn);
    expect(float).toHaveBeenCalledTimes(1);
    expect(setBounds).not.toHaveBeenCalled();

    fireEvent.pointerDown(closeBtn, { button: 0, pointerId: 4 });
    fireEvent.click(closeBtn);
    expect(close).toHaveBeenCalledTimes(1);
    expect(setBounds).not.toHaveBeenCalled();
  });

  it("renders the header strip directly ABOVE the overlay (top = y - header height)", () => {
    render(
      <EditorDragHandle
        title="Synth"
        bounds={{ x: 48, y: 300, w: W, h: H }}
        onCommit={() => {}}
      />,
    );
    const handle = screen.getByTestId("editor-drag-handle");
    expect(handle.style.position).toBe("fixed");
    expect(handle.style.left).toBe("48px");
    expect(handle.style.top).toBe(`${300 - EDITOR_HANDLE_HEIGHT}px`);
    expect(handle.style.width).toBe(`${W}px`);
  });
});
