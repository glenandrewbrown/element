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
  parameters: { layout: "fullscreen" },
  // Cable is a React Flow edge — autodocs can't introspect EdgeProps usefully.
  tags: ["!autodocs"],
};

export default meta;
type Story = StoryObj;

function signalStory(signalType: SignalType): Story {
  return {
    render: () => (
      <MiniFlow nodes={nodes} edges={[edge(makeCable({ signalType }))]} edgeTypes={edgeTypes} height={220} />
    ),
    decorators: [
      (Story) => {
        resetStores();
        return <Story />;
      },
    ],
  };
}

// Signal types — audio (blue), midi (teal), value/CV (orange).
export const Audio: Story = signalStory("audio");
export const Midi: Story = signalStory("midi");
export const Value: Story = signalStory("value");

// 6-channel surround cable renders at max stroke width.
export const SurroundSixChannel: Story = {
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
