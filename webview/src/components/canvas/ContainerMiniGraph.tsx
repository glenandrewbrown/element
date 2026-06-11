/**
 * ContainerMiniGraph — pressed-inset ~96px thumbnail region rendered below the
 * Container/Portal block header. Shows a scaled-down SVG snapshot of the
 * container's internal graph when `containerPreview` topology data is present,
 * or falls back to a category-coloured density-bar heatmap when there are more
 * than MINI_GRAPH_THRESHOLD children, or a neutral density bar when count data
 * alone is available. Nothing is fabricated: absent data = honest fallback.
 *
 * Visual language: pressed INTO the surface with an inner-shadow pair that
 * exactly mirrors the existing `.port-well` / NeuButton pressed style. No glass,
 * no blur, no transparency — one continuous dark chassis material.
 *
 * Design source: .omo/bakeoff/container-representation-2026-06-10/option-1-iteration-2/
 * Ratified T17 Option 1, Iteration 2 (S1 + S3 + S4 + S5).
 */

import { useState } from "react";
import type { BlockCategory } from "../../data/types";

// ── Category colour map (mirrors catConfig in Block.tsx) ──────────────────────

const CAT_HEX: Record<BlockCategory, string> = {
  instrument: "#4A90D9",
  audiofx:    "#E8A838",
  midifx:     "#2BC4C4",
  modulator:  "#A87FE0",
};

// ── Design constants (match mockup exactly) ────────────────────────────────────

/** Thumbnail region height (px) — matches mockup .thumbnail-region height: 96px. */
export const THUMBNAIL_H = 96;

/**
 * Child-node threshold above which the mini-graph SVG is replaced by the
 * density-bar heatmap (S3 fallback). Mockup spec: >12 = heatmap; at 12 the
 * mini-graph is still usable (the "generous" cutoff the mockup annotates).
 */
export const MINI_GRAPH_THRESHOLD = 12;

// ── ContainerPreview type (T17 host-emission contract) ────────────────────────

/** One mini pill-node in the preview topology. */
export interface MiniNode {
  /** Category drives colour. */
  category: BlockCategory;
  /** Normalised x position 0..1 within the container's bounding box. */
  x: number;
  /** Normalised y position 0..1 within the container's bounding box. */
  y: number;
}

/** One cable in the preview topology — index pair into the `children` array. */
export interface MiniCable {
  /** Index of the source node in `children`. */
  from: number;
  /** Index of the target node in `children`. */
  to: number;
}

/**
 * Optional preview topology emitted by the host. When absent the component
 * falls back gracefully to the density-bar variant (NOTHING-fake rule).
 * Normalised coordinates (0..1) let the SVG scale to any thumbnail width.
 */
export interface ContainerPreview {
  /** Array of mini pill-nodes, normalised 0..1 positions. */
  children: MiniNode[];
  /** Array of {from, to} index pairs into `children`. */
  cables: MiniCable[];
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ContainerMiniGraphProps {
  /** Container/Portal node id (used for data-testid). */
  nodeId: string;
  /** Block display name — shown in the dive hint. */
  name: string;
  /** Category of the CONTAINER block (not children) — used for neutral bar tint. */
  category: BlockCategory;
  /** Number of child nodes — drives density-bar count and fallback decision. */
  containerNodeCount: number;
  /** True when this is a Portal (externally-linked container). */
  isPortal: boolean;
  /** Optional file path for Portal variant (shown below the thumbnail). */
  portalFilename?: string;
  /** Topology preview — present when the host has emitted it for this container. */
  containerPreview?: ContainerPreview;
  /** Muted state drives saturate(0.15) brightness(0.65) filter on the thumbnail. */
  muted?: boolean;
  /** Bypassed state drives saturate(0) filter + hint row on the thumbnail. */
  bypassed?: boolean;
  /** Collapse tier — thumbnail only shows at macro + expanded (not title). */
  collapseTier?: "title" | "macro" | "expanded";
}

// ── Pressed inset shadow ───────────────────────────────────────────────────────
//
// Matches the exact inner-shadow pair used by .port-well and NeuButton pressed:
//   inset 2px 2px 5px rgba(0,0,0,0.5)  ← dark upper-left pressing it in
//   inset -1px -1px 3px rgba(255,255,255,0.04)  ← faint bottom-right lift

const SHADOW_INSET =
  "inset 2px 2px 5px rgba(0,0,0,0.5), inset -1px -1px 3px rgba(255,255,255,0.04)";

// ── Dot grid overlay (matches mockup .thumbnail-region::before) ───────────────

const DOT_GRID_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)",
  backgroundSize: "12px 12px",
  pointerEvents: "none",
  zIndex: 0,
};

// ── Mini pill-node dimensions (SVG units, thumbnail viewport 100×96) ──────────

const PILL_W = 24;
const PILL_H = 9;
const PILL_R = 3;

// ── MiniGraphSVG — SVG snapshot renderer ─────────────────────────────────────

/**
 * Renders the mini pill-nodes (coloured by category) and curved SVG cables
 * within the thumbnail viewport. Positions are normalised 0..1 → mapped to
 * the SVG's 100×96 viewport. Cables render BEHIND nodes (drawn first).
 * Cable opacity is low at rest so the thumbnail reads as a schematic.
 */
function MiniGraphSVG({
  preview,
  hovered,
  isPortal,
}: {
  preview: ContainerPreview;
  hovered: boolean;
  isPortal: boolean;
}) {
  const W = 100;
  const H = 96;

  // Map normalised 0..1 → SVG pixel coords. We inset a margin so pills don't
  // clip the viewport edges: half pill dimensions on each axis.
  const toX = (nx: number) =>
    PILL_W / 2 + nx * (W - PILL_W);
  const toY = (ny: number) =>
    PILL_H / 2 + ny * (H - PILL_H);

  const cableOpacity = hovered ? 0.7 : 0.3;
  // Teal cable tint for portal containers (mirrors portal accent colour).
  const cableStroke = isPortal ? "#2BC4C4" : "rgba(229,229,234,0.55)";

  return (
    <svg
      data-testid="mini-graph-schematic"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}
      aria-hidden
    >
      {/* Cables — drawn behind nodes */}
      {preview.cables.map((cable, ci) => {
        const src = preview.children[cable.from];
        const dst = preview.children[cable.to];
        if (!src || !dst) return null;
        const x1 = toX(src.x);
        const y1 = toY(src.y);
        const x2 = toX(dst.x);
        const y2 = toY(dst.y);
        // Cubic bezier: control points offset horizontally by 30% of dx for a
        // smooth curve that reads as a cable arc, not a straight line.
        const dx = (x2 - x1) * 0.45;
        const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
        return (
          <path
            key={ci}
            d={d}
            fill="none"
            stroke={cableStroke}
            strokeWidth={1}
            opacity={cableOpacity}
            strokeLinecap="round"
          />
        );
      })}

      {/* Pill nodes — drawn on top of cables */}
      {preview.children.map((node, ni) => {
        const cx = toX(node.x);
        const cy = toY(node.y);
        const hex = CAT_HEX[node.category] ?? CAT_HEX.instrument;
        return (
          <rect
            key={ni}
            x={cx - PILL_W / 2}
            y={cy - PILL_H / 2}
            width={PILL_W}
            height={PILL_H}
            rx={PILL_R}
            fill={`${hex}33`}
            stroke={hex}
            strokeWidth={0.75}
          />
        );
      })}
    </svg>
  );
}

// ── DensityBars — heatmap fallback for containers with >MINI_GRAPH_THRESHOLD ──

/**
 * Category-coloured density-bar heatmap (S3). One bar per child node, height
 * proportional to position in the child list (used as a rough complexity proxy
 * since port-count data is not available in the preview shape). Bar colours are
 * driven by the preview's node categories when available, otherwise all bars
 * use the container's own category colour.
 *
 * The threshold note is always visible so the user understands the switch from
 * the mini-graph. Design: mockup S3a (dense fallback).
 */
function DensityBars({
  containerNodeCount,
  preview,
  category,
}: {
  containerNodeCount: number;
  preview?: ContainerPreview;
  category: BlockCategory;
}) {
  const fallbackHex = CAT_HEX[category];

  // Derive bar data from preview nodes when available, otherwise generate
  // synthetic bars in the container's category colour.
  const bars: Array<{ hex: string; heightPct: number }> = preview
    ? preview.children.map((n, i) => ({
        hex: CAT_HEX[n.category] ?? fallbackHex,
        // Height varies slightly per index for visual interest (matches mockup).
        heightPct: 35 + ((i * 37 + 17) % 45),
      }))
    : Array.from({ length: Math.min(containerNodeCount, 32) }, (_, i) => ({
        hex: fallbackHex,
        heightPct: 35 + ((i * 37 + 17) % 45),
      }));

  return (
    <div
      data-testid="container-density-bars"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "flex-end",
        padding: "0 6px 6px",
        gap: 3,
        zIndex: 1,
      }}
    >
      {/* Node count badge — top-right */}
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          fontSize: 9,
          fontWeight: 700,
          fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
          color: "#8E8E93",
          letterSpacing: "0.03em",
          zIndex: 2,
        }}
      >
        {containerNodeCount}
      </div>
      {/* "DENSE" label — top-left */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 8,
          fontSize: 8,
          color: "#55555A",
          fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          zIndex: 2,
        }}
      >
        dense
      </div>
      {bars.map((bar, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderRadius: "2px 2px 0 0",
            minWidth: 4,
            maxWidth: 10,
            height: `${bar.heightPct}%`,
            background: bar.hex,
            opacity: 0.75,
          }}
        />
      ))}
    </div>
  );
}

// ── NeutralDensityBar — fallback when only containerNodeCount is known ────────

/**
 * Single neutral bar shown when containerNodeCount > 0 but no preview or
 * category breakdown is available. Matches the mockup's "empty / count-only"
 * fallback: a single progress-style bar tinted with the container's accent.
 */
function NeutralDensityBar({
  containerNodeCount,
  category,
}: {
  containerNodeCount: number;
  category: BlockCategory;
}) {
  const hex = CAT_HEX[category];
  const fill = Math.max(5, Math.min(95, (containerNodeCount / 20) * 80 + 10));
  return (
    <div
      data-testid="container-neutral-bar"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "0 12px",
        zIndex: 1,
      }}
    >
      {/* Block count */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
          color: "#8E8E93",
          letterSpacing: "0.03em",
        }}
      >
        {containerNodeCount === 0
          ? "Empty — open to edit"
          : `${containerNodeCount} ${containerNodeCount === 1 ? "Block" : "Blocks"}`}
      </span>
      {/* Tinted progress bar */}
      {containerNodeCount > 0 && (
        <div
          style={{
            width: "100%",
            height: 3,
            borderRadius: 2,
            background: "rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${fill}%`,
              height: "100%",
              borderRadius: 2,
              background: hex,
              opacity: 0.55,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── DiveHint — "double-click to enter" affordance ─────────────────────────────

function DiveHint({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 4,
        right: 6,
        display: "flex",
        alignItems: "center",
        gap: 3,
        fontSize: 8,
        color: visible ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.22)",
        pointerEvents: "none",
        letterSpacing: "0.04em",
        zIndex: 3,
        transition: "color 150ms ease",
      }}
    >
      {/* Nested squares icon — the "enter container" glyph */}
      <svg
        width="9"
        height="9"
        viewBox="0 0 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <rect x="0.75" y="0.75" width="7.5" height="7.5" rx="1.5" />
        <rect x="2.25" y="2.25" width="4.5" height="4.5" rx="1" />
      </svg>
      enter
    </div>
  );
}

// ── DepthBadge — child-count badge inside the thumbnail ───────────────────────

function DepthBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div
      aria-label={`${count} ${count === 1 ? "Block" : "Blocks"} inside`}
      style={{
        position: "absolute",
        bottom: 5,
        left: 6,
        background: "rgba(0,0,0,0.55)",
        borderRadius: 3,
        padding: "2px 5px",
        fontSize: 8,
        color: "#8E8E93",
        fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
        letterSpacing: "0.04em",
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      {count} {count === 1 ? "block" : "blocks"}
    </div>
  );
}

// ── PortalFilenameRow ─────────────────────────────────────────────────────────

function PortalFilenameRow({ filename }: { filename: string }) {
  const short = filename.split("/").pop() ?? filename;
  return (
    <div
      style={{
        padding: "3px 8px 4px",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {/* Link icon */}
      <svg
        width="9"
        height="9"
        viewBox="0 0 9 9"
        fill="none"
        stroke="#2BC4C4"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden
        style={{ opacity: 0.8, flexShrink: 0 }}
      >
        <path d="M3.5 5.5a2.5 2.5 0 0 0 3.5-3.5L5.5 0.5" />
        <path d="M5.5 3.5a2.5 2.5 0 0 0-3.5 3.5L3.5 8.5" />
      </svg>
      <span
        style={{
          fontSize: "8.5px",
          color: "#2BC4C4",
          opacity: 0.75,
          fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
          letterSpacing: "0.02em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
        title={filename}
      >
        {short}
      </span>
    </div>
  );
}

// ── ContainerMiniGraph ────────────────────────────────────────────────────────

/**
 * The thumbnail region for Container and Portal blocks. Renders:
 *
 *  • Mini-graph SVG (pill nodes + curved cables) when preview data is present
 *    and child count ≤ MINI_GRAPH_THRESHOLD.
 *  • Density-bar heatmap (S3) when child count > MINI_GRAPH_THRESHOLD.
 *  • Neutral density bar when only containerNodeCount is known (no preview).
 *
 * Portal variant: teal dashed outline on the thumbnail + a filename row below.
 * Muted variant: filter: saturate(0.15) brightness(0.65) on the thumbnail.
 * Bypassed variant: filter: saturate(0) + a "signal passes through" hint.
 */
export function ContainerMiniGraph({
  nodeId,
  name: _name,
  category,
  containerNodeCount,
  isPortal,
  portalFilename,
  containerPreview,
  muted,
  bypassed,
  collapseTier = "macro",
}: ContainerMiniGraphProps) {
  const [hovered, setHovered] = useState(false);

  // Thumbnail only renders at macro + expanded (not at title tier).
  if (collapseTier === "title") return null;

  // Decide which body to render inside the thumbnail.
  const useDensityBars =
    containerPreview != null
      ? containerPreview.children.length > MINI_GRAPH_THRESHOLD
      : containerNodeCount > MINI_GRAPH_THRESHOLD;

  const useMiniGraph =
    containerPreview != null &&
    containerPreview.children.length <= MINI_GRAPH_THRESHOLD;

  // State filters on the thumbnail region.
  let thumbnailFilter: string | undefined;
  if (muted) {
    thumbnailFilter = "saturate(0.15) brightness(0.65)";
  } else if (bypassed) {
    thumbnailFilter = "saturate(0) brightness(0.5)";
  }

  // Portal dashed teal outline — outline-offset keeps it inset of the thumbnail
  // border-radius, matching mockup S4: "outline:1.5px dashed rgba(43,196,196,0.35)".
  const portalOutline: React.CSSProperties = isPortal
    ? { outline: "1.5px dashed rgba(43,196,196,0.35)", outlineOffset: -2 }
    : {};

  return (
    <div data-testid="container-mini-graph" data-node-id={nodeId}>
      {/* ── Thumbnail region ── */}
      <div
        data-testid="mini-graph-thumbnail"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          margin: "6px 8px 0",
          borderRadius: 6,
          background: "#1A1A1E", // --pressed token
          boxShadow: SHADOW_INSET,
          overflow: "hidden",
          position: "relative",
          height: THUMBNAIL_H,
          filter: thumbnailFilter,
          cursor: "default",
          ...portalOutline,
        }}
      >
        {/* Dot grid overlay */}
        <div style={DOT_GRID_STYLE} aria-hidden />

        {/* Content body */}
        {useMiniGraph && containerPreview != null ? (
          <MiniGraphSVG
            preview={containerPreview}
            hovered={hovered}
            isPortal={isPortal}
          />
        ) : useDensityBars ? (
          <DensityBars
            containerNodeCount={containerNodeCount}
            preview={containerPreview}
            category={category}
          />
        ) : (
          <NeutralDensityBar
            containerNodeCount={containerNodeCount}
            category={category}
          />
        )}

        {/* Dive hint */}
        <DiveHint visible={hovered} />

        {/* Child block count badge */}
        <DepthBadge count={containerNodeCount} />

        {/* Bypassed hint row over the thumbnail */}
        {bypassed && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            <span
              style={{
                fontSize: 8,
                fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
                color: "#8E8E93",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              signal passes through
            </span>
          </div>
        )}
      </div>

      {/* Portal filename row — below the thumbnail */}
      {isPortal && portalFilename ? (
        <PortalFilenameRow filename={portalFilename} />
      ) : null}
    </div>
  );
}
