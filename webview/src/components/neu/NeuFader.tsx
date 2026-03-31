const colorHex = {
  blue: "#4A90D9",
  orange: "#E8A838",
  teal: "#2BC4C4",
} as const;

interface NeuFaderProps {
  /** 0–100 */
  value: number;
  orientation?: "vertical" | "horizontal";
  label?: string;
  color?: "blue" | "orange" | "teal";
  className?: string;
}

export function NeuFader({
  value,
  orientation = "horizontal",
  label,
  color = "blue",
  className = "",
}: NeuFaderProps) {
  const hex = colorHex[color];
  const pct = `${Math.max(0, Math.min(100, value))}%`;
  const isVert = orientation === "vertical";

  if (isVert) {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        {/* Track */}
        <div className="w-8 h-28 bg-[#1A1A1E] shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] rounded-sm relative flex flex-col items-center py-2">
          {/* Fill */}
          <div
            className="absolute bottom-2 w-1.5 rounded-full opacity-20"
            style={{ height: pct, backgroundColor: hex }}
          />
          {/* Peak hold */}
          <div
            className="absolute w-4 h-px bg-white/40"
            style={{ bottom: `calc(${pct} + 8px)` }}
          />
          {/* Thumb */}
          <div
            className="absolute w-6 h-3 bg-[#252529] shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border-y border-white/5 z-10 rounded-sm"
            style={{ bottom: pct }}
          />
        </div>
        {/* Label stack */}
        {label && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-primary uppercase leading-none">
              {label}
            </span>
            <span
              className="text-[10px] font-bold tabular"
              style={{ color: hex }}
            >
              {value}%
            </span>
          </div>
        )}
      </div>
    );
  }

  // Horizontal (default — matches edit-mode.html GAIN/PAN faders)
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {label && (
        <span className="text-[10px] text-text-secondary w-8 shrink-0">
          {label}
        </span>
      )}
      {/* Track */}
      <div className="flex-1 h-1.5 bg-[#131317] rounded-full relative overflow-visible">
        {/* Fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: pct, backgroundColor: hex }}
        />
        {/* Peak hold */}
        <div
          className="absolute top-0 h-full w-px bg-white/40"
          style={{ left: `calc(${pct} + 2px)` }}
        />
        {/* Thumb */}
        <div
          className="absolute -top-[5px] w-2 h-4 bg-[#252529] rounded shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/10"
          style={{ left: pct }}
        />
      </div>
      <span
        className="text-[10px] tabular font-bold w-12 text-right shrink-0"
        style={{ color: hex }}
      >
        {value}%
      </span>
    </div>
  );
}
