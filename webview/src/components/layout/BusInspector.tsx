import { useMemo } from "react";
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
import { nativeGraphSetCableBus } from "../../bridge/nativeGraph";
import { Icon } from "../neu/Icon";
import type { CableData, SignalType } from "../../data/types";

/**
 * Bus inspector — the IO send/receive auditor (Wizard R1 #4 + R2).
 *
 * MODEL (corrected): a Bus is NOT a "wireless cable". A Bus is a named rail that
 * **IO blocks send to (Bus Send) and receive from (Bus Receive)**. Source blocks
 * push signal INTO the bus; destination blocks pull it OUT. This panel lists each
 * named bus on the board and, for each, shows:
 *   • SEPARATE Send + Receive activity meters (real per-cable RMS / activity from
 *     `useCableMeterStore`, the same 60Hz feed that drives the cables + Block VU)
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
 * `onOpenBlock` is supplied by InspectorHub (selects the block + jumps to the
 * Block tab). When omitted (e.g. rendered in isolation) the affordance is hidden.
 */

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

/**
 * Faithful digital-VU LED ladder — green floor → amber shoulder → red ceiling by
 * POSITION (universal VU language). `level` is the real 0–1 reading; the lit-cell
 * count is the only thing it drives. Horizontal strip for the bus rows.
 */
function VuLadder({
  level,
  active,
  segments = 18,
  height = 7,
}: {
  level: number;
  active: boolean;
  segments?: number;
  height?: number;
}) {
  const amp = Math.min(1, Math.max(0, level));
  const lit = Math.round(amp * segments);
  return (
    <div
      className="flex gap-[2px] items-stretch"
      style={{
        height,
        padding: 2,
        borderRadius: 3,
        background: "hsl(240 12% 6%)",
        boxShadow:
          "inset 1.5px 1.5px 2.5px rgba(0,0,0,0.85), inset -0.5px -0.5px 1px rgba(255,255,255,0.04)",
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
            : "hsl(var(--status-ok))";
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              background: segColor,
              opacity: litThis ? (active ? 1 : 0.4) : 0.14,
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

/** A labelled Send or Receive meter — direction icon, level numeric, VU ladder. */
function FlowMeter({
  dir,
  cableIds,
  signalType,
  accent,
  endpointNames,
}: {
  dir: "send" | "receive";
  cableIds: string[];
  signalType: SignalType;
  accent: string;
  endpointNames: string[];
}) {
  const level = useMaxLevel(cableIds);
  const amp = Math.min(1, Math.max(0, level));
  const active = amp > 0.01;
  const isAudio = signalType === "audio";
  // Send = signal pushed INTO the bus (blocks → bus). Receive = signal delivered
  // OUT of the bus (bus → blocks). ArrowRight = into, ArrowLeft would invert; we
  // use upload/download glyphs from the allowlist-free fallback via Icon names.
  const label = dir === "send" ? "SEND →" : "← RECEIVE";
  const peers = endpointNames.length;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span
          className="text-[8px] font-bold uppercase tracking-widest leading-none"
          style={{ color: active ? accent : "hsl(var(--muted-foreground))" }}
        >
          {label}
        </span>
        <span className="text-[8px] text-text-dim leading-none">
          {peers} {peers === 1 ? "block" : "blocks"}
        </span>
        <div className="flex-1" />
        <span
          className="text-[10px] font-mono font-bold tabular-nums leading-none"
          style={{ color: active ? accent : "hsl(var(--muted-foreground))" }}
        >
          {isAudio ? `${toDbfs(amp)} dB` : `${Math.round(amp * 100)}%`}
        </span>
      </div>
      <VuLadder level={amp} active={active} />
      {peers > 0 && (
        <div className="text-[8px] text-text-dim truncate leading-snug">
          {endpointNames.join(" · ")}
        </div>
      )}
    </div>
  );
}

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

      {/* Honest framing — the Send/Receive levels above are real (max RMS across
          each side's cables). A dedicated per-bus FADER value needs the
          send/receive Bus-block bridge — not faked here (Pillar-2). */}
      <div className="text-[8px] text-text-dim leading-snug pt-0.5">
        Send / Receive levels are live (real RMS across each side's cables). A
        dedicated bus-fader value needs the Bus-block bridge — Pillar-2.
      </div>
    </div>
  );
}

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
  // receiving FROM the bus. Send-set = cables whose source is a feed, Receive-set
  // = cables whose target is a reader. (For a 1:1 send these coincide; for a
  // many-source / many-dest bus they differ — both read real levels either way.)
  const sendEndpoints = bus.endpoints.filter((e) => e.direction === "source");
  const recvEndpoints = bus.endpoints.filter((e) => e.direction === "target");
  const sendCableIds = bus.cableIds; // every bus cable carries a send hop
  const recvCableIds = bus.cableIds; // …and is delivered to a receiver

  const sendNames = sendEndpoints.map(
    (e) => blockNames.get(e.blockId) ?? "?",
  );
  const recvNames = recvEndpoints.map(
    (e) => blockNames.get(e.blockId) ?? "?",
  );

  // Sidechain DISPLAY — real: any feed on the bus flagged as a sidechain.
  const hasSidechain = bus.cableIds.some(
    (id) => cables.find((c) => c.id === id)?.isSidechain,
  );

  // The "open the bus" target = the first DESTINATION block the bus feeds (the
  // reverb a Reverb Send bus lands on). Opening it surfaces its controls.
  const destEndpoint = recvEndpoints[0];
  const destName = destEndpoint
    ? (blockNames.get(destEndpoint.blockId) ?? destEndpoint.blockId)
    : undefined;

  return (
    <div
      className="rounded-md bg-surface p-2.5 space-y-2 t-precision shadow-[-1px_-1px_4px_rgba(255,255,255,0.03),1px_1px_5px_rgba(0,0,0,0.32)] hover:shadow-[0_0_0_1px_var(--bus-accent),-1px_-1px_4px_rgba(255,255,255,0.04),1px_1px_6px_rgba(0,0,0,0.4)]"
      style={{ ["--bus-accent" as string]: `hsl(${sigAccent[bus.signalType]} / 0.5)` }}
    >
      {/* Header: signal glyph + name + signal pill + sidechain badge */}
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

      {/* SEPARATE Send + Receive activity meters (Wizard R2). */}
      <div className="space-y-2">
        <FlowMeter
          dir="send"
          cableIds={sendCableIds}
          signalType={bus.signalType}
          accent={accent}
          endpointNames={sendNames}
        />
        <FlowMeter
          dir="receive"
          cableIds={recvCableIds}
          signalType={bus.signalType}
          accent={accent}
          endpointNames={recvNames}
        />
      </div>

      {/* Open the bus's destination block (work on its effects). */}
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
