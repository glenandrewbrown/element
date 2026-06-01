import type { Meta, StoryObj } from "@storybook/react-vite";
import { EdgeContextMenu } from "./EdgeContextMenu";
import { useGraphStore } from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";
import type { CableData } from "../../data/types";

// ── Store seeding ──
// EdgeContextMenu returns null unless useGraphStore.edges contains the edgeId.
// Whether it shows "Route through Bus…" vs "Rename Bus / Remove from Bus"
// depends on useBusStore.cableBus[edgeId]. Native disconnect/bus bridges are
// no-ops in Storybook.

const EDGE_ID = "cab-1";

const audioCable: CableData = {
  id: EDGE_ID,
  source: "n1",
  sourcePort: "out",
  target: "n2",
  targetPort: "in",
  signalType: "audio",
  channelCount: 2,
  isSidechain: false,
};

const midiCable: CableData = {
  ...audioCable,
  id: EDGE_ID,
  signalType: "midi",
  channelCount: 1,
};

function seed(cable: CableData = audioCable, busName?: string) {
  useGraphStore.setState({ edges: [cable] });
  useBusStore.setState({ cableBus: busName ? { [EDGE_ID]: busName } : {} });
}

const meta = {
  title: "Canvas/EdgeContextMenu",
  component: EdgeContextMenu,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: [
          "EdgeContextMenu — right-click menu for Cables on the Board.",
          "",
          "**#29 fix:** \"Make Wireless\" / \"wireless patching\" language is REPLACED with",
          "the correct Bus Send / Bus Receive model framing. A cable assigned to a",
          "named bus is described as \"Route through Bus…\" — this makes the intent clear",
          "while the underlying BusStore mechanism (hide drawn cable, show named badge",
          "at each port) remains intact.",
          "",
          "**Wired actions:** Route through Bus… / Rename Bus / Remove from Bus / Delete Cable.",
          "",
          "**Honest-disabled (Pillar-2 backlog):** \"Insert Bus Blocks…\" requires",
          "el.BusSend + el.BusReceive C++ node types in NodeFactory, plus a",
          "nativeGraphInsertBusSendReceive bridge call — shown disabled with tooltip.",
          "",
          "Signal-type accent colour (blue=audio, teal=MIDI, orange=CV) is applied",
          "to the header icon and bus-chip hover glow.",
        ].join("\n"),
      },
    },
  },
} satisfies Meta<typeof EdgeContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const wrap = (Story: React.ComponentType) => (
  <div className="bg-canvas" style={{ height: 320 }}>
    <Story />
  </div>
);

// ── Wired audio cable — offers "Route through Bus…" ──────────────────────────
export const WiredAudio: Story = {
  args: { edgeId: EDGE_ID, position: { x: 24, y: 40 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Wired audio cable (blue accent). Offers \"Route through Bus…\" + " +
          "the honest-disabled \"Insert Bus Blocks…\" + \"Delete Cable\". " +
          "Entry point into bus-IO routing.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(audioCable);
      return wrap(Story);
    },
  ],
};

// ── Wired MIDI cable — teal accent ────────────────────────────────────────────
export const WiredMidi: Story = {
  args: { edgeId: EDGE_ID, position: { x: 24, y: 40 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Wired MIDI cable (teal accent). Confirms signal-type accent colour " +
          "propagates to the header icon and hover glow independently of audio.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(midiCable);
      return wrap(Story);
    },
  ],
};

// ── Cable on a bus — offers "Rename Bus" + "Remove from Bus" ─────────────────
export const OnBus: Story = {
  args: { edgeId: EDGE_ID, position: { x: 24, y: 40 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Audio cable already assigned to bus \"Reverb Send A\". The menu swaps " +
          "to \"Rename Bus…\" + \"Remove from Bus\", reflecting the routed state. " +
          "The header shows \"Bus · Reverb Send A\" instead of \"Audio Cable\".",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(audioCable, "Reverb Send A");
      return wrap(Story);
    },
  ],
};
