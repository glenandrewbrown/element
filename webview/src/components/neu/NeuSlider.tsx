import { useCallback, useRef, useState } from "react";

const colorHex = {
  blue: "#4A90D9",
  orange: "#E8A838",
  teal: "#2BC4C4",
  purple: "#A87FE0",
} as const;

interface NeuSliderProps {
  /** Normalized position, 0–1 (clamped). */
  value: number;
  /** Called with the new normalized 0–1 value during drag / keyboard nudge.
   *  Omit to render read-only. */
  onChange?: (value: number) => void;
  /** Accessible name — REQUIRED so the slider is reachable by role+name. */
  ariaLabel: string;
  /** Optional human-readable value text (e.g. "−6.0 dB") for aria-valuetext. */
  ariaValueText?: string;
  /** Normalized quantization step for STEPPED parameters (e.g. 1/(max−min)).
   *  Drag + keyboard snap to multiples of it. Omit for continuous. */
  step?: number;
  /** Fill/thumb accent. Default `blue` (the focus/active accent). */
  color?: "blue" | "orange" | "teal" | "purple";
  /** Optional className on the track wrapper. */
  className?: string;
}

/** Clamp to 0–1 and (when stepped) snap to the nearest step multiple. */
function quantize(v: number, step?: number): number {
  const c = Math.max(0, Math.min(1, v));
  if (!step || step <= 0) return c;
  return Math.max(0, Math.min(1, Math.round(c / step) * step));
}

/**
 * NeuSlider — compact neumorphic parameter slider (G3).
 *
 * Replaces the flat native `<input type="range">` in parameter lists with the
 * locked chassis language: a pressed/inset groove (`.neu-inset` utility from
 * `src/index.css`), an accent fill, and a raised extruded thumb (same recipe
 * as NeuFader's thumb). Unlike NeuFader it is value-display-agnostic — it
 * renders NO label/readout of its own, so callers compose it into compact
 * rows (`[label | slider | value]`) without fighting a built-in layout.
 *
 * Accessibility: a real `role="slider"` with aria-value* + full keyboard
 * support (arrows ±step, PageUp/Down ±10%, Home/End), focus ring via the
 * micro-glow (no flat border — G2 conformance).
 */
export function NeuSlider({
  value,
  onChange,
  ariaLabel,
  ariaValueText,
  step,
  color = "blue",
  className = "",
}: NeuSliderProps) {
  const hex = colorHex[color];
  const clamped = Math.max(0, Math.min(1, value));
  const pct = `${clamped * 100}%`;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const interactive = Boolean(onChange);

  const computeValue = useCallback(
    (e: React.PointerEvent) => {
      const track = trackRef.current;
      if (!track || !onChange) return;
      const rect = track.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      onChange(quantize(ratio, step));
    },
    [onChange, step],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onChange) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      (e.currentTarget as HTMLElement).focus();
      setDragging(true);
      computeValue(e);
    },
    [onChange, computeValue],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      computeValue(e);
    },
    [dragging, computeValue],
  );

  const onPointerUp = useCallback(() => setDragging(false), []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!onChange) return;
      const nudge = step && step > 0 ? step : 0.01;
      let next: number | null = null;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowUp":
          next = clamped + nudge;
          break;
        case "ArrowLeft":
        case "ArrowDown":
          next = clamped - nudge;
          break;
        case "PageUp":
          next = clamped + 0.1;
          break;
        case "PageDown":
          next = clamped - 0.1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      onChange(quantize(next, step));
    },
    [onChange, clamped, step],
  );

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(clamped.toFixed(4))}
      aria-valuetext={ariaValueText}
      aria-disabled={interactive ? undefined : true}
      tabIndex={interactive ? 0 : -1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={[
        "h-1.5 bg-pressed neu-inset rounded-full relative outline-none",
        interactive ? "cursor-ew-resize" : "",
        className,
      ].join(" ")}
      style={
        focused
          ? // G2: focus = micro-glow (4px semantic hue @ ~25%) layered over the
            // inset groove — NEVER a flat colored border.
            {
              boxShadow: `inset 2px 2px 6px rgba(0,0,0,0.5), inset -1px -1px 3px rgba(255,255,255,0.05), 0 0 4px ${hex}40`,
            }
          : undefined
      }
    >
      {/* Fill */}
      <div
        className="absolute left-0 top-0 h-full rounded-full pointer-events-none"
        style={{ width: pct, backgroundColor: hex, opacity: 0.85 }}
      />
      {/* Raised thumb — translateX by its own width-fraction keeps it fully
          inside the track at both extremes (NeuFader G-02 recipe). */}
      <div
        className="absolute -top-[4px] w-2 h-3.5 bg-[#252529] rounded shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/10 pointer-events-none"
        style={{ left: pct, transform: `translateX(-${clamped * 100}%)` }}
      />
    </div>
  );
}
