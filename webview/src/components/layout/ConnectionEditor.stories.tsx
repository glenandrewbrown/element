import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionEditor } from "./ConnectionEditor";
import { useGraphStore } from "../../stores/useGraphStore";
import type { BlockData, CableData } from "../../data/types";

// ConnectionEditor reads nodes + edges from useGraphStore and falls back to the
// native API (which no-ops without JUCE). Seed via decorator.

const meta = {
  title: "Layout/ConnectionEditor",
  component: ConnectionEditor,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "List-driven Cable editor for the current Board. Use it for precise routing without drawing on the canvas: search and signal-type filter chips (Audio/MIDI/Value) narrow the Cable list, each row can be removed, and the Add Cable form wires a specific source-port → target-port pair. Stays live-synced to the graph store.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ConnectionEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Shared test data ──

function makeBlock(
  id: string,
  name: string,
  category: BlockData["category"],
): BlockData {
  return {
    id,
    name,
    category,
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [
      { id: "out-L", type: "audio", direction: "output", label: "Out L", connected: true },
      { id: "out-R", type: "audio", direction: "output", label: "Out R", connected: true },
      { id: "in-L",  type: "audio", direction: "input",  label: "In L",  connected: true },
      { id: "in-R",  type: "audio", direction: "input",  label: "In R",  connected: true },
      { id: "midi-out", type: "midi", direction: "output", label: "MIDI Out", connected: false },
      { id: "midi-in",  type: "midi", direction: "input",  label: "MIDI In",  connected: false },
    ],
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

const SYNTH   = makeBlock("synth-1",   "Synth Lead",   "generator");
const REVERB  = makeBlock("reverb-1",  "Hall Reverb",  "modifier");
const DELAY   = makeBlock("delay-1",   "Tape Delay",   "modifier");
const ROUTER  = makeBlock("router-1",  "MIDI Router",  "logic");

const CABLES: CableData[] = [
  { id: "c1", source: "synth-1",  sourcePort: "out-L",    target: "reverb-1", targetPort: "in-L",    signalType: "audio", channelCount: 2, isSidechain: false },
  { id: "c2", source: "synth-1",  sourcePort: "out-R",    target: "reverb-1", targetPort: "in-R",    signalType: "audio", channelCount: 2, isSidechain: false },
  { id: "c3", source: "reverb-1", sourcePort: "out-L",    target: "delay-1",  targetPort: "in-L",    signalType: "audio", channelCount: 1, isSidechain: false },
  { id: "c4", source: "synth-1",  sourcePort: "midi-out", target: "router-1", targetPort: "midi-in", signalType: "midi",  channelCount: 1, isSidechain: false },
];

function seedGraph(nodes: BlockData[], edges: CableData[]) {
  useGraphStore.setState({
    nodes,
    edges,
    selectedNodeId: null,
    selectedEdgeId: null,
    commentBoxes: [],
  });
}

// Primary: populated board with audio + MIDI cables.
export const Populated: Story = {
  decorators: [
    (Story) => {
      seedGraph([SYNTH, REVERB, DELAY, ROUTER], CABLES);
      return (
        <div style={{ width: 400, height: 600 }} className="bg-canvas">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "The everyday view: a board with mixed audio and MIDI Cables, the count badge, search field and signal-type filter chips all active. Primary reference for the editor's full layout.",
      },
    },
  },
};

// Empty board: no connections at all.
export const Empty: Story = {
  decorators: [
    (Story) => {
      seedGraph([], []);
      return (
        <div style={{ width: 400, height: 600 }} className="bg-canvas">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "No Cables on the board — shows the empty-state message and the Add Cable affordance, the starting point before any routing exists.",
      },
    },
  },
};

// Audio-only cables.
export const AudioOnly: Story = {
  decorators: [
    (Story) => {
      seedGraph(
        [SYNTH, REVERB, DELAY],
        CABLES.filter((c) => c.signalType === "audio"),
      );
      return (
        <div style={{ width: 400, height: 600 }} className="bg-canvas">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Audio-only routing — the typical signal-chain view (synth → reverb → delay) with blue Audio pills and no MIDI noise.",
      },
    },
  },
};

// Single MIDI cable — demonstrates MIDI signal-type chip filter.
export const MidiOnly: Story = {
  decorators: [
    (Story) => {
      seedGraph(
        [SYNTH, ROUTER],
        CABLES.filter((c) => c.signalType === "midi"),
      );
      return (
        <div style={{ width: 400, height: 600 }} className="bg-canvas">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "A lone MIDI Cable — verifies the teal MIDI pill and the MIDI filter chip in isolation from audio routing.",
      },
    },
  },
};
