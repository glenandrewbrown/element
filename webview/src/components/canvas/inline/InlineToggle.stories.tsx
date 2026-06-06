import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { InlineToggle } from "./InlineToggle";

function Demo({ initial = 0, label = "SYNC" }: { initial?: number; label?: string }) {
  const [v, setV] = useState(initial);
  return (
    <div style={{ padding: 24, background: "#252529" }}>
      <InlineToggle value={v} label={label} onChange={setV} />
    </div>
  );
}

const meta = {
  title: "Canvas/Inline/InlineToggle",
  component: InlineToggle,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "T5 — a 16px square RECESSED on/off control for a boolean host parameter (NOT an iOS pill). Off = pressed-in well; on = the well lights with the accent hue. Bound to a real boolean param (≥0.5 = on).",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof InlineToggle>;

export default meta;
type Story = StoryObj<typeof InlineToggle>;

export const Off: Story = {
  render: () => <Demo initial={0} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const sw = body.getByTestId("inline-toggle");
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    await expect(sw).toHaveAttribute("aria-checked", "true");
  },
};

export const On: Story = {
  render: () => <Demo initial={1} />,
};
