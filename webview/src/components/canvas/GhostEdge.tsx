import { memo, useCallback } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { SignalType } from "../../data/types";

// ── Signal type → stroke colour (matches Cable.tsx / the locked palette) ──

const signalColor: Record<string, string> = {
  audio: "#4A90D9",
  midi: "#2BC4C4",
  value: "#E8A838",
};

/**
 * Data carried by a ghost edge. `top` marks the closest / primary suggestion
 * (the one Enter accepts), which is drawn slightly brighter and labelled.
 */
export interface GhostEdgeData {
  [key: string]: unknown;
  signalType: SignalType;
  top?: boolean;
  /** Promote THIS ghost to a real Cable (wired by GraphCanvas). */
  onAccept?: (id: string) => void;
}

/**
 * GhostEdge — a faded, dashed "suggested cable" rendered UNDER the real Cables
 * while a Block is dragged near a compatible neighbour (auto-route suggestions,
 * ported from the JUCE GhostConnectorComponent). It is visually distinct from a
 * real Cable: dashed, low-opacity, no signal pulse, no glow. Clicking it
 * promotes the suggestion to a real Cable via `data.onAccept`.
 *
 * Registered as the `ghost` edge type. Props are React Flow's `EdgeProps`.
 */
function GhostEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const d = data as GhostEdgeData | undefined;
  const color = signalColor[d?.signalType ?? "audio"];
  const isTop = d?.top ?? false;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const accept = useCallback(() => {
    d?.onAccept?.(id);
  }, [d, id]);

  return (
    <>
      {/* Wide transparent hit-path so the thin dashed ghost is easy to click. */}
      <BaseEdge
        id={`${id}-hit`}
        path={edgePath}
        style={{
          stroke: "transparent",
          strokeWidth: 16,
          pointerEvents: "stroke",
          cursor: "pointer",
        }}
        interactionWidth={20}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: isTop ? 2.5 : 1.75,
          strokeDasharray: "4 5",
          strokeLinecap: "round",
          // Low-opacity so a suggestion never reads as a committed Cable.
          opacity: isTop ? 0.6 : 0.38,
          pointerEvents: "none",
        }}
      />
      <EdgeLabelRenderer>
        {/* Click target + (for the primary) an inline "Tab" accept hint. The
            wrapper is the click surface; nodrag/nopan keep the canvas still. */}
        <button
          type="button"
          onClick={accept}
          title="Accept suggested cable — click, press Enter, or drop while holding ⌘/Ctrl"
          aria-label="Accept suggested cable"
          className="nodrag nopan"
          style={{
            position: "absolute",
            // T11(b): offset 18px above the cable midpoint so chip never
            // overlaps the stroke. Neumorphic pressed-surface backing chip.
            transform: `translate(-50%, calc(-50% - 18px)) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            background: isTop ? "#1A1A1E" : "transparent",
            border: isTop ? `1px solid ${color}66` : "1px solid transparent",
            boxShadow: isTop
              ? "inset 1px 1px 3px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(255,255,255,0.04)"
              : "none",
            color,
            borderRadius: 4,
            fontSize: 9,
            lineHeight: "14px",
            padding: isTop ? "1px 6px" : "6px",
            cursor: "pointer",
            opacity: isTop ? 0.95 : 0.0001,
            fontFamily: "ui-monospace, monospace",
            whiteSpace: "nowrap",
          }}
        >
          {isTop ? "↵ to connect" : "+"}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export const GhostEdge = memo(GhostEdgeComponent);
