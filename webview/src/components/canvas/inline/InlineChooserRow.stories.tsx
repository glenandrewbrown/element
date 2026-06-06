import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { InlineChooserRow } from "./InlineChooserRow";

const COMPARE = [
  { value: 0, label: ">" },
  { value: 1, label: ">=" },
  { value: 2, label: "<" },
  { value: 3, label: "<=" },
  { value: 4, label: "==" },
  { value: 5, label: "!=" },
];

const LOGIC = [
  { value: 0, label: "AND" },
  { value: 1, label: "OR" },
  { value: 2, label: "XOR" },
  { value: 3, label: "NAND" },
  { value: 4, label: "NOR" },
  { value: 5, label: "NOT" },
];

function Demo({
  options,
  initial,
  title,
}: {
  options: { value: number; label: string }[];
  initial: number;
  title: string;
}) {
  const [v, setV] = useState(initial);
  return (
    <div style={{ width: 180, padding: 24, background: "#222226" }}>
      <InlineChooserRow title={title} options={options} value={v} onSelect={setV} />
    </div>
  );
}

const meta = {
  title: "Canvas/Inline/InlineChooserRow",
  component: InlineChooserRow,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "T5 — the operator/mode chooser used on built-in `element.compare` / `element.logic` Block faces. ‹ › steppers + a click-the-label popover. Writes the chosen integer mode (caller wires `nativeNodeSetIntMode`) and renders engine truth.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof InlineChooserRow>;

export default meta;
type Story = StoryObj<typeof InlineChooserRow>;

export const CompareOps: Story = {
  render: () => <Demo options={COMPARE} initial={0} title="Operator" />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText(">")).toBeInTheDocument();
    await userEvent.click(body.getByLabelText("Next"));
    await expect(body.getByText(">=")).toBeInTheDocument();
  },
};

export const LogicModes: Story = {
  render: () => <Demo options={LOGIC} initial={2} title="Mode" />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("XOR")).toBeInTheDocument();
  },
};

export const PopoverSelect: Story = {
  render: () => <Demo options={LOGIC} initial={0} title="Mode" />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("button", { name: /Mode/ }));
    await userEvent.click(body.getByRole("option", { name: "NOR" }));
    await expect(body.getByText("NOR")).toBeInTheDocument();
  },
};
