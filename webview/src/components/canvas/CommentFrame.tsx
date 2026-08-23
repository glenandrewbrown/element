import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import type { CommentBoxData } from "../../data/types";

/**
 * CommentFrame — a labelled, colour-coded grouping frame drawn behind Blocks on
 * the Board (the "comment box"). Registered as the `comment` React Flow node
 * type; rendered for every entry in `useGraphStore.commentBoxes`, not mounted
 * directly. Use it to visually annotate and cluster regions of a large Board
 * (e.g. "Drum Bus", "FX Chain") so an expert can navigate signal flow at a
 * glance. It is an inset (pressed-in) neumorphic surface — same dark chassis as
 * the rest of the UI, never glass — and sits at z-index 0 so Blocks render on
 * top. Props are React Flow's injected `NodeProps`; `data` is cast to
 * `CommentBoxData` (label + frame colour).
 */
function CommentFrameInner({ data }: NodeProps) {
  const c = data as unknown as CommentBoxData;
  const raw = c.color?.replace(/^#/, "") ?? "4a4a52";
  const border = c.color?.startsWith("#") ? c.color : `#${raw}`;

  return (
    <div
      className="rounded-md h-full w-full flex flex-col overflow-hidden select-none pointer-events-auto"
      style={{
        background: "rgba(37,37,41,0.35)",
        border: `1px solid ${border}`,
        boxShadow:
          "inset 2px 2px 6px rgba(0,0,0,0.35), inset -1px -1px 4px rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 text-text-secondary truncate"
        style={{ borderBottom: `1px solid ${border}` }}
      >
        {c.label || "Comment"}
      </div>
      <div className="flex-1 min-h-[8px]" />
    </div>
  );
}

export const CommentFrame = memo(CommentFrameInner);
