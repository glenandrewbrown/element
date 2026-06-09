import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { useGraphStore } from "../../stores/useGraphStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useAppStore } from "../../stores/useAppStore";
import {
  nativeGraphAutoLayout,
  nativeGraphCommentAdd,
  nativeGraphPasteNodes,
  nativeGraphSetCanvasOptions,
  nativeMoleculeSave,
} from "../../bridge/nativeGraph";
import { computeAutoLayout } from "../../lib/autoLayout";
import { Icon } from "../neu";
import { NeuPromptModal } from "../layout/NeuPromptModal";

export interface CanvasContextMenuProps {
  /** Viewport (clientX/clientY) coordinates of the right-click; the menu is fixed-positioned here and clamped to stay on-screen. */
  position: { x: number; y: number };
  /**
   * Flow-space coordinates of the right-click (`screenToFlowPosition`). Used to
   * land a pasted block / new comment box AT the cursor rather than at the
   * Board origin — mirrors the native QuickAdd-at-cursor behaviour.
   */
  flowPosition: { x: number; y: number };
  /**
   * Open the existing QuickAdd popup at the cursor. "Add Block…" is the ONE
   * entry that routes into QuickAdd — this menu does not rebuild it.
   */
  onAddBlock: () => void;
  /** Called to dismiss the menu (outside click, Escape, or after an action completes). */
  onClose: () => void;
}

// Canvas accent — a neutral instrument blue. Unlike NodeContextMenu (which
// tints to the right-clicked Block's category) the empty canvas has no
// category, so the dopamine hover-glow uses the primary signal hue.
const CANVAS_ACCENT = "#4A90D9";

const SAVE_SNIPPET_HINT_MS = 3000;

/**
 * CanvasContextMenu — the right-click action menu for the empty Board surface.
 *
 * Replaces the old behaviour where right-clicking the pane opened QuickAdd
 * directly. QuickAdd ("Add Block…") is now ONE entry inside a fuller,
 * contextual menu that mirrors the native JUCE canvas menu set
 * (`src/ui/contextmenus.hpp`), adapted to the webview stores.
 *
 *   WIRED (real store/bridge action):
 *     Add Block…              → opens QuickAddPopup at the cursor (onAddBlock).
 *     Add Comment Box         → nativeGraphCommentAdd at the cursor.
 *     Save selection as Snippet → feature-detected; degrades to hint if native
 *                               `elementMoleculeSave` is not yet bridged.
 *     Paste                   → nativeGraphPasteNodes (host pasteboard).
 *     Select All Blocks       → React Flow selection + useGraphStore sync.
 *     Fit to View             → reactFlow.fitView (⌘0).
 *     Zoom In / Out           → reactFlow.zoomIn / zoomOut (⌘= / ⌘-).
 *     Snap to Grid            → nativeGraphSetCanvasOptions (toggles host canvas flag).
 *     Minimap                 → useGraphStore.toggleMinimap (⇧M).
 *     Auto-Layout…            → computeAutoLayout() over the real useGraphStore
 *                               nodes+edges, applied via nativeGraphAutoLayout (the
 *                               host batch-setPosition bridge → single snapshot push,
 *                               positions persist). NOTE: there is NO native layout
 *                               engine — the JUCE graph editor only has a
 *                               horizontal/vertical DIRECTION toggle
 *                               (grapheditorcomponent verticalLayout), not an arrange
 *                               algorithm; the layered layout is computed here in the
 *                               webview.
 *
 *   HONEST-DEGRADED:
 *     Save selection as Snippet → disabled when no blocks selected; degrades to
 *                               StatusBar hint when native not yet wired.
 *     Auto-Layout…            → disabled with reason "Board is empty — add Blocks
 *                               first" when the Board has zero Blocks (a real state,
 *                               not a bridge gap).
 *
 * Design: mirrors NodeContextMenu — same neumorphic shell, header, MenuItem
 * primitives, and category-hue dopamine hover-glow (here the primary signal
 * blue). No transparency, tight tracking, fixed width.
 */
export function CanvasContextMenu({
  position,
  flowPosition,
  onAddBlock,
  onClose,
}: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();

  const blockCount = useGraphStore((s) => s.nodes.length);
  const minimapVisible = useGraphStore((s) => s.minimapVisible);
  const toggleMinimap = useGraphStore((s) => s.toggleMinimap);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectedNodeIds = useGraphStore(
    useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id)),
  );

  const setCanvasHint = useAppStore((s) => s.setCanvasHint);

  // #4c — snippet-name capture via the in-app modal (window.prompt() is null in
  // JUCE's WKWebView). `onClose` UNMOUNTS this menu (GraphCanvas sets canvasMenu
  // = null), which would tear the modal down too — so we keep the menu mounted
  // while the modal is up (its popup is hidden + its outside-click/Escape
  // listeners suppressed below), snapshot the selected ids, and only call
  // `onClose` once the modal resolves.
  const [snippetPromptOpen, setSnippetPromptOpen] = useState(false);
  const [snippetPendingIds, setSnippetPendingIds] = useState<string[]>([]);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const snapToGrid = useHostExtrasStore((s) => s.canvas.snapToGrid);
  const gridSize = useHostExtrasStore((s) => s.canvas.gridSize);

  useEffect(() => {
    // Suppress the menu's outside-click + Escape dismissal while the snippet
    // modal owns the screen — the modal has its own Escape/Cancel, and an
    // outside-mousedown on the modal must NOT unmount this menu (which would
    // tear the modal down with it). (#4c)
    if (snippetPromptOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, snippetPromptOpen]);

  // ── Action handlers (every enabled item invokes a real store/bridge call) ──

  const showHint = useCallback(
    (msg: string) => {
      if (hintTimerRef.current !== undefined)
        clearTimeout(hintTimerRef.current);
      setCanvasHint(msg);
      hintTimerRef.current = setTimeout(
        () => setCanvasHint(null),
        SAVE_SNIPPET_HINT_MS,
      );
    },
    [setCanvasHint],
  );

  const handleAddComment = useCallback(() => {
    // Centre a default 240×160 comment frame on the cursor.
    void nativeGraphCommentAdd(flowPosition.x - 120, flowPosition.y - 80);
    onClose();
  }, [flowPosition, onClose]);

  const handleSaveAsSnippet = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      onClose();
      showHint("Select one or more Blocks first, then save as Snippet.");
      return;
    }
    // Keep the menu mounted (do NOT onClose yet) so it can host the modal;
    // snapshot the selection and open the in-app name modal.
    setSnippetPendingIds(selectedNodeIds);
    setSnippetPromptOpen(true);
  }, [selectedNodeIds, showHint, onClose]);

  const handleSnippetConfirm = useCallback(
    (name: string) => {
      setSnippetPromptOpen(false);
      const ids = snippetPendingIds;
      onClose();
      if (ids.length === 0) return;
      void nativeMoleculeSave(name, ids).then((ok) => {
        showHint(
          ok ? `Snippet "${name}" saved.` : `Failed to save Snippet "${name}".`,
        );
      });
    },
    [snippetPendingIds, showHint, onClose],
  );

  const handleSnippetCancel = useCallback(() => {
    setSnippetPromptOpen(false);
    onClose();
  }, [onClose]);

  const handlePaste = useCallback(() => {
    void nativeGraphPasteNodes();
    onClose();
  }, [onClose]);

  const handleSelectAll = useCallback(() => {
    // React Flow owns the multi-select `selected` flag (the same mechanism
    // align/distribute reads). Mark every Block selected and mirror the first
    // into useGraphStore so the Inspector + keyboard ops have a primary node.
    const ids: string[] = [];
    reactFlow.setNodes((nds) =>
      nds.map((n) => {
        if (n.type === "block") {
          ids.push(n.id);
          return { ...n, selected: true };
        }
        return n;
      }),
    );
    if (ids.length > 0) selectNode(ids[0]);
    onClose();
  }, [reactFlow, selectNode, onClose]);

  const handleFitView = useCallback(() => {
    reactFlow.fitView({ padding: 0.15, duration: 200 });
    onClose();
  }, [reactFlow, onClose]);

  const handleZoomIn = useCallback(() => {
    reactFlow.zoomIn({ duration: 150 });
    onClose();
  }, [reactFlow, onClose]);

  const handleZoomOut = useCallback(() => {
    reactFlow.zoomOut({ duration: 150 });
    onClose();
  }, [reactFlow, onClose]);

  const handleToggleSnap = useCallback(() => {
    // Host store is hydrated from the native snapshot; flip the flag through
    // the same bridge PreferencesModal uses, then let the snapshot round-trip
    // update useHostExtrasStore.canvas.snapToGrid.
    void nativeGraphSetCanvasOptions(!snapToGrid, gridSize);
    onClose();
  }, [snapToGrid, gridSize, onClose]);

  const handleToggleMinimap = useCallback(() => {
    toggleMinimap();
    onClose();
  }, [toggleMinimap, onClose]);

  const handleAutoLayout = useCallback(() => {
    // Read the live graph at click time so we never re-subscribe the menu to
    // the full nodes/edges arrays. computeAutoLayout produces deterministic
    // layered positions from the REAL graph; nativeGraphAutoLayout applies
    // them via the host setPosition path (persists with the project).
    const { nodes, edges } = useGraphStore.getState();
    const positions = computeAutoLayout(nodes, edges);
    if (positions.length > 0) void nativeGraphAutoLayout(positions);
    onClose();
  }, [onClose]);

  // Estimated height for bottom-edge clamping (9 rows + 3 dividers + headers).
  const estimatedHeight = 380;
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 232),
    top: Math.min(position.y, window.innerHeight - estimatedHeight),
    zIndex: 9999,
    // While the snippet modal owns the screen, keep this menu MOUNTED (so the
    // modal it hosts isn't torn down) but visually hidden. (#4c)
    ...(snippetPromptOpen ? { display: "none" } : {}),
  };

  return (
    <>
    <div
      ref={ref}
      style={menuStyle}
      className="w-56 bg-panel border border-white/10 rounded-lg shadow-[-4px_-4px_8px_rgba(255,255,255,0.04),8px_8px_24px_rgba(0,0,0,0.5)] overflow-hidden"
      role="menu"
      aria-label="Canvas menu"
    >
      {/* Header */}
      <div className="px-3 py-2 bg-pressed border-b border-white/5 flex items-center gap-2">
        <Icon name="LayoutGrid" size={12} color={CANVAS_ACCENT} aria-hidden />
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest flex-1">
          Board
        </span>
        <span
          className="text-[9px] uppercase tracking-wider shrink-0"
          style={{ color: CANVAS_ACCENT, opacity: 0.7 }}
        >
          {blockCount} {blockCount === 1 ? "block" : "blocks"}
        </span>
      </div>

      <div className="py-1">
        {/* ── Create ── */}
        <MenuItem
          iconName="Plus"
          label="Add Block…"
          shortcut="⌘K"
          accent={CANVAS_ACCENT}
          onClick={() => {
            onAddBlock();
          }}
        />
        <MenuItem
          iconName="StickyNote"
          label="Add Comment Box"
          shortcut="⇧C"
          accent={CANVAS_ACCENT}
          onClick={handleAddComment}
        />
        <MenuItem
          iconName="BookmarkPlus"
          label="Save selection as Snippet"
          accent={CANVAS_ACCENT}
          disabled={selectedNodeIds.length === 0}
          disabledReason="Select one or more Blocks first"
          onClick={handleSaveAsSnippet}
        />

        <MenuDivider />

        {/* ── Edit ── */}
        <MenuItem
          iconName="ClipboardPaste"
          label="Paste"
          shortcut="⌘V"
          accent={CANVAS_ACCENT}
          onClick={handlePaste}
        />
        <MenuItem
          iconName="BoxSelect"
          label="Select All Blocks"
          shortcut="⌘A"
          accent={CANVAS_ACCENT}
          disabled={blockCount === 0}
          disabledReason="No blocks on this Board to select"
          onClick={handleSelectAll}
        />

        <MenuDivider />

        {/* ── View ── */}
        <SectionHeader label="View" />
        <MenuItem
          iconName="Maximize2"
          label="Fit to View"
          shortcut="⌘0"
          accent={CANVAS_ACCENT}
          disabled={blockCount === 0}
          disabledReason="No blocks on this Board to fit"
          onClick={handleFitView}
        />
        <MenuItem
          iconName="ZoomIn"
          label="Zoom In"
          shortcut="⌘+"
          accent={CANVAS_ACCENT}
          onClick={handleZoomIn}
        />
        <MenuItem
          iconName="ZoomOut"
          label="Zoom Out"
          shortcut="⌘-"
          accent={CANVAS_ACCENT}
          onClick={handleZoomOut}
        />

        <MenuDivider />

        {/* ── Canvas toggles ── */}
        <SectionHeader label="Canvas" />
        <MenuItem
          iconName="LayoutGrid"
          label="Snap to Grid"
          shortcut={`${gridSize}px`}
          checked={snapToGrid}
          accent={CANVAS_ACCENT}
          onClick={handleToggleSnap}
        />
        <MenuItem
          iconName="Map"
          label="Minimap"
          shortcut="⇧M"
          checked={minimapVisible}
          accent={CANVAS_ACCENT}
          onClick={handleToggleMinimap}
        />
        <MenuItem
          iconName="MoveHorizontal"
          label="Auto-Layout"
          accent={CANVAS_ACCENT}
          disabled={blockCount === 0}
          disabledReason="Board is empty — add Blocks first"
          onClick={handleAutoLayout}
        />
      </div>
    </div>

      {/* #4c — snippet-name capture modal (window.prompt() is null in WKWebView).
          Hosted here while the menu stays mounted; confirm fires the real
          elementMoleculeSave bridge, then closes the menu. */}
      <NeuPromptModal
        open={snippetPromptOpen}
        title="Save selection as Snippet"
        description={`Name this Snippet (${snippetPendingIds.length} block${snippetPendingIds.length === 1 ? "" : "s"}).`}
        placeholder="My Snippet"
        defaultValue="My Snippet"
        confirmLabel="Save"
        onConfirm={handleSnippetConfirm}
        onCancel={handleSnippetCancel}
      />
    </>
  );
}

// ── Shared sub-components (mirror NodeContextMenu primitives) ─────────────────

function MenuDivider() {
  return <div className="my-1 mx-3 border-t border-white/5" />;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-0.5 text-[9px] uppercase tracking-widest text-text-dim font-bold">
      {label}
    </div>
  );
}

interface MenuItemProps {
  iconName: string;
  label: string;
  shortcut?: string;
  accent: string;
  onClick: () => void;
  /** Renders a check on the left rail — used for the toggle items (snap, minimap). */
  checked?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

function MenuItem({
  iconName,
  label,
  shortcut,
  accent,
  onClick,
  checked = false,
  disabled = false,
  disabledReason,
}: MenuItemProps) {
  // Category-hue dopamine hover glow — applied inline so it reflects the live
  // accent without arbitrary Tailwind class generation (matches NodeContextMenu).
  const hoverBg = `${accent}1A`; // 10% alpha

  return (
    <button
      type="button"
      role={checked ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checked ? true : undefined}
      disabled={disabled}
      onClick={!disabled ? onClick : undefined}
      title={disabled && disabledReason ? disabledReason : undefined}
      className={[
        "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors duration-150",
        checked
          ? "text-accent-blue"
          : disabled
            ? "text-text-dim opacity-40 cursor-not-allowed"
            : "text-text-primary",
      ].join(" ")}
      onMouseEnter={
        !disabled
          ? (e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg;
            }
          : undefined
      }
      onMouseLeave={
        !disabled
          ? (e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "";
            }
          : undefined
      }
    >
      <Icon name={iconName} size={13} aria-hidden />
      <span className="flex-1 text-left leading-none">{label}</span>
      {checked && (
        <Icon
          name="Circle"
          size={6}
          aria-hidden
          style={{ fill: accent, color: accent }}
        />
      )}
      {disabled && (
        <span className="text-[8px] text-text-dim opacity-60 uppercase tracking-wider ml-auto">
          soon
        </span>
      )}
      {!disabled && shortcut && (
        <span className="text-[10px] text-text-dim shrink-0">{shortcut}</span>
      )}
    </button>
  );
}
