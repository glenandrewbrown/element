import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { CableData } from "../../data/types";

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
      {selected && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: width + 6,
            opacity: 0.12,
          }}
        />
      )}

      {/* Main cable path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: width,
          strokeDasharray: isSidechain ? "6 3" : undefined,
          strokeLinecap: "round",
          opacity: selected ? 1 : 0.7,
          filter: "drop-shadow(0 0 1px rgba(0,0,0,0.5))",
        }}
      />
    </>
  );
}

export const Cable = memo(CableComponent);
