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
// inset frame + left depth-ribbon + depth-banner in context. The EXIT button
// calls navigateToBreadcrumb — in Storybook that pops the seeded stack live.

function seed(stack: string[]) {
  useGraphStore.setState({ breadcrumbStack: stack });
}

/** A mock canvas plane so the inset frame + ribbon read against real depth. */
function CanvasPlane({ stack }: { stack: string[] }) {
  // Seed the breadcrumb stack on mount (and when a story switches its stack).
  // Effect-only — never in render — so an EXIT click (which mutates the stack)
  // is not immediately re-clobbered back to the seeded depth.
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
export const RootNoChrome: Story = {
  render: () => <CanvasPlane stack={["Main Project"]} />,
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
  render: () => <CanvasPlane stack={["Main Project", "Voice Container"]} />,
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
    <CanvasPlane stack={["Main Project", "Polysynth Rack", "Voice Container"]} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Mid-depth dive (Level 2, purple) — two ribbon rungs lit, banner names the active board inside its immediate parent. The everyday nested-navigation state.",
      },
    },
  },
  // Proves the chrome reads REAL breadcrumb state and that EXIT drives
  // navigateToBreadcrumb (the same path double-click / Escape take).
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    // Banner enters with a spring (opacity/translate); wait for it to settle,
    // then assert it reflects the seeded depth + path verbatim — nothing faked.
    await waitFor(() => expect(body.getByText("LEVEL 2")).toBeVisible());
    await expect(body.getByText("Voice Container")).toBeVisible();
    await expect(body.getByText("Polysynth Rack")).toBeVisible();
    await expect(body.getByText("inside")).toBeVisible();

    // EXIT pops one level — to the parent (index = length - 2 = 1).
    const exit = body.getByRole("button", {
      name: /exit nested board/i,
    });
    await userEvent.click(exit);

    // Real store mutated: stack is now [root, parent], depth 1.
    await expect(useGraphStore.getState().breadcrumbStack).toEqual([
      "Main Project",
      "Polysynth Rack",
    ]);
  },
};

// Level 4 — magenta (--depth-4), the deepest distinct tint.
export const LevelFourDeep: Story = {
  render: () => (
    <CanvasPlane
      stack={[
        "Main Project",
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
