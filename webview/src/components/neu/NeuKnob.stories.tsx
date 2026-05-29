import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuKnob } from "./NeuKnob";

const meta = {
  title: "Neu/Knob",
  component: NeuKnob,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "NeuKnob — the canonical neumorphic rotary control for a single continuous (0–100) parameter, used for mapped Block parameters in the Inspector and Perform-mode dashboards. Drag vertically to adjust (hold Shift for fine control); the value drives a 270° arc ring and the indicator line. `color` matches the source Block's signal role (blue = generator, orange = modifier, teal = logic); `sourceLabel` names the controlled Block.",
      },
    },
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
  parameters: {
    docs: {
      description: {
        story:
          "Baseline knob — blue generator accent, the default for a mapped instrument parameter at mid-travel.",
      },
    },
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
  parameters: {
    docs: {
      description: {
        story:
          "Teal logic accent with a `sourceLabel` — shows the dashboard pattern where the knob names which Block it controls.",
      },
    },
  },
};

export const Orange: Story = {
  args: {
    value: 25,
    label: "FILTER",
    color: "orange",
    size: "md",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Orange modifier accent — use for effect/modifier parameters so the knob's signal role reads at a glance.",
      },
    },
  },
};

export const SizeMatrix: Story = {
  tags: ["!manifest"],
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
  parameters: {
    docs: {
      description: {
        story:
          "Live controlled usage: drag vertically (Shift = fine) to drive state — the real Inspector/dashboard binding pattern.",
      },
    },
  },
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
