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
// R3: meters now reflect REAL channel topology + signal type from CableData:
//   • channelCount 1 → Mono single column
//   • channelCount 2 → Stereo L/R pair
//   • channelCount 6 → 5.1 Surround per-channel columns
//   • signalType midi → MidiActivityIndicator (no VU)
//   • isSidechain → orange trough + SC prefix
//
// Per-channel level split (true per-lane amplitude) is NOT yet bridged —
// useCableMeterStore provides a single scalar per cable. All columns share
// that scalar (honest-idle). See Pillar-2 backlog.

const meta = {
  title: "Layout/BusInspector",
  component: BusInspector,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The IO send/receive Bus auditor — now topology-aware. Mono buses show a single column meter, Stereo shows L/R pair, 5.1 Surround shows six labelled columns. MIDI buses replace the VU entirely with a teal activity indicator (blink-dot + event bead). Sidechain buses render an orange-tinted trough with SC prefix. All channel count + signal type data sourced from real CableData fields. Per-channel level split (per-lane RMS) is not yet bridged — Pillar-2 backlog.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof BusInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── helpers ──────────────────────────────────────────────────────────────────

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

const SYNTH  = makeBlock("synth-1",  "Synth Lead",    "instrument");
const REVERB = makeBlock("reverb-1", "Hall Reverb",   "audiofx");
const DELAY  = makeBlock("delay-1",  "Tape Delay",    "audiofx");
const CHOIR  = makeBlock("choir-1",  "Choir Layer",   "instrument");
const DRUM   = makeBlock("drum-1",   "Drum Machine",  "instrument");
const COMP   = makeBlock("comp-1",   "Compressor",    "audiofx");
const SEQ    = makeBlock("seq-1",    "Step Sequencer","midifx");
const ARPEG  = makeBlock("arp-1",    "Arpeggiator",   "midifx");

function makeEdge(
  id: string,
  source: string,
  target: string,
  signalType: CableData["signalType"],
  channelCount: CableData["channelCount"] = 2,
  isSidechain = false,
): CableData {
  return {
    id,
    source,
    sourcePort: "out-L",
    target,
    targetPort: "in-L",
    signalType,
    channelCount,
    isSidechain,
  };
}

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

// ── Stories ───────────────────────────────────────────────────────────────────

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
          "No Buses yet — the panel teaches the IO model: add a Bus Send block to push a signal onto a named Bus and a Bus Receive block to pull it back.",
      },
    },
  },
};

// Mono audio bus (channelCount: 1) — single centred column.
export const MonoBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio", 1)];
      seedStores([SYNTH, REVERB], edges, { c1: "Mono Cue" }, { c1: 0.68 });
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
          "A mono (1-channel) audio bus — renders a single centred VU column labelled 'M'. Channel count sourced from real CableData.channelCount.",
      },
    },
  },
};

// Stereo audio bus (channelCount: 2) — L/R pair, the typical case.
export const StereoBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio", 2)];
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
          "A stereo (2-channel) audio bus — renders L/R column pair. The most common bus topology for FX sends.",
      },
    },
  },
};

// Surround bus (channelCount: 6) — six labelled columns: L R C LF Ls Rs.
export const SurroundBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio", 6)];
      seedStores([SYNTH, REVERB], edges, { c1: "5.1 Room" }, { c1: 0.72 });
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
          "A 5.1 surround (6-channel) audio bus — renders six labelled columns in two visual groups: L/R/C (front) and LF/Ls/Rs (surround + LFE). All columns share the cable scalar level (per-lane RMS split not yet bridged — Pillar-2 backlog).",
      },
    },
  },
};

// MIDI bus — NO audio VU; shows teal activity dot + event bead.
export const MidiBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "seq-1", "arp-1", "midi", 1)];
      seedStores([SEQ, ARPEG], edges, { c1: "MIDI Clock" }, { c1: 0.6 });
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
          "A MIDI bus — the VU is replaced entirely by a teal blink-dot activity indicator + event-density bead. 'Display differently' per Glen's R3 review item. Level 0.6 = moderately busy MIDI stream.",
      },
    },
  },
};

// MIDI bus idle — dot is dark, bead absent.
export const MidiBusIdle: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "seq-1", "arp-1", "midi", 1)];
      seedStores([SEQ, ARPEG], edges, { c1: "MIDI Bus Idle" }, { c1: 0 });
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
          "MIDI bus at zero activity — the dot is dark, the bead is absent, the level reads '—'. Shows the idle-state honest rendering.",
      },
    },
  },
};

// Sidechain bus — orange trough, SC label prefix, SIDECHAIN badge.
export const SidechainBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "drum-1", "comp-1", "audio", 2, true)];
      seedStores([DRUM, COMP], edges, { c1: "Duck Bus" }, { c1: 0.45 });
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
          "A sidechain bus — isSidechain=true on the cable. The meter renders with an orange trough shadow, SC prefix label, and the SIDECHAIN badge in the header. Clearly distinct from regular audio buses at a glance.",
      },
    },
  },
};

// Open-editor affordance — onOpenBlock handler wired.
export const WithOpenEditor: Story = {
  args: {
    onOpenBlock: (id: string) => console.log("open block", id),
  },
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio", 2)];
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
          "Stereo bus with an onOpenBlock handler supplied — 'Open editor' affordance appears, diving the bus's destination block (Hall Reverb) so its controls surface in the Block tab.",
      },
    },
  },
};

// Mixed topology board — Mono + Stereo + 5.1 + MIDI + Sidechain on one board.
export const MixedTopologies: Story = {
  decorators: [
    (Story) => {
      const edges = [
        makeEdge("c1", "synth-1", "reverb-1", "audio", 2),          // Stereo FX send
        makeEdge("c2", "choir-1", "delay-1",  "audio", 1),           // Mono cue
        makeEdge("c3", "synth-1", "reverb-1", "audio", 6),           // 5.1 Room
        makeEdge("c4", "seq-1",   "arp-1",    "midi",  1),           // MIDI
        makeEdge("c5", "drum-1",  "comp-1",   "audio", 2, true),     // Sidechain
      ];
      seedStores(
        [SYNTH, REVERB, DELAY, CHOIR, SEQ, ARPEG, DRUM, COMP],
        edges,
        {
          c1: "FX Send A",
          c2: "Mono Cue",
          c3: "5.1 Room",
          c4: "MIDI Clock",
          c5: "Duck Bus",
        },
        { c1: 0.6, c2: 0.35, c3: 0.8, c4: 0.5, c5: 0.28 },
      );
      return (
        <div style={{ width: 340 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Full mixed-topology board: Stereo FX Send (L/R pair), Mono Cue (single column), 5.1 Room (6 columns), MIDI Clock (activity indicator), and a Sidechain Bus (orange trough). Demonstrates Glen's R3 requirement that each bus meter matches the real channel count and signal type.",
      },
    },
  },
};

// Orphan endpoint — block id missing from node list, falls back to '?'.
export const OrphanEndpoint: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "ghost-id", "reverb-1", "audio", 2)];
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
          "Edge case: a bus endpoint references a block that no longer exists. The meter renders with stereo L/R columns, the endpoint name degrades gracefully to '?' — no crash.",
      },
    },
  },
};
