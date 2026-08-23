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
 * `index` (1-based, 1..9) drives the numbered quick-pick badge shown while
 * suggestions are live — pressing that digit immediately creates the cable.
 */
export interface GhostEdgeData {
  [key: string]: unknown;
  signalType: SignalType;
  top?: boolean;
  /** 1-based position in the suggestion list (1..9). Shown as a badge chip. */
  index?: number;
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
  // 1-based index for the numbered quick-pick badge (1..9). 0 = no badge.
  const index = d?.index ?? 0;

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
        {/* Click target + numbered quick-pick badge. The wrapper is the click
            surface; nodrag/nopan keep the canvas still. Each ghost carries a
            1-based `index` (1..9) shown as a neumorphic chip — pressing that
            digit immediately creates the cable (handled in GraphCanvas). The
            primary ghost (index=1, isTop) also shows "↵" as a secondary hint
            inside the badge. Non-primary ghosts show their number only. */}
        <button
          type="button"
          onClick={accept}
          title={
            index > 0
              ? `Press ${index} to connect · or click · or ⌘-drop for all`
              : "Accept suggested cable — click, press Enter, or drop while holding ⌘/Ctrl"
          }
          aria-label={index > 0 ? `Accept suggestion ${index}` : "Accept suggested cable"}
          className="nodrag nopan"
          style={{
            position: "absolute",
            // T11(b): offset 18px above the cable midpoint so chip never
            // overlaps the stroke. Neumorphic pressed-surface backing chip.
            transform: `translate(-50%, calc(-50% - 18px)) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            background: "#1A1A1E",
            border: `1px solid ${color}${isTop ? "99" : "55"}`,
            boxShadow: isTop
              ? `inset 1px 1px 3px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(255,255,255,0.04), 0 0 6px ${color}33`
              : "inset 1px 1px 3px rgba(0,0,0,0.4), inset -1px -1px 2px rgba(255,255,255,0.03)",
            color,
            borderRadius: 4,
            fontSize: 9,
            lineHeight: "14px",
            padding: "1px 5px",
            cursor: "pointer",
            opacity: isTop ? 0.95 : 0.75,
            fontFamily: "ui-monospace, monospace",
            whiteSpace: "nowrap",
          }}
        >
          {index > 0
            ? isTop
              ? `${index} · ↵`
              : `${index}`
            : "↵"}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export const GhostEdge = memo(GhostEdgeComponent);
