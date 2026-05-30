import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReactFlowProvider } from "@xyflow/react";
import { NodeContextMenu } from "./NodeContextMenu";
import { useGraphStore } from "../../stores/useGraphStore";
import type { BlockData } from "../../data/types";

// ── Store seeding ──
// NodeContextMenu returns null unless useGraphStore.nodes contains the nodeId,
// and it calls useReactFlow() — which throws outside a provider — so it must
// be wrapped in <ReactFlowProvider>. Bypass/mute toggles + native bridges
// no-op. The single-selection menu is the representative state (the
// align/distribute branch requires real selected nodes inside <ReactFlow>).

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
        component:
          "NodeContextMenu — the right-click action menu for a Block: rename, bypass/enable, mute/unmute (output and input), duplicate, delete (each with its shortcut). With 2+ Blocks selected it also surfaces align tools, and at 3+ distribute tools. Mount it transiently from GraphCanvas at the click position. Stories seed useGraphStore.nodes and wrap it in ReactFlowProvider (it calls useReactFlow); the single-selection menu is the representative state.",
      },
    },
  },
} satisfies Meta<typeof NodeContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (Story: React.ComponentType) => (
  <ReactFlowProvider>
    <div className="bg-canvas" style={{ height: 360 }}>
      <Story />
    </div>
  </ReactFlowProvider>
);

// Default block menu — Rename / Bypass / Mute / Mute Input / Duplicate / Delete.
export const Default: Story = {
  args: { nodeId: NODE_ID, position: { x: 80, y: 40 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Single-selection menu on an active Block — the full per-Block action set with default (not-yet-toggled) labels. The primary in-use state.",
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

// Bypassed + muted block — toggle items show their active "Enable" / "Unmute" labels.
export const BypassedAndMuted: Story = {
  args: { nodeId: NODE_ID, position: { x: 80, y: 40 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Bypassed + muted Block — confirms the toggle items flip to their active \"Enable\" / \"Unmute\" labels (orange accent) so the current engine state is legible from the menu.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode({ name: "Valhalla Reverb", category: "audiofx", bypassed: true, muted: true }));
      return framed(Story);
    },
  ],
};
