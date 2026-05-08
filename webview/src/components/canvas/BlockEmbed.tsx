import { memo, useState } from "react";
import type { BlockCategory } from "../../data/types";
import { useParameterStore } from "../../stores/useParameterStore";

// ── Design tokens ──

const CATEGORY_COLOR: Record<BlockCategory, string> = {
  generator: "#4A90D9",
  modifier: "#E8A838",
  logic: "#2BC4C4",
};

const SHADOW_PRESSED =
  "inset 1px 1px 3px rgba(0,0,0,0.4), inset -1px -1px 2px rgba(255,255,255,0.03)";

// ── Parameter data ──
//
// Pulled live from `useParameterStore`, which is fed by the C++ host's
// 15 Hz delta channel (`onParameterUpdate`). Names are synthesised when no
// metadata is available — mini fader strips don't need full names, three
// characters are enough to disambiguate at expanded zoom.

interface MiniParam {
  name: string;
  /** 0–1 normalised */
  value: number;
}

const FALLBACK_NAMES: ReadonlyArray<string> = [
  "Gain",
  "Pan",
  "Mix",
  "Freq",
  "Q",
];

function synthName(idx: number): string {
  return FALLBACK_NAMES[idx] ?? `P${idx + 1}`;
}

// ── ParamStripEmbed ──

interface MiniFaderProps {
  param: MiniParam;
  color: string;
}

function MiniFader({ param, color }: MiniFaderProps) {
  const [hovered, setHovered] = useState(false);
  const fillPct = `${Math.round(param.value * 100)}%`;

  return (
    <div
      className="flex flex-col items-center gap-0.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Value tooltip on hover */}
      <div
        className="text-[9px] tabular-nums font-bold transition-opacity duration-100"
        style={{
          color,
          opacity: hovered ? 1 : 0,
          minHeight: 11,
        }}
      >
        {Math.round(param.value * 100)}
      </div>

      {/* Track */}
      <div
        className="w-1 rounded-sm relative overflow-hidden"
        style={{
          height: 32,
          backgroundColor: "#1A1A1E",
          boxShadow: SHADOW_PRESSED,
        }}
      >
        {/* Fill — grows from bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm transition-none"
          style={{
            height: fillPct,
            backgroundColor: color,
            opacity: 0.85,
          }}
        />
      </div>

      {/* Param name */}
      <span
        className="text-[10px] font-medium uppercase tracking-tighter text-center leading-none"
        style={{ color: "rgba(229,229,234,0.4)", maxWidth: 24 }}
      >
        {param.name.slice(0, 3)}
      </span>
    </div>
  );
}

interface ParamStripEmbedProps {
  nodeId?: string;
  category: BlockCategory;
  /** How many faders to show (3–5) */
  count?: number;
}

function ParamStripEmbed({ nodeId, category, count = 4 }: ParamStripEmbedProps) {
  const color = CATEGORY_COLOR[category];
  const visible = Math.max(3, Math.min(5, count));

  // Pull the first `visible` parameter values for this node from the store.
  // Subscribe with a stable selector so unrelated updates don't re-render us.
  const values = useParameterStore((st) => {
    const out: number[] = new Array(visible);
    if (!nodeId) {
      for (let i = 0; i < visible; ++i) out[i] = NaN;
      return out;
    }
    const prefix = `${nodeId}:`;
    for (let i = 0; i < visible; ++i) {
      const v = st.values[prefix + i];
      out[i] = typeof v === "number" ? v : NaN;
    }
    return out;
  });

  const params: MiniParam[] = values.map((v, i) => ({
    name: synthName(i),
    value: Number.isFinite(v) ? v : 0,
  }));

  return (
    <div className="flex items-end justify-around px-1 py-1">
      {params.map((p, i) => (
        <MiniFader key={i} param={p} color={color} />
      ))}
    </div>
  );
}

// ── MeterEmbed ──

interface MeterBarProps {
  /** 0–1 level */
  level: number;
  /** 0–1 peak hold position */
  peak: number;
}

function MeterBar({ level, peak }: MeterBarProps) {
  const levelPct = `${Math.round(level * 100)}%`;
  const peakPct = `${Math.round(peak * 100)}%`;

  // Green → yellow → red gradient segments
  const barGradient =
    "linear-gradient(to top, #34D399 0%, #34D399 60%, #E8A838 80%, #EF4444 100%)";

  return (
    <div
      className="relative rounded-sm overflow-hidden"
      style={{
        width: 3,
        height: 32,
        backgroundColor: "#1A1A1E",
        boxShadow: SHADOW_PRESSED,
      }}
    >
      {/* Level fill */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: levelPct,
          background: barGradient,
          opacity: 0.9,
        }}
      />
      {/* Peak hold indicator */}
      <div
        className="absolute left-0 right-0"
        style={{
          height: 1,
          bottom: peakPct,
          backgroundColor: "rgba(255,255,255,0.7)",
        }}
      />
    </div>
  );
}

interface MeterEmbedProps {
  /** Left channel 0–1 */
  leftLevel?: number;
  /** Right channel 0–1 */
  rightLevel?: number;
  /** Peak hold 0–1 */
  leftPeak?: number;
  rightPeak?: number;
}

function MeterEmbed({
  // Defaults are 0 (silent) until per-block meter bridge channel
  // lands (Q-VU-PER-BLOCK). Rendering an honest empty meter is
  // preferred to fabricated levels.
  leftLevel = 0,
  rightLevel = 0,
  leftPeak = 0,
  rightPeak = 0,
}: MeterEmbedProps) {
  return (
    <div
      className="flex items-end justify-center gap-0.5 px-1 py-1 rounded-sm"
      style={{
        backgroundColor: "#1A1A1E",
        boxShadow: SHADOW_PRESSED,
        height: 40,
      }}
    >
      <MeterBar level={leftLevel} peak={leftPeak} />
      <MeterBar level={rightLevel} peak={rightPeak} />
      <span
        className="text-[9px] font-bold ml-0.5 self-end mb-0.5"
        style={{ color: "rgba(229,229,234,0.3)" }}
      >
        L R
      </span>
    </div>
  );
}

// ── SpectrumEmbed ──

function SpectrumEmbed() {
  // Static bezier placeholder — a gentle EQ-style curve
  const w = 80;
  const h = 32;
  const mid = h / 2;

  // Control points for a subtle S-curve EQ shape
  const path = [
    `M 0 ${mid + 4}`,
    `C 12 ${mid + 8} 20 ${mid - 12} 30 ${mid - 8}`,
    `C 42 ${mid - 4} 52 ${mid + 6} 60 ${mid - 2}`,
    `C 70 ${mid - 10} 76 ${mid + 4} ${w} ${mid + 2}`,
  ].join(" ");

  // Filled area below curve
  const fillPath = [
    `M 0 ${h}`,
    `L 0 ${mid + 4}`,
    `C 12 ${mid + 8} 20 ${mid - 12} 30 ${mid - 8}`,
    `C 42 ${mid - 4} 52 ${mid + 6} 60 ${mid - 2}`,
    `C 70 ${mid - 10} 76 ${mid + 4} ${w} ${mid + 2}`,
    `L ${w} ${h}`,
    "Z",
  ].join(" ");

  return (
    <div
      className="rounded-sm overflow-hidden"
      style={{
        width: w,
        height: h + 8,
        backgroundColor: "#1A1A1E",
        boxShadow: SHADOW_PRESSED,
        padding: "4px 0 0 0",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ display: "block" }}
      >
        {/* Fill area */}
        <path d={fillPath} fill="rgba(232,168,56,0.08)" />
        {/* Curve line */}
        <path
          d={path}
          fill="none"
          stroke="rgba(232,168,56,0.55)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Zero line */}
        <line
          x1={0}
          y1={mid}
          x2={w}
          y2={mid}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.5}
        />
      </svg>
    </div>
  );
}

// ── BlockEmbed (root component) ──

export interface BlockEmbedProps {
  nodeId: string;
  category: BlockCategory;
  /** When true, suppress all sub-embeds (semantic zoom compact mode) */
  compact?: boolean;
}

function BlockEmbedComponent({ nodeId, category, compact = false }: BlockEmbedProps) {
  if (compact) return null;

  const isModifier = category === "modifier";

  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1">
      {/* Param strip — shown for all categories */}
      <ParamStripEmbed nodeId={nodeId} category={category} count={isModifier ? 5 : 3} />

      {/* Meter — generators and modifiers */}
      {(category === "generator" || category === "modifier") && (
        <div className="flex items-center justify-between gap-1">
          <MeterEmbed />
          {/* Spectrum only for modifiers (EQ / spectral processors) */}
          {isModifier && <SpectrumEmbed />}
        </div>
      )}

      {/* Logic blocks: just param strip + compact meter */}
      {category === "logic" && (
        <div className="flex items-center justify-end">
          <MeterEmbed />
        </div>
      )}
    </div>
  );
}

export const BlockEmbed = memo(BlockEmbedComponent);

// Named sub-component exports for composability
export { ParamStripEmbed, MeterEmbed, SpectrumEmbed };
