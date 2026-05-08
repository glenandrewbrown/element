import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuKnob } from "./NeuKnob";

const meta = {
  title: "Neu/Knob",
  component: NeuKnob,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100, step: 1 } },
    color: {
      control: { type: "select" },
      options: ["blue", "orange", "teal"],
    },
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
  },
} satisfies Meta<typeof NeuKnob>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 50,
    label: "GAIN",
    color: "blue",
    size: "md",
  },
};

export const Teal: Story = {
  args: {
    value: 75,
    label: "DRY/WET",
    color: "teal",
    size: "md",
    sourceLabel: "Reverb 1",
  },
};

export const Orange: Story = {
  args: {
    value: 25,
    label: "FILTER",
    color: "orange",
    size: "md",
  },
};

export const SizeMatrix: Story = {
  args: { value: 50, label: "VAL" },
  render: () => (
    <div className="flex items-end gap-6 p-6">
      <NeuKnob value={25} label="SMALL" size="sm" color="blue" />
      <NeuKnob value={50} label="MEDIUM" size="md" color="teal" />
      <NeuKnob value={75} label="LARGE" size="lg" color="orange" />
    </div>
  ),
};

export const Interactive: Story = {
  args: { value: 50, label: "DRAG ME" },
  render: () => {
    const [v, setV] = useState(50);
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <NeuKnob
          value={v}
          label="DRAG ME"
          color="teal"
          size="lg"
          onChange={setV}
        />
        <span className="text-text-secondary text-xs">value: {v}</span>
      </div>
    );
  },
};
