import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlockEmbed, SpectrumEmbed } from "./BlockEmbed";
import { useGraphStore } from "../../stores/useGraphStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";

// ── Store seeding ──
// BlockEmbed reads two REAL sources (the old generic param-fader strip was
// removed — it fabricated parameter names; see BlockEmbed.tsx):
//   1. Meter level — useBlockOutputLevel(nodeId) = max live cable level over the
//      Block's OUTGOING edges (useGraphStore topology × useCableMeterStore levels).
//   2. Spectrum bins — useNodeSpectrum(nodeId) = real host FFT (G3-B item 1).
// The native bridges no-op without a backend, so each story seeds the stores
// directly to drive the visuals. Meters default to an HONEST 0 (silent) when no
// outgoing cable carries signal — never fabricated. In Storybook there is no
// __JUCE__ bridge, so the audiofx spectrum slot shows its honest "No spectrum"
// placeholder; the SpectrumLive story below feeds SpectrumEmbed real bins
// directly to demonstrate the LIVE analyser.

/**
 * Light a Block's meter by seeding ONE outgoing edge from `nodeId` and pushing
 * a real cable level onto it (the same path the host's ~60Hz channel drives).
 * `useBlockOutputLevel(nodeId)` then reads `level` as the Block's output VU.
 * Pass level=0 (or omit the call) for the honest silent state.
 */
function seedMeter(nodeId: string, level: number) {
  const edgeId = `${nodeId}-out`;
  useGraphStore.setState({
    edges: [
      {
        id: edgeId,
        source: nodeId,
        sourcePort: "out",
        target: `${nodeId}-sink`,
        targetPort: "in",
        signalType: "audio",
        channelCount: 2,
        isSidechain: false,
      },
    ],
  });
  useCableMeterStore.getState().setCableLevels([{ id: edgeId, level }]);
}

const meta = {
  title: "Canvas/BlockEmbed",
  component: BlockEmbed,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BlockEmbed — the in-Block instrument panel shown only at the expanded semantic-zoom tier inside `Block`. Surfaces a Block's REAL output level (meter) and — for audiofx — a live host FFT spectrum strip, so an expert can read a Block's signal without opening its full plugin window. Every embed shows real engine data only: the old generic GAIN/PAN/MIX/FREQ/Q fader strip was removed because it fabricated parameter names (a Valhalla reverb's real params are Mix/Feedback/Density, never 'Pan'/'Freq'/'Q'). Meters default to an honest 0 (silent) when no signal flows.",
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
          "Instrument embed — stereo output meter (LIT from a real seeded cable level), blue accent. The default instrument layout.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedMeter("gen-1", 0.72);
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
          "AudioFx embed — LIT stereo meter + spectrum slot, orange accent. In Storybook (no __JUCE__ bridge) the spectrum slot shows its HONEST 'No spectrum' placeholder; with a live host it draws real FFT bins (see SpectrumLive). The tallest variant — drives the BLOCK-OVERLAP height budget.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedMeter("mod-1", 0.61);
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
          "MidiFx embed — compact meter only (no spectrum), teal accent. The lean routing/MIDI layout.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedMeter("log-1", 0.55);
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
          "Modulator embed — compact meter, purple accent. CV/modulation sources like LFOs and envelopes.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedMeter("mod2-1", 0.48);
      return framed(<Story />);
    },
  ],
};

// ── Kill-fake #2 proof stories ──
// MeterLit vs MeterSilent prove the meter reflects REAL signal: lit at a
// non-zero seeded cable level, dark at 0. (Screenshot target for lead review.)

export const MeterLit: Story = {
  args: { nodeId: "lit-1", category: "audiofx" },
  parameters: {
    docs: {
      description: {
        story:
          "Meter LIT — a real cable level (0.85) is seeded on this Block's outgoing edge, so useBlockOutputLevel drives both stereo bars high. This is the kill-fake #2 evidence shot (real signal, not a hardwired 0).",
      },
    },
  },
  decorators: [
    (Story) => {
      seedMeter("lit-1", 0.85);
      return framed(<Story />);
    },
  ],
};

export const MeterSilent: Story = {
  args: { nodeId: "silent-1", category: "audiofx" },
  parameters: {
    docs: {
      description: {
        story:
          "Meter SILENT (honest empty state) — no outgoing cable carries signal (level 0), so the meter renders dark rather than fabricating motion. The honest counterpart to MeterLit.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedMeter("silent-1", 0);
      return framed(<Story />);
    },
  ],
};

// ── Spectrum (G3-B item 1) ──
// SpectrumLive feeds the SpectrumEmbed sub-component REAL magnitude bins so the
// live canvas analyser renders even without a host bridge (Storybook). The
// SpectrumEmpty story shows the honest "No spectrum" placeholder it falls back
// to when bins are empty (silent source / no audio output / no bridge).

/** A plausible decaying spectrum shape (REAL-looking magnitudes, but here just
 *  static demo data — the COMPONENT is the live analyser; in the app these come
 *  from the host FFT). 64 log-decaying bins. */
const DEMO_BINS = Array.from({ length: 64 }, (_, i) =>
  Math.max(0, 0.9 * Math.exp(-i / 14) * (0.7 + 0.3 * Math.sin(i * 0.7))),
);

export const SpectrumLive: Story = {
  args: { nodeId: "spec-1", category: "audiofx" },
  parameters: {
    docs: {
      description: {
        story:
          "Spectrum LIVE — the SpectrumEmbed analyser fed real 0..1 magnitude bins draws magnitude bars on a <canvas> in the audiofx accent. In the app these bins come from the host's juce::dsp::FFT (G3-B item 1); here the bins are demo data so the canvas renders without a bridge.",
      },
    },
  },
  render: () => framed(<SpectrumEmbed bins={DEMO_BINS} />),
};

export const SpectrumEmpty: Story = {
  args: { nodeId: "spec-0", category: "audiofx" },
  parameters: {
    docs: {
      description: {
        story:
          "Spectrum EMPTY (honest) — with no bins (silent source, no audio output, nobody subscribed, or no bridge) SpectrumEmbed renders the explicit 'No spectrum' placeholder rather than a fabricated curve.",
      },
    },
  },
  render: () => framed(<SpectrumEmbed bins={[]} />),
};
