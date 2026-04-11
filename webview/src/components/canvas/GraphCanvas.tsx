import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  type Connection,
  type Viewport,
  BackgroundVariant,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGraphStore } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import {
  nativeGraphCommentUpsert,
  nativeGraphConnect,
  nativeGraphDisconnect,
  nativeGraphMoveNodes,
  nativeGraphSetViewport,
} from "../../bridge/nativeGraph";
import { Block } from "./Block";
import { Cable } from "./Cable";
import { CommentFrame } from "./CommentFrame";
import { QuickAddPopup } from "./QuickAddPopup";
import type { BlockData, CableData, CommentBoxData } from "../../data/types";

// ── Custom node/edge type registrations (stable references) ──

const nodeTypes: NodeTypes = { block: Block, comment: CommentFrame };
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

function toCommentFlowNodes(
  comments: CommentBoxData[],
  selectedId: string | null,
): Node[] {
  return comments.map((c) => ({
    id: c.id,
    type: "comment",
    position: { ...c.position },
    data: c as unknown as Record<string, unknown>,
    selected: c.id === selectedId,
    draggable: true,
    style: {
      width: c.size.width,
      height: c.size.height,
      zIndex: 0,
    },
  }));
}

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
  const commentBoxes = useGraphStore((s) => s.commentBoxes);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const pushBreadcrumb = useGraphStore((s) => s.pushBreadcrumb);
  const popBreadcrumb = useGraphStore((s) => s.popBreadcrumb);
  const updateNodePositions = useGraphStore((s) => s.updateNodePositions);
  const updateCommentBoxLayout = useGraphStore((s) => s.updateCommentBoxLayout);

  const mode = useAppStore((s) => s.mode);
  const openBlockTab = useAppStore((s) => s.openBlockTab);

  const isEdit = mode === "edit";

  const [contextMenu, setContextMenu] = useState<ContextMenuPos | null>(null);
  const showMinimap = useGraphStore((s) => s.minimapVisible);
  const canvasSnap = useHostExtrasStore((s) => s.canvas.snapToGrid);
  const gridSize = useHostExtrasStore((s) => s.canvas.gridSize);
  const graphBounds = useHostExtrasStore((s) => s.canvas.graphBounds);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes([
      ...toFlowNodes(blocks, selectedNodeId),
      ...toCommentFlowNodes(commentBoxes, selectedNodeId),
    ]);
  }, [blocks, commentBoxes, selectedNodeId, setNodes]);

  useEffect(() => {
    setEdges(toFlowEdges(cables, selectedEdgeId));
  }, [cables, selectedEdgeId, setEdges]);

  // ── Handlers ──

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      selectNode(node.id);
      if (node.type === "comment" || !isEdit) return;
      openBlockTab(node.id);
    },
    [selectNode, openBlockTab, isEdit],
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === "comment") return;
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

  const onNodeDragStop = useCallback(
    (_: MouseEvent | globalThis.MouseEvent, node: Node) => {
      const p = node.position;
      if (node.type === "comment") {
        const c = node.data as unknown as CommentBoxData;
        const w = c.size.width;
        const h = c.size.height;
        updateCommentBoxLayout(c.id, { x: p.x, y: p.y, width: w, height: h });
        void nativeGraphCommentUpsert({
          id: c.id,
          title: c.label,
          color: c.color,
          x: p.x,
          y: p.y,
          width: w,
          height: h,
        });
        return;
      }
      updateNodePositions([{ id: node.id, x: p.x, y: p.y }]);
      void nativeGraphMoveNodes([{ id: node.id, x: p.x, y: p.y }]);
    },
    [updateNodePositions, updateCommentBoxLayout],
  );

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    const sh = conn.sourceHandle ?? "out-0";
    const th = conn.targetHandle ?? "in-0";
    void nativeGraphConnect(conn.source, sh, conn.target, th);
  }, []);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) {
      const sh = e.sourceHandle ?? "out-0";
      const th = e.targetHandle ?? "in-0";
      void nativeGraphDisconnect(e.source, sh, e.target, th);
    }
  }, []);

  // ── Minimap node colour ──

  const minimapNodeColor = useCallback((node: Node) => {
    if (node.type === "comment") return "#5C5C62";
    const cat = (node.data as Record<string, unknown>)?.category as string;
    return categoryColor[cat] ?? "#8E8E93";
  }, []);

  const translateExtent = [
    [graphBounds.minX - 800, graphBounds.minY - 600],
    [graphBounds.maxX + 800, graphBounds.maxY + 600],
  ] as [[number, number], [number, number]];

  const viewportPushTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  useEffect(
    () => () => {
      if (viewportPushTimerRef.current !== undefined) {
        clearTimeout(viewportPushTimerRef.current);
      }
    },
    [],
  );

  const onViewportMoveEnd = useCallback(
    (
      _event: globalThis.MouseEvent | globalThis.TouchEvent | null,
      vp: Viewport,
    ) => {
      if (viewportPushTimerRef.current !== undefined) {
        clearTimeout(viewportPushTimerRef.current);
      }
      viewportPushTimerRef.current = setTimeout(() => {
        void nativeGraphSetViewport(vp.x, vp.y, vp.zoom);
      }, 120);
    },
    [],
  );

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        onContextMenu={onPaneContextMenu}
        onConnect={isEdit ? onConnect : undefined}
        onEdgesDelete={isEdit ? onEdgesDelete : undefined}
        nodesDraggable={isEdit}
        nodesConnectable={isEdit}
        elementsSelectable={true}
        selectionOnDrag={isEdit}
        selectionMode={SelectionMode.Partial}
        snapToGrid={canvasSnap}
        snapGrid={[gridSize, gridSize]}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={3}
        translateExtent={translateExtent}
        onMoveEnd={onViewportMoveEnd}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="#2A2A2E"
          gap={Math.max(8, gridSize)}
          size={1}
        />
        {showMinimap && (
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
        )}
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
