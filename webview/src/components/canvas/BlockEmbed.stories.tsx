import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlockEmbed } from "./BlockEmbed";
import { useParameterStore } from "../../stores/useParameterStore";

// ── Store seeding ──
// BlockEmbed reads live parameter values from useParameterStore keyed by
// `${nodeId}:${index}`. The native delta channel no-ops without a backend,
// so we seed the store directly to drive the mini fader fills. Meters/spectrum
// are static placeholders (meters default to an honest 0 until the per-block
// VU bridge lands).

function seedParams(nodeId: string, values: number[]) {
  const next: Record<string, number> = {};
  values.forEach((v, i) => {
    next[`${nodeId}:${i}`] = v;
  });
  useParameterStore.setState({ values: next });
}

const meta = {
  title: "Canvas/BlockEmbed",
  component: BlockEmbed,
  parameters: { layout: "centered" },
} satisfies Meta<typeof BlockEmbed>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (children: React.ReactNode) => (
  <div className="bg-surface rounded-md p-2" style={{ width: 220 }}>
    {children}
  </div>
);

export const Generator: Story = {
  args: { nodeId: "gen-1", category: "generator" },
  decorators: [
    (Story) => {
      seedParams("gen-1", [0.6, 0.3, 0.85]);
      return framed(<Story />);
    },
  ],
};

export const Modifier: Story = {
  args: { nodeId: "mod-1", category: "modifier" },
  decorators: [
    (Story) => {
      seedParams("mod-1", [0.5, 0.7, 0.2, 0.9, 0.45]);
      return framed(<Story />);
    },
  ],
};

export const Logic: Story = {
  args: { nodeId: "log-1", category: "logic" },
  decorators: [
    (Story) => {
      seedParams("log-1", [0.4, 0.6, 0.8]);
      return framed(<Story />);
    },
  ],
};
