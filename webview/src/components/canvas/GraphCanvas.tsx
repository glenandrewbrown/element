import { useCallback, useMemo, useState, type MouseEvent } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGraphStore } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
import { Block } from "./Block";
import { Cable } from "./Cable";
import { QuickAddPopup } from "./QuickAddPopup";
import type { BlockData, CableData } from "../../data/types";

// ── Custom node/edge type registrations (stable references) ──

const nodeTypes: NodeTypes = { block: Block };
const edgeTypes: EdgeTypes = { cable: Cable };

// ── Category → minimap colour ──

const categoryColor: Record<string, string> = {
  generator: "#4A90D9",
  modifier: "#E8A838",
  logic: "#2BC4C4",
};

// ── Convert our BlockData[] to React Flow Node[] ──

function toFlowNodes(blocks: BlockData[], selectedId: string | null): Node[] {
  return blocks.map((b) => ({
    id: b.id,
    type: "block",
    position: b.position,
    data: b,
    selected: b.id === selectedId,
    draggable: true,
  }));
}

// ── Convert our CableData[] to React Flow Edge[] ──

function toFlowEdges(cables: CableData[], selectedId: string | null): Edge[] {
  return cables.map((c) => ({
    id: c.id,
    type: "cable",
    source: c.source,
    sourceHandle: c.sourcePort,
    target: c.target,
    targetHandle: c.targetPort,
    data: c,
    selected: c.id === selectedId,
  }));
}

// ── QuickAdd context menu state ──

interface ContextMenuPos {
  x: number;
  y: number;
}

// ── GraphCanvas ──

export function GraphCanvas() {
  const blocks = useGraphStore((s) => s.nodes);
  const cables = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const pushBreadcrumb = useGraphStore((s) => s.pushBreadcrumb);
  const popBreadcrumb = useGraphStore((s) => s.popBreadcrumb);

  const mode = useAppStore((s) => s.mode);
  const openBlockTab = useAppStore((s) => s.openBlockTab);

  const isEdit = mode === "edit";

  const [contextMenu, setContextMenu] = useState<ContextMenuPos | null>(null);

  // ── Memoised flow data ──

  const nodes = useMemo(
    () => toFlowNodes(blocks, selectedNodeId),
    [blocks, selectedNodeId],
  );

  const edges = useMemo(
    () => toFlowEdges(cables, selectedEdgeId),
    [cables, selectedEdgeId],
  );

  // ── Handlers ──

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      selectNode(node.id);
      if (isEdit) openBlockTab(node.id);
    },
    [selectNode, openBlockTab, isEdit],
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const data = node.data as BlockData;
      if (data.containerNodeCount != null || data.isPortal) {
        pushBreadcrumb(data.name);
      }
    },
    [pushBreadcrumb],
  );

  const onEdgeClick = useCallback(
    (_event: MouseEvent, edge: Edge) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
    setContextMenu(null);
  }, [clearSelection]);

  const onPaneDoubleClick = useCallback(() => {
    popBreadcrumb();
  }, [popBreadcrumb]);

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      if (!isEdit) return;
      setContextMenu({
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
      });
    },
    [isEdit],
  );

  // ── Minimap node colour ──

  const minimapNodeColor = useCallback((node: Node) => {
    const cat = (node.data as Record<string, unknown>)?.category as string;
    return categoryColor[cat] ?? "#8E8E93";
  }, []);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        onContextMenu={onPaneContextMenu}
        nodesDraggable={isEdit}
        nodesConnectable={isEdit}
        elementsSelectable={true}
        snapToGrid={true}
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="#2A2A2E"
          gap={20}
          size={1}
        />
        <MiniMap
          position="bottom-right"
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={0}
          maskColor="rgba(30, 30, 34, 0.8)"
          style={{
            width: 150,
            height: 100,
            backgroundColor: "#1A1A1E",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 2,
            boxShadow:
              "-2px -2px 8px rgba(255,255,255,0.04), 2px 2px 8px rgba(0,0,0,0.35)",
            opacity: 0.8,
          }}
          className="hover:!opacity-100 transition-opacity"
        />
      </ReactFlow>

      {/* QuickAdd context menu */}
      {contextMenu && (
        <QuickAddPopup
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
