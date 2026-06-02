import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import type { BlockCategory, BlockData, CableData, Port } from "../../data/types";
import {
  useGraphStore,
  selectZoomTier,
  selectEdges,
} from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";
import { useBlockNodeLevel } from "../../stores/useNodeMeterStore";
import {
  useSandboxCrashStore,
  selectSandboxNeedsAttention,
} from "../../stores/useSandboxCrashStore";
import { useParameterStore } from "../../stores/useParameterStore";
import { nativeSetNodeParameter } from "../../bridge/nativeGraph";
import { NeuKnob } from "../neu/NeuKnob";
import { BlockEmbed } from "./BlockEmbed";
import { Icon } from "../neu/Icon";
import { iconForCategory } from "../neu/iconForCategory";

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
  const scale = hovered ? 1.25 : 1;
  const glow = hovered ? `0 0 6px ${color}80` : connected ? `0 0 4px ${color}40` : "none";

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

  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{
        transform: `scale(${scale})`,
        transition: "transform 120ms ease, filter 120ms ease",
        filter: glow !== "none" ? `drop-shadow(${glow})` : undefined,
        display: "block",
      }}
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
        background: "rgba(20,20,24,0.42)",
        backdropFilter: "grayscale(0.92) saturate(0.18) brightness(0.8)",
        WebkitBackdropFilter: "grayscale(0.92) saturate(0.18) brightness(0.8)",
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
function RmsMeter({
  level = 0,
  active,
  clip,
  accent,
}: {
  level?: number;
  active: boolean;
  clip: boolean;
  accent: string;
}) {
  const SEG = 14;
  const lit = clip ? SEG : Math.round(level * SEG);
  return (
    <div
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
        const segColor = isClipSeg
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
              background: segColor,
              opacity: litThis ? (active ? 1 : 0.45) : 0.16,
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

function BlockComponent({ data, selected }: NodeProps) {
  const d = data as unknown as BlockData;
  const cat = catConfig[d.category] ?? catConfig.instrument;
  const isContainer = d.containerNodeCount != null;
  const isPortal = d.isPortal ?? false;
  const zoomTier = useGraphStore(selectZoomTier);

  // ── Header state actions (verdict 1) — real engine wiring for B/M ──
  // Solo (S) is intentionally absent: Element's engine has no solo concept
  // (Glen, 2026-05-30). Re-add a real S button when engine-solo lands; do NOT
  // fake it client-side.
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const toggleMute = useGraphStore((s) => s.toggleMute);

  // ── VU level (Q-VU-PER-BLOCK D1 — per-node output RMS) — REAL signal ──
  // Reads the host's per-node output RMS directly from useNodeMeterStore, which
  // the bridge populates ~60Hz from graphbuilder.cpp's atomic per-channel RMS.
  // Supersedes the old cable-derived `useBlockOutputLevel` path: terminal /
  // unconnected / output-only blocks now meter REAL signal (not idle 0).
  // Called unconditionally (before any early return) so hook order is stable
  // across zoom/container/portal branches.
  const meterLevel = useBlockNodeLevel(d.id);

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

  // ── R3 — sandbox crash state ──
  // selectSandboxNeedsAttention returns true when the store has a live
  // crashed/loadFailed/error entry for this block's UUID (= d.id). Nothing is
  // fabricated: the selector returns false until the host pushes a real event.
  const crashed = useSandboxCrashStore(selectSandboxNeedsAttention(d.id));
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
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">
            {d.name} (Nested)
          </span>
          <span className="text-[12px] text-white/20 cursor-pointer hover:text-white/50">
            ⤢
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: Math.min(d.containerNodeCount ?? 2, 4) }).map(
            (_, i) => (
              <div
                key={i}
                className="h-14 rounded bg-[#252529] opacity-40 border border-dashed border-white/10 flex items-center justify-center text-[10px] text-text-secondary"
                style={{ boxShadow: shadowRaised }}
              >
                NODE_{String.fromCharCode(65 + i)}
              </div>
            ),
          )}
        </div>

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

  // ── Compact mode (semantic zoom) ──

  if (zoomTier === "compact") {
    return (
      <div style={{ contain: "content" }} className="w-[100px] bg-surface rounded-lg p-2 border border-white/5">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${cat.bg}`} />
          <span className="text-[10px] font-bold text-text-primary truncate">{d.name}</span>
        </div>
      </div>
    );
  }

  // ── Standard block ──

  const hostOutline = hostColourOutline(d.hostColor);
  const isAudioBearing = d.category === "instrument" || d.category === "audiofx";
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
        // for React Flow perf WITHOUT paint-clipping. The chassis itself uses
        // overflow-hidden (below) so wells half-tuck and overlays clip cleanly.
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
        "nodeblock-v3 w-52 overflow-hidden flex flex-col relative t-precision",
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
          background: `linear-gradient(180deg, ${cat.hex} 0%, ${cat.hex}B8 100%)`,
          color: "#15151A",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.3)",
          borderTopLeftRadius: "inherit",
          borderTopRightRadius: "inherit",
        }}
      >
        <FunctionIcon name={d.name} category={d.category} />
        <span className="text-[11px] font-bold truncate flex-1 leading-none tracking-wide">
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
            state buttons stay lit + clickable to undo the state (mockup). */}
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
        </div>
      </div>

      {/* Control deck — mockup's two-branch body (NO dead space, Glen):
          • knobs present  → knob bank + a flex-1 stacked L/R RMS strip
          • no knobs, audio → flex-1 stacked L/R RMS meters fill the deck
          • no knobs, midi/mod → status text + activity dot (mockup) */}
      {zoomTier !== "expanded" && (
        <div
          className="block-body flex items-center gap-1.5 px-2 relative z-[5]"
          style={{ height: 54 }}
        >
          {knobParams.length > 0 ? (
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
                  outgoing cables) until a true per-channel L/R bridge lands. */}
              <div className="flex-1 flex flex-col gap-px ml-1 min-w-0">
                <RmsMeter level={meterLevel} active={active} clip={d.error} accent={accentHsl} />
                <RmsMeter level={meterLevel} active={active} clip={d.error} accent={accentHsl} />
              </div>
            </>
          ) : isAudioBearing ? (
            // Audio Block with no exposed knobs → the meter strip becomes the
            // whole deck, filling the space (no dead middle).
            <div className="flex-1 flex flex-col gap-1 min-w-0 justify-center">
              <RmsMeter level={meterLevel} active={active} clip={d.error} accent={accentHsl} />
              <RmsMeter level={meterLevel} active={active} clip={d.error} accent={accentHsl} />
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

      {/* ── Expanded embed (semantic zoom) ── */}
      {zoomTier === "expanded" && (
        <BlockEmbed nodeId={d.id} category={d.category} />
      )}

      {/* Port lane — dedicated band below the deck (mockup). z-20 so the port
          pips stay VISIBLE above the bypass dim (signal passes through) but
          BELOW the muted overlay (z-30, hard block hides them). */}
      <div
        className="relative shrink-0 z-20"
        style={{ height: Math.max(inputPorts.length, outputPorts.length, 1) * PORT_LANE_H + 6 }}
      >
        {inputPorts.map((port, i) => (
          <PortRow
            key={port.id}
            port={port}
            side="input"
            top={i * PORT_LANE_H + PORT_LANE_H / 2 + 2}
            busName={portBusMap.get(port.id)}
          />
        ))}
        {outputPorts.map((port, i) => (
          <PortRow
            key={port.id}
            port={port}
            side="output"
            top={i * PORT_LANE_H + PORT_LANE_H / 2 + 2}
            busName={portBusMap.get(port.id)}
          />
        ))}
      </div>

      {/* Load bar — thin status rail at the chassis foot (mockup). Bypassed
          keeps a lit (dimmed-green) rail = signal passes THROUGH; muted greys
          out = hard block. z-40 so it stays above the bypass dim. */}
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

      {/* State overlays (last in DOM, highest z). Muted (red, hard block)
          outranks bypassed (dim, pass-through) when both set. */}
      {d.muted ? <MutedOverlay /> : d.bypassed ? <BypassedDim /> : null}
    </div>
  );
}

export const Block = memo(BlockComponent);
