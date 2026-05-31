import { useState, useCallback, useRef } from "react";

const colorHex = {
  blue: "#4A90D9",
  orange: "#E8A838",
  teal: "#2BC4C4",
} as const;

const colorClasses = {
  blue: {
    text: "text-accent-blue",
    glow: "shadow-[0_0_4px_rgba(74,144,217,0.6)]",
  },
  orange: {
    text: "text-accent-orange",
    glow: "shadow-[0_0_4px_rgba(232,168,56,0.6)]",
  },
  teal: { text: "text-accent-teal", glow: "shadow-[0_0_4px_rgba(43,196,196,0.6)]" },
} as const;

const sizeMap = {
  // `xs` — on-Block density tier (verdict 1). ~34px dial sized to fill the
  // Block body across 3 knobs; used with `compact` to drop the numeric readout.
  xs: { outer: 34, inner: 23, inset: 5, indicator: { w: 3, h: 8, top: 3 } },
  sm: { outer: 48, inner: 32, inset: 8, indicator: { w: 4, h: 10, top: 4 } },
  md: { outer: 64, inner: 48, inset: 8, indicator: { w: 4, h: 12, top: 4 } },
  lg: { outer: 80, inner: 56, inset: 12, indicator: { w: 4, h: 14, top: 6 } },
} as const;

interface NeuKnobProps {
  /** Current value, 0–100 (clamped), shown numerically and as a 270° arc. */
  value: number;
  /** Parameter caption shown under the knob (e.g. "GAIN", "FILTER"). */
  label: string;
  /** Optional sub-caption naming the mapped Block/source (e.g. "Reverb 1"). */
  sourceLabel?: string;
  /**
   * Indicator/arc colour, mapped to Element's semantic palette: `blue` =
   * generator, `orange` = modifier, `teal` = logic. Default `blue`.
   */
  color?: "blue" | "orange" | "teal";
  /** Diameter tier: `xs` / `sm` / `md` (default) / `lg`. */
  size?: "xs" | "sm" | "md" | "lg";
  /**
   * Called with the new 0–100 value during a vertical drag (hold Shift for
   * fine control). Omit to render a read-only indicator knob.
   */
  onChange?: (value: number) => void;
  /**
   * Compact mode (on-Block use): tightens the wrapper gap, drops the numeric
   * readout + sourceLabel, and shrinks the caption. Pair with `size="xs"`.
   */
  compact?: boolean;
  /** Optional className appended to the wrapper. */
  className?: string;
}

/**
 * Neumorphic rotary knob for a single continuous parameter — the canonical
 * control surface for mapped Block parameters in Inspector and Perform-mode
 * dashboards. Drag vertically to adjust (Shift = fine); the value drives both
 * a sweeping arc ring and the indicator line. Use `color` to match the source
 * Block's signal role and `sourceLabel` to show which Block it controls.
 */
export function NeuKnob({
  value,
  label,
  sourceLabel,
  color = "blue",
  size = "md",
  onChange,
  compact = false,
  className = "",
}: NeuKnobProps) {
  const hex = colorHex[color];
  const { text, glow } = colorClasses[color];
  const dim = sizeMap[size];
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onChange) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startValue: value };
      setDragging(true);
    },
    [onChange, value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !onChange) return;
      const deltaY = dragRef.current.startY - e.clientY;
      const sensitivity = e.shiftKey ? 0.2 : 0.6;
      const newValue = Math.max(0, Math.min(100, dragRef.current.startValue + deltaY * sensitivity));
      onChange(Math.round(newValue * 100) / 100);
    },
    [onChange],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // Map 0–100 → -135° to +135° (270° sweep)
  const angle = (value / 100) * 270 - 135;

  // SVG arc for the progress ring
  const radius = dim.outer / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (value / 100) * (270 / 360) * circumference;

  return (
    <div className={`flex flex-col items-center ${compact ? "gap-0.5" : "gap-2"} ${className}`}>
      {/* Knob body */}
      <div
        className={[
          "relative flex items-center justify-center",
          onChange ? "cursor-ns-resize" : "",
          dragging ? "scale-[1.02]" : "",
        ].join(" ")}
        style={{ width: dim.outer, height: dim.outer }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Progress ring (SVG) */}
        <svg
          className="absolute inset-0 -rotate-[225deg]"
          width={dim.outer}
          height={dim.outer}
        >
          {/* Background track */}
          <circle
            cx={dim.outer / 2}
            cy={dim.outer / 2}
            r={radius}
            fill="none"
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={3}
          />
          {/* Active arc */}
          <circle
            cx={dim.outer / 2}
            cy={dim.outer / 2}
            r={radius}
            fill="none"
            stroke={hex}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - arcLength}
          />
        </svg>

        {/* Raised outer body */}
        <div
          className="rounded-full bg-surface shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/5 flex items-center justify-center absolute"
          style={{ width: dim.inner, height: dim.inner }}
        >
          {/* Inset track */}
          <div
            className="rounded-full shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] absolute"
            style={{
              inset: dim.inset,
            }}
          />
          {/* Indicator line */}
          <div
            className={`absolute rounded-full ${glow}`}
            style={{
              width: dim.indicator.w,
              height: dim.indicator.h,
              top: dim.indicator.top,
              left: "50%",
              marginLeft: -dim.indicator.w / 2,
              backgroundColor: hex,
              transformOrigin: `50% ${dim.inner / 2 - dim.indicator.top}px`,
              transform: `rotate(${angle}deg)`,
            }}
          />
        </div>
      </div>

      {/* Labels */}
      <div className="text-center leading-none">
        <div
          className={`${compact ? "text-[7px]" : "text-[10px]"} font-bold text-text-secondary uppercase tracking-tight leading-none`}
        >
          {label}
        </div>
        <div
          className={`${compact ? "text-[8px] mt-px text-text-primary" : `text-[10px] mt-0.5 ${text}`} font-bold tabular leading-none`}
        >
          {value}
        </div>
        {!compact && sourceLabel && (
          <div className="text-[10px] font-medium text-text-secondary uppercase tracking-widest mt-0.5">
            {sourceLabel}
          </div>
        )}
      </div>
    </div>
  );
}
