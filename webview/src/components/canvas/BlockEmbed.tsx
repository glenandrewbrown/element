import { memo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { BlockCategory } from "../../data/types";
import { useParameterStore } from "../../stores/useParameterStore";
import { useBlockOutputLevel } from "../../stores/useCableMeterStore";

// ── Design tokens ──

const CATEGORY_COLOR: Record<BlockCategory, string> = {
  instrument: "#4A90D9",
  audiofx: "#E8A838",
  midifx: "#2BC4C4",
  modulator: "#A87FE0",
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
      className="flex flex-col items-center gap-0.5 relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Value tooltip on hover — absolutely positioned so it stays OUT of the
          flex flow; an in-flow row would add ~11px of permanent height to every
          expanded block (LAYOUT-P1). Floats above the track on hover instead. */}
      <div
        className="absolute -top-2.5 text-[9px] tabular-nums font-bold transition-opacity duration-100 pointer-events-none z-10"
        style={{
          color,
          opacity: hovered ? 1 : 0,
        }}
      >
        {Math.round(param.value * 100)}
      </div>

      {/* Track — compressed 32→20px to keep the expanded block within budget */}
      <div
        className="w-1 rounded-sm relative overflow-hidden"
        style={{
          height: 20,
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
  // The selector derives a fresh array on every call, so it MUST be wrapped
  // in `useShallow`: Zustand v5 forwards the raw selector result to React's
  // `useSyncExternalStore`, which compares it with `Object.is`. A new array
  // each call is never `Object.is`-equal to the previous one, so React would
  // treat the snapshot as perpetually changed and loop forever ("The result
  // of getSnapshot should be cached" → "Maximum update depth exceeded").
  // `useShallow` element-compares and returns the cached array when unchanged.
  const values = useParameterStore(
    useShallow((st) => {
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
    }),
  );

  const params: MiniParam[] = values.map((v, i) => ({
    name: synthName(i),
    value: Number.isFinite(v) ? v : 0,
  }));

  return (
    <div className="flex items-end justify-around px-1 py-0.5">
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
        height: 24,
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
  // Levels are fed REAL signal by BlockEmbed via `useBlockOutputLevel`
  // (max live cable level over the Block's outgoing edges, host-pushed
  // ~60Hz — the same end-to-end-wired source Block.tsx's RmsMeter uses).
  // Defaults stay 0 so the meter renders an HONEST empty state (silent)
  // when no signal flows or when mounted standalone — never fabricated.
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
        height: 32,
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
  // HONEST EMPTY STATE — there is no FFT/spectrum data stream in the app.
  // The previous static bezier curve was a fake (identical shape regardless of
  // audio); per the "nothing fake ships" rule it has been removed. This renders
  // an explicit "spectrum unavailable" placeholder on the same dark inset
  // surface as the sibling meter — an EmptyState-style honest stand-in that
  // keeps the expanded-Block height budget (BLOCK-OVERLAP).
  //
  // Q-FFT: when a real per-block FFT bridge lands (a spectrum channel pushed
  // from the C++ host, mirroring the cable-level channel), replace this with a
  // live analyser that draws REAL magnitude bins. Do NOT reintroduce a
  // synthesised curve.
  const w = 80;
  const h = 24;

  return (
    <div
      role="status"
      aria-label="Spectrum unavailable"
      className="flex items-center justify-center rounded-sm overflow-hidden"
      style={{
        width: w,
        height: h + 8,
        backgroundColor: "#1A1A1E",
        boxShadow: SHADOW_PRESSED,
      }}
    >
      <span
        className="text-[8px] font-medium uppercase tracking-wide text-center leading-none"
        style={{ color: "rgba(229,229,234,0.28)" }}
      >
        No spectrum
      </span>
    </div>
  );
}

// ── BlockEmbed (root component) ──

export interface BlockEmbedProps {
  /**
   * Id of the Block this embed belongs to. Used to key live parameter values
   * out of `useParameterStore` (`${nodeId}:${index}`) so the mini faders track
   * the host's 15 Hz delta channel for this specific Block.
   */
  nodeId: string;
  /**
   * Block category — selects the semantic accent colour and the sub-embed
   * layout: generators/modifiers get a meter (modifiers also get a spectrum
   * curve), logic Blocks get a param strip + compact meter only.
   */
  category: BlockCategory;
  /** When true, suppress all sub-embeds (semantic zoom compact mode). */
  compact?: boolean;
}

/**
 * BlockEmbed — the rich in-Block instrument panel shown only at the expanded
 * semantic-zoom tier. Rendered inside `Block` when the user zooms in close, it
 * surfaces a Block's live parameters (mini fader strip), output level (meter),
 * and — for modifiers — a spectrum/EQ curve, so an expert can read and trust a
 * Block's state without opening the full plugin window. Mount it via `Block`'s
 * zoom gating rather than standalone; it reads parameter values live from
 * `useParameterStore` keyed by `nodeId`.
 */
function BlockEmbedComponent({ nodeId, category, compact = false }: BlockEmbedProps) {
  // REAL output level for this Block's meter — max live cable level over its
  // outgoing edges (host-pushed ~60Hz via useCableMeterStore), the same
  // end-to-end-wired source Block.tsx's RmsMeter uses. Called unconditionally
  // BEFORE the compact early-return so hook order stays stable across the
  // zoom-gated mount/unmount. The hook's selector returns a number and is
  // re-render-safe (see useBlockOutputLevel). Fed to both stereo bars — an
  // honest mono-derived stereo, matching Block.tsx (no fabricated L≠R split
  // until a per-channel RMS bridge lands).
  const level = useBlockOutputLevel(nodeId);

  if (compact) return null;

  const isAudioFx = category === "audiofx";

  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      {/* Param strip — shown for all categories */}
      <ParamStripEmbed nodeId={nodeId} category={category} count={isAudioFx ? 5 : 3} />

      {/* Meter — instruments and audiofx */}
      {(category === "instrument" || category === "audiofx") && (
        <div className="flex items-center justify-between gap-1">
          <MeterEmbed leftLevel={level} rightLevel={level} leftPeak={level} rightPeak={level} />
          {/* Spectrum slot only for audiofx (EQ / spectral processors).
              Currently an honest "no spectrum" placeholder — no FFT bridge
              exists yet (Q-FFT). */}
          {isAudioFx && <SpectrumEmbed />}
        </div>
      )}

      {/* midifx and modulator: just param strip + compact meter */}
      {(category === "midifx" || category === "modulator") && (
        <div className="flex items-center justify-end">
          <MeterEmbed leftLevel={level} rightLevel={level} leftPeak={level} rightPeak={level} />
        </div>
      )}
    </div>
  );
}

export const BlockEmbed = memo(BlockEmbedComponent);

// Named sub-component exports for composability
export { ParamStripEmbed, MeterEmbed, SpectrumEmbed };
