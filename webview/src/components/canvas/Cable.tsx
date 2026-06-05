import { memo } from "react";
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
 * brightness + animated signal-pulse track the live engine RMS level from
 * `useCableMeterStore`. When the Cable is assigned to a named bus via
 * `useBusStore` it becomes "wireless" — the curve is hidden (drawn only as a
 * faint dotted ghost while selected) and the connection is represented by
 * per-port bus badges in `Block`. Routing geometry (bezier vs. manhattan, with
 * fan-out for multi-output Blocks) follows `useAppStore.cableRouting`.
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
  // Phase 5B — wireless: when this cable is on a named bus, hide the curve
  // and let the port-side bus badges represent the connection visually.
  const busName = useBusStore((s) => s.cableBus[id]);
  const isWireless = Boolean(busName);
  const amp = Math.min(1, Math.max(0, level));
  const strokeOpacity = selected ? 1 : 0.4 + amp * 0.6;
  const glowOpacity = 0.05 + amp * 0.4;

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

  return (
    <>
      {/* Selection glow — Section 5.2 Micro-glow */}
      {(selected || amp > 0.01) && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: width + 8 + amp * 6,
            opacity: glowOpacity,
            filter: `blur(${4 + amp * 4}px)`,
          }}
        />
      )}

      {/* Main cable path — intensity follows engine RMS / MIDI activity (§2.4) */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: width + amp * 1.2,
          strokeDasharray: isSidechain ? "6 4" : amp > 0.05 ? "8 16" : undefined,
          strokeLinecap: "round",
          opacity: strokeOpacity,
          filter: `drop-shadow(0 0 ${2 + amp * 4}px ${color}66)`,
          animation: amp > 0.05 ? "signalPulse 1s linear infinite" : "none",
        }}
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
              border: `1px solid ${chipActive(d?.signalType, amp, cvValue) ? color : "#2A2A2E"}`,
              borderRadius: 4,
              padding: "1px 5px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 9,
              lineHeight: "12px",
              color: chipActive(d?.signalType, amp, cvValue) ? color : "#8E8E93",
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

/** True when the chip should light in the cable's signal colour. */
export function chipActive(
  signalType: string | undefined,
  amp: number,
  cvValue: number | undefined,
): boolean {
  if (signalType === "value") return cvValue !== undefined && Math.abs(cvValue) > 0.001;
  return amp > 0.001;
}

/** The chip's text: audio → dB, value → signed 2dp, MIDI → activity, idle → "—". */
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
      return cvValue.toFixed(2);
    }
    case "midi":
      return amp > 0.05 ? "● midi" : "—";
    default: {
      // Audio: presence as dBFS-ish readout from the calibrated level.
      if (amp <= 0.001) return "—";
      const db = 20 * Math.log10(amp);
      return `${db.toFixed(1)} dB`;
    }
  }
}

export const Cable = memo(CableComponent);
