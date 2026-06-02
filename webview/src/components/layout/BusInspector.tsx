import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useGraphStore,
  selectEdges,
  selectNodes,
} from "../../stores/useGraphStore";
import {
  deriveBuses,
  selectCableBusMap,
  useBusStore,
  type BusEntry,
} from "../../stores/useBusStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import { useNodeChannelMeterStore } from "../../stores/useNodeChannelMeterStore";
import { nativeGraphSetCableBus } from "../../bridge/nativeGraph";
import { Icon } from "../neu/Icon";
import type { CableData, SignalType } from "../../data/types";

/**
 * Bus inspector — the IO send/receive auditor (Wizard R1 #4 + R2 + R3).
 *
 * MODEL (corrected): a Bus is NOT a "wireless cable". A Bus is a named rail that
 * **IO blocks send to (Bus Send) and receive from (Bus Receive)**. Source blocks
 * push signal INTO the bus; destination blocks pull it OUT. This panel lists each
 * named bus on the board and, for each, shows:
 *   • SEPARATE Send + Receive activity meters (real per-cable RMS / activity from
 *     `useCableMeterStore`, the same 60Hz feed that drives the cables + Block VU)
 *   • Channel-topology-aware meters: Mono → single bar, Stereo → L/R pair,
 *     Surround (6ch) → per-channel columns with C/LF/Ls/Rs/L/R labels
 *   • MIDI buses show a teal activity indicator (blink-dot + event bead) — NOT
 *     an audio VU. "Display differently" per Glen's R3 review.
 *   • Sidechain feeds: orange trough + SC prefix — clearly visually distinct
 *   • a live volume (dBFS for audio / % activity for MIDI·CV) per side
 *   • sidechain state (display) — flagged when any feed on the bus is a sidechain
 *   • a direct "Open editor" affordance that dives the bus's destination block so
 *     its effects (e.g. a reverb living on the bus) open in the Block tab
 *
 * NOTHING FAKE: every meter reads a real level the engine pushed. The per-bus
 * FADER value (a dedicated bus-gain control) has no bridge yet — that needs the
 * send/receive Bus-block model, so it is NOT shown as a fabricated number; the
 * Send/Receive levels above ARE real (max RMS across each side's cables).
 *
 * Per-channel level split (G3-B item 2): the SEND side's multi-channel columns
 * now read REAL per-lane output RMS from each source node's per-channel atoms
 * (useNodeChannelMeterStore, fed by the host's 60Hz onNodeChannelLevels). When
 * a source reports fewer lanes than the bus topology, the missing lanes fall
 * back to the scalar (documented honest-degraded, NOT invented balance). The
 * RECEIVE side has no single source node, so it keeps the per-cable scalar.
 *
 * `onOpenBlock` is supplied by InspectorHub (selects the block + jumps to the
 * Block tab). When omitted (e.g. rendered in isolation) the affordance is hidden.
 */

// ── Design tokens (frozen HSL layer — NO ad-hoc values) ──────────────────────

const sigAccent: Record<SignalType, string> = {
  audio: "var(--sig-audio)",
  midi: "var(--sig-midi)",
  value: "var(--sig-value)",
};

const sigLabel: Record<SignalType, string> = {
  audio: "Audio",
  midi: "MIDI",
  value: "Value / CV",
};

const SIGNAL_ICON: Record<SignalType, string> = {
  audio: "AudioWaveform",
  midi: "Music",
  value: "Waves",
};

/** 0–1 amplitude → dBFS string (audio only); floored at −60 like a hardware scale. */
function toDbfs(amp: number): string {
  if (amp <= 0.0009) return "−∞";
  const db = 20 * Math.log10(amp);
  return `${db <= -60 ? "−60" : (db < 0 ? "−" : "+") + Math.abs(db).toFixed(1)}`;
}

// ── Channel topology ──────────────────────────────────────────────────────────

type ChannelCount = 1 | 2 | 6;

/**
 * Per-channel label sets. The surround order matches ITU-R BS.775 as used in
 * JUCE / VST3: L, R, C, LFE, Ls, Rs.
 */
const CHANNEL_LABELS: Record<ChannelCount, string[]> = {
  1: ["M"],
  2: ["L", "R"],
  6: ["L", "R", "C", "LF", "Ls", "Rs"],
};

/**
 * Derive the dominant channel topology for a bus from its constituent cables.
 * Returns the max channelCount found (widest cable = the bus's capability).
 * Falls back to 2 (stereo) when data is absent.
 */
function dominantChannelCount(
  cableIds: string[],
  cables: CableData[],
): ChannelCount {
  let max: ChannelCount = 1;
  for (const id of cableIds) {
    const cable = cables.find((c) => c.id === id);
    if (!cable) continue;
    const cc = cable.channelCount as ChannelCount;
    if (cc > max) max = cc;
  }
  return max;
}

// ── VU primitives ─────────────────────────────────────────────────────────────

/**
 * Single vertical LED ramp column — green floor → amber shoulder → red ceiling.
 * `level` is the real 0–1 reading; `segments` defaults to 20 for a tight column.
 */
function VuColumn({
  level,
  active,
  label,
  isSidechain = false,
  segments = 20,
}: {
  level: number;
  active: boolean;
  label?: string;
  isSidechain?: boolean;
  segments?: number;
}) {
  const amp = Math.min(1, Math.max(0, level));
  const lit = Math.round(amp * segments);

  // Sidechain columns use orange trough shadow to visually distinguish them.
  const troughShadow = isSidechain
    ? "inset 1px 1px 2px rgba(0,0,0,0.85), inset -0.5px -0.5px 1px rgba(232,168,56,0.08)"
    : "inset 1px 1px 2px rgba(0,0,0,0.85), inset -0.5px -0.5px 1px rgba(255,255,255,0.04)";

  return (
    <div className="flex flex-col items-center gap-[1px]" style={{ minWidth: 8 }}>
      {/* LED segments — rendered top-to-bottom so segment 0 = top = loudest */}
      <div
        className="flex flex-col-reverse gap-[1.5px]"
        style={{
          height: 36,
          width: 8,
          padding: "2px 1px",
          borderRadius: 3,
          background: "hsl(240 12% 6%)",
          boxShadow: troughShadow,
        }}
      >
        {Array.from({ length: segments }).map((_, i) => {
          const isClip = i >= segments - 2;
          const isWarn = i >= segments - 5;
          const litThis = i < lit;
          const segColor = isClip
            ? "hsl(var(--status-clip))"
            : isWarn
              ? "hsl(var(--status-warn))"
              : isSidechain
                ? "hsl(var(--sig-value))" // orange for sidechain columns
                : "hsl(var(--status-ok))";
          return (
            <div
              key={i}
              style={{
                flex: 1,
                borderRadius: 1,
                background: segColor,
                opacity: litThis ? (active ? 1 : 0.45) : 0.12,
                boxShadow: litThis
                  ? `0 0 2px ${segColor}`
                  : undefined,
              }}
            />
          );
        })}
      </div>
      {/* Channel label below the column */}
      {label && (
        <span
          className="text-[7px] font-bold uppercase tracking-wider leading-none select-none"
          style={{
            color: isSidechain
              ? "hsl(var(--sig-value))"
              : "hsl(var(--muted-foreground))",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * Multi-channel VU display.
 * - Mono (1ch): one centred column, no label clutter.
 * - Stereo (2ch): L/R pair with labels.
 * - Surround (6ch): six columns L R C LF Ls Rs in two visual groups.
 *
 * `levels` carries the REAL per-channel output RMS (G3-B item 2), one entry per
 * output lane, sourced from the bus's SEND node via `useNodeChannelLevels`.
 * Each VuColumn[i] shows `levels[i]`. When the source reports FEWER lanes than
 * the bus topology (e.g. a stereo source on a 5.1 bus), the missing lanes fall
 * back to the scalar `level` — documented honest-degraded, NOT invented balance.
 * `level` (max scalar) is also the fallback when no per-channel data exists.
 */
function MultiChannelVu({
  level,
  levels,
  channelCount,
  isSidechain = false,
}: {
  level: number;
  /** Real per-channel levels (0–1). [] → every lane uses the scalar fallback. */
  levels?: number[];
  channelCount: ChannelCount;
  isSidechain?: boolean;
}) {
  const amp = Math.min(1, Math.max(0, level));
  const labels = CHANNEL_LABELS[channelCount];

  // Per-lane resolver: real per-channel value when present, else the scalar.
  const laneAmp = (i: number): number => {
    const v = levels && i < levels.length ? levels[i] : amp;
    return Math.min(1, Math.max(0, v));
  };
  const laneActive = (i: number): boolean => laneAmp(i) > 0.01;

  if (channelCount === 1) {
    return (
      <div className="flex items-end justify-center" style={{ height: 44 }}>
        <VuColumn level={laneAmp(0)} active={laneActive(0)} label="M" isSidechain={isSidechain} />
      </div>
    );
  }

  if (channelCount === 2) {
    return (
      <div className="flex items-end gap-[3px]" style={{ height: 44 }}>
        <VuColumn level={laneAmp(0)} active={laneActive(0)} label={labels[0]} isSidechain={isSidechain} />
        <VuColumn level={laneAmp(1)} active={laneActive(1)} label={labels[1]} isSidechain={isSidechain} />
      </div>
    );
  }

  // 6-channel surround: two groups of 3 with a subtle gap between L/R/C and LF/Ls/Rs
  return (
    <div className="flex items-end gap-[1px]" style={{ height: 44 }}>
      {/* Front trio: L R C */}
      <div className="flex items-end gap-[3px]">
        {[0, 1, 2].map((i) => (
          <VuColumn key={i} level={laneAmp(i)} active={laneActive(i)} label={labels[i]} isSidechain={isSidechain} />
        ))}
      </div>
      {/* Visual separator */}
      <div style={{ width: 4 }} />
      {/* Surround + LFE: LF Ls Rs */}
      <div className="flex items-end gap-[3px]">
        {[3, 4, 5].map((i) => (
          <VuColumn key={i} level={laneAmp(i)} active={laneActive(i)} label={labels[i]} isSidechain={isSidechain} />
        ))}
      </div>
    </div>
  );
}

// ── MIDI activity indicator ───────────────────────────────────────────────────

/**
 * MIDI buses must NOT show an audio VU — MIDI is event-based, not amplitude.
 * This shows a teal pulsing activity dot (live blink when active) + a bead
 * that encodes rough event density as size.
 *
 * `level` is the 0–1 activity scalar the engine pushes for MIDI cables
 * (same 60Hz feed — value = recent event density, 0 = silent).
 */
function MidiActivityIndicator({
  level,
  dir,
}: {
  level: number;
  dir: "send" | "receive";
}) {
  const active = level > 0.01;
  const density = Math.min(1, Math.max(0, level));

  // Bead width 4–10px driven by density — encodes busyness (note/CC/clock).
  const beadW = 4 + density * 6;

  return (
    <div className="flex items-center gap-2" style={{ height: 44, padding: "10px 0" }}>
      {/* Activity dot: teal, pulses when active */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: active ? "hsl(var(--sig-midi))" : "hsl(240 12% 18%)",
          boxShadow: active
            ? "0 0 6px hsl(var(--sig-midi) / 0.7), 0 0 12px hsl(var(--sig-midi) / 0.3)"
            : "inset 1px 1px 3px rgba(0,0,0,0.6)",
          transition: "background 80ms ease-out, box-shadow 80ms ease-out",
          flexShrink: 0,
        }}
        aria-label={active ? "MIDI active" : "MIDI silent"}
      />

      {/* Event density trough */}
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "hsl(240 12% 8%)",
          boxShadow:
            "inset 1.5px 1.5px 2.5px rgba(0,0,0,0.8), inset -0.5px -0.5px 1px rgba(255,255,255,0.03)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {active && (
          <div
            style={{
              position: "absolute",
              left: dir === "send" ? 0 : "auto",
              right: dir === "receive" ? 0 : "auto",
              top: 0,
              height: "100%",
              width: beadW,
              borderRadius: 3,
              background: "hsl(var(--sig-midi))",
              boxShadow: "0 0 4px hsl(var(--sig-midi) / 0.5)",
              transition: "width 120ms ease-out",
            }}
          />
        )}
      </div>

      {/* Activity label */}
      <span
        className="text-[9px] font-bold tabular-nums leading-none shrink-0"
        style={{
          color: active ? "hsl(var(--sig-midi))" : "hsl(var(--muted-foreground))",
          fontVariantNumeric: "tabular-nums",
          minWidth: 28,
          textAlign: "right",
        }}
      >
        {active ? `${Math.round(density * 100)}%` : "—"}
      </span>
    </div>
  );
}

// ── FlowMeter (Send / Receive row) ────────────────────────────────────────────

/** Max real level over a set of cable ids (primitive result → re-render safe). */
function useMaxLevel(cableIds: string[]): number {
  return useCableMeterStore((s) => {
    let max = 0;
    for (const id of cableIds) {
      const lvl = s.levels[id] ?? 0;
      if (lvl > max) max = lvl;
    }
    return max;
  });
}

/**
 * Merge the REAL per-channel output RMS (G3-B item 2) of a bus side's SOURCE
 * nodes into one per-lane array, taking the max per lane across all sources.
 * Returns up to `maxChannels` lanes. `useShallow` element-compares so a steady
 * graph keeps the same reference (no re-render churn). Empty `[]` when none of
 * the source nodes report per-channel data → caller falls back to the scalar.
 */
function useMergedChannelLevels(
  sourceBlockIds: string[],
  maxChannels: number,
): number[] {
  return useNodeChannelMeterStore(
    useShallow((s) => {
      const out: number[] = [];
      for (const id of sourceBlockIds) {
        const ch = s.levels[id];
        if (!ch) continue;
        for (let i = 0; i < ch.length && i < maxChannels; ++i) {
          if (out[i] === undefined || ch[i] > out[i]) out[i] = ch[i];
        }
      }
      return out;
    }),
  );
}

/**
 * A labelled Send or Receive meter — direction label, level numeric, and
 * topology-aware VU display.
 *
 * - Audio + channelCount → MultiChannelVu (1/2/6 columns)
 * - MIDI → MidiActivityIndicator (no VU)
 * - Value/CV → horizontal VuLadder (scalar, same as before)
 * - Sidechain → orange-tinted MultiChannelVu with SC prefix
 */
function FlowMeter({
  dir,
  cableIds,
  sourceBlockIds,
  signalType,
  accent,
  endpointNames,
  channelCount,
  isSidechain,
}: {
  dir: "send" | "receive";
  cableIds: string[];
  /** UUIDs of the nodes whose OUTPUT feeds this side (the SEND side's sources).
   *  Used to resolve REAL per-channel levels; empty for the receive side. */
  sourceBlockIds: string[];
  signalType: SignalType;
  accent: string;
  endpointNames: string[];
  channelCount: ChannelCount;
  isSidechain: boolean;
}) {
  const level = useMaxLevel(cableIds);
  // Real per-channel levels for the SEND side (G3-B item 2). The receive side
  // has no single source node, so it stays on the scalar (honest — documented).
  const channelLevels = useMergedChannelLevels(sourceBlockIds, channelCount);
  const amp = Math.min(1, Math.max(0, level));
  const active = amp > 0.01;
  const isAudio = signalType === "audio";
  const isMidi = signalType === "midi";

  const label = dir === "send" ? "SEND →" : "← RECEIVE";
  const peers = endpointNames.length;

  // Sidechain tints the row's label accent to orange and shows SC prefix.
  const effectiveAccent = isSidechain
    ? "hsl(var(--sig-value))"
    : active
      ? accent
      : "hsl(var(--muted-foreground))";

  // Channel topology label (shown after SEND/RECV header on audio/value buses).
  const topoLabel = !isMidi
    ? channelCount === 1
      ? "MONO"
      : channelCount === 2
        ? "STEREO"
        : "5.1"
    : null;

  return (
    <div className="space-y-1">
      {/* Row header */}
      <div className="flex items-center gap-1.5">
        {isSidechain && (
          <span
            className="text-[7px] font-bold uppercase tracking-wider leading-none shrink-0"
            style={{
              color: "hsl(var(--sig-value))",
            }}
          >
            SC
          </span>
        )}
        <span
          className="text-[8px] font-bold uppercase tracking-widest leading-none shrink-0"
          style={{ color: effectiveAccent }}
        >
          {label}
        </span>
        {topoLabel && (
          <span
            className="text-[7px] font-bold uppercase tracking-wider leading-none shrink-0 px-1 py-0.5 rounded"
            style={{
              background: isSidechain
                ? "hsl(var(--sig-value) / 0.12)"
                : "hsl(240 12% 12%)",
              color: isSidechain
                ? "hsl(var(--sig-value))"
                : "hsl(var(--muted-foreground))",
            }}
          >
            {topoLabel}
          </span>
        )}
        <span className="text-[8px] text-text-dim leading-none">
          {peers} {peers === 1 ? "block" : "blocks"}
        </span>
        <div className="flex-1" />
        {!isMidi && (
          <span
            className="text-[10px] font-mono font-bold tabular-nums leading-none shrink-0"
            style={{ color: effectiveAccent }}
          >
            {isAudio ? `${toDbfs(amp)} dB` : `${Math.round(amp * 100)}%`}
          </span>
        )}
      </div>

      {/* Meter body — topology-aware */}
      {isMidi ? (
        <MidiActivityIndicator level={amp} dir={dir} />
      ) : (
        <div
          style={
            isSidechain
              ? {
                  padding: "3px 3px 2px",
                  borderRadius: 5,
                  background: "hsl(240 12% 7%)",
                  boxShadow:
                    "inset 1.5px 1.5px 3px rgba(0,0,0,0.7), inset -0.5px -0.5px 1px rgba(232,168,56,0.1)",
                }
              : undefined
          }
        >
          <MultiChannelVu
            level={amp}
            levels={channelLevels}
            channelCount={channelCount}
            isSidechain={isSidechain}
          />
        </div>
      )}

      {/* Endpoint names */}
      {peers > 0 && (
        <div className="text-[8px] text-text-dim truncate leading-snug">
          {endpointNames.join(" · ")}
        </div>
      )}
    </div>
  );
}

// ── BusInspector (public export) ──────────────────────────────────────────────

export function BusInspector({
  onOpenBlock,
}: {
  onOpenBlock?: (blockId: string) => void;
} = {}) {
  const edges = useGraphStore(selectEdges) as CableData[];
  const nodes = useGraphStore(selectNodes);
  const cableBus = useBusStore(selectCableBusMap);
  const setBusForCable = useBusStore((s) => s.setBusForCable);
  const selectEdgeOnGraph = useGraphStore((s) => s.selectEdge);

  const buses = useMemo(() => deriveBuses(edges, cableBus), [edges, cableBus]);
  const blockNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.name);
    return m;
  }, [nodes]);

  if (buses.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
          Buses
        </div>
        <div className="text-[10px] text-text-dim leading-relaxed">
          No buses on this Board. Add a <em>Bus Send</em> block to push a signal
          onto a named bus, and a <em>Bus Receive</em> block to pull it back —
          ideal for reverb / delay sends and parallel chains without dragging
          long cables across the canvas.
        </div>
      </div>
    );
  }

  const dissolveBus = (bus: BusEntry) => {
    for (const cableId of bus.cableIds) {
      setBusForCable(cableId, undefined);
      void nativeGraphSetCableBus(cableId, "");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
          Buses
        </span>
        <span className="text-[10px] text-text-dim tabular-nums">
          {buses.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {buses.map((bus) => (
          <BusRow
            key={bus.name}
            bus={bus}
            cables={edges}
            blockNames={blockNames}
            onSelect={() => {
              if (bus.cableIds.length > 0) selectEdgeOnGraph(bus.cableIds[0]);
            }}
            onDissolve={() => dissolveBus(bus)}
            onOpenBlock={onOpenBlock}
          />
        ))}
      </div>

      {/* Honest framing. The SEND side's multi-channel columns now show REAL
          per-channel output RMS (G3-B item 2) resolved from each source node's
          per-lane atoms. The RECEIVE side has no single source node, so it stays
          on the per-cable scalar (documented, not fabricated). A dedicated
          bus-FADER value still needs the Bus-block bridge. */}
      <div className="text-[8px] text-text-dim leading-snug pt-0.5 space-y-0.5">
        <div>
          Send levels are live per-channel (real per-lane output RMS from each
          source). Receive shares the cable scalar (no single source node).
        </div>
        <div>
          A dedicated bus-fader value needs the Bus-block bridge — Pillar-2.
        </div>
      </div>
    </div>
  );
}

// ── BusRow ────────────────────────────────────────────────────────────────────

function BusRow({
  bus,
  cables,
  blockNames,
  onSelect,
  onDissolve,
  onOpenBlock,
}: {
  bus: BusEntry;
  cables: CableData[];
  blockNames: Map<string, string>;
  onSelect: () => void;
  onDissolve: () => void;
  onOpenBlock?: (blockId: string) => void;
}) {
  const accent = `hsl(${sigAccent[bus.signalType]})`;

  // Split the bus's cables by the direction of the endpoint that touches the
  // bus: a cable's SOURCE block is sending INTO the bus, its TARGET block is
  // receiving FROM the bus.
  const sendEndpoints = bus.endpoints.filter((e) => e.direction === "source");
  const recvEndpoints = bus.endpoints.filter((e) => e.direction === "target");
  const sendCableIds = bus.cableIds;
  const recvCableIds = bus.cableIds;

  const sendNames = sendEndpoints.map(
    (e) => blockNames.get(e.blockId) ?? "?",
  );
  const recvNames = recvEndpoints.map(
    (e) => blockNames.get(e.blockId) ?? "?",
  );

  // Channel topology: widest cable on this bus determines the meter layout.
  const channelCount = useMemo(
    () => dominantChannelCount(bus.cableIds, cables),
    [bus.cableIds, cables],
  );

  // Sidechain DISPLAY — real: any feed on the bus flagged as a sidechain.
  const hasSidechain = bus.cableIds.some(
    (id) => cables.find((c) => c.id === id)?.isSidechain,
  );

  // The "open the bus" target = the first DESTINATION block the bus feeds.
  const destEndpoint = recvEndpoints[0];
  const destName = destEndpoint
    ? (blockNames.get(destEndpoint.blockId) ?? destEndpoint.blockId)
    : undefined;

  // Channel topology badge (shown in the header alongside signal type).
  const topoText =
    bus.signalType !== "midi"
      ? channelCount === 1
        ? "Mono"
        : channelCount === 2
          ? "Stereo"
          : "5.1"
      : null;

  return (
    <div
      className="rounded-md bg-surface p-2.5 space-y-2 t-precision shadow-[-1px_-1px_4px_rgba(255,255,255,0.03),1px_1px_5px_rgba(0,0,0,0.32)] hover:shadow-[0_0_0_1px_var(--bus-accent),-1px_-1px_4px_rgba(255,255,255,0.04),1px_1px_6px_rgba(0,0,0,0.4)]"
      style={{ ["--bus-accent" as string]: `hsl(${sigAccent[bus.signalType]} / 0.5)` }}
    >
      {/* Header: signal glyph + name + topology pill + signal pill + sidechain badge */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
          title="Select this bus's cable on the canvas"
        >
          <span style={{ color: accent, display: "inline-flex" }} className="shrink-0">
            <Icon name={SIGNAL_ICON[bus.signalType]} size={13} strokeWidth={2} aria-hidden />
          </span>
          <span
            className="text-[11px] font-bold uppercase tracking-tight truncate"
            style={{ color: accent }}
          >
            {bus.name}
          </span>
        </button>

        {/* Topology pill — channel count for audio/value buses */}
        {topoText && (
          <span
            className="text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded leading-none shrink-0"
            style={{
              background: "hsl(240 12% 12%)",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            {topoText}
          </span>
        )}

        <span className="text-[8px] font-bold uppercase tracking-wider text-text-dim shrink-0">
          {sigLabel[bus.signalType]}
        </span>

        {hasSidechain && (
          <span
            className="text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded leading-none shrink-0"
            style={{
              background: "hsl(var(--cat-audiofx) / 0.18)",
              color: "hsl(var(--cat-audiofx))",
            }}
            title="A sidechain feed routes through this bus"
          >
            SIDECHAIN
          </span>
        )}
        <button
          type="button"
          onClick={onDissolve}
          title="Remove this bus (return its cables to wired)"
          className="text-[11px] text-text-dim hover:text-error transition-colors cursor-pointer shrink-0"
          aria-label={`Remove bus ${bus.name}`}
        >
          ✕
        </button>
      </div>

      {/* SEPARATE Send + Receive activity meters — topology-aware. */}
      <div className="space-y-2.5">
        <FlowMeter
          dir="send"
          cableIds={sendCableIds}
          sourceBlockIds={sendEndpoints.map((e) => e.blockId)}
          signalType={bus.signalType}
          accent={accent}
          endpointNames={sendNames}
          channelCount={channelCount}
          isSidechain={hasSidechain}
        />
        <div
          style={{
            height: 1,
            background: "hsl(240 12% 14%)",
            margin: "0 -2px",
          }}
        />
        <FlowMeter
          dir="receive"
          cableIds={recvCableIds}
          sourceBlockIds={[]}
          signalType={bus.signalType}
          accent={accent}
          endpointNames={recvNames}
          channelCount={channelCount}
          isSidechain={hasSidechain}
        />
      </div>

      {/* Open the bus's destination block. */}
      {destEndpoint && onOpenBlock && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[9px] text-text-dim truncate flex-1">
            {bus.cableIds.length} cable{bus.cableIds.length === 1 ? "" : "s"}
            {destName ? ` → ${destName}` : ""}
          </span>
          <button
            type="button"
            onClick={() => onOpenBlock(destEndpoint.blockId)}
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-pressed text-text-secondary t-precision cursor-pointer shadow-[inset_1px_1px_3px_rgba(0,0,0,0.5),inset_-1px_-1px_2px_rgba(255,255,255,0.04)] hover:text-text-primary hover:shadow-[0_0_0_1px_var(--bus-accent),inset_1px_1px_3px_rgba(0,0,0,0.5)]"
            title={`Open ${destName ?? "destination"} — work on the bus's effects`}
          >
            Open editor
          </button>
        </div>
      )}
    </div>
  );
}
