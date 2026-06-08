import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
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
  type OnNodeDrag,
  type Connection,
  type OnConnectStart,
  type OnConnectEnd,
  type Viewport,
  BackgroundVariant,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGraphStore, zoomToTier } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import {
  nativeEnterContainer,
  nativeExitContainer,
  nativeGraphCommentAdd,
  nativeGraphCommentUpsert,
  nativeGraphConnect,
  nativeGraphAddPluginConnected,
  nativeGraphDisconnect,
  nativeGraphSpliceCable,
  nativeGraphMoveNodes,
  nativeGraphRenameNode,
  nativeGraphSetViewport,
  nativeMoleculeInsert,
} from "../../bridge/nativeGraph";
import {
  nativePluginEditorClose,
  nativePluginEditorOpen,
} from "../../bridge/nativePluginEditor";
import { Block } from "./Block";
import { Cable } from "./Cable";
import {
  EditorDragHandle,
  type EditorBounds,
} from "./EditorDragHandle";
import { GhostEdge, type GhostEdgeData } from "./GhostEdge";
import { CommentFrame } from "./CommentFrame";
import { QuickAddPopup } from "./QuickAddPopup";
import { NodeContextMenu } from "./NodeContextMenu";
import { EdgeContextMenu } from "./EdgeContextMenu";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { NestedChrome } from "./NestedChrome";
import {
  computeRouteSuggestions,
  buildRouteSuggestionCache,
  type RouteSuggestion,
  type RouteSuggestionCache,
} from "./autoRouteSuggestions";
import { computeAutoLayout } from "../../lib/autoLayout";
import {
  resolveCollisions,
  DEFAULT_COLLISION_MARGIN,
  type CollisionRect,
} from "../../lib/resolveCollisions";
import {
  BLOCK_REF_WIDTH,
  BLOCK_REF_HEIGHT,
} from "./autoRouteSuggestions";
import {
  nextAutoFitExtent,
  extentForBounds,
  type Extent,
} from "../../lib/autoFitExtent";
import {
  findSpliceCandidate,
  planSpliceAtomic,
  type CableGeometry,
} from "../../lib/cableSplice";
import { isSnippetDrag, parseSnippetDrop } from "../../lib/snippetDrag";
import type {
  BlockData,
  CableData,
  CommentBoxData,
  SignalType,
} from "../../data/types";
import {
  EV_FIT_BOARD,
  EV_CREATE_COMMENT,
  EV_START_RENAME,
  EV_TIDY,
} from "../../events";

// ── Custom node/edge type registrations (stable references) ──

const nodeTypes: NodeTypes = { block: Block, comment: CommentFrame };
const edgeTypes: EdgeTypes = { cable: Cable, ghost: GhostEdge };

// Throttle interval for the auto-route suggestion compute during a drag.
// The canvas is aggressively memoised, so we recompute at most ~every 100ms
// (10Hz) instead of on every pointermove pixel. Raised 60→100ms
// (architect-perf-plan §2.1a) — a ghost hint still feels instant at 10Hz, and
// the lower cadence cuts the per-tick matcher work during a heavy drag.
const SUGGEST_THROTTLE_MS = 100;

// Debounce (ms) before an auto-tidy-on-add relayout fires. Long enough that a
// burst of adds (e.g. a multi-block snippet) coalesces into ONE relayout, and
// that a user who immediately starts dragging the new block cancels it.
const AUTO_TIDY_DEBOUNCE_MS = 450;
// How long the .tidy-glide transform-transition class stays on nodes (must
// cover the 260ms CSS transition; a little slack so the glide completes).
const TIDY_GLIDE_MS = 320;
// How long the .snippet-dropin spring class stays on freshly-inserted nodes.
const SNIPPET_DROPIN_MS = 220;

// ── Category → minimap colour ──

const categoryColor: Record<string, string> = {
  instrument: "#4A90D9",
  audiofx: "#E8A838",
  midifx: "#2BC4C4",
  modulator: "#A87FE0",
};

// ── No-overlap (Task 2.3) ──
// The gutter resolveCollisions leaves between Blocks on a drop / spawn nudge.
// Single source of truth so the runtime nudge and any test assert the same.
const COLLISION_MARGIN = DEFAULT_COLLISION_MARGIN;

/**
 * Build the rectangular collision set for the live Block nodes (Task 2.3).
 * Blocks are RECTANGLES at varying collapse-tier heights, so we feed real
 * AABBs (measured size where React Flow has it, the reference size otherwise)
 * into resolveCollisions — never circular forceCollide. Comment frames are
 * skipped (they're backgrounds, not Blocks).
 */
function collisionRectsFromNodes(rfNodes: Node[]): CollisionRect[] {
  const rects: CollisionRect[] = [];
  for (const n of rfNodes) {
    if (n.type === "comment") continue;
    rects.push({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: n.measured?.width ?? BLOCK_REF_WIDTH,
      height: n.measured?.height ?? BLOCK_REF_HEIGHT,
    });
  }
  return rects;
}

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

function toFlowEdges(
  cables: CableData[],
  selectedId: string | null,
  spliceTargetId: string | null = null,
): Edge[] {
  return cables.map((c) => ({
    id: c.id,
    type: "cable",
    source: c.source,
    sourceHandle: c.sourcePort,
    target: c.target,
    targetHandle: c.targetPort,
    data: c,
    selected: c.id === selectedId,
    // Item 1b — highlight the cable a compatible Block is being dragged over as
    // the splice target (same glow language as a selected cable; CSS handles it).
    className: c.id === spliceTargetId ? "cable-splice-target" : undefined,
  }));
}

// ── Convert auto-route suggestions to faded "ghost" React Flow edges ──
//
// Ghosts render UNDER the real Cables (they're concatenated FIRST in the edge
// array, so they paint below). The closest suggestion is marked `top` — it is
// drawn brighter, labelled, and is the one Tab/Enter accepts.

function toGhostEdges(
  suggestions: RouteSuggestion[],
  onAccept: (id: string) => void,
): Edge[] {
  return suggestions.map((s, i) => ({
    id: s.id,
    type: "ghost",
    source: s.source,
    sourceHandle: s.sourcePort,
    target: s.target,
    targetHandle: s.targetPort,
    selectable: false,
    deletable: false,
    focusable: false,
    // Paint ABOVE node chassis (T8 live QA 2026-06-06): React Flow edges
    // default under nodes, which left the ghost a barely-visible stub hidden
    // beneath the dragged Block. Suggestions are transient drag feedback —
    // they must read instantly.
    zIndex: 2000,
    data: {
      signalType: s.signalType,
      top: i === 0,
      onAccept,
    } satisfies GhostEdgeData,
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

/**
 * Empty-canvas right-click menu state. Carries both the screen-space anchor
 * (clientX/clientY, for positioning the menu + the QuickAdd popup it can open)
 * and the flow-space cursor position (for landing pasted blocks / new comment
 * boxes AT the cursor).
 */
interface CanvasContextMenuState extends ContextMenuPos {
  flowX: number;
  flowY: number;
}

/**
 * T3 — pending port-typed QuickAdd opened by an ⌥(Alt)+drop of a cable onto
 * empty canvas. Carries the origin port the cable was dragged off plus the
 * flow-space drop point, so the chosen Block is added AT the drop and atomically
 * auto-connected to the origin port (one undoable host action).
 */
interface PendingConnect {
  originNodeId: string;
  originPortId: string;
  /** True when the dragged origin port was an OUTPUT (source) handle. */
  originIsSource: boolean;
  /** Resolved signal type of the origin port → drives the port-typed QuickAdd. */
  originSignalType?: SignalType;
  /** Flow-space drop coords for the new Block (reactFlow.screenToFlowPosition). */
  flowX: number;
  flowY: number;
}

/** The in-flight cable-drag origin, stashed on connect-start for connect-end. */
interface DragOrigin {
  nodeId: string;
  handleId: string;
  /** "source" (output) or "target" (input) — RF FinalConnectionState.fromHandle.type. */
  handleType: "source" | "target";
  /** Resolved signal type of the dragged port (for the port-typed QuickAdd). */
  signalType?: SignalType;
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
  const updateNodePositions = useGraphStore((s) => s.updateNodePositions);
  const updateCommentBoxLayout = useGraphStore((s) => s.updateCommentBoxLayout);
  const setZoomTier = useGraphStore((s) => s.setZoomTier);

  const mode = useAppStore((s) => s.mode);
  const openBlockTab = useAppStore((s) => s.openBlockTab);
  const embeddedEditorNodeId = useAppStore((s) => s.embeddedEditorNodeId);
  const setCanvasHint = useAppStore((s) => s.setCanvasHint);
  const autoTidyOnAdd = useAppStore((s) => s.autoTidyOnAdd);
  const sessionSnap = useAppStore((s) => s.snapToGrid);

  const isEdit = mode === "edit";

  const [contextMenu, setContextMenu] = useState<ContextMenuPos | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<CanvasContextMenuState | null>(
    null,
  );
  const [nodeContextMenu, setNodeContextMenu] =
    useState<NodeContextMenuState | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] =
    useState<EdgeContextMenuState | null>(null);

  // ── Docked-editor drag (Task 4.3) ──
  // Bounds of the free plugin-editor overlay opened by a canvas double-click
  // (anchored at the click, 720×480). Tracked LOCALLY — the embed bounds are a
  // JS-owned property, and deriving the drag here avoids a new store action.
  // Paired with `embeddedEditorNodeId`: set when WE open, cleared the moment the
  // editor closes or its owner changes (incl. an editor opened from the
  // Inspector, which docks to a panel slot and must NOT get a canvas handle).
  const [editorDrag, setEditorDrag] = useState<{
    nodeId: string;
    bounds: EditorBounds;
  } | null>(null);

  // ── T3: ⌥+drop-to-add wiring ──
  // `pendingConnect` (when set) makes the QuickAdd popup port-typed AND routes
  // its pick to a positioned add+auto-connect instead of a plain add. The
  // dragged origin is stashed in a ref on connect-start so connect-end (which
  // RF fires AFTER the drag) can read it without a re-render. A single hint
  // timer auto-clears the transient "hold ⌥" StatusBar nudge.
  const [pendingConnect, setPendingConnect] = useState<PendingConnect | null>(
    null,
  );
  const dragOriginRef = useRef<DragOrigin | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // ── In-place rename editor (triggered by element:start-rename event) ──
  // Cmd+R/Cmd+T on a selected Block or Container dispatches EV_START_RENAME;
  // we render an editable label IN PLACE over the block's header (NOT a
  // centered modal — that collided with the double-click dive gesture and felt
  // detached). `screen` is the block's top-left in screen px (via React Flow's
  // flowToScreenPosition); null when the transform is unavailable (e.g. unit
  // tests) → the editor falls back to a fixed anchor so it still functions.
  const [renameOverlay, setRenameOverlay] = useState<{
    nodeId: string;
    value: string;
    screen: { x: number; y: number } | null;
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

  // Snap-to-grid is ON if EITHER the host canvas flag or the session toolbar
  // toggle is set (Feedback #3b: flip snapping from the toolbar w/o a round-trip).
  const snapEnabled = canvasSnap || sessionSnap;

  // ── Cable-splice (Item 1b) ──
  // While a Block is dragged over a type-compatible cable, that cable id is the
  // splice target (highlighted); dropping splices A→new→B. Kept in a ref (read
  // on drag-stop without re-creating the handler) AND mirrored to state (drives
  // the edge className). Cleared when the drag leaves any cable / ends.
  const [spliceTargetEdgeId, setSpliceTargetEdgeId] = useState<string | null>(
    null,
  );
  const spliceTargetRef = useRef<string | null>(null);
  useEffect(() => {
    spliceTargetRef.current = spliceTargetEdgeId;
  }, [spliceTargetEdgeId]);

  // ── Auto-fit extent (Item 3a-W2) ──
  // The live translate extent. Seeded from the host graphBounds; grows with
  // hysteresis as Blocks approach the edge (never shrinks, never jerks). Mirrored
  // to a ref so the per-frame hysteresis check reads it without re-subscribing.
  const [translateExtent, setTranslateExtent] = useState<Extent>(() =>
    extentForBounds(graphBounds),
  );
  const extentRef = useRef<Extent>(translateExtent);
  useEffect(() => {
    extentRef.current = translateExtent;
  }, [translateExtent]);

  // True while a Block drag is in flight — gates auto-tidy-on-add (never yank a
  // node the user is moving) and the near-edge auto-fit pan (never pan under a
  // live drag). Set on drag-start, cleared on drag-stop.
  const draggingRef = useRef(false);

  // ── Live "intersecting" glow set (Task 2.3, painter-safe) ──
  // The ids of nodes the dragged Block currently overlaps (React Flow
  // getIntersectingNodes). We toggle a `.node-intersecting` CSS CLASS on those
  // nodes — and only when the SET *changes* (not every drag frame) — so the
  // glow is a class flip, never a per-tick inline shadow (painter guard). The
  // ref holds the last-applied set so we can diff cheaply and clear on stop.
  const intersectingRef = useRef<Set<string>>(new Set());

  // Skip the next post-spawn resolve pass once — set right after WE persist a
  // resolve (drag-stop / spawn nudge) so the snapshot that echoes our own move
  // back doesn't re-trigger another pass (and so an ELK-Tidy relayout owns the
  // de-overlap when the toggle is ON). Compared against the live block count.
  const lastSpawnResolveCountRef = useRef(blocks.length);

  // Auto-tidy-on-add debounce timer + the block count at the last settle, so we
  // relayout only on a genuine ADD (count increased), not a delete/move.
  const autoTidyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastBlockCountRef = useRef(blocks.length);
  // .tidy-glide class strip timer (transient transform-transition).
  const glideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlow = useReactFlow();

  // ── Auto-route suggestions (ghost cables shown while dragging) ──
  // `suggestions` is the live list of valid (compatible/free/acyclic) ghost
  // cables for the in-flight drag; empty when not dragging. The throttle ref
  // gates how often the compute runs (see SUGGEST_THROTTLE_MS).
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([]);
  const lastSuggestRef = useRef(0);
  // Per-drag memo of the adjacency + used-port Sets (pure fn of the edges
  // array; topology can't change mid-drag). Reused across throttled ticks and
  // auto-rebuilt by the matcher when the edges identity changes
  // (architect-perf-plan §2.1b). Cleared on drag-stop.
  const suggestCacheRef = useRef<RouteSuggestionCache | null>(null);
  // Keep the latest suggestions in a ref too, so the global key handler and
  // drag-stop can read/accept the top one without being re-created per change.
  const suggestionsRef = useRef<RouteSuggestion[]>([]);
  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  // Drop the canvas drag handle the instant the editor it belongs to is gone or
  // its owner changes — covers Esc/✕/host-push close and an editor re-opened
  // from the Inspector (which docks to a panel slot, not the canvas). The open
  // path sets `editorDrag`; this is the single teardown.
  useEffect(() => {
    if (editorDrag && embeddedEditorNodeId !== editorDrag.nodeId) {
      setEditorDrag(null);
    }
  }, [embeddedEditorNodeId, editorDrag]);

  useEffect(() => {
    setNodes([
      ...toFlowNodes(blocks, selectedNodeId),
      ...toCommentFlowNodes(commentBoxes, selectedNodeId),
    ]);
  }, [blocks, commentBoxes, selectedNodeId, setNodes]);

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
      // A still-loading Block (Phase-4 async load) has no real processor yet —
      // nothing to dive into and no editor to open. Ignore double-click until
      // loadState flips to ready (defense-in-depth over the host's safe no-op).
      if (data.loadState === "loading") return;
      // Real LOCAL Container → dive INTO its nested Board via the engine. The
      // host re-pushes a snapshot with the nested nodes/edges + a deeper
      // breadcrumb, so the canvas + breadcrumb update from snapshot truth — no
      // optimistic client push (the dive-desync fix). A Portal is NOT a real
      // local board (it links an external .elboard), so it must NOT fake a
      // dive — it falls through to the honest "open to edit" affordance below.
      if (data.containerNodeCount != null && !data.isPortal) {
        void nativeEnterContainer(node.id);
        return;
      }
      // Plugin Block: toggle the embedded plugin GUI window (Blueprint §10.1).
      // Double-clicking the Block that already owns the embed CLOSES it (fast
      // dismissal — P1-A), so a double-click is a true open/close toggle rather
      // than a dead-end re-open. Read the owner from the store at call time to
      // avoid a stale closure without widening the dep array.
      if (useAppStore.getState().embeddedEditorNodeId === node.id) {
        setEditorDrag(null);
        void nativePluginEditorClose();
        return;
      }
      // Otherwise anchor a fresh editor near the click with a sensible default
      // size; the host clamps to screen bounds.
      const anchorX = (event as MouseEvent).clientX ?? 80;
      const anchorY = (event as MouseEvent).clientY ?? 80;
      const w = 720;
      const h = 480;
      // Only surface the drag handle once the open actually succeeds (the open
      // path retry-polls and can fail), so the handle never appears for a
      // missing editor. Bounds match exactly what the host received.
      // `Promise.resolve` guards a non-thenable bridge return (e.g. in tests).
      void Promise.resolve(
        nativePluginEditorOpen(node.id, anchorX, anchorY, w, h),
      ).then((ok) => {
        if (ok) {
          setEditorDrag({
            nodeId: node.id,
            bounds: { x: anchorX, y: anchorY, w, h },
          });
        }
      });
    },
    [],
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
    setCanvasMenu(null);
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
      setCanvasMenu(null);
      setNodeContextMenu(null);
      setEdgeContextMenu({
        edgeId: edge.id,
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
      });
    },
    [isEdit, selectEdge],
  );

  // Double-click empty canvas = "navigate UP one level" (gesture spec). Drives
  // the engine exit; the parent board + shortened breadcrumb arrive via the
  // next snapshot. No-op at the top level (host returns false).
  //
  // This is React Flow's RAW `onDoubleClick` (there is no pane-only dbl-click
  // prop in v12), so it ALSO fires when a node is double-clicked — the event
  // bubbles up from the node DOM to the ReactFlow root. Without the guard below
  // a container double-click triggered BOTH onNodeDoubleClick (enterContainer)
  // AND this handler (exitContainer) on the same gesture: the dive was entered
  // then immediately popped → net no-op (the "double-click does not dive" bug).
  // Only act when the double-click landed on empty canvas (the pane / its
  // background / the viewport transform layer), never inside a node/edge/control.
  const onPaneDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".react-flow__node") || target?.closest(".react-flow__edge"))
      return; // node/edge dbl-click — its own handler owns this gesture.
    void nativeExitContainer();
  }, []);

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isEdit) return;
      const clientX = (event as MouseEvent).clientX;
      const clientY = (event as MouseEvent).clientY;
      // Glen QA 2026-06-06 (reverses A2): plain right-click on the EMPTY Board
      // opens the FULL canvas menu — "Add Block…" is its top item and routes to
      // QuickAdd at this same cursor. SHIFT+right-click keeps the speed path
      // (QuickAdd directly). Node/cable context menus are unchanged.
      if ((event as MouseEvent).shiftKey) {
        setContextMenu({ x: clientX, y: clientY });
        setCanvasMenu(null);
        setNodeContextMenu(null);
        setEdgeContextMenu(null);
        return;
      }
      // Capture the flow-space cursor so "Add Comment Box" / "Paste" inside
      // the menu can land at the click point, not the origin.
      const flow = reactFlow.screenToFlowPosition({ x: clientX, y: clientY });
      setCanvasMenu({ x: clientX, y: clientY, flowX: flow.x, flowY: flow.y });
      setContextMenu(null);
      setNodeContextMenu(null);
      setEdgeContextMenu(null);
    },
    [isEdit, reactFlow],
  );

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isEdit || node.type === "comment") return;
      selectNode(node.id);
      setContextMenu(null);
      setCanvasMenu(null);
      setEdgeContextMenu(null);
      setNodeContextMenu({
        nodeId: node.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [isEdit, selectNode],
  );

  // ── Auto-route suggestion lifecycle ──

  const clearSuggestions = useCallback(() => {
    lastSuggestRef.current = 0;
    suggestCacheRef.current = null;
    setSuggestions((prev) => (prev.length === 0 ? prev : []));
    // Drop the T8 discoverability hint with the ghosts (only if it's ours).
    const app = useAppStore.getState();
    if (app.canvasHint?.startsWith("⌘-drop")) app.setCanvasHint(null);
  }, []);

  // Promote a single ghost suggestion to a real Cable via the existing bridge.
  // The new cable arrives authoritatively on the next engine snapshot (we never
  // fabricate the Cable locally), so we only fire the connect + clear ghosts.
  const acceptSuggestion = useCallback(
    (ghostId: string) => {
      const s = suggestionsRef.current.find((x) => x.id === ghostId);
      if (!s) return;
      void nativeGraphConnect(s.source, s.sourcePort, s.target, s.targetPort);
      clearSuggestions();
    },
    [clearSuggestions],
  );

  // ── Tidy (Item 3b) ──
  // Apply the transient .tidy-glide transform-transition class to the named
  // nodes (or all, when ids is undefined) so their move to new positions GLIDES
  // rather than teleports, then strip it after the glide completes. Class-based
  // + transform-only → no per-tick painter style, perf guardrails stay green.
  const applyTidyGlide = useCallback(
    (ids?: Set<string>) => {
      if (glideTimerRef.current !== undefined) clearTimeout(glideTimerRef.current);
      reactFlow.setNodes((nds) =>
        nds.map((n) =>
          (!ids || ids.has(n.id)) && !n.className?.includes("tidy-glide")
            ? { ...n, className: `${n.className ?? ""} tidy-glide`.trim() }
            : n,
        ),
      );
      glideTimerRef.current = setTimeout(() => {
        reactFlow.setNodes((nds) =>
          nds.map((n) =>
            n.className?.includes("tidy-glide")
              ? {
                  ...n,
                  className: n.className.replace(/\s*tidy-glide/g, "").trim(),
                }
              : n,
          ),
        );
        glideTimerRef.current = undefined;
      }, TIDY_GLIDE_MS);
    },
    [reactFlow],
  );

  // Relayout the current Board via the existing deterministic layered layout,
  // then persist the new positions through the host (single batch op). Blocks
  // glide to place. No-op on an empty Board (honest — nothing to tidy).
  const runTidy = useCallback(() => {
    const { nodes: storeNodes, edges: storeEdges } = useGraphStore.getState();
    const positions = computeAutoLayout(storeNodes, storeEdges);
    if (positions.length === 0) return;
    applyTidyGlide();
    // Optimistically move locally so the glide animates immediately, then push
    // to the host (authoritative positions arrive on the next snapshot).
    updateNodePositions(positions);
    void nativeGraphMoveNodes(positions);
  }, [applyTidyGlide, updateNodePositions]);

  // ── Intersecting-glow class toggle (Task 2.3, painter-safe) ──
  // Apply `.node-intersecting` to exactly the nodes in `next`, and remove it
  // from any node that just left the set. We DIFF against intersectingRef and
  // bail when the set is unchanged, so this writes to React Flow's node array
  // ONLY on a genuine enter/leave transition — never on every drag frame. The
  // glow itself is a single static CSS rule (no inline shadow), so the painter
  // guards stay green. Empty `next` clears the glow.
  const applyIntersectingClass = useCallback(
    (next: Set<string>) => {
      const prev = intersectingRef.current;
      if (prev.size === next.size) {
        let identical = true;
        for (const id of next) {
          if (!prev.has(id)) {
            identical = false;
            break;
          }
        }
        if (identical) return; // set unchanged → no DOM/React write this frame.
      }
      intersectingRef.current = next;
      // Defensive optional-access (mirrors flowToScreenPosition) so a non-RF
      // environment is a no-op rather than a throw.
      const setNodesFn = (
        reactFlow as unknown as {
          setNodes?: (updater: (nds: Node[]) => Node[]) => void;
        }
      ).setNodes;
      if (typeof setNodesFn !== "function") return;
      setNodesFn((nds) =>
        nds.map((n) => {
          const want = next.has(n.id);
          const has = n.className?.includes("node-intersecting") ?? false;
          if (want === has) return n; // class already correct — no-op.
          const base = (n.className ?? "")
            .replace(/\s*node-intersecting/g, "")
            .trim();
          return {
            ...n,
            className: want ? `${base} node-intersecting`.trim() : base,
          };
        }),
      );
    },
    [reactFlow],
  );

  // Drag-start: mark a drag in flight + cancel any pending auto-tidy pass. This
  // is constraint (d) — "a manual drag DURING the debounce window cancels that
  // relayout pass" — so a deliberately-moved Block is never yanked back (Q3).
  const onNodeDragStart = useCallback((_event: MouseEvent, node: Node) => {
    if (node.type === "comment") return;
    draggingRef.current = true;
    if (autoTidyTimerRef.current !== undefined) {
      clearTimeout(autoTidyTimerRef.current);
      autoTidyTimerRef.current = undefined;
    }
  }, []);

  // While a Block is dragged, (throttled) recompute the ghost suggestions from
  // the LIVE drag position. React Flow mutates `nodes` in place during the
  // drag, so we overlay the live RF positions/sizes onto the store's BlockData
  // (which carries the ports + signal types) before running the pure matcher.
  const onNodeDrag: OnNodeDrag = useCallback(
    (_event, node) => {
      if (!isEdit || node.type === "comment") {
        if (suggestionsRef.current.length > 0) clearSuggestions();
        if (spliceTargetRef.current !== null) setSpliceTargetEdgeId(null);
        if (intersectingRef.current.size > 0) applyIntersectingClass(new Set());
        return;
      }
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - lastSuggestRef.current < SUGGEST_THROTTLE_MS) return;
      lastSuggestRef.current = now;

      // Live positions/sizes from the in-flight React Flow node graph.
      const rfNodes = reactFlow.getNodes();
      const livePos = new Map<string, { x: number; y: number }>();
      const measured = new Map<string, { width: number; height: number }>();
      for (const n of rfNodes) {
        if (n.type === "comment") continue;
        livePos.set(n.id, { x: n.position.x, y: n.position.y });
        const w = n.measured?.width;
        const h = n.measured?.height;
        if (typeof w === "number" && typeof h === "number") {
          measured.set(n.id, { width: w, height: h });
        }
      }

      const liveBlocks: BlockData[] = useGraphStore
        .getState()
        .nodes.map((b) => {
          const p = livePos.get(b.id);
          return p ? { ...b, position: p } : b;
        });

      const liveEdges = useGraphStore.getState().edges;
      // Reuse the adjacency + used-port Sets across the drag — rebuilt only if
      // the edges identity changed (topology never changes mid-drag).
      suggestCacheRef.current = buildRouteSuggestionCache(
        liveEdges,
        suggestCacheRef.current,
      );
      const next = computeRouteSuggestions(
        node.id,
        liveBlocks,
        liveEdges,
        measured,
        suggestCacheRef.current,
      );
      setSuggestions(next);

      // ── Cable-splice hit-test (Item 1b) ──
      // Find the type-compatible cable the dragged Block is hovering over (its
      // centre within the hit radius of the cable's segment). Build each cable's
      // geometry from the LIVE source/target node centres. Highlight the single
      // best candidate; the drop handler reads spliceTargetRef. The dragged
      // block must have a compatible in AND out for that signal (NOTHING-fake —
      // canBlockSpliceCable enforces it inside findSpliceCandidate).
      const draggedBlock = liveBlocks.find((b) => b.id === node.id);
      let spliceId: string | null = null;
      if (draggedBlock) {
        const centerOf = (id: string) => {
          const p = livePos.get(id);
          if (!p) return null;
          const m = measured.get(id);
          return {
            x: p.x + (m ? m.width / 2 : 0),
            y: p.y + (m ? m.height / 2 : 0),
          };
        };
        const dragCenter = centerOf(node.id);
        if (dragCenter) {
          const geoms: CableGeometry[] = [];
          for (const e of liveEdges) {
            const a = centerOf(e.source);
            const b = centerOf(e.target);
            if (!a || !b) continue;
            geoms.push({
              id: e.id,
              source: e.source,
              target: e.target,
              signalType: e.signalType,
              a,
              b,
            });
          }
          spliceId = findSpliceCandidate(draggedBlock, dragCenter, geoms);
        }
      }
      if (spliceId !== spliceTargetRef.current) setSpliceTargetEdgeId(spliceId);

      // ── Live intersecting-glow set (Task 2.3) ──
      // Ask React Flow which nodes the dragged Block currently overlaps and
      // toggle the `.node-intersecting` class on them. applyIntersectingClass
      // diffs the set and writes nodes ONLY on an enter/leave change, so this
      // is cheap (no per-frame node-array churn) and painter-safe (a class, not
      // an inline shadow). Comment frames are excluded from the glow set.
      const getIntersecting = (
        reactFlow as unknown as {
          getIntersectingNodes?: (n: Node, partially?: boolean) => Node[];
        }
      ).getIntersectingNodes;
      if (typeof getIntersecting === "function") {
        const hits = getIntersecting(node, true);
        const hitSet = new Set<string>();
        for (const h of hits) {
          if (h.type === "comment") continue;
          hitSet.add(h.id);
        }
        // Include the dragged node itself so BOTH sides of an overlap glow.
        if (hitSet.size > 0) hitSet.add(node.id);
        applyIntersectingClass(hitSet);
      }

      // Discoverability (T8): advertise the accept gestures in the status
      // footer while ghosts are live; clear when they vanish mid-drag.
      const app = useAppStore.getState();
      if (next.length > 0) {
        app.setCanvasHint("⌘-drop to auto-connect · Tab/Enter accept · Esc dismiss");
      } else if (
        suggestionsRef.current.length > 0 &&
        app.canvasHint?.startsWith("⌘-drop")
      ) {
        app.setCanvasHint(null);
      }
    },
    [isEdit, reactFlow, clearSuggestions, applyIntersectingClass],
  );

  const onNodeDragStop = useCallback(
    (
      event: MouseEvent | globalThis.MouseEvent,
      node: Node,
      draggedNodes?: Node[],
    ) => {
      draggingRef.current = false;

      // ── Cable-splice on drop (Item 1b) ──
      // If the Block was dropped onto a highlighted compatible cable, splice it
      // into that chain (A→new→B) by composing the existing disconnect/connect
      // natives. Takes precedence over the ghost-accept path (the user aimed at a
      // cable). The three ops are independent undo steps (no compound-undo bridge
      // — documented in the report). The new topology arrives on the next
      // snapshot; we still persist the moved position below so the block sits
      // where it was dropped.
      const spliceEdgeId = spliceTargetRef.current;
      setSpliceTargetEdgeId(null);
      if (spliceEdgeId && node.type !== "comment") {
        const cable = useGraphStore
          .getState()
          .edges.find((e) => e.id === spliceEdgeId);
        const block = useGraphStore
          .getState()
          .nodes.find((b) => b.id === node.id);
        if (cable && block) {
          // Splice the block into the cable as ONE undoable operation: the host
          // posts a single SpliceConnectionMessage (remove A→B, add A→new, add
          // new→B) which GuiService performs in one undo transaction, so a
          // single undo restores the cable (task #23 / Glen Q7 "seamless").
          const atomic = planSpliceAtomic(block, cable);
          if (atomic) {
            void nativeGraphSpliceCable(
              atomic.aId,
              atomic.aPort,
              atomic.newId,
              atomic.newInPort,
              atomic.newOutPort,
              atomic.bId,
              atomic.bPort,
            );
          }
        }
        // A splice supersedes ghost suggestions — discard them, don't also wire.
        clearSuggestions();
        applyIntersectingClass(new Set()); // drop the live overlap glow on stop.
        const p = node.position;
        updateNodePositions([{ id: node.id, x: p.x, y: p.y }]);
        void nativeGraphMoveNodes([{ id: node.id, x: p.x, y: p.y }]);
        return;
      }

      // Accept-on-drop — mirrors the JUCE BlockComponent::mouseUp contract:
      // dropping with the modifier key (Cmd / Ctrl) held APPLIES the ghost
      // suggestions; a plain drop just discards them. This keeps the user in
      // control — repositioning a Block never silently auto-wires it. JUCE
      // applies ALL pending ghosts, so we do too.
      const accept =
        node.type !== "comment" &&
        (Boolean((event as MouseEvent | globalThis.MouseEvent).metaKey) ||
          Boolean((event as MouseEvent | globalThis.MouseEvent).ctrlKey));
      if (accept) {
        for (const s of suggestionsRef.current) {
          void nativeGraphConnect(s.source, s.sourcePort, s.target, s.targetPort);
        }
      }
      clearSuggestions();
      // Drop the live overlap glow the instant the drag ends (the resolve below
      // makes the overlap go away anyway, but clear the class immediately).
      applyIntersectingClass(new Set());

      // React Flow fires onNodeDragStop ONCE per drag operation but passes
      // all participating nodes as `draggedNodes` (the primary plus every
      // co-selected sibling). Without iterating that list, multi-select
      // drag persists only the primary node — sibling positions get reset
      // on the next snapshot sync.
      const all =
        draggedNodes && draggedNodes.length > 0 ? draggedNodes : [node];

      const blockMoves: Array<{ id: string; x: number; y: number }> = [];
      const draggedBlockIds = new Set<string>();
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
          draggedBlockIds.add(n.id);
        }
      }

      // ── No-overlap resolve on drop (Task 2.3) — ONE-SHOT, not per-tick ──
      // Owner feedback #1: Blocks must never end up overlapping. Run the pure
      // rectangular resolver ONCE here on drag-STOP (never in onNodeDrag — a
      // per-tick resolve is a perf regression AND fights ELK Tidy). The
      // just-dropped Block(s) are the movable set; every other Block is pinned,
      // so a Block dropped ON a neighbour is the one nudged clear (the neighbour
      // stays put). resolveCollisions is pure + framework-free; we feed it the
      // live measured AABBs and persist only the positions that actually moved.
      let finalBlockMoves = blockMoves;
      // Only resolve a SINGLE-Block drop. A multi-select drag is a deliberate
      // GROUP move — the user arranged those Blocks relative to each other, so
      // we must not reflow them against one another here (that's ELK Tidy's job
      // / the user's). The plan's acceptance is the single "dropped a Block ON
      // another" case. getNodes is accessed defensively (mirrors the
      // flowToScreenPosition optional-access pattern) so a non-RF environment
      // simply skips the nudge rather than throwing.
      const getNodesFn = (
        reactFlow as unknown as { getNodes?: () => Node[] }
      ).getNodes;
      if (
        draggedBlockIds.size === 1 &&
        blockMoves.length === 1 &&
        typeof getNodesFn === "function"
      ) {
        const moved = blockMoves[0];
        // Live rects, with the just-dropped position applied (RF mutates node
        // positions in place during a drag, but be explicit so a stale frame
        // can't feed the resolver an old position).
        const rects = collisionRectsFromNodes(getNodesFn.call(reactFlow)).map(
          (r) => (r.id === moved.id ? { ...r, x: moved.x, y: moved.y } : r),
        );
        if (rects.length > 1 && rects.some((r) => r.id === moved.id)) {
          // Pin every OTHER Block → only the dropped Block moves to clear an
          // overlap (the neighbour it landed on stays put).
          const fixed = new Set(
            rects.map((r) => r.id).filter((id) => id !== moved.id),
          );
          const resolved = resolveCollisions(rects, {
            margin: COLLISION_MARGIN,
            fixed,
          });
          const r = resolved.find((x) => x.id === moved.id);
          if (r) {
            // Snap to whole px so positions stay clean/deterministic.
            finalBlockMoves = [
              { id: moved.id, x: Math.round(r.x), y: Math.round(r.y) },
            ];
          }
        }
      }

      if (finalBlockMoves.length > 0) {
        // Mark our own move so the snapshot echo doesn't re-trigger the spawn
        // resolve pass (the count is unchanged by a move, but keep the marker
        // in sync defensively).
        lastSpawnResolveCountRef.current = useGraphStore.getState().nodes.length;
        updateNodePositions(finalBlockMoves);
        void nativeGraphMoveNodes(finalBlockMoves);
      }
    },
    [
      updateNodePositions,
      updateCommentBoxLayout,
      clearSuggestions,
      applyIntersectingClass,
      reactFlow,
    ],
  );

  // Real Cables + (while dragging) ghost suggestions. Ghosts are concatenated
  // FIRST so they paint UNDER the real Cables. Re-runs when either changes.
  useEffect(() => {
    setEdges([
      ...toGhostEdges(suggestions, acceptSuggestion),
      ...toFlowEdges(cables, selectedEdgeId, spliceTargetEdgeId),
    ]);
  }, [
    cables,
    selectedEdgeId,
    spliceTargetEdgeId,
    suggestions,
    acceptSuggestion,
    setEdges,
  ]);

  // Keyboard accept/dismiss for ghost suggestions — only bound while at least
  // one suggestion is live (so it never shadows global shortcuts at rest).
  // Tab / Enter accept the TOP (closest) suggestion; Escape dismisses them all.
  const hasSuggestions = suggestions.length > 0;
  useEffect(() => {
    if (!hasSuggestions) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key === "Enter") {
        const top = suggestionsRef.current[0];
        if (!top) return;
        e.preventDefault();
        acceptSuggestion(top.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearSuggestions();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hasSuggestions, acceptSuggestion, clearSuggestions]);

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    const sh = conn.sourceHandle ?? "out-0";
    const th = conn.targetHandle ?? "in-0";
    void nativeGraphConnect(conn.source, sh, conn.target, th);
  }, []);

  // ── T3: ⌥+drop a cable on empty canvas → port-typed QuickAdd → add+connect ──

  // Show a transient StatusBar nudge that auto-clears after `ms`. Any newer hint
  // (or an explicit clear) cancels the pending timer so they never stack.
  const showTransientHint = useCallback(
    (hint: string, ms: number) => {
      if (hintTimerRef.current !== undefined) clearTimeout(hintTimerRef.current);
      setCanvasHint(hint);
      hintTimerRef.current = setTimeout(() => {
        setCanvasHint(null);
        hintTimerRef.current = undefined;
      }, ms);
    },
    [setCanvasHint],
  );

  // connect-start: stash the dragged origin (node + handle + resolved signal
  // type) and surface the live drag affordance. The signal type is read from the
  // origin Block's real port data so the QuickAdd can filter to compatible
  // Blocks (NOTHING fake — the port type comes from the engine snapshot).
  const onConnectStart: OnConnectStart = useCallback(
    (_event, params) => {
      if (hintTimerRef.current !== undefined) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = undefined;
      }
      const nodeId = params.nodeId ?? undefined;
      const handleId = params.handleId ?? undefined;
      const handleType = params.handleType ?? undefined;
      if (!nodeId || !handleId || !handleType) {
        dragOriginRef.current = null;
        return;
      }
      const block = useGraphStore
        .getState()
        .nodes.find((n) => n.id === nodeId);
      const signalType = block?.ports.find((p) => p.id === handleId)?.type;
      dragOriginRef.current = { nodeId, handleId, handleType, signalType };
      setCanvasHint(
        "Drop on a port to connect · hold ⌥ and release to add a block",
      );
    },
    [setCanvasHint],
  );

  // connect-end: RF reports whether the drag landed on a valid handle. On a
  // valid drop we do nothing (RF fires onConnect → nativeGraphConnect). On an
  // empty-canvas release WITH ⌥ held we open a port-typed QuickAdd at the cursor
  // and stash the pending add+connect; without ⌥ we just nudge. The live
  // drag hint is always cleared on end.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const origin = dragOriginRef.current;
      dragOriginRef.current = null;

      if (connectionState.isValid === true) {
        setCanvasHint(null);
        return; // RF will fire onConnect for the real cable.
      }

      const altHeld = Boolean(
        (event as MouseEvent | TouchEvent & { altKey?: boolean }).altKey,
      );

      if (altHeld && origin) {
        const clientX =
          "clientX" in event
            ? event.clientX
            : (event.changedTouches?.[0]?.clientX ?? 0);
        const clientY =
          "clientY" in event
            ? event.clientY
            : (event.changedTouches?.[0]?.clientY ?? 0);
        const flow = reactFlow.screenToFlowPosition({ x: clientX, y: clientY });
        setPendingConnect({
          originNodeId: origin.nodeId,
          originPortId: origin.handleId,
          originIsSource: origin.handleType === "source",
          originSignalType: origin.signalType,
          flowX: flow.x,
          flowY: flow.y,
        });
        setContextMenu({ x: clientX, y: clientY });
        setCanvasHint(null);
        return;
      }

      // Plain empty-canvas release — teach the ⌥ affordance, then auto-clear.
      showTransientHint("Hold ⌥ next time to add a block here", 2500);
    },
    [reactFlow, setCanvasHint, showTransientHint],
  );

  // Clear any pending hint timer on unmount.
  useEffect(
    () => () => {
      if (hintTimerRef.current !== undefined) clearTimeout(hintTimerRef.current);
    },
    [],
  );

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) {
      const sh = e.sourceHandle ?? "out-0";
      const th = e.targetHandle ?? "in-0";
      void nativeGraphDisconnect(e.source, sh, e.target, th);
    }
  }, []);

  // ── Snippet drop-target (Item 4a-iii / U6) ──
  // Accept a Snippet dragged from the SnippetShelf (the C-worker's drag contract
  // in lib/snippetDrag). onDragOver must preventDefault + set dropEffect so the
  // browser permits the drop; onDrop deserializes the payload and inserts the
  // molecule AT the drop point via the existing nativeMoleculeInsert(name,x,y).
  const onSnippetDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!isEdit || !isSnippetDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [isEdit],
  );

  const onSnippetDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!isEdit) return;
      const payload = parseSnippetDrop(event.dataTransfer);
      if (!payload) return; // not our drag — leave for any other handler
      event.preventDefault();
      const flow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      void nativeMoleculeInsert(payload.name, flow.x, flow.y);
      // G6 latency-mask: snapshot the current node ids; after a short delay
      // (covering the C++ insert) tag whatever is NEW with the .snippet-dropin
      // scale-up spring, then strip it. Best-effort — purely cosmetic.
      const before = new Set(useGraphStore.getState().nodes.map((n) => n.id));
      window.setTimeout(() => {
        const added = useGraphStore
          .getState()
          .nodes.filter((n) => !before.has(n.id))
          .map((n) => n.id);
        if (added.length === 0) return;
        const addedSet = new Set(added);
        reactFlow.setNodes((nds) =>
          nds.map((n) =>
            addedSet.has(n.id) && !n.className?.includes("snippet-dropin")
              ? { ...n, className: `${n.className ?? ""} snippet-dropin`.trim() }
              : n,
          ),
        );
        window.setTimeout(() => {
          reactFlow.setNodes((nds) =>
            nds.map((n) =>
              n.className?.includes("snippet-dropin")
                ? {
                    ...n,
                    className: n.className
                      .replace(/\s*snippet-dropin/g, "")
                      .trim(),
                  }
                : n,
            ),
          );
        }, SNIPPET_DROPIN_MS);
      }, 120);
    },
    [isEdit, reactFlow],
  );

  // ── Minimap node colour ──

  const minimapNodeColor = useCallback((node: Node) => {
    if (node.type === "comment") return "#5C5C62";
    const cat = (node.data as Record<string, unknown>)?.category as string;
    return categoryColor[cat] ?? "#8E8E93";
  }, []);

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
      // Anchor the editor at the block's on-screen position so it appears IN
      // PLACE over the block header. flowToScreenPosition may be absent in
      // non-RF environments (unit tests) — degrade to a null anchor (fixed
      // fallback in the render) rather than throwing.
      let screen: { x: number; y: number } | null = null;
      const toScreen = (
        reactFlow as unknown as {
          flowToScreenPosition?: (p: { x: number; y: number }) => {
            x: number;
            y: number;
          };
        }
      ).flowToScreenPosition;
      if (typeof toScreen === "function" && node.position) {
        try {
          screen = toScreen({ x: node.position.x, y: node.position.y });
        } catch {
          screen = null;
        }
      }
      setRenameOverlay({ nodeId, value: node.name, screen });
    };

    const handleTidy = () => runTidy();

    window.addEventListener(EV_FIT_BOARD, handleFitBoard);
    window.addEventListener(EV_CREATE_COMMENT, handleCreateComment);
    window.addEventListener(EV_START_RENAME, handleStartRename);
    window.addEventListener(EV_TIDY, handleTidy);
    return () => {
      window.removeEventListener(EV_FIT_BOARD, handleFitBoard);
      window.removeEventListener(EV_CREATE_COMMENT, handleCreateComment);
      window.removeEventListener(EV_START_RENAME, handleStartRename);
      window.removeEventListener(EV_TIDY, handleTidy);
    };
  }, [reactFlow, runTidy]);

  // ── Auto-tidy on add (Item 3b, Glen Q3 — ON by default) ──
  // Fire a debounced animated relayout ONLY when the block COUNT increases (a
  // genuine ADD), never on a delete/move. Constraints: (a) ADD-only; (b) the
  // relayout animates (runTidy applies the glide); (c) the toggle disables it;
  // (d) a manual drag mid-debounce cancels the pending pass (onNodeDragStart +
  // the draggingRef guard below). A drag in flight at fire-time also aborts.
  useEffect(() => {
    const prev = lastBlockCountRef.current;
    lastBlockCountRef.current = blocks.length;
    if (!autoTidyOnAdd) return;
    if (blocks.length <= prev) return; // not an add (delete/move/no-op)
    if (draggingRef.current) return; // never relayout under a live drag
    if (autoTidyTimerRef.current !== undefined) {
      clearTimeout(autoTidyTimerRef.current);
    }
    autoTidyTimerRef.current = setTimeout(() => {
      autoTidyTimerRef.current = undefined;
      // Re-check at fire-time: a drag that began during the debounce cancels.
      if (draggingRef.current) return;
      runTidy();
    }, AUTO_TIDY_DEBOUNCE_MS);
  }, [blocks.length, autoTidyOnAdd, runTidy]);

  // ── No-overlap on new-Block spawn (Task 2.3, part b) ──
  // A freshly-added Block must never spawn overlapping an existing one (owner
  // feedback #1 + the spawn-position defect). When ELK "Tidy"-on-add is ON it
  // already relayouts the whole Board (and guarantees no overlap), so we ONLY
  // run the spawn nudge when Tidy is OFF — otherwise the two would fight (the
  // resolve is the per-add layer UNDER ELK, never a competing relayout). On a
  // genuine ADD (count increased) we resolve the NEW Block(s) against the
  // existing ones (existing pinned) and persist only the new Block(s) that
  // actually had to move. Deferred a frame so React Flow has measured the new
  // node's real size before we compute its AABB.
  const spawnResolveTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  useEffect(() => {
    const prev = lastSpawnResolveCountRef.current;
    lastSpawnResolveCountRef.current = blocks.length;
    if (autoTidyOnAdd) return; // ELK Tidy owns de-overlap when it's ON.
    if (blocks.length <= prev) return; // not an add (delete/move/no-op).
    if (draggingRef.current) return; // never nudge under a live drag.
    if (spawnResolveTimerRef.current !== undefined) {
      clearTimeout(spawnResolveTimerRef.current);
    }
    const addedCount = blocks.length - prev;
    spawnResolveTimerRef.current = setTimeout(() => {
      spawnResolveTimerRef.current = undefined;
      if (draggingRef.current) return; // a drag began during the defer.
      const rfNodes = reactFlow.getNodes();
      const rects = collisionRectsFromNodes(rfNodes);
      if (rects.length <= 1) return;
      // The NEW Blocks are the LAST `addedCount` in snapshot order (the host
      // appends added nodes), which RF preserves. Resolve those, pin the rest.
      const storeNodes = useGraphStore.getState().nodes;
      const newIds = new Set(
        storeNodes.slice(Math.max(0, storeNodes.length - addedCount)).map(
          (n) => n.id,
        ),
      );
      const fixed = new Set(
        rects.map((r) => r.id).filter((id) => !newIds.has(id)),
      );
      const resolved = resolveCollisions(rects, {
        margin: COLLISION_MARGIN,
        fixed,
      });
      // Persist only the NEW Blocks whose position actually changed.
      const moves: Array<{ id: string; x: number; y: number }> = [];
      const origById = new Map(rects.map((r) => [r.id, r]));
      for (const r of resolved) {
        if (!newIds.has(r.id)) continue;
        const o = origById.get(r.id);
        const nx = Math.round(r.x);
        const ny = Math.round(r.y);
        if (!o || o.x !== nx || o.y !== ny) moves.push({ id: r.id, x: nx, y: ny });
      }
      if (moves.length > 0) {
        updateNodePositions(moves);
        void nativeGraphMoveNodes(moves);
      }
    }, 120);
  }, [blocks.length, autoTidyOnAdd, reactFlow, updateNodePositions]);

  // Clear the auto-tidy/glide timers on unmount.
  useEffect(
    () => () => {
      if (autoTidyTimerRef.current !== undefined) {
        clearTimeout(autoTidyTimerRef.current);
      }
      if (glideTimerRef.current !== undefined) {
        clearTimeout(glideTimerRef.current);
      }
      if (spawnResolveTimerRef.current !== undefined) {
        clearTimeout(spawnResolveTimerRef.current);
      }
    },
    [],
  );

  // ── Auto-fit extent with hysteresis (Item 3a-W2, G4) ──
  // As block bounds change (add/move settle → graphBounds updates from the
  // snapshot), grow the translate extent ONLY when a block creeps within the
  // ~100px band (nextAutoFitExtent returns null otherwise → hold steady, no
  // jerk). Never expand under a live drag (a cable/node drag near the edge must
  // not trigger a pan). The grown extent is monotonic (never shrinks).
  useEffect(() => {
    if (draggingRef.current) return;
    const next = nextAutoFitExtent(extentRef.current, graphBounds);
    if (next) setTranslateExtent(next);
  }, [graphBounds]);

  // WKWebView zoom sharpness: promote the viewport to a GPU layer ONLY while a
  // pan/zoom gesture is in flight, and explicitly demote it when the gesture
  // ends. The demotion is the important half — it forces WebKit to drop its
  // cached layer bitmap and re-rasterize the canvas subtree at the FINAL
  // effective scale, so Blocks/labels are crisp at any zoom. (A permanent
  // `will-change: transform` made WebKit keep a ~1x bitmap and stretch it —
  // the "blurry when zoomed" defect. Chrome re-rasterizes per scale, so this
  // only ever showed in the real JUCE WKWebView host.)
  const viewportLayerPromotedRef = useRef(false);
  const setViewportWillChange = useCallback((value: "transform" | "auto") => {
    const el = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (el) el.style.willChange = value;
    viewportLayerPromotedRef.current = value === "transform";
  }, []);

  // ── Debounced zoom-tier update fired during active pan/zoom ──
  const onViewportMove = useCallback(
    (
      _event: globalThis.MouseEvent | globalThis.TouchEvent | null,
      vp: Viewport,
    ) => {
      if (!viewportLayerPromotedRef.current) setViewportWillChange("transform");
      if (zoomTierTimerRef.current !== undefined) {
        clearTimeout(zoomTierTimerRef.current);
      }
      zoomTierTimerRef.current = setTimeout(() => {
        setZoomTier(zoomToTier(vp.zoom));
      }, 80);
    },
    [setZoomTier, setViewportWillChange],
  );

  const onViewportMoveEnd = useCallback(
    (
      _event: globalThis.MouseEvent | globalThis.TouchEvent | null,
      vp: Viewport,
    ) => {
      // Demote the viewport layer → WebKit re-rasterizes crisp at this zoom.
      setViewportWillChange("auto");
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
    <div
      className="w-full h-full relative"
      onDragOver={onSnippetDragOver}
      onDrop={onSnippetDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStart={isEdit ? onNodeDragStart : undefined}
        onNodeDrag={isEdit ? onNodeDrag : undefined}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onConnect={isEdit ? onConnect : undefined}
        onConnectStart={isEdit ? onConnectStart : undefined}
        onConnectEnd={isEdit ? onConnectEnd : undefined}
        onEdgesDelete={isEdit ? onEdgesDelete : undefined}
        nodesDraggable={isEdit}
        nodesConnectable={isEdit}
        elementsSelectable={true}
        selectionOnDrag={isEdit}
        // D1 (Glen feel-test): SELECT is the primary cursor — left-drag on the
        // pane draws a marquee, not a pan. Panning ("grab") is the middle/right
        // mouse button, or hold Space and drag — never the bare left button.
        // This is React Flow's official "Figma-like" recipe. Perform mode has no
        // marquee, so left-drag there stays a pan for navigation.
        panOnDrag={isEdit ? [1, 2] : true}
        panActivationKeyCode="Space"
        selectionMode={SelectionMode.Partial}
        snapToGrid={snapEnabled}
        snapGrid={[gridSize, gridSize]}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        // A3/F2 — surgical zoom range. 0.1 → whole-board overview on huge
        // boards; 3.0 → port-level close work. The old 1.3-ish feel came from
        // the WKWebView blur defect, which the promote/demote will-change fix
        // below resolved — there is no longer a reason to cap viewing zoom.
        minZoom={0.1}
        maxZoom={3.0}
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
                Right-click for Board actions · Shift+right-click to quick-add a Block
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Docked-editor titlebar (Task 4.3) — the free plugin-editor overlay
          opened by a canvas double-click is a borderless native component with
          NO window chrome, so it "cannot be moved". This strip is its titlebar:
          grab + drag to reposition the overlay live (via nativePluginEditor
          SetBounds), plus pop-out-to-float and close affordances. Only shown for
          the canvas-opened editor (we own its bounds locally); an editor docked
          into the Inspector slot falls back to the ✕ pill below. */}
      {editorDrag && embeddedEditorNodeId === editorDrag.nodeId && (
        <EditorDragHandle
          title={
            blocks.find((b) => b.id === editorDrag.nodeId)?.name ??
            "Plugin editor"
          }
          bounds={editorDrag.bounds}
          onCommit={(x, y) =>
            setEditorDrag((prev) =>
              prev ? { ...prev, bounds: { ...prev.bounds, x, y } } : prev,
            )
          }
        />
      )}

      {/* Embedded-editor close affordance (P1-A) — a small ✕ pill pinned
          top-centre while a plugin editor is embedded WITHOUT a canvas drag
          handle (e.g. opened from the Inspector slot), so the editor is never a
          dead-end (it can also be dismissed via Esc or a double-click on its
          Block). Only the pill captures clicks; the canvas stays interactive. */}
      {embeddedEditorNodeId && embeddedEditorNodeId !== editorDrag?.nodeId && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
          <button
            type="button"
            onClick={() => void nativePluginEditorClose()}
            title="Close plugin editor (Esc)"
            aria-label="Close plugin editor"
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-panel border border-white/10 px-2.5 py-1 text-[10px] font-medium text-text-secondary shadow-[4px_4px_16px_rgba(0,0,0,0.45)] hover:text-text-primary hover:border-white/20 transition-colors"
          >
            <span className="truncate max-w-[180px]">
              {blocks.find((b) => b.id === embeddedEditorNodeId)?.name ??
                "Plugin editor"}
            </span>
            <span aria-hidden className="text-[12px] leading-none">
              ✕
            </span>
          </button>
        </div>
      )}

      {/* Empty-canvas contextual menu — "Add Block…" routes to QuickAdd below */}
      {canvasMenu && (
        <CanvasContextMenu
          position={{ x: canvasMenu.x, y: canvasMenu.y }}
          flowPosition={{ x: canvasMenu.flowX, y: canvasMenu.flowY }}
          onAddBlock={() => {
            // Hand off to the existing QuickAdd popup at the same cursor anchor.
            setContextMenu({ x: canvasMenu.x, y: canvasMenu.y });
            setCanvasMenu(null);
          }}
          onClose={() => setCanvasMenu(null)}
        />
      )}

      {/* QuickAdd context menu. Opened either from the canvas menu's "Add
          Block…" (generic) OR from a T3 ⌥+drop of a cable (port-typed: filtered
          to compatible Blocks, and its pick routes to a positioned add +
          auto-connect via `onPick`). */}
      {contextMenu && (
        <QuickAddPopup
          x={contextMenu.x}
          y={contextMenu.y}
          portType={pendingConnect?.originSignalType}
          onPick={
            pendingConnect
              ? (pluginId) => {
                  void nativeGraphAddPluginConnected(
                    pluginId,
                    pendingConnect.flowX,
                    pendingConnect.flowY,
                    pendingConnect.originNodeId,
                    pendingConnect.originPortId,
                    pendingConnect.originIsSource,
                  );
                  setPendingConnect(null);
                  setContextMenu(null);
                }
              : undefined
          }
          onClose={() => {
            setContextMenu(null);
            setPendingConnect(null);
          }}
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

      {/* In-place rename editor — triggered by Cmd+R/Cmd+T (EV_START_RENAME)
          on a selected Block or Container. Renders the editable label AT the
          block's on-screen position (over its header), NOT as a centered modal
          and NOT on double-click (double-click is the dive-into-Container
          gesture). Key-trapped so a keystroke never leaks to a global shortcut
          (e.g. Space=play): Enter commits via nativeGraphRenameNode, Esc
          reverts, blur dismisses. When the React Flow transform is unavailable
          (unit tests) `screen` is null → a fixed top-centre fallback anchor. */}
      {renameOverlay && (
        <div
          className={
            renameOverlay.screen
              ? "absolute z-[9999]"
              : "absolute left-1/2 top-16 -translate-x-1/2 z-[9999]"
          }
          style={
            renameOverlay.screen
              ? {
                  left: renameOverlay.screen.x,
                  top: renameOverlay.screen.y,
                }
              : undefined
          }
          data-testid="rename-inplace"
        >
          <input
            ref={renameInputRef}
            type="text"
            aria-label="Rename block"
            value={renameOverlay.value}
            onChange={(e) =>
              setRenameOverlay({ ...renameOverlay, value: e.target.value })
            }
            onKeyDown={(e) => {
              // Trap EVERY key inside the editor so global shortcuts (transport,
              // align, duplicate…) can never fire mid-rename — same focus
              // discipline as QuickAdd. Enter commits, Esc reverts.
              e.stopPropagation();
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
            // ≥44px hit area (min-h-11), high-contrast focus ring (2px accent
            // ring + outer glow, not shadow-only), sits over the block header.
            className="min-h-11 min-w-[180px] bg-surface text-text-primary text-[12px] font-bold rounded-md px-2 py-1 outline-none ring-2 ring-accent-blue shadow-[0_0_0_4px_rgba(74,144,217,0.25)]"
          />
        </div>
      )}

      {/* Nested-Board chrome — inset frame + depth ribbon + depth banner.
          Renders only when the breadcrumb stack is deeper than root (honest:
          absent at depth 0). Frame is pointer-events-none so the canvas stays
          interactive; only the banner/EXIT capture clicks. */}
      <NestedChrome />
    </div>
  );
}
