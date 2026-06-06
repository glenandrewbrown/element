import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuSlider } from "./NeuSlider";

const meta = {
  title: "Neu/Slider",
  component: NeuSlider,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "NeuSlider — the compact neumorphic parameter slider (G3). A pressed/inset groove with an accent fill and a raised extruded thumb, replacing flat native `<input type=\"range\">` styling in parameter lists. Value-display-agnostic: it renders no label/readout of its own so callers compose it into compact `[label | slider | value]` rows. Full keyboard support (arrows ±step, PageUp/Down ±10%, Home/End) and a micro-glow focus ring — never a flat colored border.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    color: {
      control: { type: "select" },
      options: ["blue", "orange", "teal", "purple"],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NeuSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 0.6,
    ariaLabel: "Gain",
    color: "blue",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Baseline continuous slider — the inset groove + raised thumb used for every parameter row in the Block inspector.",
      },
    },
  },
};

export const Interactive: Story = {
  args: { value: 0.4, ariaLabel: "Cutoff" },
  render: (args) => {
    const [v, setV] = useState(args.value);
    return (
      <div className="space-y-2">
        <NeuSlider {...args} value={v} onChange={setV} />
        <div className="text-[10px] text-text-secondary tabular-nums">
          value: {v.toFixed(3)}
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "Live drag + keyboard. Click the track, drag, or focus and use arrow keys / Home / End.",
      },
    },
  },
};

export const Stepped: Story = {
  args: {
    value: 0.5,
    step: 0.25,
    ariaLabel: "Mode",
    color: "purple",
  },
  render: (args) => {
    const [v, setV] = useState(args.value);
    return <NeuSlider {...args} value={v} onChange={setV} />;
  },
  parameters: {
    docs: {
      description: {
        story:
          "Stepped parameter (5 positions → step 0.25) — drag and keyboard snap to the step grid.",
      },
    },
  },
};

export const ReadOnly: Story = {
  args: {
    value: 0.3,
    ariaLabel: "Read-only level",
    color: "teal",
  },
  parameters: {
    docs: {
      description: {
        story:
          "No `onChange` → read-only: not focusable, `aria-disabled`, no drag cursor.",
      },
    },
  },
};
