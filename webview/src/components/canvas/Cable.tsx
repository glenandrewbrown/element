import { memo } from "react";
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
    </>
  );
}

export const Cable = memo(CableComponent);
