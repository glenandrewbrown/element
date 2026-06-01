import { useCallback, useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../../stores/useGraphStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import {
  nativeGraphCommentAdd,
  nativeGraphPasteNodes,
  nativeGraphSetCanvasOptions,
} from "../../bridge/nativeGraph";
import { Icon } from "../neu";

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

/**
 * CanvasContextMenu — the right-click action menu for the empty Board surface.
 *
 * Replaces the old behaviour where right-clicking the pane opened QuickAdd
 * directly. QuickAdd ("Add Block…") is now ONE entry inside a fuller,
 * contextual menu that mirrors the native JUCE canvas menu set
 * (`src/ui/contextmenus.hpp`), adapted to the webview stores.
 *
 *   WIRED (real store/bridge action):
 *     Add Block…        → opens QuickAddPopup at the cursor (onAddBlock).
 *     Add Comment Box   → nativeGraphCommentAdd at the cursor.
 *     Paste             → nativeGraphPasteNodes (host pasteboard).
 *     Select All Blocks → React Flow selection + useGraphStore sync.
 *     Fit to View       → reactFlow.fitView (⌘0).
 *     Zoom In / Out     → reactFlow.zoomIn / zoomOut (⌘= / ⌘-).
 *     Snap to Grid      → nativeGraphSetCanvasOptions (toggles host canvas flag).
 *     Minimap           → useGraphStore.toggleMinimap (⇧M).
 *
 *   HONEST-DISABLED (UI present, action not yet wired):
 *     Auto-Layout…      → no webview auto-layout bridge exists yet. Native has a
 *                         layout-direction toggle driven by the C++ layout
 *                         engine; the webview has no elementGraphAutoLayout
 *                         bridge, so the item is shown disabled with a tooltip
 *                         naming the gap.
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

  const snapToGrid = useHostExtrasStore((s) => s.canvas.snapToGrid);
  const gridSize = useHostExtrasStore((s) => s.canvas.gridSize);

  useEffect(() => {
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
  }, [onClose]);

  // ── Action handlers (every enabled item invokes a real store/bridge call) ──

  const handleAddComment = useCallback(() => {
    // Centre a default 240×160 comment frame on the cursor.
    void nativeGraphCommentAdd(flowPosition.x - 120, flowPosition.y - 80);
    onClose();
  }, [flowPosition, onClose]);

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

  // Estimated height for bottom-edge clamping (8 rows + 3 dividers + headers).
  const estimatedHeight = 360;
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 232),
    top: Math.min(position.y, window.innerHeight - estimatedHeight),
    zIndex: 9999,
  };

  return (
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
          label="Auto-Layout…"
          accent={CANVAS_ACCENT}
          disabled
          disabledReason="Requires elementGraphAutoLayout bridge — native has a layout engine, the webview has no auto-layout call yet (Pillar-2)"
          onClick={() => {}}
        />
      </div>
    </div>
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
