import type { Meta, StoryObj } from "@storybook/react-vite";
import { NeuDisplay } from "./NeuDisplay";

const meta = {
  title: "Neu/Display",
  component: NeuDisplay,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof NeuDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: "w-24 h-8",
    children: (
      <span className="flex items-center justify-center h-full text-[11px] text-text-primary font-bold tabular-nums">
        440.0 Hz
      </span>
    ),
  },
};

export const EmptyDisplay: Story = {
  args: {
    className: "w-24 h-8",
  },
};

export const NumericReadout: Story = {
  args: {
    className: "w-32 h-8",
    children: (
      <span className="flex items-center justify-center h-full text-[11px] text-generator font-bold tabular-nums">
        -6.0 dB
      </span>
    ),
  },
};

export const VariantMatrix: Story = {
  args: {},
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-4">
        {/* Frequency readout */}
        <NeuDisplay className="w-28 h-8">
          <span className="flex items-center justify-center h-full text-[11px] text-generator font-bold tabular-nums">
            440.0 Hz
          </span>
        </NeuDisplay>

        {/* dB readout */}
        <NeuDisplay className="w-24 h-8">
          <span className="flex items-center justify-center h-full text-[11px] text-modifier font-bold tabular-nums">
            -6.0 dB
          </span>
        </NeuDisplay>

        {/* BPM readout */}
        <NeuDisplay className="w-20 h-8">
          <span className="flex items-center justify-center h-full text-[11px] text-logic font-bold tabular-nums">
            120 BPM
          </span>
        </NeuDisplay>

        {/* Empty */}
        <NeuDisplay className="w-20 h-8" />
      </div>

      {/* Wider meter-style display */}
      <NeuDisplay className="w-64 h-4">
        <div
          className="absolute left-0 top-0 h-full rounded"
          style={{ width: "68%", background: "linear-gradient(90deg, #4A90D9 0%, #2BC4C4 100%)" }}
        />
      </NeuDisplay>

      {/* Multi-line parameter display */}
      <NeuDisplay className="w-48 h-12 p-2">
        <div className="flex flex-col justify-center h-full gap-0.5">
          <span className="text-[9px] text-text-secondary uppercase tracking-wide">Reverb 1</span>
          <span className="text-[11px] text-text-primary font-bold tabular-nums">2.4 s · Hall</span>
        </div>
      </NeuDisplay>
    </div>
  ),
};
