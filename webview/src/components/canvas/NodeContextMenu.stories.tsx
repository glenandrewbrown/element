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
    category: "generator",
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
  parameters: { layout: "fullscreen" },
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
  decorators: [
    (Story) => {
      seed(makeNode({ name: "Valhalla Reverb", category: "modifier", bypassed: true, muted: true }));
      return framed(Story);
    },
  ],
};
