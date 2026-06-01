import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReactFlowProvider } from "@xyflow/react";
import { NodeContextMenu } from "./NodeContextMenu";
import { useGraphStore } from "../../stores/useGraphStore";
import type { BlockData } from "../../data/types";

// ── Store seeding ──
// NodeContextMenu returns null unless useGraphStore.nodes contains the nodeId,
// and it calls useReactFlow() — which throws outside a provider — so it must
// be wrapped in <ReactFlowProvider>. Bypass/mute toggles + native bridges
// no-op in Storybook. The single-selection menu is the primary state.

const NODE_ID = "n1";

function makeNode(over: Partial<BlockData> = {}): BlockData {
  return {
    id: NODE_ID,
    name: "Serum",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 18,
    latencyMs: 2,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...over,
  };
}

function seed(node: BlockData) {
  useGraphStore.setState({ nodes: [node] });
}

const meta = {
  title: "Canvas/NodeContextMenu",
  component: NodeContextMenu,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: [
          "NodeContextMenu — the right-click action menu for a Block on the Board.",
          "",
          "**Wired actions (real store/bridge):** Rename, Enable/Bypass, Mute Output,",
          "Mute Input, Copy, Duplicate, Delete, multi-select Align + Distribute.",
          "",
          "**Honest-disabled (Pillar-2 backlog):** Disconnect ports, Color, Oversample,",
          "Replace, Presets — each labelled \"soon\" and shows a tooltip naming the",
          "missing bridge/follow-up work. Nothing is a silent no-op.",
          "",
          "**Design:** category-hue dopamine hover-glow (no resize), tight neumorphic",
          "shadow, category icon + format badge in the header.",
        ].join("\n"),
      },
    },
  },
} satisfies Meta<typeof NodeContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (Story: React.ComponentType) => (
  <ReactFlowProvider>
    <div className="bg-canvas" style={{ height: 520 }}>
      <Story />
    </div>
  </ReactFlowProvider>
);

// ── Default: instrument block ─────────────────────────────────────────────────
export const Default: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Single-selection instrument block (Serum / VST3). The full extended " +
          "menu with native-parity sections: primary actions, signal state, " +
          "disconnect (honest-disabled), options (honest-disabled), clipboard, delete.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode());
      return framed(Story);
    },
  ],
};

// ── Bypassed + muted block ────────────────────────────────────────────────────
export const BypassedAndMuted: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Bypassed + muted audio-FX block (Valhalla Reverb). Confirms the toggle " +
          "items flip to \"Enable\" / \"Unmute Output\" with the orange active accent " +
          "so the current engine state is legible from the menu.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        makeNode({
          name: "Valhalla Reverb",
          category: "audiofx",
          bypassed: true,
          muted: true,
        }),
      );
      return framed(Story);
    },
  ],
};

// ── MIDI FX block ─────────────────────────────────────────────────────────────
export const MidiFxBlock: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "MIDI FX block (Teal accent). Confirms the category icon and header " +
          "accent colour update to match the 4-category taxonomy.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        makeNode({
          name: "MIDI Router",
          category: "midifx",
          format: "INT",
          cpuLoad: 0,
          latencyMs: 0,
        }),
      );
      return framed(Story);
    },
  ],
};

// ── Modulator block ───────────────────────────────────────────────────────────
export const ModulatorBlock: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Modulator/Utility block (Purple accent). The Waves icon in the header " +
          "confirms the category icon system round-trips through iconForCategory.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        makeNode({
          name: "LFO Script",
          category: "modulator",
          format: "INT",
          cpuLoad: 2,
          latencyMs: 0,
        }),
      );
      return framed(Story);
    },
  ],
};
