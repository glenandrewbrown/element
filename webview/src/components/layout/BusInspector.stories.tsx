import type { Meta, StoryObj } from "@storybook/react-vite";
import { BusInspector } from "./BusInspector";
import { useGraphStore } from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import type { BlockData, CableData } from "../../data/types";

// BusInspector reads edges/nodes from useGraphStore, bus assignments from
// useBusStore, and live per-cable levels from useCableMeterStore (for the
// Send/Receive meters). Seed all three in each story's decorator.
//
// Wizard R1 #4 reworked this away from the old "wireless bus" framing into the
// IO send/receive model — a Bus is a named rail that blocks SEND TO / RECEIVE
// FROM (Bus Send / Bus Receive), not a wireless cable.

const meta = {
  title: "Layout/BusInspector",
  component: BusInspector,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The IO send/receive Bus auditor. Lists every named Bus on the Board; each row shows SEPARATE live Send + Receive activity meters (real per-cable RMS / activity from useCableMeterStore), the signal-type colour, a sidechain badge where any feed is a sidechain, the sender/receiver block names, and — when given an onOpenBlock handler — a direct 'Open editor' affordance that dives the Bus's destination block (e.g. a reverb on the Bus). A Bus is a named rail that blocks Bus-Send to / Bus-Receive from — NOT a wireless cable. Empty state teaches the Bus Send / Bus Receive model.",
      },
    },
  },
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

const SYNTH  = makeBlock("synth-1",  "Synth Lead",   "instrument");
const REVERB = makeBlock("reverb-1", "Hall Reverb",  "audiofx");
const DELAY  = makeBlock("delay-1",  "Tape Delay",   "audiofx");
const CHOIR  = makeBlock("choir-1",  "Choir Layer",  "instrument");

const makeEdge = (
  id: string,
  source: string,
  target: string,
  signalType: CableData["signalType"],
  isSidechain = false,
): CableData => ({
  id,
  source,
  sourcePort: "out-L",
  target,
  targetPort: "in-L",
  signalType,
  channelCount: 2,
  isSidechain,
});

function seedStores(
  nodes: BlockData[],
  edges: CableData[],
  cableBus: Record<string, string>,
  levels: Record<string, number> = {},
) {
  useGraphStore.setState({ nodes, edges, selectedNodeId: null, selectedEdgeId: null, commentBoxes: [] });
  useBusStore.setState({ cableBus });
  useCableMeterStore.setState((s) => ({ ...s, levels }));
}

// Empty state: no buses — teaches the Bus Send / Bus Receive model.
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
  parameters: {
    docs: {
      description: {
        story:
          "No Buses yet — the panel teaches the IO model: add a Bus Send block to push a signal onto a named Bus and a Bus Receive block to pull it back. The common first-run state.",
      },
    },
  },
};

// Single audio bus with a live Send/Receive level.
export const SingleBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio")];
      seedStores([SYNTH, REVERB], edges, { c1: "FX Send A" }, { c1: 0.55 });
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "One audio Bus (FX Send A) — the minimal populated row, showing the blue audio glyph, the live Send + Receive VU meters (lit from a real 0.55 cable level), and the Synth Lead → Hall Reverb endpoints.",
      },
    },
  },
};

// Single bus + open-editor affordance wired (handler passed via args).
export const WithOpenEditor: Story = {
  args: {
    onOpenBlock: (id: string) => console.log("open block", id),
  },
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio")];
      seedStores([SYNTH, REVERB], edges, { c1: "Reverb Send" }, { c1: 0.42 });
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Same Bus with an onOpenBlock handler supplied — the 'Open editor' affordance appears, diving the Bus's destination block (Hall Reverb) so its controls open in the Block tab. This is how InspectorHub wires it.",
      },
    },
  },
};

// Sidechain feed → SIDECHAIN badge + audiofx-tinted display.
export const SidechainBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio", true)];
      seedStores([SYNTH, REVERB], edges, { c1: "Duck Bus" }, { c1: 0.3 });
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "A Bus carrying a sidechain feed — the SIDECHAIN badge surfaces (sidechain DISPLAY, Wizard R1 P2), tinted in the audio-effect hue so the routing is obvious at a glance.",
      },
    },
  },
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
        { c1: "FX Send A", c2: "Verb Return", c3: "MIDI Clock" },
        { c1: 0.6, c2: 0.25, c3: 0.5 },
      );
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Several Buses mixing audio and MIDI signal types — demonstrates the per-signal colour coding (blue audio, teal MIDI) plus live Send/Receive levels that let the user tell routes apart at a glance.",
      },
    },
  },
};

// Bus with unknown block ID — endpoint falls back to "?".
export const OrphanEndpoint: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "ghost-id", "reverb-1", "audio")];
      seedStores([REVERB], edges, { c1: "Ghost Bus" });
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Edge case: a Bus endpoint references a Block that no longer exists — the Send meter's endpoint list degrades gracefully to a \"?\" label instead of crashing.",
      },
    },
  },
};
