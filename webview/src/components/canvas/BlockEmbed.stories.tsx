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
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BlockEmbed — the rich in-Block instrument panel shown only at the expanded semantic-zoom tier inside `Block`. Surfaces a Block's live parameters (mini fader strip), output level (meter), and — for modifiers — a spectrum/EQ curve, so an expert can read a Block's state without opening its full plugin window. Fader fills are seeded from `useParameterStore` per story; meters default to an honest 0 until the per-block VU bridge lands.",
      },
    },
  },
} satisfies Meta<typeof BlockEmbed>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (children: React.ReactNode) => (
  <div className="bg-surface rounded-md p-2" style={{ width: 220 }}>
    {children}
  </div>
);

export const Instrument: Story = {
  args: { nodeId: "gen-1", category: "instrument" },
  parameters: {
    docs: {
      description: {
        story:
          "Instrument embed — 3-fader param strip + stereo meter, blue accent. The default instrument layout.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedParams("gen-1", [0.6, 0.3, 0.85]);
      return framed(<Story />);
    },
  ],
};

export const AudioFx: Story = {
  args: { nodeId: "mod-1", category: "audiofx" },
  parameters: {
    docs: {
      description: {
        story:
          "AudioFx embed — the tallest variant: 5 faders + meter + spectrum/EQ curve, orange accent. Drives the BLOCK-OVERLAP height budget.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedParams("mod-1", [0.5, 0.7, 0.2, 0.9, 0.45]);
      return framed(<Story />);
    },
  ],
};

export const MidiFx: Story = {
  args: { nodeId: "log-1", category: "midifx" },
  parameters: {
    docs: {
      description: {
        story:
          "MidiFx embed — param strip + compact meter only (no spectrum), teal accent. The lean routing/MIDI layout.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedParams("log-1", [0.4, 0.6, 0.8]);
      return framed(<Story />);
    },
  ],
};

export const Modulator: Story = {
  args: { nodeId: "mod2-1", category: "modulator" },
  parameters: {
    docs: {
      description: {
        story:
          "Modulator embed — param strip + compact meter, purple accent. CV/modulation sources like LFOs and envelopes.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedParams("mod2-1", [0.3, 0.7, 0.5]);
      return framed(<Story />);
    },
  ],
};
