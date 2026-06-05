import { memo, useEffect, useRef } from "react";
import type { BlockCategory } from "../../data/types";
import { useBlockOutputLevel } from "../../stores/useCableMeterStore";
import { useNodeSpectrum } from "../../hooks/useNodeSpectrum";

// ── Design tokens ──

const SHADOW_PRESSED =
  "inset 1px 1px 3px rgba(0,0,0,0.4), inset -1px -1px 2px rgba(255,255,255,0.03)";

// NOTE — the generic GAIN/PAN/MIX/FREQ/Q mini-fader strip was REMOVED here
// (Glen, 2026-06-03). It synthesised parameter NAMES from a hardcoded fallback
// list ("Gain","Pan","Mix","Freq","Q"), so it misreported every hosted plugin's
// real controls — e.g. a Valhalla reverb's true params are Mix/Feedback/Density,
// never "Pan"/"Freq"/"Q". Showing fabricated labels violates the nothing-fake
// rule (a fader labelled "Gain" that doesn't move the plugin's gain is a lie).
// The honest, real-data embeds (live output meter + host FFT spectrum) stay.
// Real per-parameter values, when genuinely the plugin's, surface on the
// STANDARD-tier on-Block knobs (Block.tsx, indexed P1/P2/P3 — index-honest, no
// invented names) and in the Inspector. Do NOT reintroduce a synthesised-name
// fader strip; lean = remove, not replace-with-fake.

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

interface SpectrumEmbedProps {
  /** Real 0..1 magnitude bins from `useNodeSpectrum` (host FFT). Empty → honest
   *  "No spectrum" placeholder. NEVER a synthesised curve. */
  bins?: number[];
}

/**
 * SpectrumEmbed — a live FFT spectrum strip (G3-B item 1).
 *
 * When `bins` carries real magnitude data (host-computed via juce::dsp::FFT,
 * see useNodeSpectrum), draws the spectrum as magnitude bars on a <canvas> in
 * the audiofx accent. When `bins` is empty — no signal, no audio output, nobody
 * subscribed, or no bridge (Storybook/Vite) — renders the SAME honest
 * "No spectrum" placeholder as before. The previous static bezier curve was a
 * fake (identical regardless of audio) and stays deleted: do NOT reintroduce a
 * synthesised curve.
 */
function SpectrumEmbed({ bins = [] }: SpectrumEmbedProps) {
  const w = 80;
  const h = 24;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasData = bins.length > 0;

  useEffect(() => {
    if (!hasData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Backing-store size (logical px — keep it cheap, no DPR scaling needed for
    // this tiny strip). Clear, then draw log-spaced magnitude bars.
    const W = w;
    const H = h + 8;
    ctx.clearRect(0, 0, W, H);

    const n = bins.length;
    const bars = 28; // condense 1024 bins into ~28 bars for the strip
    ctx.fillStyle = "#E8A838"; // audiofx accent
    for (let b = 0; b < bars; ++b) {
      // Log-spaced bucket over the bins (audio spectra read best on a log axis).
      const lo = Math.floor((Math.pow(b / bars, 2) * (n - 1)) | 0);
      const hi = Math.max(
        lo + 1,
        Math.floor((Math.pow((b + 1) / bars, 2) * (n - 1)) | 0),
      );
      let mag = 0;
      for (let i = lo; i < hi && i < n; ++i) mag = Math.max(mag, bins[i]);
      // Map magnitude to a pseudo-log height so quiet content stays visible.
      const norm = mag <= 0 ? 0 : Math.min(1, Math.max(0, 1 + Math.log10(mag) / 3));
      const barH = Math.round(norm * (H - 2));
      const x = Math.round((b / bars) * W);
      const bw = Math.max(1, Math.floor(W / bars) - 1);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, H - barH, bw, barH);
    }
    ctx.globalAlpha = 1;
  }, [bins, hasData, w, h]);

  if (!hasData) {
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

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h + 8}
      role="img"
      aria-label="Spectrum"
      className="rounded-sm overflow-hidden"
      style={{
        width: w,
        height: h + 8,
        backgroundColor: "#1A1A1E",
        boxShadow: SHADOW_PRESSED,
      }}
    />
  );
}

// ── BlockEmbed (root component) ──

export interface BlockEmbedProps {
  /**
   * Id of the Block this embed belongs to. Keys the REAL data sources for this
   * specific Block: its output level via `useBlockOutputLevel(nodeId)` (meter)
   * and its host FFT via `useNodeSpectrum(nodeId)` (audiofx spectrum strip).
   */
  nodeId: string;
  /**
   * Block category — selects the sub-embed layout: instruments/audiofx get an
   * output meter (audiofx also gets a live spectrum strip), midifx/modulator
   * get a compact meter only. (The old generic param-fader strip was removed —
   * it fabricated parameter names; see the note at the top of this file.)
   */
  category: BlockCategory;
  /** When true, suppress all sub-embeds (semantic zoom compact mode). */
  compact?: boolean;
}

/**
 * BlockEmbed — the in-Block instrument panel shown only at the expanded
 * semantic-zoom tier. Rendered inside `Block` when the user zooms in close, it
 * surfaces a Block's REAL output level (meter) and — for audiofx — a live host
 * FFT spectrum strip, so an expert can read and trust a Block's signal without
 * opening the full plugin window. Every embed shows real engine data only; the
 * old generic param-fader strip was removed (it fabricated parameter names —
 * see the note at the top of this file). Mount it via `Block`'s zoom gating
 * rather than standalone.
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

  // REAL FFT spectrum for the audiofx slot (G3-B item 1). Called
  // unconditionally (hook-order stability across the zoom-gated mount) but only
  // ACTIVE — i.e. subscribed + polled — for an expanded audiofx block, so the
  // audio-thread FFT tap is scoped to exactly the blocks whose spectrum is on
  // screen. Returns [] (→ honest "No spectrum") in Storybook/Vite (no bridge).
  const isAudioFx = category === "audiofx";
  const spectrumBins = useNodeSpectrum(nodeId, isAudioFx && !compact);

  if (compact) return null;

  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      {/* Meter — instruments and audiofx. The output meter is the lead readout
          now the fabricated-name fader strip is gone. */}
      {(category === "instrument" || category === "audiofx") && (
        <div className="flex items-center justify-between gap-1">
          <MeterEmbed leftLevel={level} rightLevel={level} leftPeak={level} rightPeak={level} />
          {/* Spectrum slot only for audiofx (EQ / spectral processors). Live
              FFT bins from the host (G3-B item 1); empty → honest "No spectrum"
              placeholder (silent / no bridge / nobody subscribed). */}
          {isAudioFx && <SpectrumEmbed bins={spectrumBins} />}
        </div>
      )}

      {/* midifx and modulator: compact meter only. */}
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
export { MeterEmbed, SpectrumEmbed };
