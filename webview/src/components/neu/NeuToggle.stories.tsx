import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuToggle } from "./NeuToggle";

const meta = {
  title: "Neu/Toggle",
  component: NeuToggle,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    color: {
      control: { type: "select" },
      options: ["blue", "orange", "teal"],
    },
  },
} satisfies Meta<typeof NeuToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    active: false,
    color: "blue",
    onChange: () => {},
  },
};

export const ActiveBlue: Story = {
  args: {
    active: true,
    color: "blue",
    onChange: () => {},
  },
};

export const ActiveOrange: Story = {
  args: {
    active: true,
    color: "orange",
    onChange: () => {},
  },
};

export const ActiveTeal: Story = {
  args: {
    active: true,
    color: "teal",
    onChange: () => {},
  },
};

export const VariantMatrix: Story = {
  args: { active: false, onChange: () => {} },
  render: () => (
    <div className="flex flex-col gap-4 p-6">
      {(["blue", "orange", "teal"] as const).map((color) => (
        <div key={color} className="flex items-center gap-6">
          <span className="text-text-secondary text-[10px] w-14 uppercase">{color}</span>
          <div className="flex items-center gap-4">
            <NeuToggle active={false} color={color} onChange={() => {}} />
            <span className="text-text-secondary text-[10px]">off</span>
          </div>
          <div className="flex items-center gap-4">
            <NeuToggle active={true} color={color} onChange={() => {}} />
            <span className="text-text-secondary text-[10px]">on</span>
          </div>
        </div>
      ))}
    </div>
  ),
};

export const Interactive: Story = {
  args: { active: false, onChange: () => {} },
  render: () => {
    const [blue, setBlue] = useState(false);
    const [orange, setOrange] = useState(true);
    const [teal, setTeal] = useState(false);
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <NeuToggle active={blue} color="blue" onChange={setBlue} />
          <span className="text-text-secondary text-[10px]">Blue — {blue ? "on" : "off"}</span>
        </div>
        <div className="flex items-center gap-3">
          <NeuToggle active={orange} color="orange" onChange={setOrange} />
          <span className="text-text-secondary text-[10px]">Orange — {orange ? "on" : "off"}</span>
        </div>
        <div className="flex items-center gap-3">
          <NeuToggle active={teal} color="teal" onChange={setTeal} />
          <span className="text-text-secondary text-[10px]">Teal — {teal ? "on" : "off"}</span>
        </div>
      </div>
    );
  },
};
