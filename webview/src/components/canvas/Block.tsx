import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import type { BlockCategory, BlockData, CableData, Port } from "../../data/types";
import {
  useGraphStore,
  selectEdges,
} from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";
import { useBlockNodeLevelBallistic } from "../../hooks/useBlockNodeLevelBallistic";
import {
  useSandboxCrashStore,
  selectSandboxNeedsAttention,
  selectSandboxInProcess,
} from "../../stores/useSandboxCrashStore";
import { useParameterStore } from "../../stores/useParameterStore";
import { nativeSetNodeParameter } from "../../bridge/nativeGraph";
import { NeuKnob } from "../neu/NeuKnob";
import { BlockEmbed } from "./BlockEmbed";
import { Icon } from "../neu/Icon";
import { iconForCategory } from "../neu/iconForCategory";
import {
  getInlineFaceSpec,
  validateInlineFace,
  faceNeedsParamMeta,
} from "./inlineParams";
import { useNodeParamMeta } from "./inline/useNodeParamMeta";
import { InlineFace } from "./inline/InlineFace";

// On-Block knob colour by category (verdict 1 + verdict 8). NeuKnob has no
// purple tier yet, so modulators borrow blue until verdict 8 adds purple.
const catToKnob: Record<BlockCategory, "blue" | "orange" | "teal"> = {
  instrument: "blue",
  audiofx: "orange",
  midifx: "teal",
  modulator: "blue",
};

// The live 15 Hz delta channel carries values only, no parameter names. Until
// real metadata is wired (Inspector path), label knobs generically by index —
// guessing "Gain/Mix/Freq" would misreport what the param actually is.
const ON_BLOCK_KNOBS = 3;

// ── Category config ──

const catConfig: Record<
  BlockCategory,
  { hex: string; bg: string; shape: string; glowClass: string }
> = {
  instrument: {
    hex: "#4A90D9",
    bg: "bg-[#4A90D9]",
    shape: "w-1.5 h-1.5 rounded-full bg-[#4A90D9]",
    glowClass: "glow-blue",
  },
  audiofx: {
    hex: "#E8A838",
    bg: "bg-[#E8A838]",
    shape: "w-1.5 h-1.5 rotate-45 bg-[#E8A838]",
    glowClass: "glow-orange",
  },
  midifx: {
    hex: "#2BC4C4",
    bg: "bg-[#2BC4C4]",
    shape: "w-1.5 h-1.5 bg-[#2BC4C4]",
    glowClass: "glow-teal",
  },
  modulator: {
    hex: "#A87FE0",
    bg: "bg-[#A87FE0]",
    shape: "w-1.5 h-1.5 bg-[#A87FE0]",
    glowClass: "glow-purple",
  },
};

// ── Port colour map ──

const portColor: Record<string, string> = {
  audio: "#4A90D9",
  midi: "#2BC4C4",
  value: "#E8A838",
};

// ── SVG shape for each signal type ──

function PortShape({
  type,
  connected,
  hovered,
}: {
  type: string;
  connected: boolean;
  hovered: boolean;
}) {
  const color = portColor[type] ?? portColor.audio;

  const sharedProps = {
    fill: connected ? color : "none",
    stroke: color,
    strokeWidth: connected ? 0 : 1.5,
  };

  let shape: React.ReactNode;
  if (type === "audio") {
    shape = <circle cx="6" cy="6" r="5" {...sharedProps} />;
  } else if (type === "midi") {
    shape = <polygon points="6,1 11,6 6,11 1,6" {...sharedProps} />;
  } else {
    // value / CV
    shape = <rect x="1" y="1" width="10" height="10" {...sharedProps} />;
  }

  // Glow + 1.25× hover scale moved to static CSS classes (architect-perf-plan
  // §1.3) so PortShape no longer writes a fresh inline `filter: drop-shadow()`
  // string on every Block re-render (× every port). The signal hue — INCLUDING
  // the per-state alpha (hovered ⇒ 50%, connected ⇒ 25%) — rides the element's
  // `color`, so the CSS `drop-shadow(... currentColor)` resolves the right tint;
  // `color` is identity-stable per (type, state). Class precedence: hovered wins.
  const glowClass = hovered
    ? "port-hovered"
    : connected
      ? "port-connected"
      : "port-idle";
  const glowColor = hovered ? `${color}80` : connected ? `${color}40` : undefined;

  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className={`port-shape ${glowClass}`}
      style={glowColor ? { color: glowColor } : undefined}
    >
      {shape}
    </svg>
  );
}

// ── BusBadge — wireless port label (Phase 5B §7.2.8) ──
//
// Rendered next to a port whenever the cable attached to that port has been
// flagged wireless via useBusStore. Replaces the curve that would otherwise
// be drawn across the canvas. Colour matches the port's signal type so a
// "Reverb Send A" audio bus and a "Reverb Send A" MIDI bus stay visually
// distinct.

const portColorMap: Record<string, string> = {
  audio: "#4A90D9",
  midi: "#2BC4C4",
  value: "#E8A838",
};

function BusBadge({
  busName,
  signalType,
  side,
}: {
  busName: string;
  signalType: string;
  side: "left" | "right";
}) {
  const color = portColorMap[signalType] ?? portColorMap.audio;
  const sideStyle: React.CSSProperties =
    side === "left"
      ? { right: "calc(100% + 6px)", textAlign: "right" }
      : { left: "calc(100% + 6px)", textAlign: "left" };

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        ...sideStyle,
        pointerEvents: "none",
      }}
    >
      <span
        className="px-1.5 py-[1px] rounded-[3px] text-[9px] font-bold uppercase tracking-tight whitespace-nowrap"
        style={{
          background: `${color}1F`,
          color,
          border: `1px solid ${color}55`,
          boxShadow: `0 0 4px ${color}40`,
          letterSpacing: "0.04em",
        }}
      >
        {/* Antenna glyph — small radio icon distinguishes from regular labels */}
        <span style={{ marginRight: 4, opacity: 0.9 }}>⟪</span>
        {busName}
      </span>
    </div>
  );
}

// ── PortHandle — transparent React Flow Handle + SVG visual overlay ──

interface PortHandleProps {
  portId: string;
  portType: string;
  connected: boolean;
  handleType: "source" | "target";
  position: Position;
  topPercent: number;
  /** Phase 5B — when set, the connected cable is rendered as a wireless bus
   *  badge instead of a drawn curve. */
  busName?: string;
  /** Real port name from the engine (verdict 1 — labeled ports). Rendered
   *  OUTWARD of the chassis (in the canvas gutter, like a bus badge) so it never
   *  overlaps body content, and only when revealed (port hover or block
   *  hover/selected) so the canvas stays clean at rest. */
  label?: string;
  /** Block-level reveal (hovered or selected) — forces the port label visible
   *  even when this specific port isn't hovered. */
  showLabel?: boolean;
}

function PortHandle({
  portId,
  portType,
  connected,
  handleType,
  position,
  topPercent,
  busName,
  label,
  showLabel,
}: PortHandleProps) {
  const [hovered, setHovered] = useState(false);
  // Inward of the chassis, in the port lane — contained + blended like the
  // mockup (small mono, low-opacity, signal-tinted), not a loud gutter chip.
  const inward: React.CSSProperties =
    position === Position.Left
      ? { left: "calc(100% + 5px)", textAlign: "left" }
      : { right: "calc(100% + 5px)", textAlign: "right" };
  const labelVisible = !!label && !busName;
  void showLabel;

  // Offset the 24px hitbox so it's centred on the block edge
  const translateX =
    position === Position.Left ? "-50%" : "50%";

  return (
    <Handle
      id={portId}
      type={handleType}
      position={position}
      style={{
        top: `${topPercent}%`,
        width: 24,
        height: 24,
        background: "transparent",
        border: "none",
        borderRadius: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `translateX(${translateX}) translateY(-50%)`,
        cursor: "crosshair",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <PortShape type={portType} connected={connected} hovered={hovered} />
      {busName ? (
        <BusBadge
          busName={busName}
          signalType={portType}
          side={position === Position.Left ? "left" : "right"}
        />
      ) : labelVisible ? (
        <span
          className="font-mono tracking-tight whitespace-nowrap leading-none overflow-hidden text-ellipsis"
          style={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            ...inward,
            maxWidth: 60,
            fontSize: "8.5px",
            color: portColor[portType] ?? "#8E8E93",
            opacity: hovered ? 0.95 : 0.62,
            pointerEvents: "none",
            transition: "opacity 120ms ease",
          }}
        >
          {label}
        </span>
      ) : null}
    </Handle>
  );
}


// ── Neumorphic shadow constants ──

const shadowRaised =
  "4px 4px 12px rgba(0,0,0,0.4), -2px -2px 8px rgba(255,255,255,0.05)";
const shadowPressed =
  "inset 2px 2px 6px rgba(0,0,0,0.4), inset -1px -1px 4px rgba(255,255,255,0.05)";

// ── State overlays ──────────────────────────────────────────────────────────
// Two SEMANTICALLY-DISTINCT states (Glen, feedback 7/8):
//
//  • MUTED   — signal is HARD-BLOCKED. A red wash covers the WHOLE block body
//    INCLUDING the port lane (so no port pip pokes through and reads as a
//    cheap box-on-top), with the MUTED chip integrated dead-centre + a kill-X.
//    Transcribed from the mockup's muted overlay (status-clip wash + X + chip).
//
//  • BYPASSED — signal PASSES THROUGH untouched. The chassis is desaturated /
//    dimmed (it's "off"), BUT a pass-through cue stays lit — the load bar reads
//    green and the port pips stay visible (rendered ABOVE the dim) so you can
//    see signal is still flowing. This is the one place we go beyond the
//    mockup (its bypass was greyscale-only, which Glen rejected).

/** MUTED overlay — covers the body below the header (incl. the whole port lane)
 *  so the block reads as a hard block. pointer-events:none keeps the header B/M
 *  buttons underneath clickable to undo the state. */
function MutedOverlay() {
  return (
    <div
      className="nodeblock-mute absolute inset-0 pointer-events-none flex items-center justify-center z-30"
      style={{
        // Covers the WHOLE block INCLUDING the header (Glen P0 — "red wash over
        // whole block incl header"). pointer-events:none keeps the B/M buttons
        // underneath fully clickable to undo the state, so we can wash the
        // header too without trapping clicks.
        borderRadius: "inherit",
        // Red wash over the WHOLE block (Glen P0). Translucent across the top
        // ~12% (the header band) so the category gradient bleeds through as a
        // RED-TINTED header rather than vanishing — then ramps to a dense opaque
        // red over the body so knobs/meter/pips are fully hidden (a hard block,
        // not a cheap box-on-top). The B/M cluster is raised above this (z-40)
        // so Mute stays lit + clickable, exactly like the mockup.
        // Glen, literal: "just a colour gradient overlay of red over the whole
        // block — no cheap red border/stripes". So: a pure red wash, NO ring
        // border, NO kill-X slashes. Translucent over the header band (category
        // gradient bleeds through as red-tinted) → dense opaque over the body.
        background:
          "linear-gradient(180deg, hsl(358 70% 26% / 0.55) 0%, hsl(358 62% 17% / 0.82) 14%, hsl(358 56% 14% / 0.96) 30%, hsl(358 58% 11% / 0.98) 100%)",
      }}
    >
      {/* Understated wordmark — integrated into the wash, not a floating pill
          (Glen: the chip "looks out of place"). No background, no border. */}
      <span
        className="relative text-[10px] font-mono font-semibold tracking-[0.32em]"
        style={{ color: "hsl(358 90% 82% / 0.85)", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
      >
        MUTED
      </span>
    </div>
  );
}

/** BYPASSED dim — a desaturating wash over the body only (NOT the load bar, NOT
 *  the port pips). Distinct from mute: the chassis goes "off" but the
 *  pass-through indicators (load bar + lit pips) stay visible above it. */
function BypassedDim() {
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none flex items-center justify-center z-10"
      style={{
        // Covers the WHOLE block INCLUDING the coloured header title (Glen P0 —
        // "whole block incl coloured title desaturated"). The B/M cluster (z-50)
        // and the load bar (z-40, signal still passing through) stay above this,
        // so bypass reads as "off but flowing" — distinct from mute's hard block.
        top: 0,
        bottom: 2, // leave the 2px load bar lit — signal passes through
        borderRadius: "inherit",
        // FLAT dark wash — NO backdrop-filter (architect-perf-plan §0.4 +
        // design law: no backdrop-blur/read-back). A denser opaque-ish dark
        // wash (0.62) crushes the chassis colour toward the canvas so the block
        // reads clearly "off / disabled" without a per-frame WKWebView
        // read-back-blur-recomposite. The lit load bar (below, z-40) + the
        // BYPASSED label keep "off but flowing" distinct from mute's hard block.
        background: "rgba(20,20,24,0.62)",
      }}
    >
      <span
        className="flex items-center gap-1 text-[10px] font-mono font-bold tracking-[0.18em] px-2 py-0.5 rounded-[3px]"
        style={{
          color: "#D5D5DB",
          background: "rgba(0,0,0,0.55)",
          boxShadow: "0 1px 5px rgba(0,0,0,0.7)",
        }}
      >
        {/* arrow → reinforces "signal passes through" vs mute's block */}
        <span style={{ opacity: 0.85 }}>→</span> BYPASSED
      </span>
    </div>
  );
}

// ── CrashBadge — R3 sandbox worker crash overlay ──────────────────────────
//
// Shown ONLY when the host has pushed an `onSandboxEvent` with kind ∈
// {crashed, loadFailed, error} for this block's nodeUuid (= d.id). Nothing
// fabricated: the badge appears iff useSandboxCrashStore has a live entry, and
// disappears immediately on a successful restart (store clears optimistically).
//
// Visual language: a dense red-tinted overlay band at the FOOT of the chassis
// (above the load bar, below state overlays) with a reload affordance.  Sits at
// z-50 so it is always readable regardless of bypass/mute overlays; the header
// B/M cluster is also z-50 so they remain clickable side-by-side.

interface CrashBadgeProps {
  categoryHex: string;
  onReload: (e: React.MouseEvent) => void;
  reloading: boolean;
}

function CrashBadge({ categoryHex, onReload, reloading }: CrashBadgeProps) {
  return (
    <div
      className="absolute left-0 right-0 flex items-center justify-between gap-1 px-2 pointer-events-auto z-50"
      style={{
        // Sits just above the 2px load bar — 22px band at the chassis foot.
        bottom: 2,
        height: 22,
        // Dense red fill (no transparency — neumorphic dark system rule).
        // A subtle left-border in the category hue so the block's identity
        // reads through even when crashed (you know WHAT crashed).
        background:
          "linear-gradient(90deg, hsl(358 62% 16%) 0%, hsl(358 58% 13%) 100%)",
        borderLeft: `2px solid ${categoryHex}88`,
        borderTop: "1px solid hsl(358 50% 28% / 0.6)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 -1px 4px rgba(0,0,0,0.5)",
      }}
    >
      {/* Warning glyph + label */}
      <span
        className="text-[9px] font-mono font-bold tracking-[0.06em] uppercase leading-none truncate"
        style={{
          color: "hsl(358 90% 76%)",
          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
        }}
      >
        <span style={{ marginRight: 4, fontSize: 10 }}>⚠</span>
        plugin crashed
      </span>

      {/* Reload button — pressed INTO the surface (neumorphic inset) */}
      <button
        type="button"
        disabled={reloading}
        onClick={onReload}
        className="shrink-0 flex items-center gap-0.5 px-1.5 rounded-[3px] text-[8px] font-mono font-bold uppercase tracking-wider leading-none"
        style={{
          height: 14,
          color: reloading ? "hsl(240 6% 45%)" : "hsl(358 90% 80%)",
          background: reloading
            ? "hsl(240 8% 18%)"
            : "linear-gradient(180deg, hsl(358 58% 22%) 0%, hsl(358 52% 16%) 100%)",
          boxShadow: reloading
            ? "inset 1.5px 1.5px 3px rgba(0,0,0,0.7), inset -0.5px -0.5px 1px rgba(255,255,255,0.03)"
            : "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.6)",
          cursor: reloading ? "not-allowed" : "pointer",
          transition: "background 80ms ease, box-shadow 80ms ease",
          border: "1px solid hsl(358 42% 28% / 0.7)",
        }}
      >
        {reloading ? "…" : "↺ reload"}
      </button>
    </div>
  );
}

// ── InProcessBadge — sandbox-unavailable honesty band ─────────────────────────
//
// Shown ONLY when the host pushed an `onSandboxEvent` with kind
// "inProcessFallback" (PluginManager::SandboxEvent::FellBackInProcess, int 4)
// for this block's nodeUuid (= d.id): the user opted into sandbox isolation but
// the worker failed to launch/load, so the plugin is running IN-PROCESS and is
// therefore NOT crash-protected. Nothing fabricated — the band appears iff
// useSandboxCrashStore has a real `inProcessFallback` entry.
//
// Distinct from CrashBadge: amber (advisory), NOT red (failure); no reload
// affordance — the plugin is running fine, it just lacks crash isolation, so the
// honest remedy is at the host level (Preferences → Plugins → Sandbox Mode), not
// a per-block restart. Same 22px chassis-foot band + z-50 so it stays readable.

interface InProcessBadgeProps {
  categoryHex: string;
}

function InProcessBadge({ categoryHex }: InProcessBadgeProps) {
  return (
    <div
      className="absolute left-0 right-0 flex items-center gap-1 px-2 pointer-events-none z-50"
      style={{
        // Sits just above the 2px load bar — 22px band at the chassis foot.
        bottom: 2,
        height: 22,
        // Dense amber fill (no transparency — neumorphic dark system rule).
        // Left-border carries the block's category hue so identity reads through.
        background:
          "linear-gradient(90deg, hsl(38 54% 15%) 0%, hsl(38 50% 12%) 100%)",
        borderLeft: `2px solid ${categoryHex}88`,
        borderTop: "1px solid hsl(38 46% 26% / 0.6)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 -1px 4px rgba(0,0,0,0.5)",
      }}
    >
      {/* Shield-down glyph + label — "running unprotected" */}
      <span
        className="text-[9px] font-mono font-bold tracking-[0.06em] uppercase leading-none truncate"
        style={{
          color: "hsl(38 92% 72%)",
          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
        }}
      >
        <span style={{ marginRight: 4, fontSize: 10 }}>⚠</span>
        in-process — unprotected
      </span>
    </div>
  );
}

/** JUCE `Colour::toString()` is often `#AARRGGBB`; CSS border wants opaque RGB. */
function hostColourOutline(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (t.startsWith("#") && t.length === 9) return `#${t.slice(3)}`;
  if (t.startsWith("#") && t.length === 7) return t;
  return undefined;
}

// ── Header controls (bake-off verdict 1 — re-housed from the mockup) ──
//
// Always-on B/M/S state buttons + a signal LED, lifted in spirit from the
// mockup's NodeBlock but wired to Element's REAL engine state: B → toggleBypass,
// M → toggleMute (both optimistic + host-confirmed via useGraphStore). Solo (S)
// has no engine concept in Element yet (the mockup's was local-only too), so it
// is a local visual toggle pending a parity decision — it must NOT pretend to
// mute the rest of the graph.

interface StateBtnProps {
  letter: string;
  active: boolean;
  activeColor: string;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}

function StateBtn({ letter, active, activeColor, onClick, title }: StateBtnProps) {
  // Measured mockup values: 15x15, 8px mono bold, 2px radius, dark idle
  // gradient, dark text + filled category colour when active.
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-[15px] h-[15px] flex items-center justify-center rounded-[2px] text-[8px] font-mono font-bold shrink-0"
      style={{
        color: active ? "#15151A" : "rgba(139,139,146,0.85)",
        background: active
          ? activeColor
          : "linear-gradient(180deg, rgb(41,41,46) 0%, rgb(26,26,30) 100%)",
        boxShadow: active
          ? "inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 1px rgba(0,0,0,0.5)"
          : "inset 1px 1px 1.5px rgba(0,0,0,0.7), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.04)",
      }}
    >
      {letter}
    </button>
  );
}


// ── Block component ──

/**
 * Block — the neumorphic node that represents a single instrument, effect, or
 * utility (a "Block") on the Board canvas. Registered as the React Flow
 * `block` node type and rendered for every node in `useGraphStore.nodes`; you
 * do not mount it directly, you register it via `nodeTypes={{ block: Block }}`
 * on `<ReactFlow>`.
 *
 * Use it as the visual unit of the routing graph: it colour-codes by category
 * (generator = blue circle, modifier = orange diamond, logic = teal triangle),
 * draws audio/MIDI/value ports as connectable React Flow Handles, and adapts
 * its body to the current semantic-zoom tier (compact name-chip → standard
 * with viz + CPU/latency → expanded with a live `BlockEmbed` fader/meter strip).
 * Container and Portal variants get distinct treatments. Bypass/mute/error
 * states are reflected as overlays so the engine state is legible at a glance.
 *
 * Props are React Flow's injected `NodeProps`; `data` is cast to `BlockData`
 * (the per-Block model from `useGraphStore`) and `selected` drives the
 * category micro-glow.
 */
// Function-type icon for the gradient header — a MEANINGFUL Lucide glyph
// inferred from the Block's name + category via iconForCategory (the single
// source of truth). Replaces the old inline SVG path approach so that all
// icon decisions are centralised in iconForCategory.ts.
//
// Icon.tsx does not accept an arbitrary hex via `tone` (tone is a semantic key),
// so we wrap in a span with currentColor and set color on the wrapper.
function FunctionIcon({
  name,
  category,
  color = "#15151A",
  size = 13,
}: {
  name: string;
  category: BlockCategory;
  color?: string;
  size?: number;
}) {
  const iconName = iconForCategory(category, name);
  return (
    <span className="shrink-0 inline-flex" style={{ color }}>
      <Icon
        name={iconName}
        size={size}
        strokeWidth={2}
        aria-hidden
      />
    </span>
  );
}

// Compact horizontal segmented RMS meter — the mockup's SHAPE (Glen explicitly
// likes this; do NOT use vertical bars). ~14 thin segments, ~6px tall: green
// floor → amber shoulder (last ~4) → red ceiling (last ~2). Honest: `level` is
// real 0–1 amplitude and defaults to 0 (idle) — never fabricates motion. The
// strip flexes to fill remaining deck width (two stacked = L/R).
//
// `stale` = no host frame for >250ms (engine wedged / dead — see P3-A
// ballistics). When stale the ladder renders as a uniform DIMMED GREY no-data
// bar (every cell dark, zero lit, no green/amber/red), so a frozen reading can
// never masquerade as live signal. Stays subtle + on-brand (recessed neumorphic
// well); it reads as "no data", not as an alarm.
function RmsMeter({
  level = 0,
  active,
  clip,
  accent,
  stale = false,
}: {
  level?: number;
  active: boolean;
  clip: boolean;
  accent: string;
  stale?: boolean;
}) {
  const SEG = 14;
  // Stale ⇒ zero cells lit (no-data), regardless of any frozen `level`.
  const lit = stale ? 0 : clip ? SEG : Math.round(level * SEG);
  return (
    <div
      data-testid="rms-meter"
      className="flex gap-[1.5px] h-[7px] items-stretch"
      style={{
        padding: "1.5px",
        borderRadius: 2.5,
        // Deeper recessed track so the LED cells sit IN a well (mockup). Inset
        // shadows from neumorphism-generator on the near-black meter base.
        background: "hsl(240 12% 6%)",
        boxShadow:
          "inset 1.5px 1.5px 2.5px rgba(0,0,0,0.85), inset -0.5px -0.5px 1px rgba(255,255,255,0.04)",
      }}
    >
      {Array.from({ length: SEG }).map((_, i) => {
        // Digital-VU ramp by POSITION (mockup): green floor → amber shoulder →
        // red ceiling. The category accent only tints nothing here — the ramp
        // is the universal VU language so every block's meter reads the same.
        const isClipSeg = i >= SEG - 2;
        const isWarnSeg = i >= SEG - 5;
        const litThis = i < lit;
        // Stale: drop the semantic ramp entirely — every cell is a neutral grey
        // recessed bar (no-data), so the strip can't be mistaken for signal.
        const segColor = stale
          ? "hsl(240 6% 42%)"
          : isClipSeg
            ? "hsl(var(--status-clip))"
            : isWarnSeg
              ? "hsl(var(--status-warn))"
              : "hsl(var(--status-ok))";
        void accent;
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              // Lit cell = its ramp colour with a soft LED bloom; unlit cell =
              // that SAME colour crushed to a dim recessed bar so the meter
              // reads as a real LED ladder at rest (every cell visible, none
              // misreading as "hot"). Honest: lit count = real level only.
              // Stale: all cells crushed to a faint uniform grey (no-data) —
              // slightly dimmer than the live unlit floor so it reads "off".
              background: segColor,
              opacity: stale ? 0.12 : litThis ? (active ? 1 : 0.45) : 0.16,
              boxShadow: litThis
                ? `0 0 2px ${segColor}, inset 0 0.5px 0 rgba(255,255,255,0.3)`
                : "inset 0 0.5px 1px rgba(0,0,0,0.6)",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Primary signal classification (NOTHING-fake — from REAL ports) ──────────
//
// Decision A/2b + Gemini G2: the single activity bar's MAGNITUDE stays the
// honest conflated `level` scalar, but its COLOUR is set by the node's primary
// signal classification — real metadata (the node's actual port types), not a
// fabricated second lane. Derived from the node's real OUTPUT ports (what the
// block emits): audio wins, then MIDI, then Value/CV. A sink-only node (e.g.
// Audio Output, audio ins only) falls back to its input side so it still reads
// audio.
type PrimarySignal = "audio" | "midi" | "cv";

function primarySignalOf(ports: Port[]): PrimarySignal {
  const has = (dir: "input" | "output", t: string) =>
    ports.some((p) => p.direction === dir && p.type === t);
  if (has("output", "audio") || has("input", "audio")) return "audio";
  if (has("output", "midi") || has("input", "midi")) return "midi";
  if (has("output", "value") || has("input", "value")) return "cv";
  return "audio";
}

// One honest activity bar (2b / Decision-A compact well). A single horizontal
// LED ladder whose lit count is the REAL `level` scalar and whose colour is the
// node's primary signal classification (--sig-*). NEVER two magnitude
// indicators off the one scalar (the conflated-scalar trap, documented in the
// plan): a third-party card + a collapsed face each show EXACTLY this one bar.
// Stale (no recent host frame) → neutral grey no-data. Recessed well so it
// reads as pressed into the chassis (matches the meter-well language).
//
// PAINTER LAW (perf-wave guardrail): level → 9-bucket index (Cable's
// ampToBucket pattern). Each segment gets ONE class string: `sigbar-seg
// sigbar-lit-{0..8}` (lit, bucket index decides glow intensity) or
// `sigbar-seg sigbar-unlit` (dark). Stale adds `sigbar-stale` to the wrapper.
// Signal colour is carried via `data-signal` on the wrapper → CSS attr selector.
// Identical bucket + state = identical class string = React/DOM no-op.
// Zero per-tick inline background/opacity/boxShadow writes on any segment.
function sigbarBucket(level: number): number {
  // 9 steps 0..8 — mirrors ampToBucket in Cable.tsx.
  return Math.round(Math.max(0, Math.min(1, level)) * 8);
}

const SEG_COUNT = 16;

function SignalActivityBar({
  level = 0,
  signal,
  active,
  stale = false,
}: {
  level?: number;
  signal: PrimarySignal;
  active: boolean;
  stale?: boolean;
}) {
  const bucket = stale ? 0 : sigbarBucket(level);
  // lit = how many of the 16 segments are "on" for this bucket.
  const lit = stale ? 0 : Math.round((bucket / 8) * SEG_COUNT);
  const wrapperClass = `sigbar-well${stale ? " sigbar-stale" : ""}${!active ? " sigbar-inactive" : ""}`;
  return (
    <div
      data-testid="signal-activity-bar"
      data-signal={signal}
      className={wrapperClass}
    >
      {Array.from({ length: SEG_COUNT }).map((_, i) => (
        <div
          key={i}
          className={`sigbar-seg${i < lit ? ` sigbar-lit-${bucket}` : " sigbar-unlit"}`}
        />
      ))}
    </div>
  );
}

// ── Collapse chevron (D3 affordance matrix + Task 2.4 three-tier cycle) ──────
//
// Header affordance CYCLING the persisted collapse tier (title→macro→expanded→
// title). One click === one double-click on the title: it advances the tier.
// The glyph reflects the CURRENT tier so the header alone tells you where you
// are: ▸ (title, fully collapsed) · ◂▸ → use ▹ (macro, lean) · ▾ (expanded,
// full). Pure glyph swap (no rotate) honours the SNAP motion rule. D3
// {rest/hover/active/focus}: rest = dim ink glyph; hover = brightens + subtle
// backing; active(title) = category micro-glow so the collapsed state reads
// from the header alone; focus = high-contrast ring (G5 a11y, not shadow-only).
const TIER_GLYPH: Record<"title" | "macro" | "expanded", string> = {
  title: "▸", // fully collapsed — points right ("there is more, click to open")
  macro: "▹", // lean middle — hollow chevron reads as a partial open
  expanded: "▾", // fully open — points down
};
const TIER_NEXT_LABEL: Record<"title" | "macro" | "expanded", string> = {
  title: "Expand block to lean view",
  macro: "Expand block to full view",
  expanded: "Collapse block to title",
};
function CollapseChevron({
  tier,
  accent,
  onCycle,
  disabled = false,
}: {
  tier: "title" | "macro" | "expanded";
  accent: string;
  onCycle: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const atTitle = tier === "title";
  return (
    <button
      type="button"
      data-testid="collapse-chevron"
      data-tier={tier}
      aria-label={
        disabled ? "Block loading" : `${TIER_NEXT_LABEL[tier]} (currently ${tier})`
      }
      // Three-state control — `aria-expanded` can't express 3 tiers, so report
      // the current tier via aria-label + data-tier and only mark fully-expanded
      // as expanded for AT that key off the boolean.
      aria-expanded={tier === "expanded"}
      disabled={disabled}
      title={
        disabled
          ? "Loading…"
          : `${TIER_NEXT_LABEL[tier]} — title → lean → full → title`
      }
      onClick={onCycle}
      onDoubleClick={(e) => { e.stopPropagation(); }}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="shrink-0 flex items-center justify-center rounded focus:outline-none focus-visible:ring-2"
      style={{
        width: 14,
        height: 14,
        color: disabled
          ? "rgba(21,21,26,0.35)"
          : atTitle
            ? "#15151A"
            : hover
              ? "rgba(21,21,26,0.95)"
              : "rgba(21,21,26,0.62)",
        background: hover && !disabled ? "rgba(0,0,0,0.14)" : "transparent",
        boxShadow: atTitle && !disabled ? `0 0 4px ${accent}` : undefined,
        transition: "color 120ms ease, background 120ms ease",
        cursor: disabled ? "default" : "pointer",
        ["--tw-ring-color" as string]: accent,
      }}
    >
      <span aria-hidden className="leading-none font-bold" style={{ fontSize: 9 }}>
        {TIER_GLYPH[tier]}
      </span>
    </button>
  );
}

// Chassis corner radius per category — a synth reads differently from an FX
// rack at a glance (mockup's getChassisShape, radius only). Matches the
// mockup's vst-instrument / vst-effect / vst-midi / logic silhouettes.
const chassisRadius: Record<BlockCategory, string> = {
  instrument: "11px 11px 3px 3px", // "keyboard cap"
  audiofx: "5px", // "rack module"
  midifx: "3px 12px 12px 3px", // "data dart"
  modulator: "3px", // "CV chip"
};

const PORT_LANE_H = 16;

// One port row in the port lane (mockup port-well + always-on mono label):
// a recessed `.port-well` socket at the chassis edge with a signal-coloured
// pip inside, and a GREY mono label inward (the pip carries the signal colour,
// the label stays neutral — mockup parity). The RF `<Handle>` IS the well
// (relative-positioned so it flows in the row, yet React Flow still resolves
// its rect for connections). The label is ALWAYS visible (never hover-gated).
function PortRow({
  port,
  side,
  top,
  busName,
}: {
  port: Port;
  side: "input" | "output";
  top: number;
  busName?: string;
}) {
  const color = portColor[port.type] ?? portColor.audio;
  const isInput = side === "input";
  const isSidechain =
    /side\s*chain|(^|[^a-z])sc([^a-z]|$)/i.test(port.label) ||
    /(^|[^a-z])sc([^a-z]|$)/i.test(port.id);
  const labelText =
    busName ?? (isSidechain && /^sc$/i.test(port.label) ? "SC" : port.label);
  return (
    <div
      className="absolute flex items-center gap-1"
      style={{
        top,
        transform: "translateY(-50%)",
        ...(isInput
          ? { left: -7 }
          : { right: -7, flexDirection: "row-reverse" }),
      }}
    >
      {/* `.port-well` recessed socket; the RF Handle is styled AS the well so
          connections wire. A signal-coloured pip (~5px) reads the type. */}
      <Handle
        id={port.id}
        type={isInput ? "target" : "source"}
        position={isInput ? Position.Left : Position.Right}
        className={`port-well ${isSidechain ? "port-sidechain" : ""}`}
        style={{
          position: "relative",
          transform: "none",
          top: "auto",
          left: "auto",
          right: "auto",
          // .port-well supplies the recessed socket; when a cable is plugged,
          // add an outer signal-tint halo so a live port glows (mockup). Idle
          // ports keep the bare recess from the CSS.
          boxShadow: port.connected
            ? `inset 1.5px 1.5px 3px rgba(0,0,0,0.95), inset -1px -1px 1.5px rgba(255,255,255,0.06), 0 0 6px ${color}55`
            : undefined,
          cursor: "crosshair",
        }}
      >
        <span
          style={{
            // Signal-coloured pip nested in the socket. Smaller (4.5px) + a
            // subtle top highlight so it reads as a domed contact, brighter
            // when a cable is plugged (mockup). SC pips are dimmed (the dashed
            // ring carries the read).
            width: 4.5,
            height: 4.5,
            borderRadius: "50%",
            background: isSidechain
              ? `${color}66`
              : port.connected
                ? color
                : `${color}99`,
            boxShadow: port.connected
              ? `0 0 4px ${color}, inset 0 0.5px 0 rgba(255,255,255,0.45)`
              : "inset 0 0.5px 0 rgba(255,255,255,0.25)",
            pointerEvents: "none",
          }}
        />
      </Handle>
      <span
        className="font-mono whitespace-nowrap overflow-hidden text-ellipsis leading-none"
        style={{
          fontSize: "9px",
          // Grey mono label (mockup parity); pip carries the signal colour. A
          // touch of letter-spacing + the monospace make In L / Out R columns
          // line up cleanly (Glen P0 — alignment).
          color: "rgba(146,146,153,0.9)",
          fontWeight: 400,
          letterSpacing: "0.03em",
          maxWidth: 80,
        }}
      >
        {labelText}
      </span>
    </div>
  );
}

// Lean-port-lane expander (Glen, 2026-06-03). A compact, on-brand row that
// collapses the Value/CV param-port wall behind a single "▸ N params" control.
// Positioned absolutely INTO the port lane like a PortRow so it shares the
// lane's rhythm. Visual language = the locked neumorphic "one chassis": a
// recessed pill (pressed INTO the surface) tinted with the Value/CV orange
// (#E8A838 — these ARE value ports, so the accent is honest, not decorative),
// understated so it reads as a quiet utility, not a loud button. Chevron flips
// ▸→▾ on expand. The whole row is the hit target. stopPropagation keeps a click
// from selecting/dragging the node underneath.
const PARAM_ACCENT = "#E8A838"; // Value/CV signal colour (matches portColor.value)

function ParamLaneToggle({
  count,
  expanded,
  top,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  top: number;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={expanded ? "Hide parameter ports" : "Show parameter ports"}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Hide" : "Show"} ${count} parameter ${count === 1 ? "port" : "ports"}`}
      // A6/F5 (Fitts's law): the BUTTON is a 30px-tall invisible hit target —
      // the visible 13px pill is the inner span below, visually unchanged.
      // Clicks anywhere in the 30px band toggle the lane; the chassis around
      // the pill still LOOKS untouched.
      className="nodeblock-param-toggle absolute flex items-center justify-center select-none"
      style={{
        top,
        left: "50%",
        transform: "translate(-50%, -50%)",
        height: 30,
        minWidth: 44,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        // Above the bypass dim (z-20 lane) but the lane itself already sits at
        // z-20; nothing extra needed — it inherits the lane stacking.
        pointerEvents: "auto",
      }}
    >
      <span
        className="flex items-center gap-1 px-1.5 leading-none"
        style={{
          height: 13,
          borderRadius: 3,
          // Recessed into the chassis (inset shadow) — pressed, not raised.
          // Idle keeps a bare recess; hover warms a faint orange tint + a hair
          // brighter so the affordance surfaces without breaking the "off" rest
          // state. Same idle/hover grammar as the header StateBtn + port wells.
          background: hovered
            ? `linear-gradient(180deg, ${PARAM_ACCENT}14 0%, ${PARAM_ACCENT}0A 100%)`
            : "linear-gradient(180deg, rgba(26,26,30,0.9) 0%, rgba(20,20,24,0.95) 100%)",
          boxShadow: hovered
            ? `inset 1px 1px 2px rgba(0,0,0,0.7), inset -0.5px -0.5px 1px rgba(255,255,255,0.04), 0 0 5px ${PARAM_ACCENT}33`
            : "inset 1px 1px 2px rgba(0,0,0,0.7), inset -0.5px -0.5px 1px rgba(255,255,255,0.04)",
          transition: "background 90ms ease, box-shadow 90ms ease",
        }}
      >
      {/* Chevron — flips on expand. Orange so it ties to the Value/CV ports it
          governs. */}
      <span
        aria-hidden
        className="font-mono"
        style={{
          fontSize: 8,
          lineHeight: 1,
          color: PARAM_ACCENT,
          opacity: hovered || expanded ? 1 : 0.85,
          // Rotate a single ▸ glyph rather than swapping characters so the
          // motion reads as a smooth disclosure twist.
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 120ms ease, opacity 90ms ease",
          display: "inline-block",
        }}
      >
        ▸
      </span>
      <span
        className="font-mono tabular-nums tracking-tight whitespace-nowrap"
        style={{
          fontSize: 8.5,
          color: hovered ? "rgba(229,229,234,0.9)" : "rgba(146,146,153,0.92)",
          letterSpacing: "0.02em",
        }}
      >
        {count} {count === 1 ? "param" : "params"}
        </span>
      </span>
    </button>
  );
}

function BlockComponent({ data, selected }: NodeProps) {
  const d = data as unknown as BlockData;
  const cat = catConfig[d.category] ?? catConfig.instrument;
  const isContainer = d.containerNodeCount != null;
  const isPortal = d.isPortal ?? false;
  // Built-in (internal) nodes carry format "INT"; everything else
  // (VST3/AU/CLAP/LV2) is a third-party plugin and renders the fixed I/O +
  // single-activity-bar card (2b), never an embedded editor on the face.
  const isThirdParty = d.format !== "INT";

  // ── Persisted collapse TIER (Decision A-2a + Task 2.4 — three tiers) ──
  // Replaces the old zoom-driven content swap (2a — kill zoom-morph): a Block
  // renders ONE content-driven (A-1) height and zoom only SCALES it (React Flow
  // transform). The collapse TIER is engine-persisted (hydrated from the Node
  // ValueTree as `collapseTier`, Task 2.0) and is now a real 3-state enum
  // (research TOP-10 #2 — the Bitwig/Vital/Serum density model):
  //   • 'title'    = header only (name + chevron + B/M + the single activity
  //                  well, ≈84px). The most-collapsed glance state. Cables stay
  //                  routable (collapsed-socket rule §5 — port Handles persist).
  //   • 'macro'    = LEAN DEFAULT — header + activity well + a COMPACT port lane
  //                  (essential audio/MIDI I/O only), MINUS the full control deck
  //                  / embed / param-port wall. Kills wasted space (owner's pain)
  //                  while keeping the block scannable + wireable. NOTHING-fake:
  //                  only real ports + real activity, never fabricated knobs.
  //   • 'expanded' = full control deck + heavy embed + the "▸ N params" lane.
  // A LOADING node (loading-node contract §4/§7) is PINNED to 'title' until ready
  // (name + "loading…", no ports/meters); the cycle does not apply mid-load.
  const isLoading = d.loadState === "loading";
  const tier: "title" | "macro" | "expanded" = isLoading
    ? "title"
    : (d.collapseTier ?? "macro");
  const setCollapseTier = useGraphStore((s) => s.setCollapseTier);
  // Render gates derived from the tier (kept as named booleans so the body JSX
  // below reads cleanly): the single activity well shows at title AND macro;
  // the full control deck + embed + param-port wall show ONLY when expanded.
  const showActivityWell = tier === "title";
  const showCompactPortLane = tier === "macro"; // essential I/O only, no deck
  const isExpanded = tier === "expanded";
  // Double-click the title/header CYCLES title→macro→expanded→title (Task 2.4).
  // The chevron reuses the same cycle so the header carries one consistent
  // affordance. Pinned while loading (no tier change until ready).
  const cycleTier = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLoading) return;
    const next: "title" | "macro" | "expanded" =
      tier === "title" ? "macro" : tier === "macro" ? "expanded" : "title";
    void setCollapseTier(d.id, next);
  };

  // ── Header state actions (verdict 1) — real engine wiring for B/M ──
  // Solo (S) is intentionally absent: Element's engine has no solo concept
  // (Glen, 2026-05-30). Re-add a real S button when engine-solo lands; do NOT
  // fake it client-side.
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const toggleMute = useGraphStore((s) => s.toggleMute);

  // ── VU level (Q-VU-PER-BLOCK D1 — per-node output RMS) — REAL signal ──
  // Reads the host's per-node output RMS (populated ~60Hz from graphbuilder.cpp's
  // atomic per-channel RMS) through the falling-envelope ballistics (P3-A): the
  // display snaps UP instantly on a host push and decays toward 0 between
  // pushes, so a stopped-but-alive engine falls to 0 and HOLDS 0 instead of
  // freezing on the last value. `meterState` distinguishes honest idle (engine
  // alive, no signal) from "stale" (no host frame for >250ms → no-data), which
  // the meter renders dimmed/grey rather than as a coloured reading. Supersedes
  // the cable-derived path: terminal / unconnected / output-only blocks meter
  // REAL signal (not idle 0). Called unconditionally (before any early return)
  // so hook order is stable across zoom/container/portal branches.
  const { level: meterLevel, state: meterState } = useBlockNodeLevelBallistic(
    d.id,
  );

  // ── On-Block knobs (verdict 1) — live param values + real host write ──
  // Read the first N param values for this Block off the 15 Hz delta channel.
  // useShallow is mandatory: a fresh array each call would loop useSyncExternal-
  // Store (same reason BlockEmbed wraps its selector).
  const setLocalParam = useParameterStore((s) => s.setLocal);
  const paramValues = useParameterStore(
    useShallow((st) => {
      const out: number[] = new Array(ON_BLOCK_KNOBS);
      const prefix = `${d.id}:`;
      for (let i = 0; i < ON_BLOCK_KNOBS; ++i) {
        const v = st.values[prefix + i];
        out[i] = typeof v === "number" ? v : NaN;
      }
      return out;
    }),
  );
  const knobParams = paramValues
    .map((v, i) => ({ i, v }))
    .filter((p) => Number.isFinite(p.v));

  // ── T5 — Bitwig-style curated inline face for built-in (INT) Blocks ──
  // A registry maps the engine `identifier` (e.g. "element.compare") to a
  // curated face spec. Resolved + validated here (unconditionally, above the
  // early returns — hook-order discipline). The metadata fetch is gated to faces
  // that actually bind params (chooser-only faces skip the round-trip). The face
  // renders ONLY when validation passes; any name mismatch / missing param falls
  // back to the generic knob deck below. NOTHING-fake: a control is bound only to
  // a parameter that really exists on the node.
  const inlineSpec =
    d.format === "INT" ? getInlineFaceSpec(d.identifier) : undefined;
  const needsMeta = inlineSpec ? faceNeedsParamMeta(inlineSpec) : false;
  const inlineMeta = useNodeParamMeta(d.id, !!inlineSpec && needsMeta);
  // Chooser-only faces validate without metadata; param faces wait for meta
  // (null = loading → not yet valid → generic deck for now).
  const inlineFaceValid =
    inlineSpec != null &&
    (!needsMeta
      ? validateInlineFace(inlineSpec, [])
      : inlineMeta != null && validateInlineFace(inlineSpec, inlineMeta));

  // ── R3 — sandbox crash state ──
  // selectSandboxNeedsAttention returns true when the store has a live
  // crashed/loadFailed/error entry for this block's UUID (= d.id). Nothing is
  // fabricated: the selector returns false until the host pushes a real event.
  const crashed = useSandboxCrashStore(selectSandboxNeedsAttention(d.id));
  // Amber honesty band: sandbox requested but the worker failed → plugin runs
  // in-process (unprotected). Mutually exclusive with `crashed` (the store holds
  // one latest event per node, and the two selectors partition the kinds).
  const inProcess = useSandboxCrashStore(selectSandboxInProcess(d.id));
  const sandboxRestart = useSandboxCrashStore((s) => s.restart);
  const [reloading, setReloading] = useState(false);

  const handleReload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (reloading) return;
    setReloading(true);
    void sandboxRestart(d.id).finally(() => setReloading(false));
  };

  // Block-level hover swaps the sculpt chassis to its lighter hover variant
  // (no size/layout change). Port labels are now always-on (mockup), so hover
  // no longer gates them.
  const [hovered, setHovered] = useState(false);

  const inputPorts = d.ports.filter((p) => p.direction === "input");
  const outputPorts = d.ports.filter((p) => p.direction === "output");

  // ── Lean port lane (Glen, 2026-06-03) — split essential I/O from param/mod ──
  //
  // A plugin hosted via a params-as-ports format (e.g. a Valhalla reverb's Mix,
  // Feedback, Density, Width, LowCut… exposed as CV inputs) dumps an
  // overwhelming wall of rows. Split by signal TYPE — the cleanest signal the
  // port data carries:
  //   • ESSENTIAL  = audio + MIDI ports (`type !== "value"`) — the main I/O you
  //     almost always wire. Always VISIBLE.
  //   • PARAM/MOD  = Value/CV ports (`type === "value"`) — these map to plugin
  //     parameters / modulation inputs (orange Value signal type). COLLAPSED by
  //     default behind a "▸ N params" expander, revealed on click.
  // Heuristic note: Element's Port model has no explicit "is this a main bus vs
  // a param" flag, so signal type IS the discriminator — and it lines up with
  // the design system (audio blue / MIDI teal = essential; value orange = the
  // param/mod ports). If a future port ever tags main-vs-param explicitly,
  // prefer that; until then `type === "value"` is the honest best signal.
  const isParamPort = (p: Port) => p.type === "value";
  const essentialInputs = inputPorts.filter((p) => !isParamPort(p));
  const essentialOutputs = outputPorts.filter((p) => !isParamPort(p));
  // Per-block hidden params (Configure Parameters… popover, Glen 2026-06-03):
  // the user can HIDE the Value/CV param ports they don't care about on this
  // Block. d.hiddenParams holds those port ids (persisted on the node tree);
  // filter them out entirely so they neither render nor count toward
  // "▸ N params". Default [] ⇒ nothing hidden ⇒ all params present (the
  // previous behaviour). NOTHING-fake: the set is engine-persisted, hydrated
  // from the snapshot, and reconciled — not a transient client guess.
  const hiddenParamIds = useMemo(
    () => new Set(d.hiddenParams ?? []),
    [d.hiddenParams],
  );
  const isVisibleParamPort = (p: Port) =>
    isParamPort(p) && !hiddenParamIds.has(p.id);
  const paramInputs = inputPorts.filter(isVisibleParamPort);
  const paramOutputs = outputPorts.filter(isVisibleParamPort);
  // Count = VISIBLE (non-hidden) param ports — what the expander actually shows.
  const paramPortCount = paramInputs.length + paramOutputs.length;
  const hasParamPorts = paramPortCount > 0;

  // Per-block local UI state — collapsed by default (lean). Does NOT persist;
  // a fresh mount (reload / re-add) starts collapsed again, which is the lean
  // default we want. Container/Portal branches return before this is read, so
  // the hook order stays stable (this is below all early returns' hooks).
  const [paramsExpanded, setParamsExpanded] = useState(false);

  // ── Phase 5B — derive port→busName map for this block ──
  // We look at every cable that touches this block; if useBusStore has the
  // cable flagged wireless, the corresponding port gets a bus badge. A port
  // with multiple wireless cables shows the most recent name (rare).
  const edges = useGraphStore(selectEdges);
  const cableBus = useBusStore((s) => s.cableBus);
  const portBusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const edge of edges as CableData[]) {
      const bus = cableBus[edge.id];
      if (!bus) continue;
      if (edge.target === d.id) map.set(edge.targetPort, bus);
      if (edge.source === d.id) map.set(edge.sourcePort, bus);
    }
    return map;
  }, [edges, cableBus, d.id]);

  // ── Portal: distinct treatment ──
  if (isPortal) {
    return (
      <div
        style={{ contain: "content" }}
        className="w-40 border-2 border-dashed border-[#E8A838]/30 bg-[#E8A838]/5 rounded-lg flex flex-col items-center justify-center py-3 px-2"
      >
        <span className="text-[10px] text-[#E8A838] font-black uppercase">
          External Portal
        </span>
        <span className="text-[11px] text-white/70 mt-0.5">{d.name}</span>

        {/* Ports */}
        {inputPorts.map((port, i) => (
          <PortHandle
            key={port.id}
            portId={port.id}
            portType={port.type}
            connected={port.connected}
            handleType="target"
            position={Position.Left}
            topPercent={40 + i * 20}
            busName={portBusMap.get(port.id)}
          />
        ))}
        {outputPorts.map((port, i) => (
          <PortHandle
            key={port.id}
            portId={port.id}
            portType={port.type}
            connected={port.connected}
            handleType="source"
            position={Position.Right}
            topPercent={40 + i * 20}
            busName={portBusMap.get(port.id)}
          />
        ))}
      </div>
    );
  }

  // ── Container: inset background, child slots ──
  if (isContainer) {
    return (
      <div
        style={{ contain: "content", boxShadow: shadowPressed }}
        className="w-[280px] bg-pressed border border-white/5 rounded-xl p-3"
      >
        <div className="flex items-center justify-between mb-3">
          {/* Container label: real name + "(Nested)" qualifier. Falls back to
              "Container" when unnamed so it never reads as a bare " (Nested)".
              Hover hints rename (Cmd+R/Cmd+T → in-place editor), same as Blocks. */}
          <span
            className="text-[10px] font-bold text-white/30 uppercase tracking-tighter cursor-text hover:text-white/50"
            title="Rename (⌘R)"
          >
            {(d.name?.trim() || "Container") + " (Nested)"}
          </span>
          <span className="text-[12px] text-white/20 cursor-pointer hover:text-white/50">
            ⤢
          </span>
        </div>
        {/* Honest in-canvas preview (P3-B): a Container holds a REAL nested
            Board whose contents we do not mirror here — so show the real child
            count (engine getNumNodes()), not invented node identities. The dive
            (double-click) opens the actual Board. NOTHING-fake: no placeholder
            grid, no fabricated per-child labels. */}
        {(() => {
          const n = d.containerNodeCount ?? 0;
          const label =
            n > 0
              ? `${n} ${n === 1 ? "Block" : "Blocks"} — open to edit`
              : "Empty — open to edit";
          return (
            <div
              className="h-14 rounded bg-[#252529] border border-white/5 flex items-center justify-center gap-2 text-[11px] text-text-secondary"
              style={{ boxShadow: shadowRaised }}
            >
              <span aria-hidden className="text-[13px] opacity-70">
                ▦
              </span>
              <span className="tabular-nums">{label}</span>
            </div>
          );
        })()}

        {/* Ports */}
        {inputPorts.map((port, i) => (
          <PortHandle
            key={port.id}
            portId={port.id}
            portType={port.type}
            connected={port.connected}
            handleType="target"
            position={Position.Left}
            topPercent={35 + i * 20}
            busName={portBusMap.get(port.id)}
          />
        ))}
        {outputPorts.map((port, i) => (
          <PortHandle
            key={port.id}
            portId={port.id}
            portType={port.type}
            connected={port.connected}
            handleType="source"
            position={Position.Right}
            topPercent={35 + i * 20}
            busName={portBusMap.get(port.id)}
          />
        ))}
      </div>
    );
  }

  // ── Standard block ──
  //
  // 2a — zoom-driven content morphing is GONE: the block renders one
  // content-driven (A-1) height; React Flow's transform handles zoom scaling.
  // The deliberate COMPACT tier (collapse) is handled inside this render below
  // (header + activity well only when `collapsed`), not by a zoom branch.

  const hostOutline = hostColourOutline(d.hostColor);
  // Per-node custom colour (right-click → Options swatches): when set it
  // REPLACES the category hue on the header gradient — the visible change the
  // user asked for (previously it only tinted the 1px border, i.e. invisible).
  const headerHex = hostOutline ?? cat.hex;
  // Meters are PORT-derived, not category-derived (Glen QA 2026-06-06): the
  // ballistic feed reads the node's real audio OUTPUT RMS, so a block with no
  // audio outputs (e.g. a MIDI input device the name heuristic in
  // blockcategory.hpp miscategorises as "instrument") must never render a VU —
  // it would be structurally fake. Category keeps driving icon/colour/status.
  // Note: the Audio Output device node (audio INS only) also loses its meter —
  // honest, since the output-RMS feed carries no data for it; an input-side
  // RMS bridge is the named follow-up.
  const hasAudioOut = d.ports.some(
    (p) => p.type === "audio" && p.direction === "output",
  );
  const active = !d.bypassed && !d.muted;
  const accentHsl = `hsl(var(--cat-${d.category}))`;
  // Header LED + load-bar use status hsl (scoped tokens). Bypassed reads as a
  // dim-but-flowing pass-through, so its LED is dark while the load bar stays
  // lit (signal still passes); muted is a hard block (load bar greyed).
  const ledColor = active
    ? "hsl(var(--status-ok))"
    : "hsl(240 6% 30%)";

  return (
    <div
      style={{
        // `layout style` (not `content`) — keeps per-node layout/style isolation
        // for React Flow perf WITHOUT paint-clipping. The root is NOT clipped
        // (overflow-visible, below): clipping it with overflow-hidden severed the
        // port `<Handle>` hit-areas, which protrude past the chassis edge (the
        // PortRow wells sit at left/right:-7), so the handle CENTRE fell through
        // to the canvas pane and cable-drag was unreliable / "can't fan out"
        // (Wave-3 Task 2.2). The chassis rounding survives without root clipping:
        // the background + box-shadow honour `borderRadius`, and every decorative
        // child that reaches a corner (header, load bar, state overlays) already
        // self-rounds via `borderRadius: "inherit"`. The well half-tuck visual is
        // a function of the well's -7 position, NOT of the parent clip, so it is
        // unchanged.
        contain: "layout style",
        borderRadius: chassisRadius[d.category],
        // Drives the subtle category-colour hover glow (.neu-sculpt-hover);
        // raw HSL triplet so the CSS can wrap it in hsl()/alpha (P1, feedback 6).
        ["--hover-glow" as string]: `var(--cat-${d.category})`,
        ...(hostOutline ? { borderColor: hostOutline } : {}),
      }}
      className={[
        // `.nodeblock-v3` scopes the mockup tokens/classes to this subtree.
        // Hover swaps `.neu-sculpt` → `.neu-sculpt-hover` (lighter gradient +
        // stronger shadow, NO size/layout change). Selected → category glow.
        // overflow-VISIBLE (not hidden): the port `<Handle>`s protrude past the
        // chassis edge and MUST stay un-clipped so their hit-area (centre) is
        // clickable — Wave-3 Task 2.2 (multi-cable fan-out). Decorative corner
        // rounding is preserved by the children themselves (see style note above).
        "nodeblock-v3 w-52 overflow-visible flex flex-col relative t-precision",
        selected
          ? `neu-glow-${d.category}`
          : hovered
            ? "neu-sculpt-hover"
            : "neu-sculpt",
        d.error && "animate-pulse",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Error pulsing border */}
      {d.error && (
        <div className="absolute inset-0 ring-1 ring-error/60 pointer-events-none z-40" style={{ borderRadius: "inherit" }} />
      )}

      {/* Header — full-width gradient category bar (mockup language). All
          elements vertically centred on one baseline via `items-center` +
          `leading-none`; even `gap-1.5` rhythm (Glen: alignment). */}
      <div
        className="flex items-center gap-1.5 px-2 shrink-0 relative z-10"
        style={{
          height: 26,
          background: `linear-gradient(180deg, ${headerHex} 0%, ${headerHex}B8 100%)`,
          color: "#15151A",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.3)",
          borderTopLeftRadius: "inherit",
          borderTopRightRadius: "inherit",
        }}
      >
        <FunctionIcon name={d.name} category={d.category} />
        {/* Title hints editability on hover (cursor + subtle underline) so the
            rename affordance is discoverable; the actual edit is keyboard-driven
            (Cmd+R/Cmd+T → in-place editor). DOUBLE-CLICK the title CYCLES the
            collapse tier (title→macro→expanded→title, Task 2.4) — the canvas
            dive-in gesture is double-click on the BLOCK BODY, so consuming the
            title's dblclick here (stopPropagation in cycleTier) keeps the two
            distinct. Pinned while loading. */}
        <span
          data-testid="block-title"
          className="text-[11px] font-bold truncate flex-1 leading-none tracking-wide cursor-text hover:underline decoration-white/30 underline-offset-2"
          title="Rename (⌘R) · double-click to change density"
          onDoubleClick={cycleTier}
        >
          {d.name}
        </span>

        {/* Signal LED — pulses green while passing signal, dark when off. */}
        <span
          className="w-[6px] h-[6px] rounded-full shrink-0"
          style={{
            backgroundColor: ledColor,
            boxShadow: active
              ? `0 0 4px ${ledColor}, inset 0 0.5px 0 rgba(255,255,255,0.4)`
              : "inset 1px 1px 1px rgba(0,0,0,0.6)",
            animation: active ? "led-pulse 1.6s ease-in-out infinite" : undefined,
          }}
          title={active ? "Signal" : "Idle"}
        />

        {/* CPU readout — styled like the format pill (dark pill, near-white
            text) so the header has ONE consistent baseline of pills. Tabular
            nums + px padding so it never reads cramped (Glen: alignment). */}
        {d.cpuLoad > 0 && (
          <span
            className="text-[7.5px] font-mono font-bold px-1 rounded leading-none shrink-0 tabular-nums"
            style={{
              background: "rgba(0,0,0,0.32)",
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "0.02em",
            }}
            title={`CPU ${d.cpuLoad.toFixed(1)}%${d.latencyMs > 0 ? ` · ${d.latencyMs}ms latency` : ""}`}
          >
            {d.cpuLoad.toFixed(0)}%
          </span>
        )}
        {d.muteInput ? (
          <span
            className="text-[7px] font-mono font-bold px-1 rounded leading-none shrink-0"
            style={{ background: "rgba(0,0,0,0.32)", color: "rgba(255,255,255,0.85)" }}
            title="Input muted"
          >
            Min
          </span>
        ) : null}
        <span
          className="text-[7.5px] font-mono font-bold px-1 rounded leading-none shrink-0"
          style={{
            background: "rgba(0,0,0,0.32)",
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "0.04em",
          }}
        >
          {d.format}
        </span>
        {/* z-50 keeps B/M ABOVE the muted/bypassed overlays (z-30/z-10) so the
            state buttons stay lit + clickable to undo the state (mockup). The
            collapse chevron sits with them (also z-50): toggles the persisted
            compact tier (Decision A-2a). */}
        <div className="flex items-center gap-px shrink-0 relative z-50">
          <StateBtn
            letter="B"
            active={d.bypassed}
            activeColor={accentHsl}
            onClick={(e) => {
              e.stopPropagation();
              void toggleBypass(d.id);
            }}
            title="Bypass"
          />
          <StateBtn
            letter="M"
            active={!!d.muted}
            activeColor="hsl(var(--status-clip))"
            onClick={(e) => {
              e.stopPropagation();
              void toggleMute(d.id);
            }}
            title="Mute"
          />
          <CollapseChevron
            tier={tier}
            accent={accentHsl}
            onCycle={cycleTier}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* ── Loading face (loading-node contract §4) ──
          A node whose real processor is still instantiating renders an HONEST
          loading face: name (already in the header above) + a "loading…"
          indicator, and NOTHING else — no meters, no param controls. The port
          lane + control deck + embed below are all suppressed while loading
          (the node also exposes no connectable ports — see the port-lane block).
          NOTHING-fake: the only real data mid-load are the name and the fact
          that it is loading. */}
      {isLoading ? (
        <div
          data-testid="block-loading"
          className="block-body flex items-center gap-1.5 px-2 relative z-[5]"
          style={{ height: 22 }}
        >
          {/* Neutral neumorphic shimmer dot + label — no glass, no signal hue
              (no signal exists yet). A quiet pulse keyed on a CSS class (not a
              per-tick inline animation) so the painter guard stays green. */}
          <span
            aria-hidden
            className="block-loading-dot shrink-0"
            style={{ width: 6, height: 6, borderRadius: "50%" }}
          />
          <span
            className="text-[10px] font-mono lowercase tracking-wide leading-none"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            loading…
          </span>
        </div>
      ) : null}

      {/* ── Activity well (title + macro tiers) ──
          At 'title' (header only) AND 'macro' (lean default) the Block shows a
          single honest activity well — one bar off the real `level` scalar,
          coloured by the node's primary signal type (D5: never "name + dot").
          NO control deck, NO embed, NO param-port wall (those are 'expanded'
          only). The macro tier ADDS the compact essential-I/O port lane below
          (rendered by the shared port-lane block) — that lean middle is what
          kills the wasted space. Transition is a SNAP (locked motion rule —
          width/height are never animated). */}
      {!isLoading && showActivityWell ? (
        <div
          className="block-body flex items-center px-2 relative z-[5]"
          style={{ height: 22 }}
        >
          <SignalActivityBar
            level={meterLevel}
            signal={primarySignalOf(d.ports)}
            active={active}
            stale={meterState === "stale"}
          />
        </div>
      ) : null}

      {/* ── Macro tier — lean default (Task 2.4) ──
          header + the single activity well + a COMPACT essential-I/O port lane
          (rendered by the shared port-lane block below), MINUS the full control
          deck / heavy embed / param-port wall. This is the wasted-space fix:
          the block stays scannable + wireable without the bulky deck. The well
          here is identical to 'title' (one honest bar); the only added density
          vs title is the labelled essential ports below. NOTHING-fake: real
          ports + real activity only — NO fabricated param knobs (live params are
          Phase 4, pinned-param slots are Task 3.E). */}
      {!isLoading && showCompactPortLane ? (
        <div
          data-testid="block-macro-well"
          className="block-body flex items-center px-2 relative z-[5]"
          style={{ height: 22 }}
        >
          <SignalActivityBar
            level={meterLevel}
            signal={primarySignalOf(d.ports)}
            active={active}
            stale={meterState === "stale"}
          />
        </div>
      ) : null}

      {/* Control deck — content-driven (A-1), zoom-INVARIANT (2a). Renders ONLY
          at the 'expanded' tier (Task 2.4 — macro/title show just the activity
          well; the full deck is the deliberate expert deep-dive).
          • THIRD-PARTY (non-INT plugin, 2b): the fixed card body = ONE honest
            activity bar off `level`, coloured by signal type. No knobs, no
            second meter, NO embedded editor (double-click opens the windowed
            editor). The conflated-scalar trap: exactly ONE indicator.
          • BUILT-IN: curated inline face (T5) → indexed knobs + RMS strip →
            audio meter strip → MIDI/mod status (the mockup's two-branch body). */}
      {isExpanded && (
        <div
          className="block-body flex items-center gap-1.5 px-2 relative z-[5]"
          style={{ height: 54 }}
        >
          {isThirdParty ? (
            // 2b — third-party plugin card: real I/O (port lane below) + a
            // SINGLE activity bar coloured by signal type. NOTHING-fake: one
            // bar off the one `level` scalar, never an audio-VU + MIDI-LED pair.
            <div className="flex-1 flex items-center min-w-0">
              <SignalActivityBar
                level={meterLevel}
                signal={primarySignalOf(d.ports)}
                active={active}
                stale={meterState === "stale"}
              />
            </div>
          ) : inlineSpec && inlineFaceValid ? (
            // T5 — curated inline face (validated). Replaces the generic deck
            // for built-in INT blocks whose identifier has a registered face.
            <InlineFace d={d} spec={inlineSpec} meta={inlineMeta ?? []} />
          ) : knobParams.length > 0 ? (
            <>
              {knobParams.map(({ i, v }) => (
                <NeuKnob
                  key={i}
                  size="xs"
                  compact
                  color={catToKnob[d.category]}
                  label={`P${i + 1}`}
                  value={Math.round(v * 100)}
                  onChange={(nv) => {
                    const norm = Math.max(0, Math.min(1, nv / 100));
                    setLocalParam(d.id, i, norm); // optimistic
                    void nativeSetNodeParameter(d.id, i, norm); // host write
                  }}
                />
              ))}
              {/* RMS strip fills remaining width — stacked L/R (mockup). Both
                  channels read the Block's real output level (max over its
                  outgoing cables) until a true per-channel L/R bridge lands.
                  Port-gated: no audio outputs → no VU (the feed has no data). */}
              {hasAudioOut && (
                <div className="flex-1 flex flex-col gap-px ml-1 min-w-0">
                  <RmsMeter level={meterLevel} active={active} clip={d.error} accent={accentHsl} stale={meterState === "stale"} />
                  <RmsMeter level={meterLevel} active={active} clip={d.error} accent={accentHsl} stale={meterState === "stale"} />
                </div>
              )}
            </>
          ) : hasAudioOut ? (
            // Audio Block with no exposed knobs → the meter strip becomes the
            // whole deck, filling the space (no dead middle).
            <div className="flex-1 flex flex-col gap-1 min-w-0 justify-center">
              <RmsMeter level={meterLevel} active={active} clip={d.error} accent={accentHsl} stale={meterState === "stale"} />
              <RmsMeter level={meterLevel} active={active} clip={d.error} accent={accentHsl} stale={meterState === "stale"} />
            </div>
          ) : (
            // MIDI / modulator → status text + activity dot (mockup).
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <FunctionIcon name={d.name} category={d.category} color={accentHsl} />
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className="text-[10px] font-mono leading-tight truncate tabular-nums"
                  style={{ color: "hsl(var(--foreground))" }}
                >
                  {d.category === "midifx" ? "MIDI · routing" : "Modulation"}
                </span>
                <span
                  className="text-[9px] uppercase tracking-wider leading-tight"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  Pass-through
                </span>
              </div>
              {active && (
                <span
                  className="w-[4px] h-[4px] rounded-full shrink-0"
                  style={{
                    backgroundColor: accentHsl,
                    boxShadow: `0 0 5px ${accentHsl}`,
                    animation: "led-pulse 1.6s ease-in-out infinite",
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Heavy face (live meter + FFT spectrum) ──
          2a — NO LONGER auto-mounted by zoom. The heavy BlockEmbed appears only
          where a REAL audio block warrants it AND the block is expanded:
          a BUILT-IN audiofx node (EQ / spectral processor) that is not
          collapsed and has a real audio output — that is the one place the live
          FFT spectrum strip carries unique real data (useNodeSpectrum gates the
          audio-thread tap to exactly these on-screen blocks). Third-party
          plugins get the single activity card instead (2b) and NEVER an embed;
          non-audio built-ins are covered by the deck above. Honest + perf-safe:
          the spectrum tap is scoped to visible audiofx blocks only. Task 2.4:
          gated on 'expanded' (the heavy FFT strip is the full deep-dive — macro
          / title keep the lean activity well only). */}
      {isExpanded && !isThirdParty && d.category === "audiofx" && hasAudioOut && (
        <BlockEmbed nodeId={d.id} category={d.category} />
      )}

      {/* Port lane — dedicated band below the deck (mockup). z-20 so the port
          pips stay VISIBLE above the bypass dim (signal passes through) but
          BELOW the muted overlay (z-30, hard block hides them).

          LEAN (Glen, 2026-06-03): essential audio/MIDI I/O always shows; the
          Value/CV param-port wall collapses behind a "▸ N params" toggle so a
          params-heavy plugin doesn't dump 18 rows by default. Lane height tracks
          exactly what's shown — lean when collapsed, grows on expand.

          TASK 2.4 — three-tier behaviour:
          • LOADING: the port lane is SUPPRESSED entirely (the loading node
            exposes NO connectable ports — loading-node contract §3/§4).
          • title + macro: essential audio/MIDI I/O Handles STAY (collapsed-
            socket rule §5 — a connected Block keeps rendering its port Handles
            so the engine Arc's endpoints still draw; the cable must not vanish).
            The param-port wall + "▸ N params" toggle are HIDDEN (only essential
            I/O at these lean tiers).
          • expanded: the full lean lane incl. the "▸ N params" toggle. */}
      {!isLoading && (() => {
        const essentialRows = Math.max(
          essentialInputs.length,
          essentialOutputs.length,
        );
        const paramRows = Math.max(paramInputs.length, paramOutputs.length);
        // The toggle, when present, occupies the row directly below the
        // essential I/O. Param rows (when expanded) stack below the toggle.
        const toggleTop = essentialRows * PORT_LANE_H + PORT_LANE_H / 2 + 2;
        const paramBaseRow = essentialRows + (hasParamPorts ? 1 : 0);
        // The param-port wall + "▸ N params" toggle appear ONLY at the expanded
        // tier. title + macro keep ONLY essential I/O so the Block stays
        // cablable (collapsed-socket rule) without dumping the param wall —
        // that lean lane is the wasted-space fix. Expanded: the usual lean lane.
        const showParamLane = hasParamPorts && isExpanded;
        const shownRows =
          essentialRows +
          (showParamLane ? 1 : 0) +
          (showParamLane && paramsExpanded ? paramRows : 0);
        return (
          <div
            className="relative shrink-0 z-20"
            style={{ height: Math.max(shownRows, 1) * PORT_LANE_H + 6 }}
          >
            {/* ESSENTIAL — audio + MIDI I/O, exactly where they always sat. */}
            {essentialInputs.map((port, i) => (
              <PortRow
                key={port.id}
                port={port}
                side="input"
                top={i * PORT_LANE_H + PORT_LANE_H / 2 + 2}
                busName={portBusMap.get(port.id)}
              />
            ))}
            {essentialOutputs.map((port, i) => (
              <PortRow
                key={port.id}
                port={port}
                side="output"
                top={i * PORT_LANE_H + PORT_LANE_H / 2 + 2}
                busName={portBusMap.get(port.id)}
              />
            ))}

            {/* PARAM/MOD — collapsed by default behind the toggle. Suppressed
                entirely when the BLOCK is collapsed (compact tier shows only
                essential I/O + the activity well). */}
            {showParamLane && (
              <ParamLaneToggle
                count={paramPortCount}
                expanded={paramsExpanded}
                top={toggleTop}
                onToggle={(e) => {
                  e.stopPropagation();
                  setParamsExpanded((v) => !v);
                }}
              />
            )}
            {showParamLane &&
              paramsExpanded &&
              paramInputs.map((port, i) => (
                <PortRow
                  key={port.id}
                  port={port}
                  side="input"
                  top={(paramBaseRow + i) * PORT_LANE_H + PORT_LANE_H / 2 + 2}
                  busName={portBusMap.get(port.id)}
                />
              ))}
            {showParamLane &&
              paramsExpanded &&
              paramOutputs.map((port, i) => (
                <PortRow
                  key={port.id}
                  port={port}
                  side="output"
                  top={(paramBaseRow + i) * PORT_LANE_H + PORT_LANE_H / 2 + 2}
                  busName={portBusMap.get(port.id)}
                />
              ))}
          </div>
        );
      })()}

      {/* Load bar — thin status rail at the chassis foot (mockup). Bypassed
          keeps a lit (dimmed-green) rail = signal passes THROUGH; muted greys
          out = hard block. z-40 so it stays above the bypass dim. Suppressed
          while loading — no signal flows yet, so an honest loading face shows
          no status rail (loading-node contract §4: nothing-fake). */}
      {!isLoading && (
      <div
        className="shrink-0 relative z-40"
        style={{
          height: 2,
          borderBottomLeftRadius: "inherit",
          borderBottomRightRadius: "inherit",
          // Subtle status rail (mockup): a thin low-opacity green line, not a
          // loud bar (Glen P2 — "looks out of place"). Bypassed dims it but
          // keeps it lit (signal passes through); muted greys it (hard block).
          background: d.error
            ? "hsl(var(--status-clip) / 0.85)"
            : d.muted
              ? "rgba(120,120,130,0.35)"
              : d.bypassed
                ? "hsl(var(--status-ok) / 0.3)" // dimmed-green: passes through
                : "hsl(var(--status-ok) / 0.42)",
          boxShadow: active
            ? "0 0 5px hsl(var(--status-ok) / 0.35)"
            : "none",
        }}
      />
      )}

      {/* R3 — sandbox crash badge. Honest: only renders when the host has
          pushed a real crashed/loadFailed/error event for this block's UUID.
          z-50 sits above state overlays so it is always readable; the reload
          button clears the badge on a successful host-side restart. */}
      {crashed && (
        <CrashBadge
          categoryHex={cat.hex}
          onReload={handleReload}
          reloading={reloading}
        />
      )}

      {/* Sandbox-unavailable honesty band. Honest: only renders when the host
          pushed a real "inProcessFallback" event for this block's UUID — the
          plugin loaded in-process and is NOT crash-protected. Amber/advisory,
          not the red crash badge; mutually exclusive with `crashed`. */}
      {inProcess && <InProcessBadge categoryHex={cat.hex} />}

      {/* State overlays (last in DOM, highest z). Muted (red, hard block)
          outranks bypassed (dim, pass-through) when both set. */}
      {d.muted ? <MutedOverlay /> : d.bypassed ? <BypassedDim /> : null}
    </div>
  );
}

export const Block = memo(BlockComponent);
