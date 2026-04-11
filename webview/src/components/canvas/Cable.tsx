import { memo, useId } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { CableData } from "../../data/types";
import { useCableMeterStore } from "../../stores/useCableMeterStore";

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

// ── Animated pulse component for signal flow ──

function AnimatedPulse({
  path,
  color,
  speed,
  size,
}: {
  path: string;
  color: string;
  speed: number;
  size: number;
}) {
  const gradientId = useId();
  const duration = Math.max(0.5, 2 - speed * 1.5); // Faster with more signal
  
  return (
    <g>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity="0">
            <animate
              attributeName="offset"
              values="-0.3;1.1"
              dur={`${duration}s`}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="15%" stopColor={color} stopOpacity="0.8">
            <animate
              attributeName="offset"
              values="-0.15;1.25"
              dur={`${duration}s`}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="30%" stopColor={color} stopOpacity="0">
            <animate
              attributeName="offset"
              values="0;1.4"
              dur={`${duration}s`}
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={size}
        strokeLinecap="round"
      />
    </g>
  );
}

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
  const amp = Math.min(1, Math.max(0, level));
  const strokeOpacity = selected ? 1 : 0.38 + amp * 0.62;
  const glowOpacity = 0.08 + amp * 0.35;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      {/* Selection glow */}
      {(selected || amp > 0.02) && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: width + 6 + amp * 4,
            opacity: glowOpacity,
          }}
        />
      )}

      {/* Main cable path — intensity follows engine RMS / MIDI activity (§2.4) */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: width + amp * 1.5,
          strokeDasharray: isSidechain ? "6 3" : undefined,
          strokeLinecap: "round",
          opacity: strokeOpacity,
          filter: `drop-shadow(0 0 ${1 + amp * 3}px ${color}55)`,
        }}
      />

      {/* Signal flow pulse animation - only when signal is active */}
      {amp > 0.05 && (
        <AnimatedPulse 
          path={edgePath} 
          color={color} 
          speed={amp} 
          size={width + 2}
        />
      )}
    </>
  );
}

export const Cable = memo(CableComponent);
