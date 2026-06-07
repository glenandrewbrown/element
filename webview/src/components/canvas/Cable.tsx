import { memo, useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { CableData } from "../../data/types";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import { useAppStore } from "../../stores/useAppStore";
import { useBusStore } from "../../stores/useBusStore";
import { useGraphStore } from "../../stores/useGraphStore";

// Per-port lateral offset between parallel manhattan cables (px).
// Value chosen so cables remain visually distinct without crowding adjacent ports.
const MANHATTAN_FAN_PX = 18;

// ── Signal type → stroke colour ──

const signalColor: Record<string, string> = {
  audio: "#4A90D9",
  midi: "#2BC4C4",
  value: "#E8A838",
};

// ── Channel count → stroke width ──

const channelWidth: Record<number, number> = {
  1: 2,
  2: 3,
  6: 5,
};

// ── Amp quantisation (architect-perf-plan §1.1) ──
// The live engine amp (0..1) is bucketed to 9 discrete steps (0..8) so the
// amp-driven PAINTER styling (glow blur, drop-shadow, opacity — pre-baked into
// `.cbl-a{n}`/`.cbl-glow-a{n}` in index.css) and the bucket-memoised stroke
// style object only change on a bucket crossing (a few Hz) instead of every
// 60Hz meter tick. round() so amp=1 maps to bucket 8, amp=0 to bucket 0.
export const AMP_BUCKETS = 8;
export function ampToBucket(amp: number): number {
  const clamped = Math.min(1, Math.max(0, amp));
  return Math.round(clamped * AMP_BUCKETS);
}

// ── Signal pulse animation ──
// Injected once at module load. Previously a <style> tag was rendered
// inside every Cable component — on a graph with N cables that's N
// duplicate style nodes mounted/unmounted per render. Single injection
// is functionally equivalent and avoids the O(N) DOM churn.

const pulseKeyframes = `
@keyframes signalPulse {
  0% { stroke-dashoffset: 24; }
  100% { stroke-dashoffset: 0; }
}
`;

if (typeof document !== "undefined") {
  const ID = "element-cable-pulse-keyframes";
  if (!document.getElementById(ID)) {
    const tag = document.createElement("style");
    tag.id = ID;
    tag.textContent = pulseKeyframes;
    document.head.appendChild(tag);
  }
}

/**
 * Cable — the React Flow edge that draws a signal path ("Cable") between two
 * Block ports on the Board. Registered as the `cable` edge type
 * (`edgeTypes={{ cable: Cable }}`); rendered for every connection in
 * `useGraphStore.edges`, not mounted directly.
 *
 * Use it as the visual carrier of signal semantics: stroke colour encodes the
 * signal type (audio = blue, MIDI = teal, value/CV = orange), width encodes
 * channel count (1/2/6), a dashed stroke marks a sidechain, and the cable's
 * brightness + a dashed flow-pulse overlay track the live engine RMS level
 * from `useCableMeterStore` (the pulse's march speed and opacity both scale
 * with the real amp, and the overlay is omitted entirely below threshold so an
 * idle cable stays clean). Endpoint plugs (small signal-colour discs with a
 * dark neumorphic ring) anchor each port, and a per-edge `marker-end`
 * arrowhead — with a UNIQUE id per cable so each paints its own colour —
 * shows signal direction (locked bake-off verdict #2, T9a–c). When the Cable
 * is assigned to a named bus via `useBusStore` it becomes "wireless" — the
 * curve is hidden (drawn only as a faint dotted ghost while selected) and the
 * connection is represented by per-port bus badges in `Block`. Routing
 * geometry (bezier — the default since verdict #2 — vs. manhattan, with
 * fan-out for multi-output Blocks) follows `useAppStore.cableRouting`.
 *
 * PERF (architect-perf-plan §1.1/§1.2): the amp-driven painter properties are
 * QUANTISED to a 9-step bucket and routed through pre-baked CSS classes
 * (`.cbl-a{n}` / `.cbl-glow-a{n}` carry the blur/drop-shadow/opacity stops) +
 * bucket-memoised, identity-stable inline style objects for stroke/width — so
 * no painter (`filter: blur`/`drop-shadow`) or strokeWidth float mutates on a
 * 60Hz meter tick, only on a bucket crossing. The flow-pulse march rides the
 * static `.cable-pulse` class + a `--pd` custom property (retiming without a
 * keyframe restart) rather than reassigning the `animation` shorthand per tick.
 *
 * Props are React Flow's injected `EdgeProps`; `data` is cast to `CableData`.
 */
function CableComponent({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const d = data as unknown as CableData | undefined;
  const color = signalColor[d?.signalType ?? "audio"];
  const width = channelWidth[d?.channelCount ?? 2];
  const isSidechain = d?.isSidechain ?? false;
  const level = useCableMeterStore((s) => s.levels[id] ?? 0);
  const routing = useAppStore((s) => s.cableRouting);
  // Flow-Debug mode (logic-routing plan W3): live per-cable readout chip.
  // Both selectors return primitives so a steady graph never re-renders:
  // `flowDebug` is a boolean; the CV value is display-quantised to 2dp INSIDE
  // the selector, so sub-0.01 jitter fails Object.is equality checks upstream
  // of React (the store's epsilon-diff already gates 60Hz pushes).
  const flowDebug = useAppStore((s) => s.flowDebug);
  const cvValue = useCableMeterStore((s) => {
    // Optional-chained: tests/stories may replace-setState with only {levels}.
    const v = s.values?.[id];
    return v === undefined ? undefined : Math.round(v * 100) / 100;
  });
  // CV block-absolute-peak (A5): activity gate for the chip. Last-sample alone
  // aliases on fast bipolar CV (reads ~0 at zero crossings → looks idle), so
  // the chip's ACTIVE state keys off the per-block |peak| latch while the
  // numeric readout stays last-sample. Quantised in-selector (3dp) for the
  // same Object.is re-render discipline as `cvValue` above.
  const cvPeak = useCableMeterStore((s) => {
    const p = s.peaks?.[id];
    return p === undefined ? undefined : Math.round(p * 1000) / 1000;
  });
  // Phase 5B — wireless: when this cable is on a named bus, hide the curve
  // and let the port-side bus badges represent the connection visually.
  const busName = useBusStore((s) => s.cableBus[id]);
  const isWireless = Boolean(busName);
  const amp = Math.min(1, Math.max(0, level));
  // Quantise amp → 0..8 bucket (architect-perf-plan §1.1). ALL amp-derived
  // painter styling is keyed off the bucket (CSS classes `.cbl-a{n}` /
  // `.cbl-glow-a{n}` carry the blur/drop-shadow/opacity stops; the bucketed
  // stroke style objects below are identity-stable per bucket) so nothing
  // mutates a painter inline string on a 60Hz tick — only on a bucket crossing.
  const ampBucket = ampToBucket(amp);
  const ampQ = ampBucket / AMP_BUCKETS;
  // Endpoint plug opacity follows the SAME stops as the main stroke
  // (selected ⇒ 1, else 0.4 + amp*0.6) but quantised to the bucket so the two
  // plug circles don't re-paint a fresh opacity float every tick either.
  // Endpoint plug opacity: minimum floor raised to 0.65 (was 0.4) so an idle
  // plug on the dark chassis (#1E1E22) achieves ≥4.5:1 contrast (G5/T9 Wave-2).
  // Still quantised to the bucket; selected forces full opacity.
  const plugOpacity = selected ? 1 : 0.65 + ampQ * 0.35;
  // Unique per-edge marker id (T9b). A shared id would make ALL cables paint
  // with the FIRST mounted cable's marker colour (a known SVG quirk: <marker>
  // is referenced by url(#id), so identical ids collapse to one definition).
  const markerId = `cable-arrow-${id}`;

  // Manhattan fan-out: when the source block has multiple output ports, splay
  // each port's cable to a different vertical trunk so they don't overlap on
  // the orthogonal mid-segment. Single-output blocks pass through unchanged.
  const fanOffset = useGraphStore((s) => {
    if (routing !== "manhattan") return 0;
    const node = s.nodes.find((n) => n.id === source);
    if (!node) return 0;
    const outPorts = node.ports.filter((p) => p.direction === "output");
    if (outPorts.length <= 1) return 0;
    const idx = outPorts.findIndex((p) => p.id === d?.sourcePort);
    if (idx < 0) return 0;
    // Center the fan around 0 so the visual splay is symmetric across the bundle.
    return (idx - (outPorts.length - 1) / 2) * MANHATTAN_FAN_PX;
  });

  const [edgePath, labelX, labelY] =
    routing === "bezier"
      ? getBezierPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
        })
      : getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          borderRadius: 8,
          centerX:
            fanOffset !== 0 ? (sourceX + targetX) / 2 + fanOffset : undefined,
        });

  // Bucket-memoised stroke style objects (architect-perf-plan §1.1). Reused by
  // reference while the bucket/colour/width/state are unchanged, so React/WebKit
  // see an IDENTITY-STABLE `style` between meter ticks — no per-tick style
  // recalc. `color` carries the signal hue (full for the line, hue@40% for the
  // glow/main `currentColor` drop-shadow); the blur/drop-shadow/opacity live in
  // the `.cbl-*` classes. strokeWidth folds in the small bucketed amp term so
  // it, too, only changes on a bucket crossing — never a per-frame float
  // mutation. Hooks run unconditionally (before the wireless early return) so
  // the hook order stays stable across the wireless branch.
  const glowStyle = useMemo<React.CSSProperties>(
    () => ({
      stroke: color,
      // 40%-alpha hue drives the (CSS) blur layer's own colour; opacity in class.
      color: `${color}66`,
      strokeWidth: width + 8 + ampQ * 6,
    }),
    [color, width, ampQ],
  );
  const mainStyle = useMemo<React.CSSProperties>(
    () => ({
      stroke: color,
      // hue@40% so the CSS `drop-shadow(... currentColor)` matches the old
      // `${color}66` glow softness; the line stroke itself stays full hue above.
      color: `${color}66`,
      strokeWidth: width + ampQ * 1.2,
      strokeDasharray: isSidechain ? "6 4" : undefined,
      strokeLinecap: "round",
    }),
    [color, width, ampQ, isSidechain],
  );
  // Pulse overlay style — identity-stable per bucket. The march DURATION rides
  // the `--pd` custom property (consumed by `.cable-pulse` in CSS) so retiming
  // never restarts the keyframes; opacity is the bucketed 0.3–0.8 band. NO
  // `animation` shorthand and NO painter filter here.
  const pulseStyle = useMemo<React.CSSProperties>(
    () =>
      ({
        stroke: color,
        strokeWidth: width + ampQ * 1.2,
        strokeDasharray: "8 16",
        strokeLinecap: "round",
        opacity: 0.3 + ampQ * 0.5,
        pointerEvents: "none",
        ["--pd"]: `${1.6 - ampQ * 1.1}s`,
      }) as React.CSSProperties,
    [color, width, ampQ],
  );

  if (isWireless) {
    // Wireless cables stay in the React Flow edge graph (so the engine
    // still routes audio and selection works), but their visual is
    // delegated to per-port BusBadge components in Block.tsx. When the
    // user *selects* the wireless cable we still draw a faint dotted
    // ghost so the routing relationship is discoverable on demand —
    // exactly the behaviour from Unreal's Blueprint reroute pins.
    return (
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 1.5 : 0,
          strokeDasharray: "2 6",
          strokeLinecap: "round",
          opacity: selected ? 0.55 : 0,
          pointerEvents: "stroke",
        }}
      />
    );
  }

  // T9c — pulse overlay: a dashed path stroked ON TOP of the main cable whose
  // dash march speed AND opacity scale with the live engine amp. Below the
  // activity threshold no overlay is rendered at all (idle / -∞ stays a clean
  // static cable). CSS keyframes drive the march via the `.cable-pulse` class
  // (architect-perf-plan §1.2); only the DURATION (`--pd`) and opacity vary —
  // both QUANTISED to the amp bucket so they change a few Hz, not 60×/s, and
  // the full `animation` shorthand is NEVER reassigned per tick (which would
  // restart the keyframe sequence → stutter + style recalc on every
  // signal-carrying cable). NOTHING-fake: amp is the real RMS/MIDI level.
  const PULSE_THRESHOLD = 0.05;
  const showPulse = amp > PULSE_THRESHOLD;

  return (
    <>
      {/* Per-edge arrowhead marker (T9b) — UNIQUE id so each cable paints its
          own signal colour. Lives in the cable's <g>, not a shared layer. */}
      <defs>
        {/* T9/Wave-2: strokeWidth units keep the arrowhead proportionally
            visible across the zoom band (0.5×–1.5×). markerWidth/Height 3.5
            in strokeWidth units ≈ 7–17px at the cable's 2–5px stroke range.
            refX 5 tucks the tip flush with the port. */}
        <marker
          id={markerId}
          viewBox="0 0 8 8"
          refX="5"
          refY="4"
          markerWidth="3.5"
          markerHeight="3.5"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill={color} />
        </marker>
      </defs>

      {/* Selection glow — Section 5.2 Micro-glow. Blur + opacity come from the
          bucketed `.cbl-glow-a{n}` class (no per-tick `filter: blur()` string);
          stroke/width from the identity-stable memoised glowStyle. */}
      {(selected || amp > 0.01) && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          className={`cbl-glow-a${ampBucket}`}
          style={glowStyle}
        />
      )}

      {/* Main cable path — intensity follows engine RMS / MIDI activity (§2.4).
          marker-end draws the direction arrowhead in the signal colour. The
          drop-shadow + opacity come from the bucketed `.cbl-a{n}` class (+
          `.cbl-sel` forcing full opacity when selected) — NO per-tick
          `drop-shadow()` string; stroke/width/dash from the memoised mainStyle. */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        className={`cbl-a${ampBucket}${selected ? " cbl-sel" : ""}`}
        style={mainStyle}
      />

      {/* Flow-pulse overlay (T9c) — dashed, amp-scaled march + opacity. Only
          mounted while signal is actually flowing; sidechain keeps its own
          static dash on the main stroke so the overlay sits cleanly on top.
          The march is the static `.cable-pulse` class driven by `--pd` (in
          pulseStyle) — the `animation` shorthand is never reassigned per tick. */}
      {showPulse && !isSidechain && (
        <BaseEdge
          id={`${id}-pulse`}
          path={edgePath}
          className="cable-pulse"
          style={pulseStyle}
        />
      )}

      {/* Endpoint plugs (T9b) — small signal-colour discs with a dark neu ring
          press the cable INTO each port (no blur, per the neumorphic system).
          Drawn at the React-Flow endpoints so they track the live geometry.
          Opacity is bucket-quantised (plugOpacity) so the discs don't repaint a
          fresh opacity float every tick. */}
      {/* r=5 (was 4) + min-opacity 0.65 for ≥4.5:1 contrast on the dark chassis
          at idle. No blur (neumorphic). Opacity bucket-quantised. (T9/Wave-2) */}
      <circle
        cx={sourceX}
        cy={sourceY}
        r={5}
        fill={color}
        stroke="#1A1A1E"
        strokeWidth={1.5}
        opacity={plugOpacity}
        pointerEvents="none"
        data-testid={`cable-plug-source-${id}`}
      />
      <circle
        cx={targetX}
        cy={targetY}
        r={5}
        fill={color}
        stroke="#1A1A1E"
        strokeWidth={1.5}
        opacity={plugOpacity}
        pointerEvents="none"
        data-testid={`cable-plug-target-${id}`}
      />

      {/* Flow-Debug readout chip (W3) — live engine data ONLY (NOTHING-fake):
          audio → dB, value/CV → signed numeric, MIDI → activity, no signal →
          dim "—" (also the intentional rendering for Control-sourced "value"
          cables, which carry no numeric `v` by design). */}
      {flowDebug && (
        <EdgeLabelRenderer>
          <div
            data-testid={`flow-debug-chip-${id}`}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              background: "#1A1A1E",
              border: `1px solid ${chipActive(d?.signalType, amp, cvValue, cvPeak) ? color : "#2A2A2E"}`,
              borderRadius: 4,
              padding: "1px 5px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              // G4: fixed-width digits — without this the chip jitters in
              // width every 60Hz value tick.
              fontVariantNumeric: "tabular-nums",
              fontSize: 9,
              lineHeight: "12px",
              color: chipActive(d?.signalType, amp, cvValue, cvPeak) ? color : "#8E8E93",
              boxShadow:
                "inset 1px 1px 2px rgba(0,0,0,0.4), inset -1px -1px 2px rgba(255,255,255,0.04)",
              whiteSpace: "nowrap",
              zIndex: 5,
            }}
          >
            {chipText(d?.signalType, amp, cvValue)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ── Flow-Debug chip content ──
// Pure functions of (signalType, presence amp, quantised CV value) so the chip
// is trivially unit-testable and never invents data.

/** True when the chip should light in the cable's signal colour.
 *  CV cables gate on the per-block |peak| latch (A5) — a fast bipolar CV can
 *  read ~0 at every block-end zero crossing, so last-sample alone looks idle.
 *  Falls back to |last-sample| when the host predates the `pk` field. */
export function chipActive(
  signalType: string | undefined,
  amp: number,
  cvValue: number | undefined,
  cvPeak?: number,
): boolean {
  if (signalType === "value") {
    const presence = cvPeak ?? (cvValue !== undefined ? Math.abs(cvValue) : undefined);
    return presence !== undefined && presence > 0.001;
  }
  return amp > 0.001;
}

/** The chip's text (G4): audio → dB (silent = "-∞ dB"), value → ALWAYS-signed
 *  2dp ("+0.50"/"-0.50"), MIDI → activity dot "●" only, no feed → "—". */
export function chipText(
  signalType: string | undefined,
  amp: number,
  cvValue: number | undefined,
): string {
  switch (signalType) {
    case "value": {
      // Control-sourced cables have no numeric feed (host folds Control+CV
      // into "value" but only CV carries `v`) — show the idle dash.
      if (cvValue === undefined) return "—";
      // ALWAYS signed (G4): polarity is the signal on a CV cable. Normalise
      // the float "-0.00" artefact so zero always reads "+0.00".
      const fixed = cvValue.toFixed(2);
      if (fixed === "-0.00") return "+0.00";
      return fixed.startsWith("-") ? fixed : `+${fixed}`;
    }
    case "midi":
      // Dot only (G4) — the teal already says "MIDI"; the word was redundant.
      return amp > 0.05 ? "●" : "—";
    default: {
      // Audio: presence as dBFS-ish readout from the calibrated level.
      // Silence is honest "-∞ dB" (G4), not an ambiguous dash.
      if (amp <= 0.001) return "-∞ dB";
      const db = 20 * Math.log10(amp);
      return `${db.toFixed(1)} dB`;
    }
  }
}

export const Cable = memo(CableComponent);
