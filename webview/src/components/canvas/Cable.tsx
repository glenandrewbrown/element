import { memo } from "react";
import {
  BaseEdge,
  getSmoothStepPath,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { CableData } from "../../data/types";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import { useAppStore } from "../../stores/useAppStore";
import { useBusStore } from "../../stores/useBusStore";

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

const pulseKeyframes = `
@keyframes signalPulse {
  0% { stroke-dashoffset: 24; }
  100% { stroke-dashoffset: 0; }
}
`;

function CableComponent({
  id,
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
  // Phase 5B — wireless: when this cable is on a named bus, hide the curve
  // and let the port-side bus badges represent the connection visually.
  const busName = useBusStore((s) => s.cableBus[id]);
  const isWireless = Boolean(busName);
  const amp = Math.min(1, Math.max(0, level));
  const strokeOpacity = selected ? 1 : 0.4 + amp * 0.6;
  const glowOpacity = 0.05 + amp * 0.4;

  const [edgePath] =
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
      <style>{pulseKeyframes}</style>

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
    </>
  );
}

export const Cable = memo(CableComponent);
