import type { Meta, StoryObj } from "@storybook/react-vite";
import { MacroDashboard } from "./MacroDashboard";
import { usePerformStore } from "../../stores/usePerformStore";
import type { MacroControl } from "../../data/types";

// ── Store seeding ──
// MacroDashboard reads usePerformStore for macros (selectMacros), liveHealth
// (selectLiveHealth — for the VU meters, BPM and timecode) and mapMode
// (selectMapMode — drives the Map Mode toggle in the tab bar). The default tab
// is "macros"; the "fx" tab reads useGraphStore.nodes but is not visible at
// static mount, so graph nodes do not need seeding.
//
// `liveHealth` must be seeded COMPLETE: setState shallow-merges and the
// component calls health.bpm.toFixed(2), so a partial object would crash.

function seedHealth(outputPeak: number): void {
  usePerformStore.setState({
    liveHealth: {
      cpu: 22,
      buffer: 256,
      latency: 5,
      clock: "Internal",
      bpm: 124,
      timecode: "00:02:11:04",
      sampleRateLabel: "48.0 kHz",
      alerts: [],
      ioActivity: "nominal",
      outputPeak,
    },
  });
}

function seed(macros: MacroControl[], mapMode: boolean, outputPeak = 0.62): void {
  usePerformStore.setState({ macros, mapModeActive: mapMode });
  seedHealth(outputPeak);
}

const demoMacros: MacroControl[] = [
  {
    id: "m-cutoff",
    name: "Filter Cutoff",
    sourceBlock: "Filter Core",
    sourceParam: "cutoff",
    value: 72,
    type: "knob",
    signalType: "audio",
  },
  {
    id: "m-qpeak",
    name: "Q-PEAK",
    sourceBlock: "Pro-Q 3",
    sourceParam: "q",
    value: 48,
    type: "knob",
    signalType: "audio",
  },
  {
    id: "m-lfo-rate",
    name: "LFO Rate",
    sourceBlock: "LFO Tool",
    sourceParam: "rate",
    value: 33,
    type: "knob",
    signalType: "value",
  },
  {
    id: "m-eq-gain",
    name: "EQ Gain",
    sourceBlock: "Pro-Q 3",
    sourceParam: "outputGain",
    value: 65,
    type: "fader",
    signalType: "audio",
  },
  {
    id: "m-mod-depth",
    name: "Mod Depth",
    sourceBlock: "LFO Tool",
    sourceParam: "depth",
    value: 41,
    type: "fader",
    signalType: "value",
  },
];

const meta = {
  title: "Layout/MacroDashboard",
  component: MacroDashboard,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MacroDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (
  <div style={{ height: 360 }} className="bg-canvas">
    <MacroDashboard />
  </div>
);

export const Populated: Story = {
  decorators: [
    (Story) => {
      seed(demoMacros, false);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const MapModeActive: Story = {
  decorators: [
    (Story) => {
      seed(demoMacros, true, 0.85);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const KnobsOnly: Story = {
  decorators: [
    (Story) => {
      seed(
        demoMacros.filter((m) => m.type === "knob"),
        false,
        0.3,
      );
      return <Story />;
    },
  ],
  render: () => framed,
};

export const Empty: Story = {
  decorators: [
    (Story) => {
      seed([], false, 0);
      return <Story />;
    },
  ],
  render: () => framed,
};
