import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuToggle } from "./NeuToggle";

const meta = {
  title: "Neu/Toggle",
  component: NeuToggle,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "NeuToggle — a compact neumorphic on/off switch (ARIA `role=\"switch\"`) for binary settings: bypass, mute, snap-to-grid, monitor on/off, and similar toggles in panels and Perform-mode dashboards. The active track lights up in the chosen semantic hue (blue = generator, orange = modifier, teal = logic) while the off state is recessed/inset, so its state reads at a glance.",
      },
    },
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
  parameters: {
    docs: {
      description: {
        story: "Off state — recessed inset track, the resting state of a binary setting.",
      },
    },
  },
};

export const ActiveBlue: Story = {
  args: {
    active: true,
    color: "blue",
    onChange: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "On state with blue generator accent — the lit track signals an engaged setting.",
      },
    },
  },
};

export const ActiveOrange: Story = {
  args: {
    active: true,
    color: "orange",
    onChange: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "On state with orange modifier accent — match the hue to the controlled Block's role.",
      },
    },
  },
};

export const ActiveTeal: Story = {
  args: {
    active: true,
    color: "teal",
    onChange: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "On state with teal logic accent — e.g. a logic/MIDI-related toggle.",
      },
    },
  },
};

export const VariantMatrix: Story = {
  tags: ["!manifest"],
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
  parameters: {
    docs: {
      description: {
        story:
          "Live controlled usage: each switch flips its own boolean state — the real settings/dashboard binding pattern.",
      },
    },
  },
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
