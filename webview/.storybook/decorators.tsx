/**
 * Shared Storybook helpers for Element.
 *
 * `MiniFlow` mounts a component inside a real (tiny) React Flow canvas so that
 * node components (Block, BlockEmbed) and edge components (Cable) receive the
 * full xyflow context — provider store AND per-node id context — that `Handle`
 * and `useStore` require. Rendering a node bare (outside <ReactFlow>) makes
 * Handle warn about a missing node id, which would trip the render-verify gate.
 */
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface MiniFlowProps {
  nodes: Node[];
  edges?: Edge[];
  nodeTypes?: NodeTypes;
  edgeTypes?: EdgeTypes;
  /** Canvas height in px. Default 360. */
  height?: number;
  /** Disable fitView when you want to control the initial viewport. */
  fitView?: boolean;
}

export function MiniFlow({
  nodes,
  edges = [],
  nodeTypes,
  edgeTypes,
  height = 360,
  fitView = true,
}: MiniFlowProps) {
  return (
    <div style={{ width: "100%", height }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView={fitView}
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
