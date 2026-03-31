import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BlockData } from "../../data/types";

// ── Category config ──

const catConfig: Record<
  string,
  { hex: string; bg: string; shape: string; glowShadow: string }
> = {
  generator: {
    hex: "#4A90D9",
    bg: "bg-[#4A90D9]",
    shape: "w-1.5 h-1.5 rounded-full bg-[#4A90D9]",
    glowShadow: "0 0 6px rgba(74,144,217,0.4)",
  },
  modifier: {
    hex: "#E8A838",
    bg: "bg-[#E8A838]",
    shape: "w-1.5 h-1.5 rotate-45 bg-[#E8A838]",
    glowShadow: "0 0 6px rgba(232,168,56,0.4)",
  },
  logic: {
    hex: "#2BC4C4",
    bg: "bg-[#2BC4C4]",
    shape: "w-1.5 h-1.5 bg-[#2BC4C4]",
    glowShadow: "0 0 6px rgba(43,196,196,0.4)",
  },
};

// ── Port colour / shape ──

const portStyle: Record<
  string,
  { hex: string; radius: string; rotate: boolean }
> = {
  audio: { hex: "#4A90D9", radius: "50%", rotate: false },
  midi: { hex: "#2BC4C4", radius: "50%", rotate: true },
  value: { hex: "#E8A838", radius: "2px", rotate: false },
};

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
    <div className="h-6 bg-[#1A1A1E] rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] flex items-center justify-around px-1">
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

// ── Bypass stripe overlay ──

const bypassOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.15) 6px)",
  pointerEvents: "none",
  borderRadius: "inherit",
};

// ── Block component ──

function BlockComponent({ data, selected }: NodeProps) {
  const d = data as unknown as BlockData;
  const cat = catConfig[d.category] ?? catConfig.generator;
  const isContainer = d.containerNodeCount != null;
  const isPortal = d.isPortal ?? false;

  const inputPorts = d.ports.filter((p) => p.direction === "input");
  const outputPorts = d.ports.filter((p) => p.direction === "output");

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
        {inputPorts.map((port, i) => {
          const ps = portStyle[port.type] ?? portStyle.audio;
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="target"
              position={Position.Left}
              style={{
                top: `${40 + i * 20}%`,
                width: 12,
                height: 12,
                background: port.connected ? ps.hex : "#1A1A1E",
                border: `2px solid ${ps.hex}`,
                borderRadius: ps.radius,
                transform: ps.rotate
                  ? "translateX(-50%) rotate(45deg)"
                  : "translateX(-50%)",
              }}
            />
          );
        })}
        {outputPorts.map((port, i) => {
          const ps = portStyle[port.type] ?? portStyle.audio;
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="source"
              position={Position.Right}
              style={{
                top: `${40 + i * 20}%`,
                width: 12,
                height: 12,
                background: port.connected ? ps.hex : "#1A1A1E",
                border: `2px solid ${ps.hex}`,
                borderRadius: ps.radius,
                transform: ps.rotate
                  ? "translateX(50%) rotate(45deg)"
                  : "translateX(50%)",
              }}
            />
          );
        })}
      </div>
    );
  }

  // ── Container: inset background, child slots ──
  if (isContainer) {
    return (
      <div
        style={{ contain: "content" }}
        className="w-[280px] bg-[#1A1A1E] shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 rounded-xl p-3"
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
                className="h-14 rounded bg-[#252529] shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] opacity-40 border border-dashed border-white/10 flex items-center justify-center text-[10px] text-text-secondary"
              >
                NODE_{String.fromCharCode(65 + i)}
              </div>
            ),
          )}
        </div>

        {/* Ports */}
        {inputPorts.map((port, i) => {
          const ps = portStyle[port.type] ?? portStyle.audio;
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="target"
              position={Position.Left}
              style={{
                top: `${35 + i * 20}%`,
                width: 12,
                height: 12,
                background: port.connected ? ps.hex : "#1A1A1E",
                border: `2px solid ${ps.hex}`,
                borderRadius: ps.radius,
                transform: ps.rotate
                  ? "translateX(-50%) rotate(45deg)"
                  : "translateX(-50%)",
              }}
            />
          );
        })}
        {outputPorts.map((port, i) => {
          const ps = portStyle[port.type] ?? portStyle.audio;
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="source"
              position={Position.Right}
              style={{
                top: `${35 + i * 20}%`,
                width: 12,
                height: 12,
                background: port.connected ? ps.hex : "#1A1A1E",
                border: `2px solid ${ps.hex}`,
                borderRadius: ps.radius,
                transform: ps.rotate
                  ? "translateX(50%) rotate(45deg)"
                  : "translateX(50%)",
              }}
            />
          );
        })}
      </div>
    );
  }

  // ── Standard block ──

  const selectedShadow = selected
    ? "-2px -2px 8px rgba(255,255,255,0.08), 2px 2px 8px rgba(0,0,0,0.5)"
    : "-2px -2px 8px rgba(255,255,255,0.04), 2px 2px 8px rgba(0,0,0,0.35)";

  return (
    <div
      style={{
        contain: "content",
        boxShadow: selectedShadow,
      }}
      className={[
        "w-48 bg-[#252529] rounded-lg overflow-visible flex flex-col relative",
        "outline outline-1",
        selected ? "outline-white/10" : "outline-[rgba(139,145,156,0.15)]",
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

      {/* Top colour stripe */}
      <div className={`h-1 ${cat.bg} rounded-t-lg`} />

      {/* Header — 24px, semantic bg */}
      <div
        className="px-2 py-1 bg-[#2A2A2E] flex items-center justify-between"
        style={{ opacity: d.bypassed ? 0.6 : 1 }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={cat.shape} />
          <span className="text-[10px] font-bold text-white/90 truncate">
            {d.name}
          </span>
        </div>
        <span
          className="text-[10px] font-bold shrink-0"
          style={{ color: `${cat.hex}CC` }}
        >
          {d.format}
        </span>
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
          <div className="text-[10px] text-white/30 tracking-widest text-center uppercase">
            Signal Processing
          </div>
        )}

        {d.category === "logic" && (
          <div className="text-[10px] text-white/30 tracking-widest text-center uppercase">
            Routing
          </div>
        )}

        {/* Latency readout */}
        {d.latencyMs > 0 && (
          <div className="flex justify-between items-center text-[10px] text-text-secondary">
            <span>LATENCY</span>
            <span className="tabular" style={{ color: cat.hex }}>
              {d.latencyMs}ms
            </span>
          </div>
        )}

        {/* CPU readout — tiny, bottom-right */}
        {d.cpuLoad > 0 && (
          <div className="text-right">
            <span className="text-[10px] tabular text-text-dim">
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

      {/* ── Input handles (left side) ── */}
      {inputPorts.map((port, i) => {
        const ps = portStyle[port.type] ?? portStyle.audio;
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="target"
            position={Position.Left}
            style={{
              top: `${30 + ((i + 1) / (inputPorts.length + 1)) * 60}%`,
              width: 12,
              height: 12,
              background: port.connected ? ps.hex : "#1A1A1E",
              border: `2px solid ${port.connected ? ps.hex : "rgba(255,255,255,0.2)"}`,
              borderRadius: ps.radius,
              boxShadow: port.connected
                ? catConfig[d.category]?.glowShadow
                : "none",
              transform: ps.rotate
                ? "translateX(-50%) rotate(45deg)"
                : "translateX(-50%)",
            }}
          />
        );
      })}

      {/* ── Output handles (right side) ── */}
      {outputPorts.map((port, i) => {
        const ps = portStyle[port.type] ?? portStyle.audio;
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            position={Position.Right}
            style={{
              top: `${30 + ((i + 1) / (outputPorts.length + 1)) * 60}%`,
              width: 12,
              height: 12,
              background: port.connected ? ps.hex : "#1A1A1E",
              border: `2px solid ${ps.hex}`,
              borderRadius: ps.radius,
              boxShadow: port.connected
                ? catConfig[d.category]?.glowShadow
                : "none",
              transform: ps.rotate
                ? "translateX(50%) rotate(45deg)"
                : "translateX(50%)",
            }}
          />
        );
      })}
    </div>
  );
}

export const Block = memo(BlockComponent);
