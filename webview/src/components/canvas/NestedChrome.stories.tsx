import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { NestedChrome } from "./NestedChrome";
import { useGraphStore } from "../../stores/useGraphStore";

// ── Store seeding ──
// NestedChrome reads `breadcrumbStack` from useGraphStore and renders only when
// the stack is deeper than the root (depth = length - 1 > 0). It paints itself
// over whatever sits behind it, so each story seeds a breadcrumb path and frames
// the overlay over a mock "canvas" surface (dotted dark background) to show the
// inset frame + left depth-ribbon + depth-banner in context.
//
// EXIT is ENGINE-driven (the dive-desync fix): it calls exitToBreadcrumb, which
// asks the host to back out and lets the breadcrumb redraw from the snapshot the
// host re-pushes. There is no host in Storybook, so EXIT is a visual-only no-op
// here (the seeded stack is the source of truth for the layout) — the live-pop
// behaviour is covered by the GraphCanvas/useGraphStore unit tests instead.

function seed(stack: string[]) {
  useGraphStore.setState({ breadcrumbStack: stack });
}

/** A mock canvas plane so the inset frame + ribbon read against real depth. */
function CanvasPlane({ stack }: { stack: string[] }) {
  // Seed the breadcrumb stack on mount (and when a story switches its stack).
  useEffect(() => {
    seed(stack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack.join("›")]);
  return (
    <div
      className="relative bg-canvas overflow-hidden rounded-md"
      style={{
        width: "100%",
        height: 460,
        backgroundImage:
          "radial-gradient(circle, #2A2A2E 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }}
    >
      {/* a couple of faux blocks so the frame visibly "contains" a board */}
      <div className="absolute left-[120px] top-[150px] w-28 h-16 rounded-lg bg-surface neu-raised" />
      <div className="absolute left-[300px] top-[230px] w-28 h-16 rounded-lg bg-surface neu-raised" />
      <NestedChrome />
    </div>
  );
}

const meta = {
  title: "Canvas/NestedChrome",
  component: NestedChrome,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "NestedChrome — the canvas overlay shown when the user dives into a Container/nested Board. Driven entirely by the real breadcrumb stack in useGraphStore (depth = stack.length − 1): an inset `.nested-canvas-frame` border that seats the nested Board inside a recessed compartment, a left depth-ribbon (one lit rung per level, tinted by the `--depth-N` token), and an animated depth-banner reading \"LEVEL N · {board} inside {parent}\" with a visible EXIT control. Absent at the root (depth 0). The frame is pointer-events-none so the canvas stays interactive; only the banner + EXIT capture clicks.",
      },
    },
  },
  tags: ["!autodocs"],
} satisfies Meta<typeof NestedChrome>;

export default meta;
type Story = StoryObj<typeof meta>;

// Root — depth 0, overlay intentionally absent (honest: nothing nested).
// The engine emits a TWO-element root stack [sessionName, activeGraphName];
// neither is a dived container, so depth 0 / no chrome.
export const RootNoChrome: Story = {
  render: () => <CanvasPlane stack={["Main Project", "Main Board"]} />,
  parameters: {
    docs: {
      description: {
        story:
          "Root Project (depth 0). The chrome is intentionally absent — there is no nested Board to frame, so the canvas shows no frame, ribbon, or banner. Documents the no-render guard.",
      },
    },
  },
};

// Level 1 — first dive. Teal (--depth-1).
export const LevelOne: Story = {
  render: () => (
    <CanvasPlane stack={["Main Project", "Main Board", "Voice Container"]} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "First dive (Level 1, teal). The frame + single-rung ribbon sweep in and the banner slides down reading \"LEVEL 1 · Voice Container inside Main Project\". The minimum nested case.",
      },
    },
  },
};

// Level 2 — purple (--depth-2). The everyday mid-depth case.
export const LevelTwo: Story = {
  render: () => (
    <CanvasPlane
      stack={["Main Project", "Main Board", "Polysynth Rack", "Voice Container"]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Mid-depth dive (Level 2, purple) — two ribbon rungs lit, banner names the active board inside its immediate parent. The everyday nested-navigation state.",
      },
    },
  },
  // Proves the chrome reads REAL breadcrumb state and surfaces a working EXIT
  // affordance. EXIT is engine-driven (it calls exitToBreadcrumb → the host),
  // so with no host attached the live stack does not change here — the actual
  // back-out is unit-tested (GraphCanvas/useGraphStore). We assert the banner
  // reflects the seeded path verbatim and that EXIT is present + clickable.
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    // Banner enters with a spring (opacity/translate); wait for it to settle,
    // then assert it reflects the seeded depth + path verbatim — nothing faked.
    await waitFor(() => expect(body.getByText("LEVEL 2")).toBeVisible());
    await expect(body.getByText("Voice Container")).toBeVisible();
    await expect(body.getByText("Polysynth Rack")).toBeVisible();
    await expect(body.getByText("inside")).toBeVisible();

    // EXIT is the visible back-out affordance (engine-driven; one level up).
    const exit = body.getByRole("button", {
      name: /exit nested board/i,
    });
    await expect(exit).toBeVisible();
    await userEvent.click(exit);
  },
};

// Level 4 — magenta (--depth-4), the deepest distinct tint.
export const LevelFourDeep: Story = {
  render: () => (
    <CanvasPlane
      stack={[
        "Main Project",
        "Main Board",
        "Instruments",
        "Polysynth Rack",
        "Voice Container",
        "Filter Stage",
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Deep dive (Level 4, magenta) — the deepest distinct depth tint, four ribbon rungs lit. Stress-tests the banner path text and the ribbon rung stack at maximum nesting.",
      },
    },
  },
};

// Long names — verifies banner truncation without breaking the pill shape.
export const LongNames: Story = {
  render: () => (
    <CanvasPlane
      stack={[
        "Main Project Root Board",
        "Main Board",
        "Very Long Container Name That Tests Overflow Behaviour",
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Verbose Container names — the banner truncates the board/parent labels (full text in the title tooltip) so the depth pill never blows out the banner width.",
      },
    },
  },
};
