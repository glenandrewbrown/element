import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, fireEvent, within } from "storybook/test";
import {
  EditorDragHandle,
  EDITOR_HANDLE_HEIGHT,
  type EditorBounds,
} from "./EditorDragHandle";

// EditorDragHandle is the titlebar for the docked plugin-editor overlay. In the
// real app the overlay is a native JUCE component painted ABOVE the webview;
// here we mock the overlay with a styled placeholder so the spatial
// relationship (handle sits on the strip directly above the editor body) is
// visible. The bridge calls (SetBounds/Float/Close) no-op in Storybook.

const meta: Meta<typeof EditorDragHandle> = {
  title: "Canvas/EditorDragHandle",
  component: EditorDragHandle,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: [
          "EditorDragHandle — the missing titlebar for the docked plugin editor (Task 4.3).",
          "",
          "The embedded plugin GUI opened by a canvas double-click is a borderless,",
          "in-process native overlay with NO window chrome — which is why it",
          '"cannot be moved". This strip gives it a draggable header: grab + drag',
          "repositions the native overlay LIVE via the existing",
          "`nativePluginEditorSetBounds(x, y, w, h)` bridge.",
          "",
          "**Perf rule:** no React state update per `pointermove`. The in-flight",
          "position is tracked in a ref; the handle moves itself with direct DOM",
          "style writes and the bridge is the only per-move side effect. The parent",
          "bounds state updates exactly once, on `pointerup`.",
          "",
          "Also surfaces the two existing editor affordances as explicit opt-ins:",
          "pop out to a floating window (`nativePluginEditorFloat`) and close",
          "(`nativePluginEditorClose`).",
        ].join("\n"),
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// A stateful harness: mirrors how GraphCanvas owns the bounds and re-renders the
// handle at its committed home after a drag. Renders a faux editor body under
// the handle so the layout reads correctly.
function Harness({
  initial = { x: 120, y: 140, w: 480, h: 320 },
  onCommit,
}: {
  initial?: EditorBounds;
  onCommit?: (x: number, y: number) => void;
}) {
  const [bounds, setBounds] = useState<EditorBounds>(initial);
  return (
    <div className="bg-canvas" style={{ position: "relative", height: 560 }}>
      {/* Faux native overlay (the plugin GUI). */}
      <div
        data-testid="faux-editor-body"
        className="bg-surface border border-white/10 rounded-b-lg grid place-items-center text-text-dim text-[12px]"
        style={{
          position: "fixed",
          left: bounds.x,
          top: bounds.y,
          width: bounds.w,
          height: bounds.h,
        }}
      >
        plugin editor surface
      </div>
      <EditorDragHandle
        title="Serum"
        bounds={bounds}
        onCommit={(x, y) => {
          setBounds((b) => ({ ...b, x, y }));
          onCommit?.(x, y);
        }}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Harness />,
  parameters: {
    docs: {
      description: {
        story:
          "Docked editor with its titlebar. Drag the grip/strip to move the overlay; " +
          "the float and ✕ buttons are explicit opt-ins.",
      },
    },
  },
};

export const DragMovesOverlay: Story = {
  render: (_args, { args }) => (
    <Harness onCommit={args.onCommit as (x: number, y: number) => void} />
  ),
  args: { onCommit: fn() } as never,
  parameters: {
    docs: {
      description: {
        story:
          "Interaction: a header pointer-drag streams live SetBounds updates and " +
          "commits the final position once on pointerup. Verifies the handle settles " +
          "at its new home (left = grabbed origin + delta).",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const handle = body.getByTestId("editor-drag-handle");
    // jsdom/Storybook test env: stub Pointer Capture so the handlers run.
    handle.setPointerCapture = () => {};
    handle.releasePointerCapture = () => {};
    handle.hasPointerCapture = () => true;

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 1,
      clientX: 130,
      clientY: 150,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 230,
      clientY: 250,
    });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 230, clientY: 250 });

    // Grab offset (10,10) from origin (120,140); final pointer (230,250) →
    // overlay top-left (220,240).
    await expect(args.onCommit).toHaveBeenCalledWith(220, 240);
    // Handle settled at its committed home (top sits a header-height above).
    await expect(handle.style.left).toBe("220px");
    await expect(handle.style.top).toBe(`${240 - EDITOR_HANDLE_HEIGHT}px`);
  },
};
