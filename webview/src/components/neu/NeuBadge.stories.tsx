import type { Meta, StoryObj } from "@storybook/react-vite";
import { NeuBadge } from "./NeuBadge";

const meta = {
  title: "Neu/Badge",
  component: NeuBadge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "NeuBadge — a small neumorphic pill for terse, colour-coded metadata: plugin-format tags (VST3, AU, CLAP, LV2) and signal-type labels (Audio, MIDI, CV). Colour maps to Element's semantic palette (blue = generator, orange = modifier, teal = logic) plus purple/grey for plugin formats. Use it inline on Block headers and browser rows to convey role at a glance; it is non-interactive.",
      },
    },
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
  parameters: {
    docs: {
      description: {
        story: "Baseline format tag — the common VST3 plugin-format badge.",
      },
    },
  },
};

export const Orange: Story = {
  args: {
    text: "AU",
    color: "orange",
  },
  parameters: {
    docs: {
      description: {
        story: "Orange modifier accent applied to a format tag — the hue reserved for modifier/CV roles.",
      },
    },
  },
};

export const Teal: Story = {
  args: {
    text: "CLAP",
    color: "teal",
  },
  parameters: {
    docs: {
      description: {
        story: "Teal logic accent — used for CLAP format and MIDI signal labels.",
      },
    },
  },
};

export const Purple: Story = {
  args: {
    text: "AU",
    color: "purple",
  },
  parameters: {
    docs: {
      description: {
        story: "Purple — the dedicated tone for the AudioUnit (AU) plugin format.",
      },
    },
  },
};

export const Grey: Story = {
  args: {
    text: "LV2",
    color: "grey",
  },
  parameters: {
    docs: {
      description: {
        story: "Neutral grey — for low-emphasis format tags such as LV2.",
      },
    },
  },
};

export const ColorMatrix: Story = {
  tags: ["!manifest"],
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
