import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuFader } from "./NeuFader";

const meta = {
  title: "Neu/Fader",
  component: NeuFader,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100, step: 1 } },
    orientation: {
      control: { type: "select" },
      options: ["horizontal", "vertical"],
    },
    color: {
      control: { type: "select" },
      options: ["blue", "orange", "teal"],
    },
  },
} satisfies Meta<typeof NeuFader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 50,
    label: "GAIN",
    color: "blue",
    orientation: "horizontal",
  },
};

export const Vertical: Story = {
  args: {
    value: 70,
    label: "LEVEL",
    color: "teal",
    orientation: "vertical",
  },
};

export const Orange: Story = {
  args: {
    value: 30,
    label: "FILTER",
    color: "orange",
    orientation: "horizontal",
  },
};

export const VariantMatrix: Story = {
  args: { value: 50 },
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-8 p-6">
      <div className="flex flex-col gap-3">
        <span className="text-text-secondary text-[10px] uppercase tracking-wide">Horizontal</span>
        <NeuFader value={25} label="GAIN" color="blue" orientation="horizontal" className="w-48" />
        <NeuFader value={50} label="PAN" color="orange" orientation="horizontal" className="w-48" />
        <NeuFader value={75} label="SEND" color="teal" orientation="horizontal" className="w-48" />
      </div>
      <div className="flex items-end gap-6">
        <span className="text-text-secondary text-[10px] uppercase tracking-wide self-start">Vertical</span>
        <NeuFader value={25} label="CH1" color="blue" orientation="vertical" />
        <NeuFader value={50} label="CH2" color="orange" orientation="vertical" />
        <NeuFader value={75} label="CH3" color="teal" orientation="vertical" />
        <NeuFader value={100} label="CH4" color="blue" orientation="vertical" />
      </div>
    </div>
  ),
};

export const Interactive: Story = {
  args: { value: 50 },
  render: () => {
    const [hVal, setHVal] = useState(50);
    const [vVal, setVVal] = useState(60);
    return (
      <div className="flex flex-col items-center gap-8 p-6">
        <div className="flex flex-col gap-2 w-64">
          <NeuFader
            value={hVal}
            label="GAIN"
            color="blue"
            orientation="horizontal"
            onChange={setHVal}
          />
          <span className="text-text-secondary text-[10px] text-center">value: {hVal}</span>
        </div>
        <div className="flex items-center gap-4">
          <NeuFader
            value={vVal}
            label="LEVEL"
            color="teal"
            orientation="vertical"
            onChange={setVVal}
          />
          <span className="text-text-secondary text-[10px]">value: {vVal}</span>
        </div>
      </div>
    );
  },
};
