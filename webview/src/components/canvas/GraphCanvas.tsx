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
  useReactFlow,
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

import { useGraphStore, zoomToTier } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import {
  nativeGraphCommentAdd,
  nativeGraphCommentUpsert,
  nativeGraphConnect,
  nativeGraphDisconnect,
  nativeGraphMoveNodes,
  nativeGraphRenameNode,
  nativeGraphSetViewport,
} from "../../bridge/nativeGraph";
import { nativePluginEditorOpen } from "../../bridge/nativePluginEditor";
import { Block } from "./Block";
import { Cable } from "./Cable";
import { CommentFrame } from "./CommentFrame";
import { QuickAddPopup } from "./QuickAddPopup";
import { NodeContextMenu } from "./NodeContextMenu";
import { EdgeContextMenu } from "./EdgeContextMenu";
import type { BlockData, CableData, CommentBoxData } from "../../data/types";
import { EV_FIT_BOARD, EV_CREATE_COMMENT, EV_START_RENAME } from "../../events";

// ── Custom node/edge type registrations (stable references) ──

const nodeTypes: NodeTypes = { block: Block, comment: CommentFrame };
const edgeTypes: EdgeTypes = { cable: Cable };

// ── Category → minimap colour ──

const categoryColor: Record<string, string> = {
  instrument: "#4A90D9",
  audiofx: "#E8A838",
  midifx: "#2BC4C4",
  modulator: "#A87FE0",
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

interface NodeContextMenuState extends ContextMenuPos {
  nodeId: string;
}

interface EdgeContextMenuState extends ContextMenuPos {
  edgeId: string;
}

// ── GraphCanvas ──

/**
 * GraphCanvas — the full Board: the React-Flow routing canvas that hosts every
 * Block, Cable, and CommentFrame, plus the transient QuickAdd / node / edge
 * context menus, minimap, semantic-zoom tier tracking, and the empty-Board
 * watermark. It is the primary Edit-mode surface where an expert wires up a
 * Project. Mount it once (inside a `ReactFlowProvider`) as the canvas pane; it
 * reads its model from `useGraphStore` and pushes interactions (connect, move,
 * rename, viewport) through the native bridge. Takes no props.
 */
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
  const setZoomTier = useGraphStore((s) => s.setZoomTier);

  const mode = useAppStore((s) => s.mode);
  const openBlockTab = useAppStore((s) => s.openBlockTab);

  const isEdit = mode === "edit";

  const [contextMenu, setContextMenu] = useState<ContextMenuPos | null>(null);
  const [nodeContextMenu, setNodeContextMenu] =
    useState<NodeContextMenuState | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] =
    useState<EdgeContextMenuState | null>(null);

  // ── Inline rename overlay (triggered by element:start-rename event) ──
  const [renameOverlay, setRenameOverlay] = useState<{
    nodeId: string;
    value: string;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renameOverlay) {
      // Defer focus so the element is in the DOM
      requestAnimationFrame(() => renameInputRef.current?.select());
    }
  }, [renameOverlay]);
  const showMinimap = useGraphStore((s) => s.minimapVisible);
  const canvasSnap = useHostExtrasStore((s) => s.canvas.snapToGrid);
  const gridSize = useHostExtrasStore((s) => s.canvas.gridSize);
  const graphBounds = useHostExtrasStore((s) => s.canvas.graphBounds);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlow = useReactFlow();

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
      setNodeContextMenu(null);
      if (node.type === "comment" || !isEdit) return;
      openBlockTab(node.id);
    },
    [selectNode, openBlockTab, isEdit],
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (event, node) => {
      if (node.type === "comment") return;
      const data = node.data as BlockData;
      if (data.containerNodeCount != null || data.isPortal) {
        pushBreadcrumb(data.name);
        return;
      }
      // Plugin Block: open the embedded plugin GUI window (Blueprint §10.1).
      // Anchor the GUI near the click location with a sensible default size;
      // the host clamps to screen bounds.
      const anchorX = (event as MouseEvent).clientX ?? 80;
      const anchorY = (event as MouseEvent).clientY ?? 80;
      void nativePluginEditorOpen(node.id, anchorX, anchorY, 720, 480);
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
    setNodeContextMenu(null);
    setEdgeContextMenu(null);
  }, [clearSelection]);

  /**
   * Phase 5B — right-click on a cable opens the wireless-patching menu.
   * Mirrors onNodeContextMenu's behaviour: prevent default, stop propagation
   * (so the pane menu doesn't also fire), and pin the popup at the click.
   */
  const onEdgeContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent, edge: Edge) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isEdit) return;
      selectEdge(edge.id);
      setContextMenu(null);
      setNodeContextMenu(null);
      setEdgeContextMenu({
        edgeId: edge.id,
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
      });
    },
    [isEdit, selectEdge],
  );

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
      setNodeContextMenu(null);
      setEdgeContextMenu(null);
    },
    [isEdit],
  );

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isEdit || node.type === "comment") return;
      selectNode(node.id);
      setContextMenu(null);
      setEdgeContextMenu(null);
      setNodeContextMenu({
        nodeId: node.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [isEdit, selectNode],
  );

  const onNodeDragStop = useCallback(
    (
      _: MouseEvent | globalThis.MouseEvent,
      node: Node,
      draggedNodes?: Node[],
    ) => {
      // React Flow fires onNodeDragStop ONCE per drag operation but passes
      // all participating nodes as `draggedNodes` (the primary plus every
      // co-selected sibling). Without iterating that list, multi-select
      // drag persists only the primary node — sibling positions get reset
      // on the next snapshot sync.
      const all =
        draggedNodes && draggedNodes.length > 0 ? draggedNodes : [node];

      const blockMoves: Array<{ id: string; x: number; y: number }> = [];
      for (const n of all) {
        const p = n.position;
        if (n.type === "comment") {
          const c = n.data as unknown as CommentBoxData;
          const w = c.size.width;
          const h = c.size.height;
          updateCommentBoxLayout(c.id, {
            x: p.x,
            y: p.y,
            width: w,
            height: h,
          });
          void nativeGraphCommentUpsert({
            id: c.id,
            title: c.label,
            color: c.color,
            x: p.x,
            y: p.y,
            width: w,
            height: h,
          });
        } else {
          blockMoves.push({ id: n.id, x: p.x, y: p.y });
        }
      }
      if (blockMoves.length > 0) {
        updateNodePositions(blockMoves);
        void nativeGraphMoveNodes(blockMoves);
      }
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
  const zoomTierTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  useEffect(
    () => () => {
      if (viewportPushTimerRef.current !== undefined) {
        clearTimeout(viewportPushTimerRef.current);
      }
      if (zoomTierTimerRef.current !== undefined) {
        clearTimeout(zoomTierTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const handleFitBoard = () => {
      reactFlow.fitView({ padding: 0.15, duration: 200 });
    };

    const handleCreateComment = () => {
      const position = reactFlow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      void nativeGraphCommentAdd(position.x - 120, position.y - 80);
    };

    const handleStartRename = (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;
      const node = useGraphStore.getState().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setRenameOverlay({ nodeId, value: node.name });
    };

    window.addEventListener(EV_FIT_BOARD, handleFitBoard);
    window.addEventListener(EV_CREATE_COMMENT, handleCreateComment);
    window.addEventListener(EV_START_RENAME, handleStartRename);
    return () => {
      window.removeEventListener(EV_FIT_BOARD, handleFitBoard);
      window.removeEventListener(EV_CREATE_COMMENT, handleCreateComment);
      window.removeEventListener(EV_START_RENAME, handleStartRename);
    };
  }, [reactFlow]);

  // ── Debounced zoom-tier update fired during active pan/zoom ──
  const onViewportMove = useCallback(
    (
      _event: globalThis.MouseEvent | globalThis.TouchEvent | null,
      vp: Viewport,
    ) => {
      if (zoomTierTimerRef.current !== undefined) {
        clearTimeout(zoomTierTimerRef.current);
      }
      zoomTierTimerRef.current = setTimeout(() => {
        setZoomTier(zoomToTier(vp.zoom));
      }, 80);
    },
    [setZoomTier],
  );

  const onViewportMoveEnd = useCallback(
    (
      _event: globalThis.MouseEvent | globalThis.TouchEvent | null,
      vp: Viewport,
    ) => {
      // Cancel any pending debounced tier update — apply immediately on move-end.
      if (zoomTierTimerRef.current !== undefined) {
        clearTimeout(zoomTierTimerRef.current);
        zoomTierTimerRef.current = undefined;
      }
      setZoomTier(zoomToTier(vp.zoom));

      if (viewportPushTimerRef.current !== undefined) {
        clearTimeout(viewportPushTimerRef.current);
      }
      viewportPushTimerRef.current = setTimeout(() => {
        void nativeGraphSetViewport(vp.x, vp.y, vp.zoom);
      }, 120);
    },
    [setZoomTier],
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
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
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
        onMove={onViewportMove}
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

      {/* Empty board watermark */}
      {blocks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="flex flex-col items-center gap-4 opacity-20">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" className="text-text-secondary">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            <div className="text-center">
              <div className="text-[14px] font-bold text-text-secondary tracking-wide">
                Empty Board
              </div>
              <div className="text-[11px] text-text-dim mt-1">
                Right-click to add a block · Cmd+K to search
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QuickAdd context menu */}
      {contextMenu && (
        <QuickAddPopup
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {nodeContextMenu && (
        <NodeContextMenu
          nodeId={nodeContextMenu.nodeId}
          position={{ x: nodeContextMenu.x, y: nodeContextMenu.y }}
          onClose={() => setNodeContextMenu(null)}
        />
      )}

      {edgeContextMenu && (
        <EdgeContextMenu
          edgeId={edgeContextMenu.edgeId}
          position={{ x: edgeContextMenu.x, y: edgeContextMenu.y }}
          onClose={() => setEdgeContextMenu(null)}
        />
      )}

      {/* Inline rename overlay — triggered by Cmd+R keyboard shortcut */}
      {renameOverlay && (
        <div className="absolute inset-0 flex items-start justify-center pt-16 z-[9999] pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-1 w-64 bg-panel border border-white/10 rounded-lg shadow-[8px_8px_24px_rgba(0,0,0,0.5)] px-3 py-2">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
              Rename Block
            </span>
            <input
              ref={renameInputRef}
              type="text"
              value={renameOverlay.value}
              onChange={(e) =>
                setRenameOverlay({ ...renameOverlay, value: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const trimmed = renameOverlay.value.trim();
                  if (trimmed.length > 0) {
                    void nativeGraphRenameNode(renameOverlay.nodeId, trimmed);
                  }
                  setRenameOverlay(null);
                } else if (e.key === "Escape") {
                  setRenameOverlay(null);
                }
              }}
              onBlur={() => setRenameOverlay(null)}
              className="w-full bg-surface border border-accent-blue focus:outline-none rounded px-2 py-1 text-[11px] text-text-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}
