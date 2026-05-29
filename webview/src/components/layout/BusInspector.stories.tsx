import type { Meta, StoryObj } from "@storybook/react-vite";
import { BusInspector } from "./BusInspector";
import { useGraphStore } from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";
import type { BlockData, CableData } from "../../data/types";

// BusInspector reads edges/nodes from useGraphStore and wireless bus assignments
// from useBusStore. Seed both in each story's decorator.

const meta = {
  title: "Layout/BusInspector",
  component: BusInspector,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof BusInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── shared data ──

function makeBlock(id: string, name: string, category: BlockData["category"]): BlockData {
  return {
    id,
    name,
    category,
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    muted: false,
    muteInput: false,
    error: false,
    isMacroTagged: false,
    isPortal: false,
  };
}

const SYNTH  = makeBlock("synth-1",  "Synth Lead",   "generator");
const REVERB = makeBlock("reverb-1", "Hall Reverb",  "modifier");
const DELAY  = makeBlock("delay-1",  "Tape Delay",   "modifier");
const CHOIR  = makeBlock("choir-1",  "Choir Layer",  "generator");

const makeEdge = (id: string, source: string, target: string, signalType: CableData["signalType"]): CableData => ({
  id,
  source,
  sourcePort: "out-L",
  target,
  targetPort: "in-L",
  signalType,
  channelCount: 2,
  isSidechain: false,
});

function seedStores(
  nodes: BlockData[],
  edges: CableData[],
  cableBus: Record<string, string>,
) {
  useGraphStore.setState({ nodes, edges, selectedNodeId: null, selectedEdgeId: null, commentBoxes: [] });
  useBusStore.setState({ cableBus });
}

// Empty state: no buses — shows the informational tip.
export const Empty: Story = {
  decorators: [
    (Story) => {
      seedStores([], [], {});
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
};

// Single audio bus.
export const SingleBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio")];
      seedStores([SYNTH, REVERB], edges, { "c1": "FX Send A" });
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
};

// Multiple buses: audio + midi, to show different signal-type colours.
export const MultipleBuses: Story = {
  decorators: [
    (Story) => {
      const edges = [
        makeEdge("c1", "synth-1",  "reverb-1", "audio"),
        makeEdge("c2", "choir-1",  "delay-1",  "audio"),
        makeEdge("c3", "synth-1",  "reverb-1", "midi"),
      ];
      seedStores(
        [SYNTH, REVERB, DELAY, CHOIR],
        edges,
        { "c1": "FX Send A", "c2": "Verb Return", "c3": "MIDI Clock" },
      );
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
};

// Bus with unknown block ID — endpoint falls back to "?".
export const OrphanEndpoint: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "ghost-id", "reverb-1", "audio")];
      seedStores([REVERB], edges, { "c1": "Ghost Bus" });
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
};
