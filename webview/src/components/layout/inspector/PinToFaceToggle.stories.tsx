import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn, expect, userEvent, within } from "storybook/test";
import { PinToFaceToggle } from "./PinToFaceToggle";

/**
 * PinToFaceToggle — the per-param "📌 pin to Block face" control (Wave-3 Task 3.E).
 * A thin wrapper over NeuToggle: pinned = the param is surfaced on the Block's
 * Macro tier (the inverse of the Block's `hiddenParams` substrate). The 📌 is a
 * decorative at-a-glance cue; the actual control is the neumorphic NeuToggle
 * (role="switch"), wrapped in a labelled group so AT announces what it pins.
 */
const meta = {
  title: "Layout/Inspector/PinToFaceToggle",
  component: PinToFaceToggle,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The 📌 pin-to-face toggle wires a single REAL Value/CV param to the Block Macro tier. Pinned " +
          "(on) = surfaced on the face; unpinned (off) = hidden. It is a presentational wrapper over " +
          "NeuToggle — the inversion + the hiddenParams write live in the Inspector caller, so this stays " +
          "a pure toggle. NOTHING fabricated: it is only ever rendered for a param that really exists.",
      },
    },
  },
  args: {
    pinned: true,
    label: "Mix",
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="bg-panel p-6 rounded-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PinToFaceToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Pinned (on) — the param is surfaced on the Block face ──
export const Pinned: Story = {
  args: { pinned: true, label: "Mix" },
  play: async ({ canvas, args }) => {
    // The labelled group announces the unpin action; the switch reads checked AND
    // carries its OWN accessible name (not just the wrapping group) — queryable by
    // role+name directly (the MINOR a11y fix).
    const sw = canvas.getByRole("switch", { name: /unpin mix from block face/i });
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.click(sw);
    // Toggling a pinned param requests UNpin (next = false).
    await expect(args.onChange).toHaveBeenCalledWith(false);
  },
};

// ── Unpinned (off) — the param is hidden from the face ──
export const Unpinned: Story = {
  args: { pinned: false, label: "Decay" },
  play: async ({ canvas, args }) => {
    const group = canvas.getByRole("group", { name: /pin decay to block face/i });
    const sw = within(group).getByRole("switch");
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    // Toggling an unpinned param requests pin (next = true).
    await expect(args.onChange).toHaveBeenCalledWith(true);
  },
};

// ── Interactive — drives the real pinned/unpinned flip ──
function InteractivePin() {
  const [pinned, setPinned] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <span className="text-text-secondary text-[11px] font-mono">Width</span>
      <PinToFaceToggle pinned={pinned} label="Width" onChange={setPinned} />
      <span className="text-text-dim text-[10px]">
        {pinned ? "on face" : "hidden"}
      </span>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <InteractivePin />,
  play: async ({ canvas }) => {
    // Starts hidden; clicking pins it (label flips to "on face").
    await expect(canvas.getByText("hidden")).toBeInTheDocument();
    const sw = canvas.getByRole("switch");
    await userEvent.click(sw);
    await expect(canvas.getByText("on face")).toBeInTheDocument();
    await expect(sw).toHaveAttribute("aria-checked", "true");
  },
};
