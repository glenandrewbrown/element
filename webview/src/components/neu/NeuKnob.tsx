const colorHex = {
  blue: "#4A90D9",
  orange: "#E8A838",
  teal: "#2BC4C4",
} as const;

const colorClasses = {
  blue: {
    text: "text-generator",
    glow: "shadow-[0_0_4px_rgba(74,144,217,0.6)]",
  },
  orange: {
    text: "text-modifier",
    glow: "shadow-[0_0_4px_rgba(232,168,56,0.6)]",
  },
  teal: { text: "text-logic", glow: "shadow-[0_0_4px_rgba(43,196,196,0.6)]" },
} as const;

const sizeMap = {
  sm: { outer: 48, inner: 32, inset: 8, indicator: { w: 4, h: 10, top: 4 } },
  md: { outer: 64, inner: 48, inset: 8, indicator: { w: 4, h: 12, top: 4 } },
  lg: { outer: 80, inner: 56, inset: 12, indicator: { w: 4, h: 14, top: 6 } },
} as const;

interface NeuKnobProps {
  /** 0–100 */
  value: number;
  label: string;
  sourceLabel?: string;
  color?: "blue" | "orange" | "teal";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function NeuKnob({
  value,
  label,
  sourceLabel,
  color = "blue",
  size = "md",
  className = "",
}: NeuKnobProps) {
  const hex = colorHex[color];
  const { text, glow } = colorClasses[color];
  const dim = sizeMap[size];

  // Map 0–100 → -135° to +135° (270° sweep)
  const angle = (value / 100) * 270 - 135;

  // SVG arc for the progress ring
  const radius = dim.outer / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (value / 100) * (270 / 360) * circumference;

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* Knob body */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: dim.outer, height: dim.outer }}
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
          className="rounded-full bg-[#252529] shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/5 flex items-center justify-center absolute"
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
        <div className="text-[10px] font-bold text-text-primary uppercase tracking-tight">
          {label}
        </div>
        <div className={`text-[10px] font-bold tabular mt-0.5 ${text}`}>
          {value}
        </div>
        {sourceLabel && (
          <div className="text-[10px] font-medium text-text-secondary uppercase tracking-widest mt-0.5">
            {sourceLabel}
          </div>
        )}
      </div>
    </div>
  );
}
