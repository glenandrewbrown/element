import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReactFlowProvider } from "@xyflow/react";
import { GraphCanvas } from "./GraphCanvas";
import { useGraphStore } from "../../stores/useGraphStore";
import { demoGraph } from "../../data/demoGraph";

// ── Store seeding ──
// GraphCanvas is the full React-Flow Board. It reads its nodes/edges/comment
// boxes from useGraphStore and renders its own <ReactFlow> — but it also calls
// useReactFlow() at the top level, which throws outside a provider, so every
// story wraps it in <ReactFlowProvider>. useAppStore.mode defaults to "edit"
// (full interactivity) and useHostExtrasStore ships sensible canvas defaults
// (gridSize / graphBounds), so seeding the graph store is enough to mount it.
// Native bridge calls (connect, move, viewport push, plugin editor open) all
// no-op without a JUCE backend. fitView frames whatever is seeded.

function seedGraph(opts: { empty?: boolean } = {}) {
  if (opts.empty) {
    useGraphStore.setState({
      nodes: [],
      edges: [],
      commentBoxes: [],
      selectedNodeId: null,
      selectedEdgeId: null,
    });
    return;
  }
  useGraphStore.setState({
    nodes: demoGraph.blocks,
    edges: demoGraph.cables,
    commentBoxes: demoGraph.commentBoxes,
    selectedNodeId: null,
    selectedEdgeId: null,
  });
}

const meta = {
  title: "Canvas/GraphCanvas",
  component: GraphCanvas,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "GraphCanvas — the full Board: the React-Flow routing canvas that hosts every Block (the `block` node type), Cable (the `cable` edge type), and CommentFrame (the `comment` node type), plus the transient QuickAdd / node / edge context menus, minimap, semantic-zoom tier tracking, and the empty-Board watermark. It is the primary Edit-mode surface where an expert wires up a Project. It reads its model from useGraphStore and pushes interactions (connect, move, rename, viewport) through the native bridge, which no-ops in Storybook. Wrapped in ReactFlowProvider here because the component calls useReactFlow().",
      },
    },
  },
  // GraphCanvas hosts its own ReactFlow + custom node/edge types — autodocs
  // can't introspect anything useful and it takes no props.
  tags: ["!autodocs"],
} satisfies Meta<typeof GraphCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (Story: React.ComponentType) => (
  <ReactFlowProvider>
    <div className="bg-canvas" style={{ width: "100%", height: 600 }}>
      <Story />
    </div>
  </ReactFlowProvider>
);

// Full demo Project — 15 Blocks, 18 Cables (audio/MIDI/value, sidechain,
// surround), 2 comment frames. The representative populated Board.
export const Default: Story = {
  decorators: [
    (Story) => {
      seedGraph();
      return framed(Story);
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Populated Board — the full demo Project (15 Blocks, 18 Cables across all three signal types plus a sidechain and a 6-channel surround run, inside two comment frames). The primary in-use state of the canvas.",
      },
    },
  },
};

// Empty Board — no Blocks seeded, so the centred watermark + add-a-block hint
// shows. Confirms first-open / cleared-Project guidance renders.
export const Empty: Story = {
  decorators: [
    (Story) => {
      seedGraph({ empty: true });
      return framed(Story);
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Empty Project — no Blocks/Cables seeded, so the canvas shows its centred \"Empty Board\" watermark with the right-click / Cmd+K guidance. The first-open and cleared-Project state.",
      },
    },
  },
};
