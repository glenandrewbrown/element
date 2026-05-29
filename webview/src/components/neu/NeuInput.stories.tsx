import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuInput } from "./NeuInput";

const meta = {
  title: "Neu/Input",
  component: NeuInput,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof NeuInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Search blocks…",
  },
};

export const WithValue: Story = {
  args: {
    value: "Reverb",
    placeholder: "Name",
    onChange: () => {},
  },
};

export const Placeholder: Story = {
  args: {
    placeholder: "Enter project name",
  },
};

export const VariantMatrix: Story = {
  args: {},
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-4 p-6 w-64">
      <NeuInput placeholder="Empty / placeholder" />
      <NeuInput value="With a value" onChange={() => {}} />
      <NeuInput value="Long text truncates inside a narrow container gracefully" onChange={() => {}} />
      <NeuInput placeholder="Disabled (read-only prop)" value="read only" />
    </div>
  ),
};

export const Interactive: Story = {
  args: {},
  render: () => {
    const [val, setVal] = useState("");
    return (
      <div className="flex flex-col gap-3 p-6 w-64">
        <NeuInput
          value={val}
          placeholder="Type something…"
          onChange={setVal}
        />
        <span className="text-text-secondary text-[10px]">
          value: &ldquo;{val}&rdquo; ({val.length} chars)
        </span>
      </div>
    );
  },
};
