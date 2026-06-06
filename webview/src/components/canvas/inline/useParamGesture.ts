/**
 * T5 — shared pointer-gesture hook for inline param widgets (and NeuKnob's
 * additive props). Implements the locked Bitwig gesture spec ONCE so every
 * inline control (and the Inspector knob) behaves identically:
 *
 *   • pointer-down → stopPropagation + setPointerCapture + React Flow `nodrag`
 *     class on the element, so dragging a control NEVER moves the Block. (Element
 *     uses React Flow's default noDragClassName "nodrag" — verified in
 *     GhostEdge.tsx; we also add "nopan".)
 *   • 3px vertical DEADZONE before any value change (a click that drifts <3px is
 *     not a drag → leaves the value untouched, lets double-click register).
 *   • RELATIVE vertical drag: value += (anchorY − clientY) * sensitivity.
 *   • Shift = 10× fine, ENGAGEABLE MID-DRAG: on a shift transition we re-anchor
 *     (rebase anchorY + anchorValue to the current point) so engaging/releasing
 *     Shift never JUMPS the value (the bug in the old NeuKnob).
 *   • double-click → reset to defaultValue (handled by the caller via onReset;
 *     this hook exposes a dblclick handler).
 *   • Cmd/Ctrl-click → inline type-in (caller opens a NeuInput; this hook reports
 *     the intent via onTypeRequest so widgets share the affordance).
 *   • wheel is NOT captured (caller must not attach onWheel).
 *
 * The hook is value-domain agnostic: it works in NORMALISED 0–1 space (the
 * representation the host + useParameterStore use). `range` lets a 0–100 widget
 * (NeuKnob) reuse the same math by scaling sensitivity.
 */

import { useCallback, useRef } from "react";

/** React Flow's default no-drag / no-pan classes (verified in GhostEdge.tsx). */
export const NO_DRAG_CLASS = "nodrag nopan";

export interface ParamGestureOptions {
  /** Current value in the widget's units (e.g. 0–1 normalised, or 0–100). */
  value: number;
  /** Inclusive value bounds. Default 0..1. */
  min?: number;
  max?: number;
  /** Coarse units-per-pixel. Default = (max-min)/200 (≈ full sweep over 200px). */
  sensitivity?: number;
  /** Fine multiplier applied while Shift is held. Default 0.1 (10× finer). */
  fineFactor?: number;
  /** Deadzone in px before a drag starts changing the value. Default 3. */
  deadzone?: number;
  /** Called with the clamped new value during a drag. */
  onChange: (value: number) => void;
  /** Called on double-click (caller resets to defaultValue). Optional. */
  onReset?: () => void;
  /** Called on Cmd/Ctrl-click (caller opens type-in). Optional. */
  onTypeRequest?: () => void;
}

interface DragState {
  anchorY: number;
  anchorValue: number;
  shift: boolean;
  active: boolean; // crossed the deadzone
  pointerId: number;
  moved: boolean;
}

export interface ParamGestureHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  /** Class names to spread onto the draggable element. */
  className: string;
}

/**
 * Pure math used by the hook — exported for unit tests. Given an anchor and the
 * current pointer Y, returns the clamped new value.
 */
export function computeDragValue(params: {
  anchorY: number;
  anchorValue: number;
  clientY: number;
  sensitivity: number;
  fineFactor: number;
  shift: boolean;
  min: number;
  max: number;
}): number {
  const { anchorY, anchorValue, clientY, sensitivity, fineFactor, shift, min, max } =
    params;
  const dy = anchorY - clientY; // up = increase
  const eff = shift ? sensitivity * fineFactor : sensitivity;
  const raw = anchorValue + dy * eff;
  return Math.min(max, Math.max(min, raw));
}

/** Snap a value to the nearest stepped increment within [min,max]. */
export function snapStepped(
  value: number,
  min: number,
  max: number,
  steps: number,
): number {
  if (steps <= 1) return Math.min(max, Math.max(min, value));
  const span = max - min;
  const stepped = Math.round(((value - min) / span) * steps) / steps;
  return min + Math.min(1, Math.max(0, stepped)) * span;
}

export function useParamGesture(opts: ParamGestureOptions): ParamGestureHandlers {
  const {
    value,
    min = 0,
    max = 1,
    sensitivity = (max - min) / 200,
    fineFactor = 0.1,
    deadzone = 3,
    onChange,
    onReset,
    onTypeRequest,
  } = opts;

  const stateRef = useRef<DragState | null>(null);
  // Keep the latest value in a ref so a re-anchor during a long drag rebases off
  // the live value (not a stale closure).
  const valueRef = useRef(value);
  valueRef.current = value;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Type-in takes precedence over a drag; don't capture the pointer.
      if ((e.metaKey || e.ctrlKey) && onTypeRequest) {
        e.stopPropagation();
        e.preventDefault();
        onTypeRequest();
        return;
      }
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      stateRef.current = {
        anchorY: e.clientY,
        anchorValue: valueRef.current,
        shift: e.shiftKey,
        active: false,
        pointerId: e.pointerId,
        moved: false,
      };
    },
    [onTypeRequest],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = stateRef.current;
      if (!st) return;

      // Re-anchor on a Shift transition (mid-drag fine engage/disengage) so the
      // value never jumps: rebase anchorY + anchorValue to the current point.
      if (e.shiftKey !== st.shift) {
        st.shift = e.shiftKey;
        st.anchorY = e.clientY;
        st.anchorValue = valueRef.current;
      }

      // Deadzone: ignore drift below the threshold until we've crossed it once.
      if (!st.active) {
        if (Math.abs(e.clientY - st.anchorY) < deadzone) return;
        st.active = true;
        // Re-anchor at the deadzone edge so the first applied delta is smooth
        // (no 3px jump on activation).
        st.anchorY = e.clientY;
        st.anchorValue = valueRef.current;
      }
      st.moved = true;

      const next = computeDragValue({
        anchorY: st.anchorY,
        anchorValue: st.anchorValue,
        clientY: e.clientY,
        sensitivity,
        fineFactor,
        shift: st.shift,
        min,
        max,
      });
      onChange(next);
    },
    [deadzone, sensitivity, fineFactor, min, max, onChange],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const st = stateRef.current;
    if (st) (e.target as HTMLElement).releasePointerCapture?.(st.pointerId);
    stateRef.current = null;
  }, []);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onReset) return;
      e.stopPropagation();
      e.preventDefault();
      onReset();
    },
    [onReset],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    className: NO_DRAG_CLASS,
  };
}
