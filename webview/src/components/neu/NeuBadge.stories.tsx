import type { Meta, StoryObj } from "@storybook/react-vite";
import { NeuBadge } from "./NeuBadge";

const meta = {
  title: "Neu/Badge",
  component: NeuBadge,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    color: {
      control: { type: "select" },
      options: ["blue", "orange", "teal", "purple", "grey"],
    },
  },
} satisfies Meta<typeof NeuBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    text: "VST3",
    color: "blue",
  },
};

export const Orange: Story = {
  args: {
    text: "AU",
    color: "orange",
  },
};

export const Teal: Story = {
  args: {
    text: "CLAP",
    color: "teal",
  },
};

export const Purple: Story = {
  args: {
    text: "AU",
    color: "purple",
  },
};

export const Grey: Story = {
  args: {
    text: "LV2",
    color: "grey",
  },
};

export const ColorMatrix: Story = {
  args: { text: "x" },
  render: () => (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <NeuBadge text="blue" color="blue" />
        <NeuBadge text="orange" color="orange" />
        <NeuBadge text="teal" color="teal" />
        <NeuBadge text="purple" color="purple" />
        <NeuBadge text="grey" color="grey" />
      </div>
      <div className="border-t border-white/10 pt-4">
        <span className="text-text-secondary text-[10px] block mb-2 uppercase tracking-wide">Plugin format badges</span>
        <div className="flex flex-wrap items-center gap-2">
          <NeuBadge text="VST3" color="blue" />
          <NeuBadge text="AU" color="purple" />
          <NeuBadge text="CLAP" color="teal" />
          <NeuBadge text="LV2" color="grey" />
          <NeuBadge text="VST2" color="orange" />
        </div>
      </div>
      <div className="border-t border-white/10 pt-4">
        <span className="text-text-secondary text-[10px] block mb-2 uppercase tracking-wide">Signal type badges</span>
        <div className="flex flex-wrap items-center gap-2">
          <NeuBadge text="Audio" color="blue" />
          <NeuBadge text="MIDI" color="teal" />
          <NeuBadge text="CV" color="orange" />
        </div>
      </div>
    </div>
  ),
};
