import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node, Edge } from "@xyflow/react";
import { MiniFlow } from "../../../.storybook/decorators";
import { Cable } from "./Cable";
import type { CableData, SignalType } from "../../data/types";
import { useBusStore } from "../../stores/useBusStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";

// ── Helpers ──
//
// Cable is a React Flow *edge*. We mount it on a tiny canvas with two plain
// (default-type) nodes so the edge binds to default handles without needing
// a custom node + matching port-handle ids. Signal colour is driven by
// `data.signalType`, width by `data.channelCount`. Wireless state is read
// from useBusStore (NOT data.busName); meter glow/pulse from useCableMeterStore.

const nodes: Node[] = [
  { id: "src", position: { x: 0, y: 40 }, data: { label: "Out" } },
  { id: "dst", position: { x: 240, y: 40 }, data: { label: "In" } },
];

function makeCable(over: Partial<CableData> = {}): CableData {
  return {
    id: "cab-1",
    source: "src",
    sourcePort: "out",
    target: "dst",
    targetPort: "in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
    ...over,
  };
}

function edge(data: CableData): Edge {
  return { id: data.id, source: "src", target: "dst", type: "cable", data };
}

const edgeTypes = { cable: Cable };

function resetStores() {
  useBusStore.setState({ cableBus: {} });
  useCableMeterStore.setState({ levels: {} });
}

// Render-only edge stories drive everything through MiniFlow, so the story
// type is left loose (`StoryObj`) rather than bound to EdgeProps — binding it
// would force a full `args: EdgeProps` on every render-only story.
const meta: Meta<typeof Cable> = {
  title: "Canvas/Cable",
  component: Cable,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Cable — the React Flow edge that draws a signal path between two Block ports. Registered as the `cable` edge type and rendered for every entry in `useGraphStore.edges`. Stroke colour encodes signal type (audio = blue, MIDI = teal, value/CV = orange), width encodes channel count (1/2/6), a dashed stroke marks a sidechain, and brightness + signal-pulse track the live engine RMS level (`useCableMeterStore`). A Cable assigned to a named bus (`useBusStore`) becomes wireless: the curve is hidden and the connection shows as per-port badges instead. Mounted on a MiniFlow canvas with two plain nodes here so the edge binds to default handles.",
      },
    },
  },
  // Cable is a React Flow edge — autodocs can't introspect EdgeProps usefully.
  tags: ["!autodocs"],
};

export default meta;
type Story = StoryObj;

function signalStory(signalType: SignalType, doc: string): Story {
  return {
    render: () => (
      <MiniFlow nodes={nodes} edges={[edge(makeCable({ signalType }))]} edgeTypes={edgeTypes} height={220} />
    ),
    parameters: { docs: { description: { story: doc } } },
    decorators: [
      (Story) => {
        resetStores();
        return <Story />;
      },
    ],
  };
}

// Signal types — audio (blue), midi (teal), value/CV (orange).
export const Audio: Story = signalStory(
  "audio",
  "Audio Cable — blue stroke. The default signal type; verifies audio routing reads as blue.",
);
export const Midi: Story = signalStory(
  "midi",
  "MIDI Cable — teal stroke. Distinguishes note/CC routing from audio at a glance.",
);
export const Value: Story = signalStory(
  "value",
  "Value/CV Cable — orange stroke. The third signal type, carrying control data independent of MIDI.",
);

// 6-channel surround cable renders at max stroke width.
export const SurroundSixChannel: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "6-channel surround Cable — max stroke width encodes channel count, so wide buses read as heavier than mono/stereo.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={nodes}
      edges={[edge(makeCable({ signalType: "audio", channelCount: 6 }))]}
      edgeTypes={edgeTypes}
      height={220}
    />
  ),
  decorators: [
    (Story) => {
      resetStores();
      return <Story />;
    },
  ],
};

// Sidechain cable uses a dashed stroke.
export const Sidechain: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Sidechain Cable — dashed stroke marks a sidechain/key input so it's not mistaken for the main signal path.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={nodes}
      edges={[edge(makeCable({ signalType: "audio", isSidechain: true }))]}
      edgeTypes={edgeTypes}
      height={220}
    />
  ),
  decorators: [
    (Story) => {
      resetStores();
      return <Story />;
    },
  ],
};

// Active cable — engine RMS level drives glow + signal pulse animation.
export const ActiveWithSignal: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Active Cable — a high engine RMS level (0.8) drives the glow + animated signal pulse, the visual feedback that signal is flowing.",
      },
    },
  },
  render: () => (
    <MiniFlow nodes={nodes} edges={[edge(makeCable())]} edgeTypes={edgeTypes} height={220} />
  ),
  decorators: [
    (Story) => {
      resetStores();
      useCableMeterStore.setState({ levels: { "cab-1": 0.8 } });
      return <Story />;
    },
  ],
};

// Wireless cable on a named bus. The badge lives in Block.tsx; the cable
// itself draws only a faint dotted ghost, and only when selected — so the
// edge is rendered selected here to make the wireless state visible.
export const WirelessBusBadge: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Wireless Cable on a named bus — the curve is suppressed (faint dotted ghost only while selected); the connection is shown via per-port badges in Block. Demonstrates the de-cluttering wireless-patching state.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={nodes}
      edges={[{ ...edge(makeCable({ busName: "Reverb Send A" })), selected: true }]}
      edgeTypes={edgeTypes}
      height={220}
    />
  ),
  decorators: [
    (Story) => {
      resetStores();
      useBusStore.setState({ cableBus: { "cab-1": "Reverb Send A" } });
      return <Story />;
    },
  ],
};
