import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BlockData, CableData } from "../../data/types";
import {
  useGraphStore,
  selectZoomTier,
  selectEdges,
} from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";
import { BlockEmbed } from "./BlockEmbed";

// ── Category config ──

const catConfig: Record<
  string,
  { hex: string; bg: string; shape: string; glowClass: string }
> = {
  generator: {
    hex: "#4A90D9",
    bg: "bg-[#4A90D9]",
    shape: "w-1.5 h-1.5 rounded-full bg-[#4A90D9]",
    glowClass: "glow-blue",
  },
  modifier: {
    hex: "#E8A838",
    bg: "bg-[#E8A838]",
    shape: "w-1.5 h-1.5 rotate-45 bg-[#E8A838]",
    glowClass: "glow-orange",
  },
  logic: {
    hex: "#2BC4C4",
    bg: "bg-[#2BC4C4]",
    shape: "w-1.5 h-1.5 bg-[#2BC4C4]",
    glowClass: "glow-teal",
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
}

function PortHandle({
  portId,
  portType,
  connected,
  handleType,
  position,
  topPercent,
  busName,
}: PortHandleProps) {
  const [hovered, setHovered] = useState(false);

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
      ) : null}
    </Handle>
  );
}

// ── Mini waveform (generator viz) ──

function MiniWaveform({ color }: { color: string }) {
  const bars = [
    { h: 8, o: 0.4 },
    { h: 12, o: 0.6 },
    { h: 16, o: 1 },
    { h: 12, o: 0.6 },
    { h: 8, o: 0.4 },
  ];
  return (
    <div className="h-6 bg-pressed neu-inset rounded flex items-center justify-around px-1">
      {bars.map((b, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full"
          style={{
            height: b.h,
            backgroundColor: color,
            opacity: b.o,
          }}
        />
      ))}
    </div>
  );
}

// ── Neumorphic shadow constants ──

const shadowRaised =
  "4px 4px 12px rgba(0,0,0,0.4), -2px -2px 8px rgba(255,255,255,0.05)";
const shadowPressed =
  "inset 2px 2px 6px rgba(0,0,0,0.4), inset -1px -1px 4px rgba(255,255,255,0.05)";
// ── Bypass stripe overlay ──

const bypassOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.15) 6px)",
  pointerEvents: "none",
  borderRadius: "inherit",
};

const muteOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0,0,0,0.38)",
  pointerEvents: "none",
  borderRadius: "inherit",
};

/** JUCE `Colour::toString()` is often `#AARRGGBB`; CSS border wants opaque RGB. */
function hostColourOutline(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (t.startsWith("#") && t.length === 9) return `#${t.slice(3)}`;
  if (t.startsWith("#") && t.length === 7) return t;
  return undefined;
}

// ── Block component ──

function BlockComponent({ data, selected }: NodeProps) {
  const d = data as unknown as BlockData;
  const cat = catConfig[d.category] ?? catConfig.generator;
  const isContainer = d.containerNodeCount != null;
  const isPortal = d.isPortal ?? false;
  const zoomTier = useGraphStore(selectZoomTier);

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

  return (
    <div
      style={{
        contain: "content",
        boxShadow: shadowRaised,
        ...(hostOutline ? { borderColor: hostOutline } : {}),
      }}
      className={[
        "w-48 bg-[#252529] rounded-lg overflow-visible flex flex-col relative transition-shadow duration-150",
        selected && cat.glowClass,
        d.error && "animate-pulse",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Error pulsing border */}
      {d.error && (
        <div className="absolute inset-0 rounded-lg ring-1 ring-error/60 pointer-events-none" />
      )}

      {/* Bypass stripe overlay */}
      {d.bypassed && <div style={bypassOverlay} />}

      {d.muted && <div style={muteOverlay} />}

      {/* Top colour stripe */}
      <div className={`h-1 ${cat.bg} rounded-t-lg`} />

      {/* Header — 24px, semantic bg */}
      <div
        className="px-2 py-1 bg-[#2A2A2E] flex items-center justify-between h-6"
        style={{ opacity: d.bypassed ? 0.6 : 1 }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={cat.shape} />
          <span className="text-[11px] font-bold text-white/90 truncate uppercase tracking-tight">
            {d.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {d.muteInput ? (
            <span className="text-[8px] font-black text-modifier uppercase px-1 rounded bg-modifier/15">
              M in
            </span>
          ) : null}
          <span
            className="text-[10px] font-bold tabular-nums"
            style={{ color: `${cat.hex}CC` }}
          >
            {d.format}
          </span>
        </div>
      </div>

      {/* Body — tight 8px padding, UE5-like density */}
      {/* Hidden by .perform-mode .block-body { display:none } */}
      <div
        className="block-body p-2 space-y-1.5"
        style={{ opacity: d.bypassed ? 0.6 : 1 }}
      >
        {/* Category-specific viz */}
        {d.category === "generator" && <MiniWaveform color={cat.hex} />}

        {d.category === "modifier" && (
          <div className="text-[9px] text-white/30 tracking-widest text-center uppercase font-medium">
            Signal Processing
          </div>
        )}

        {d.category === "logic" && (
          <div className="text-[9px] text-white/30 tracking-widest text-center uppercase font-medium">
            Routing
          </div>
        )}

        {/* Latency readout */}
        {d.latencyMs > 0 && (
          <div className="flex justify-between items-center text-[10px] text-text-secondary font-medium uppercase tracking-tighter">
            <span>LATENCY</span>
            <span className="tabular-nums" style={{ color: cat.hex }}>
              {d.latencyMs}ms
            </span>
          </div>
        )}

        {/* CPU readout — tiny, bottom-right */}
        {d.cpuLoad > 0 && (
          <div className="text-right">
            <span className="text-[10px] tabular-nums text-text-dim font-medium">
              {d.cpuLoad.toFixed(1)}ms
            </span>
          </div>
        )}
      </div>

      {/* Macro strip — only visible in .perform-mode via CSS */}
      {/* .perform-mode .block-macro-strip { display:flex } */}
      {d.isMacroTagged && (
        <div className="block-macro-strip hidden items-center justify-center gap-1 px-2 py-1.5">
          <div
            className="w-3 h-3 rounded-full border"
            style={{ borderColor: cat.hex, boxShadow: `0 0 4px ${cat.hex}40` }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: cat.hex }}
          >
            Macro
          </span>
        </div>
      )}

      {/* ── Expanded embed (semantic zoom) ── */}
      {zoomTier === "expanded" && (
        <BlockEmbed nodeId={d.id} category={d.category} />
      )}

      {/* ── Input handles (left side) ── */}
      {inputPorts.map((port, i) => (
        <PortHandle
          key={port.id}
          portId={port.id}
          portType={port.type}
          connected={port.connected}
          handleType="target"
          position={Position.Left}
          topPercent={30 + ((i + 1) / (inputPorts.length + 1)) * 60}
          busName={portBusMap.get(port.id)}
        />
      ))}

      {/* ── Output handles (right side) ── */}
      {outputPorts.map((port, i) => (
        <PortHandle
          key={port.id}
          portId={port.id}
          portType={port.type}
          connected={port.connected}
          handleType="source"
          position={Position.Right}
          topPercent={30 + ((i + 1) / (outputPorts.length + 1)) * 60}
          busName={portBusMap.get(port.id)}
        />
      ))}
    </div>
  );
}

export const Block = memo(BlockComponent);
