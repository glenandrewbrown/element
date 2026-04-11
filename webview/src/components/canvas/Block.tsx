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

// ── Rich visualizations for specific plugin types ──

// Mini waveform visualization
function MiniWaveform({ color }: { color: string }) {
  return (
    <div className="h-10 bg-[#131317] rounded border border-white/5 p-1.5 relative overflow-hidden">
      <svg className="w-full h-full" viewBox="0 0 100 24" preserveAspectRatio="none">
        <path 
          d="M0,12 Q10,4 20,12 T40,12 T60,12 T80,12 T100,12" 
          fill="none" 
          stroke={color} 
          strokeWidth="1.5"
          opacity="0.8"
        />
      </svg>
    </div>
  );
}

// Oscillator knob with wavetable position
function OscillatorViz({ color, name }: { color: string; name: string }) {
  return (
    <div className="flex items-center gap-2 p-1.5">
      <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center relative" style={{ borderColor: `${color}50` }}>
        <div className="w-0.5 h-4 rounded-full absolute top-1 origin-bottom rotate-[45deg]" style={{ backgroundColor: color }} />
      </div>
      <div className="flex-1 space-y-1">
        <div className="h-8 bg-[#131317] rounded overflow-hidden border border-white/5">
          <svg className="w-full h-full" viewBox="0 0 60 24">
            <path d="M0,12 Q8,2 15,12 T30,12 T45,12 T60,12" fill="none" stroke={color} strokeWidth="1" opacity="0.7" />
          </svg>
        </div>
        <div className="flex justify-between text-[8px]">
          <span className="text-text-dim">WT POS</span>
          <span style={{ color }} className="tabular">128</span>
        </div>
      </div>
    </div>
  );
}

// EQ curve visualization
function EQCurveViz({ color }: { color: string }) {
  return (
    <div className="h-16 bg-[#131317] rounded border border-white/5 p-1 relative">
      <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
        <path 
          d="M0,35 L15,35 Q25,35 35,8 T55,22 T75,35 L100,35" 
          fill="none" 
          stroke={color} 
          strokeWidth="1.5"
          opacity="0.7"
        />
        {/* Band markers */}
        <circle cx="35" cy="10" r="2.5" fill={color} />
        <circle cx="55" cy="20" r="2" fill={color} opacity="0.5" />
      </svg>
      <div className="absolute bottom-1 right-2 flex gap-2 text-[7px]" style={{ color }}>
        <span className="tabular">2.4kHz</span>
        <span className="tabular">-4.2dB</span>
      </div>
    </div>
  );
}

// Compressor gain reduction meter
function CompressorViz({ color }: { color: string }) {
  return (
    <div className="space-y-1.5 p-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-4 bg-[#131317] rounded border border-white/5 flex overflow-hidden">
          <div className="w-1/3 h-full" style={{ backgroundColor: `${color}40` }} />
          <div className="w-1/4 h-full" style={{ backgroundColor: `${color}80` }} />
          <div className="w-1/6 h-full" style={{ backgroundColor: color }} />
        </div>
        <span className="text-[8px] text-text-dim">-6dB</span>
      </div>
      <div className="flex justify-between text-[8px] text-text-dim">
        <span>RATIO: 4:1</span>
        <span className="tabular" style={{ color }}>GR</span>
      </div>
    </div>
  );
}

// MIDI Router channel mapping
function MIDIRouterViz({ color }: { color: string }) {
  return (
    <div className="space-y-1 p-1.5">
      {[{ from: "CH 1", to: "BUS A" }, { from: "CH 2", to: "BUS B" }].map((route, i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1 bg-[#131317] rounded border border-white/5 text-[8px]">
          <span className="text-text-dim">{route.from}</span>
          <svg width="12" height="8" viewBox="0 0 12 8">
            <path d="M0,4 L8,4 M6,1 L9,4 L6,7" fill="none" stroke={color} strokeWidth="1.5" />
          </svg>
          <span className="text-text-dim">{route.to}</span>
        </div>
      ))}
    </div>
  );
}

// MIDI Filter note range
function MIDIFilterViz({ color }: { color: string }) {
  return (
    <div className="p-1.5 space-y-1">
      <div className="flex items-center justify-between text-[8px]">
        <span className="text-text-dim">NOTE RANGE</span>
        <span style={{ color }} className="tabular">C2 - C5</span>
      </div>
      <div className="h-3 bg-[#131317] rounded-full border border-white/5 relative overflow-hidden">
        <div className="absolute left-[20%] right-[30%] h-full rounded-full" style={{ backgroundColor: `${color}60` }} />
      </div>
      <div className="flex items-center justify-between text-[8px]">
        <span className="text-text-dim">VELOCITY</span>
        <span style={{ color }} className="tabular">1 - 127</span>
      </div>
    </div>
  );
}

// MIDI Transpose display
function MIDITransposeViz({ color }: { color: string }) {
  return (
    <div className="p-2 flex items-center justify-center gap-3">
      <div className="text-center">
        <div className="text-2xl font-black tabular" style={{ color }}>+12</div>
        <div className="text-[8px] text-text-dim uppercase">SEMITONES</div>
      </div>
      <div className="h-8 w-px bg-white/10" />
      <div className="text-center">
        <div className="text-lg font-bold tabular text-text-secondary">+1</div>
        <div className="text-[8px] text-text-dim uppercase">OCTAVE</div>
      </div>
    </div>
  );
}

// Arpeggiator pattern
function ArpeggiatorViz({ color }: { color: string }) {
  const steps = [1, 3, 2, 4, 3, 5, 4, 6];
  return (
    <div className="p-1.5 space-y-1">
      <div className="h-10 bg-[#131317] rounded border border-white/5 flex items-end justify-around px-1 pb-1">
        {steps.map((h, i) => (
          <div key={i} className="w-2 rounded-t" style={{ height: h * 5, backgroundColor: i === 2 ? color : `${color}50` }} />
        ))}
      </div>
      <div className="flex justify-between text-[8px]">
        <span className="text-text-dim">UP-DOWN</span>
        <span style={{ color }} className="tabular">1/16</span>
      </div>
    </div>
  );
}

// Logical Editor rules
function LogicalEditorViz({ color }: { color: string }) {
  return (
    <div className="p-1.5 space-y-1">
      <div className="px-2 py-1 bg-[#131317] rounded border border-white/5 text-[8px] flex items-center gap-2">
        <span className="text-text-dim">IF</span>
        <span style={{ color }}>Velocity {"<"} 64</span>
      </div>
      <div className="px-2 py-1 bg-[#131317] rounded border border-white/5 text-[8px] flex items-center gap-2">
        <span className="text-text-dim">THEN</span>
        <span style={{ color }}>Delete Note</span>
      </div>
    </div>
  );
}

// Input gain slider
function InputGainViz({ color }: { color: string }) {
  return (
    <div className="p-1.5 space-y-1.5">
      <div className="flex justify-between items-center text-[9px]">
        <span className="text-text-dim uppercase">Input Gain</span>
        <span style={{ color }} className="tabular">+3.5 dB</span>
      </div>
      <div className="h-1.5 bg-[#131317] rounded-full border border-white/5 overflow-hidden">
        <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }} />
      </div>
    </div>
  );
}

// LFO waveform
function LFOViz({ color }: { color: string }) {
  return (
    <div className="p-1.5 space-y-1">
      <div className="h-8 bg-[#131317] rounded border border-white/5 overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 60 20">
          <path d="M0,10 Q7.5,0 15,10 T30,10 T45,10 T60,10" fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      </div>
      <div className="flex justify-between text-[8px]">
        <span className="text-text-dim">SINE</span>
        <span style={{ color }} className="tabular">2.0 Hz</span>
      </div>
    </div>
  );
}

// Reverb decay visualization  
function ReverbViz({ color }: { color: string }) {
  return (
    <div className="p-1.5 space-y-1">
      <div className="h-8 bg-[#131317] rounded border border-white/5 overflow-hidden relative">
        <svg className="w-full h-full" viewBox="0 0 60 20">
          <path d="M0,18 Q5,2 15,10 Q25,16 35,14 Q45,12 55,17 L60,18" fill={`${color}20`} stroke={color} strokeWidth="1" />
        </svg>
      </div>
      <div className="flex justify-between text-[8px]">
        <span className="text-text-dim">DECAY</span>
        <span style={{ color }} className="tabular">2.4s</span>
      </div>
    </div>
  );
}

// Delay time visualization
function DelayViz({ color }: { color: string }) {
  return (
    <div className="p-1.5 space-y-1.5">
      <div className="flex gap-1 h-6 items-end">
        {[1, 0.7, 0.5, 0.3, 0.15].map((h, i) => (
          <div key={i} className="flex-1 rounded-t" style={{ height: `${h * 100}%`, backgroundColor: color, opacity: 1 - i * 0.15 }} />
        ))}
      </div>
      <div className="flex justify-between text-[8px]">
        <span className="text-text-dim">1/8 SYNC</span>
        <span style={{ color }} className="tabular">45% FB</span>
      </div>
    </div>
  );
}

// Select visualization based on plugin name
function getBlockVisualization(name: string, category: string, color: string) {
  const lowerName = name.toLowerCase();
  
  // MIDI/Logic category
  if (category === "logic") {
    if (lowerName.includes("router") || lowerName.includes("route")) return <MIDIRouterViz color={color} />;
    if (lowerName.includes("filter") && lowerName.includes("midi")) return <MIDIFilterViz color={color} />;
    if (lowerName.includes("transpose")) return <MIDITransposeViz color={color} />;
    if (lowerName.includes("arp")) return <ArpeggiatorViz color={color} />;
    if (lowerName.includes("logical") || lowerName.includes("editor")) return <LogicalEditorViz color={color} />;
    if (lowerName.includes("lfo")) return <LFOViz color={color} />;
    return <MIDIRouterViz color={color} />;
  }
  
  // Generator category
  if (category === "generator") {
    if (lowerName.includes("osc") || lowerName.includes("serum") || lowerName.includes("vital")) return <OscillatorViz color={color} name={name} />;
    if (lowerName.includes("input") || lowerName.includes("audio in")) return <InputGainViz color={color} />;
    return <MiniWaveform color={color} />;
  }
  
  // Modifier category
  if (lowerName.includes("eq") || lowerName.includes("pro-q") || lowerName.includes("proq")) return <EQCurveViz color={color} />;
  if (lowerName.includes("comp") || lowerName.includes("1176") || lowerName.includes("limiter")) return <CompressorViz color={color} />;
  if (lowerName.includes("reverb") || lowerName.includes("valhalla") || lowerName.includes("room")) return <ReverbViz color={color} />;
  if (lowerName.includes("delay") || lowerName.includes("h-delay")) return <DelayViz color={color} />;
  if (lowerName.includes("filter") && !lowerName.includes("midi")) return <EQCurveViz color={color} />;
  
  return null;
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

  const hostOutline = hostColourOutline(d.hostColor);

  return (
    <div
      style={{
        contain: "content",
        boxShadow: selectedShadow,
        ...(hostOutline
          ? {
              outlineWidth: 2,
              outlineColor: hostOutline,
              outlineStyle: "solid",
            }
          : {}),
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
      {/* Processing load state glow */}
      {d.cpuLoad > 50 && !d.error && (
        <div 
          className="absolute inset-0 rounded-lg pointer-events-none animate-pulse"
          style={{ boxShadow: "0 0 8px rgba(239,68,68,0.5), inset 0 0 4px rgba(239,68,68,0.2)" }}
        />
      )}
      {d.cpuLoad > 25 && d.cpuLoad <= 50 && !d.error && (
        <div 
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{ boxShadow: "0 0 6px rgba(232,168,56,0.4)" }}
        />
      )}
      {d.cpuLoad > 0 && d.cpuLoad <= 25 && !d.error && !d.bypassed && (
        <div 
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{ boxShadow: "0 0 4px rgba(43,196,196,0.25)" }}
        />
      )}

      {/* Error pulsing border */}
      {d.error && (
        <div className="absolute inset-0 rounded-lg ring-2 ring-error/60 pointer-events-none animate-pulse" />
      )}

      {/* Bypass stripe overlay */}
      {d.bypassed && <div style={bypassOverlay} />}

      {d.muted && <div style={muteOverlay} />}

      {/* Top colour stripe */}
      <div className={`h-1 ${cat.bg} rounded-t-lg`} />

      {/* Header — 24px, semantic bg + CPU meter */}
      <div
        className="px-2 py-1 bg-[#2A2A2E] flex items-center justify-between"
        style={{ opacity: d.bypassed ? 0.6 : 1 }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Bypass indicator dot */}
          {d.bypassed && (
            <div className="w-1.5 h-1.5 rounded-full bg-generator shrink-0" title="Bypassed" />
          )}
          {d.muted && !d.bypassed && (
            <div className="w-1.5 h-1.5 rounded-full bg-error shrink-0" title="Muted" />
          )}
          <div className={cat.shape} />
          <span className="text-[10px] font-bold text-white/90 truncate">
            {d.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {d.muteInput ? (
            <span className="text-[8px] font-black text-modifier uppercase px-1 rounded bg-modifier/15">
              M in
            </span>
          ) : null}
          {/* Mini CPU meter bar */}
          {d.cpuLoad > 0 && (
            <div className="flex items-center gap-0.5" title={`CPU: ${d.cpuLoad.toFixed(1)}%`}>
              <div className="w-6 h-1.5 rounded-full bg-[#1A1A1E] overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    d.cpuLoad > 50 ? "bg-error" : d.cpuLoad > 25 ? "bg-modifier" : "bg-logic"
                  }`}
                  style={{ width: `${Math.min(100, d.cpuLoad)}%` }}
                />
              </div>
            </div>
          )}
          <span
            className="text-[9px] font-bold"
            style={{ color: `${cat.hex}99` }}
          >
            {d.format}
          </span>
        </div>
      </div>

      {/* Body — rich visualizations based on plugin type */}
      {/* Hidden by .perform-mode .block-body { display:none } */}
      <div
        className="block-body"
        style={{ opacity: d.bypassed ? 0.6 : 1 }}
      >
        {/* Plugin-specific visualization */}
        {getBlockVisualization(d.name, d.category, cat.hex) || (
          <div className="p-2 text-[9px] text-white/30 tracking-widest text-center uppercase">
            {d.category === "generator" ? "Audio Source" : d.category === "logic" ? "Logic / MIDI" : "Signal Processing"}
          </div>
        )}

        {/* Status row: Latency + CPU */}
        {(d.latencyMs > 0 || d.cpuLoad > 0) && (
          <div className="flex justify-between items-center px-2 py-1 border-t border-white/5 text-[8px] text-text-dim">
            {d.latencyMs > 0 && (
              <span className="tabular">LAT: <span style={{ color: cat.hex }}>{d.latencyMs}ms</span></span>
            )}
            {d.cpuLoad > 0 && (
              <span className="tabular">CPU: <span style={{ color: d.cpuLoad > 50 ? "#EF4444" : d.cpuLoad > 25 ? "#E8A838" : cat.hex }}>{d.cpuLoad.toFixed(1)}%</span></span>
            )}
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
