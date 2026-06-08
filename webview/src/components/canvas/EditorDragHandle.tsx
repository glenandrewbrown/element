import { useCallback, useRef } from "react";
import {
  nativePluginEditorClose,
  nativePluginEditorFloat,
  nativePluginEditorSetBounds,
} from "../../bridge/nativePluginEditor";
import { Icon } from "../neu";

/** Height of the draggable header strip, in CSS px. */
export const EDITOR_HANDLE_HEIGHT = 26;

export interface EditorBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditorDragHandleProps {
  /** Display name of the Block whose plugin GUI is embedded. */
  title: string;
  /**
   * Current overlay bounds (host client / viewport coords — the SAME space the
   * open path anchored with `event.clientX/clientY`, and the same the C++
   * `pluginEditorSetBounds` consumes). The native overlay covers
   * `[y, y + h]`, so the handle is drawn in the strip directly ABOVE it
   * (`top = y - EDITOR_HANDLE_HEIGHT`) to avoid being occluded by the native
   * component, which always paints above the WebBrowserComponent.
   */
  bounds: EditorBounds;
  /**
   * Commit the final position after a drag completes (single call on pointer-up).
   * Width/height are unchanged by the drag, so only x/y move. The parent owns
   * the bounds state so the handle re-renders at its new home; DURING the drag
   * the parent is NOT touched (no per-move React update — perf rule).
   */
  onCommit: (x: number, y: number) => void;
}

/**
 * EditorDragHandle — the missing titlebar for the docked plugin editor.
 *
 * The embedded plugin GUI is a borderless, in-process native overlay
 * (`ElementWebViewHost::pluginEmbedEditor`) with NO window chrome, which is why
 * "the window cannot be moved". This React strip gives it a draggable header:
 * grabbing it and dragging repositions the native overlay LIVE by calling the
 * existing `nativePluginEditorSetBounds(x, y, w, h)` bridge per pointer-move.
 *
 * Perf rule (no React state churn per `pointermove`): the in-flight position is
 * tracked in a ref and the handle moves itself via direct DOM style writes; the
 * bridge is the only side-effect per move. The parent's bounds state is updated
 * exactly once, on `pointerup` (`onCommit`), so the handle settles at its new
 * home from snapshot-of-truth without a re-render storm mid-drag.
 *
 * Also surfaces the two existing editor affordances as explicit opt-ins: pop
 * out to a floating window (`nativePluginEditorFloat`) and close
 * (`nativePluginEditorClose`). Neumorphic, opaque — no glass.
 */
export function EditorDragHandle({
  title,
  bounds,
  onCommit,
}: EditorDragHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  // Live drag state, kept OUT of React so a 60 Hz pointermove stream never
  // re-renders the tree. `null` when not dragging.
  const dragRef = useRef<{
    pointerId: number;
    // Offset from the pointer to the overlay's top-left at grab time, so the
    // editor doesn't jump under the cursor.
    grabDX: number;
    grabDY: number;
    // Latest committed-on-move position (read on pointer-up).
    x: number;
    y: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Left button / primary pointer only; ignore the affordance buttons
      // (they live in their own stopPropagation handlers below).
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = handleRef.current;
      if (el == null) return;
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        grabDX: e.clientX - bounds.x,
        grabDY: e.clientY - bounds.y,
        x: bounds.x,
        y: bounds.y,
      };
    },
    [bounds.x, bounds.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag == null || e.pointerId !== drag.pointerId) return;
      const nextX = Math.round(e.clientX - drag.grabDX);
      const nextY = Math.round(e.clientY - drag.grabDY);
      drag.x = nextX;
      drag.y = nextY;
      // Move the handle itself with a direct style write — NO React state.
      const el = handleRef.current;
      if (el != null) {
        el.style.left = `${nextX}px`;
        el.style.top = `${nextY - EDITOR_HANDLE_HEIGHT}px`;
      }
      // Reposition the native overlay LIVE via the existing bridge.
      void nativePluginEditorSetBounds(nextX, nextY, bounds.w, bounds.h);
    },
    [bounds.w, bounds.h],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag == null || e.pointerId !== drag.pointerId) return;
      const el = handleRef.current;
      if (el != null && el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      const { x, y } = drag;
      dragRef.current = null;
      // Single React update: parent re-renders the handle at its new home.
      onCommit(x, y);
    },
    [onCommit],
  );

  const style: React.CSSProperties = {
    position: "fixed",
    left: bounds.x,
    top: bounds.y - EDITOR_HANDLE_HEIGHT,
    width: bounds.w,
    height: EDITOR_HANDLE_HEIGHT,
    zIndex: 60,
  };

  return (
    <div
      ref={handleRef}
      data-testid="editor-drag-handle"
      role="toolbar"
      aria-label={`${title} editor — drag to move`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={style}
      className="flex items-center gap-1.5 px-2 select-none cursor-grab active:cursor-grabbing rounded-t-lg bg-panel border border-b-0 border-white/10 shadow-[-3px_-3px_8px_rgba(255,255,255,0.04),4px_-2px_12px_rgba(0,0,0,0.45)]"
    >
      <Icon
        name="GripVertical"
        size={13}
        aria-hidden
        className="text-text-dim shrink-0"
      />
      <span className="flex-1 truncate text-[11px] font-medium leading-none text-text-secondary">
        {title}
      </span>
      {/* Pop out to a floating window — explicit opt-in (kept from the existing
          host affordance). Stops propagation so the grab handler never fires. */}
      <button
        type="button"
        data-testid="editor-float-button"
        title="Pop out to floating window"
        aria-label="Pop out to floating window"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void nativePluginEditorFloat();
        }}
        className="grid place-items-center w-5 h-5 rounded text-text-dim hover:text-text-primary hover:bg-white/5 transition-colors"
      >
        <Icon name="Maximize2" size={12} aria-hidden />
      </button>
      {/* Close the embedded editor. */}
      <button
        type="button"
        data-testid="editor-close-button"
        title="Close plugin editor (Esc)"
        aria-label="Close plugin editor"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void nativePluginEditorClose();
        }}
        className="grid place-items-center w-5 h-5 rounded text-text-dim hover:text-text-primary hover:bg-white/5 transition-colors"
      >
        <Icon name="X" size={12} aria-hidden />
      </button>
    </div>
  );
}
