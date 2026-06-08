import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import { AppShell } from "./AppShell";
import {
  useAppStore,
  PANEL_MIN_W,
  PANEL_MAX_W,
} from "../../stores/useAppStore";
import { usePerformStore } from "../../stores/usePerformStore";

/**
 * Layout/AppShell · Drag-resize (Task 3.F / brief Phase F)
 * ────────────────────────────────────────────────────────
 * Focused stories for the side-panel drag-to-resize + snap-collapse handle.
 *
 * The handle's whole reason to exist is the painter/perf rule: dragging it
 * must NOT re-render React or churn the Zustand store per `pointermove`. It
 * writes the live width straight to the DOM and commits to the store ONCE on
 * `pointerup` (→ `setPanelWidth`), OR collapses the panel (→ `togglePanel`)
 * when the drag drops below the ~120px snap threshold.
 *
 * These stories assert that contract directly:
 *  - `CommitsOnPointerUpNotMove` — store width is UNCHANGED across pointermoves,
 *    then committed exactly once on pointerup; and a render-counting probe never
 *    ticks during the move phase.
 *  - `SnapCollapseBelowThreshold` — dragging the inner edge far past the
 *    threshold and releasing snaps the panel to its rail (panelOpen → false).
 */

// ── Render-counting probe ───────────────────────────────────────────────────
// Subscribes to the exact app-store slices the resize feature would mutate, and
// records how many times it rendered. If a pointermove caused ANY React-visible
// state change (store write → re-render), this counter would tick. We snapshot
// it at pointerdown and assert it is unchanged at the end of the move phase →
// proof of "no React render per pointermove" (the perf guard).
let renderCount = 0;
function ResizeProbe({ children }: { children: ReactNode }) {
  // Touch the resize-relevant slices so a change to any of them re-renders us.
  const lw = useAppStore((s) => s.leftWidth);
  const rw = useAppStore((s) => s.rightWidth);
  const lo = useAppStore((s) => s.leftPanelOpen);
  const ro = useAppStore((s) => s.rightPanelOpen);
  renderCount += 1;
  return (
    <>
      <span
        data-testid="render-count"
        data-lw={lw}
        data-rw={rw}
        data-lo={String(lo)}
        data-ro={String(ro)}
        style={{ position: "fixed", top: 0, left: 0, opacity: 0, zIndex: -1 }}
      >
        {renderCount}
      </span>
      {children}
    </>
  );
}

function seedOpen() {
  useAppStore.setState({
    mode: "edit",
    leftPanelOpen: true,
    rightPanelOpen: true,
    bottomPanelOpen: true,
    leftWidth: 260,
    rightWidth: 280,
    inspectorUserCollapsed: false,
  });
  usePerformStore.setState({ mapModeActive: false });
}

const meta = {
  title: "Layout/AppShell/DragResize",
  component: AppShell,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Drag-to-resize + snap-collapse for the side panels (owner feedback #8). Grab a panel's inner edge and drag to resize within a clamped min/max; drag narrower than ~120px and release to snap it to the icon rail (tldraw/Figma). Widths persist (committed to the store on pointer-up). The live drag writes width straight to the DOM — no React render per pointermove (the locked painter/perf rule).",
      },
    },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const canvas = (
  <div className="flex items-center justify-center h-full text-text-dim text-[11px] uppercase tracking-widest">
    Board canvas
  </div>
);

const host = (node: ReactNode) => (
  <div className="relative w-full bg-canvas" style={{ height: 600 }}>
    <ResizeProbe>{node}</ResizeProbe>
  </div>
);

// Fire a pointer drag on a handle: down → N moves → up. Coordinates are in
// client px. We deliberately read `clientX` deltas the handle uses, not rects.
function pointerDrag(
  el: Element,
  fromX: number,
  steps: number[],
  opts: { up?: boolean } = {},
) {
  fireEvent.pointerDown(el, { clientX: fromX, pointerId: 1, button: 0 });
  for (const x of steps) {
    fireEvent.pointerMove(el, { clientX: x, pointerId: 1 });
  }
  if (opts.up !== false) {
    fireEvent.pointerUp(el, { clientX: steps[steps.length - 1], pointerId: 1 });
  }
}

// ── Test 1: commit on pointerup, never during move; no render per move ──
export const CommitsOnPointerUpNotMove: Story = {
  args: { children: canvas },
  render: (args) => host(<AppShell {...args} />),
  decorators: [
    (Story) => {
      seedOpen();
      return <Story />;
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Dragging the left panel's inner edge fires many pointermoves, but the store width stays put and the render-count probe never ticks during the move — the width is written straight to the DOM. On pointer-up the new clamped width is committed to the store exactly once.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const handle = await c.findByTestId("resize-handle-left");
    const probe = c.getByTestId("render-count");

    // Baseline store width + render count.
    const startWidth = useAppStore.getState().leftWidth;
    expect(startWidth).toBe(260);
    const startRenders = Number(probe.textContent);
    expect(probe.dataset.lw).toBe("260");

    // The panel <aside> the handle lives in — its REAL rendered width is the
    // drag's `startW` (260, the seeded width, in the real browser).
    const aside = handle.parentElement as HTMLElement;
    const baseW = aside.getBoundingClientRect().width;

    // Drag the inner edge RIGHT by +80px in several steps WITHOUT releasing.
    const rect = handle.getBoundingClientRect();
    const x0 = rect.left + rect.width / 2;
    const DRAG_DX = 80;
    fireEvent.pointerDown(handle, { clientX: x0, pointerId: 1, button: 0 });
    for (const dx of [20, 40, 60, DRAG_DX]) {
      fireEvent.pointerMove(handle, { clientX: x0 + dx, pointerId: 1 });
    }

    // ── The perf contract, asserted during the move phase ──
    // (a) store width unchanged — NOT committed mid-drag.
    expect(useAppStore.getState().leftWidth).toBe(startWidth);
    // (b) the render-count probe did NOT re-render → no React render per move.
    expect(Number(probe.textContent)).toBe(startRenders);
    // (c) the live width WAS written straight to the panel DOM (≈ base + drag).
    const liveWidth = aside.getBoundingClientRect().width;
    expect(liveWidth).toBeGreaterThan(baseW);
    expect(Math.abs(liveWidth - (baseW + DRAG_DX))).toBeLessThanOrEqual(2);

    // Release → commit happens exactly here (exactly once).
    fireEvent.pointerUp(handle, { clientX: x0 + DRAG_DX, pointerId: 1 });

    await waitFor(() => {
      const w = useAppStore.getState().leftWidth;
      // Committed the dragged-to width (base + 80), clamped + panel still open.
      expect(useAppStore.getState().leftPanelOpen).toBe(true);
      expect(w).toBeGreaterThanOrEqual(PANEL_MIN_W);
      expect(w).toBeLessThanOrEqual(PANEL_MAX_W);
      expect(Math.abs(w - (baseW + DRAG_DX))).toBeLessThanOrEqual(2);
    });
  },
};

// ── Test 2: drag below the snap threshold → collapse to the rail ──
export const SnapCollapseBelowThreshold: Story = {
  args: { children: canvas },
  render: (args) => host(<AppShell {...args} />),
  decorators: [
    (Story) => {
      seedOpen();
      return <Story />;
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Dragging the left panel's inner edge far to the LEFT (past the ~120px snap threshold) and releasing collapses the panel to its 40px icon rail instead of committing a sliver width — the tldraw/Figma snap-collapse. The browser PanelRail's expand button appears.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const handle = await c.findByTestId("resize-handle-left");
    expect(useAppStore.getState().leftPanelOpen).toBe(true);

    // Drag the LEFT panel's right edge far leftwards (huge negative dx) so the
    // computed width drops well under PANEL_SNAP_W (120), then release.
    const rect = handle.getBoundingClientRect();
    const x0 = rect.left + rect.width / 2;
    pointerDrag(handle, x0, [x0 - 100, x0 - 200, x0 - 300]);

    await waitFor(() => {
      // Snapped to the rail → panel reported closed.
      expect(useAppStore.getState().leftPanelOpen).toBe(false);
    });

    // The unified PanelRail (browser) is now in the DOM (collapse hides
    // content, not access).
    await waitFor(() =>
      expect(
        c.getByRole("button", { name: "Expand browser" }),
      ).toBeInTheDocument(),
    );
  },
};
