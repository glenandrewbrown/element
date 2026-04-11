import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  useGraphStore,
  selectSelectedNode,
  selectNodes,
  selectEdges,
} from "../../stores/useGraphStore";
import {
  usePerformStore,
  selectLiveHealth,
  selectSessionName,
} from "../../stores/usePerformStore";
import { NeuButton, NeuDisplay } from "../neu";
import type { BlockData } from "../../data/types";
import {
  nativeGetNodeParameters,
  nativeSetNodeParameter,
  type NodeParameterRow,
} from "../../bridge/nativeGraph";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import {
  nativePluginEditorClose,
  nativePluginEditorFloat,
  nativePluginEditorOpen,
  nativePluginEditorSetBounds,
} from "../../bridge/nativePluginEditor";

type Tab = "inspector" | "log" | "meters";

function BlockHeader({ block }: { block: BlockData }) {
  const { name, category, format } = block;
  const colorClass =
    category === "generator"
      ? "bg-generator/20 border-generator/30 text-generator"
      : category === "modifier"
        ? "bg-modifier/20 border-modifier/30 text-modifier"
        : "bg-logic/20 border-logic/30 text-logic";

  const portSummary = `${block.ports.filter((p) => p.direction === "input").length} in · ${block.ports.filter((p) => p.direction === "output").length} out`;

  return (
    <div className="flex items-center gap-3 p-2 bg-surface rounded shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center border ${colorClass}`}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 6H8l-4 4h16l-4-4zm2 6H2v8h20v-8zM4 16h2v2H4v-2z" />
        </svg>
      </div>
      <div>
        <div className="text-[11px] font-bold text-text-primary">{name}</div>
        <div className="text-[10px] text-text-secondary uppercase">
          {category} · {format} · {portSummary}
        </div>
      </div>
    </div>
  );
}

function formatParamDisplay(p: NodeParameterRow): string {
  if (p.boolean) return p.value >= 0.5 ? "On" : "Off";
  const min = p.min;
  const max = p.max;
  if (typeof min === "number" && typeof max === "number" && max > min) {
    const v = min + p.value * (max - min);
    if (p.stepped) return String(Math.round(v));
    if (max - min <= 24 && Number.isInteger(min) && Number.isInteger(max))
      return v.toFixed(2);
    return v.toFixed(3);
  }
  return `${(p.value * 100).toFixed(1)}%`;
}

function IOResponseCurve() {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
        I/O Response
      </div>
      <div className="h-32 bg-pressed rounded-lg shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 relative overflow-hidden">
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(5)].map((_, i) => (
            <div
              key={`h-${i}`}
              className="absolute w-full h-px bg-white/20"
              style={{ top: `${(i + 1) * 20}%` }}
            />
          ))}
          {[...Array(5)].map((_, i) => (
            <div
              key={`v-${i}`}
              className="absolute h-full w-px bg-white/20"
              style={{ left: `${(i + 1) * 20}%` }}
            />
          ))}
        </div>
        {/* Curve */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path
            d="M0,100 Q20,98 40,70 T70,40 T100,5"
            fill="none"
            stroke="rgba(74,144,217,0.8)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M0,100 Q20,98 40,70 T70,40 T100,5 L100,100 Z"
            fill="url(#curveGradient)"
            opacity="0.3"
          />
          <defs>
            <linearGradient id="curveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(74,144,217,0.4)" />
              <stop offset="100%" stopColor="rgba(74,144,217,0)" />
            </linearGradient>
          </defs>
        </svg>
        {/* Input/Output markers */}
        <div className="absolute bottom-2 left-2 flex gap-2 text-[8px]">
          <span className="text-generator">IN</span>
          <span className="w-1 h-1 rounded-full bg-generator mt-1" />
        </div>
        <div className="absolute top-2 right-2 flex gap-2 text-[8px]">
          <span className="w-1 h-1 rounded-full bg-modifier mt-1" />
          <span className="text-modifier">OUT</span>
        </div>
      </div>
    </div>
  );
}

function BlockMetrics({ block }: { block: BlockData }) {
  const rows = [
    { label: "CPU (est.)", value: `${block.cpuLoad.toFixed(1)}%` },
    {
      label: "Latency",
      value: block.latencyMs > 0 ? `${block.latencyMs.toFixed(1)} ms` : "—",
    },
    { label: "Ports", value: String(block.ports.length) },
  ];
  return (
    <NeuDisplay className="h-auto min-h-[5rem] p-3 space-y-2">
      <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
        Block metrics
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between text-[10px]">
          <span className="text-text-secondary">{r.label}</span>
          <span className="font-bold text-text-primary tabular">{r.value}</span>
        </div>
      ))}
    </NeuDisplay>
  );
}

function BlockParameterList({ nodeId }: { nodeId: string }) {
  const [params, setParams] = useState<NodeParameterRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    void nativeGetNodeParameters(nodeId).then(({ parameters }) => {
      setParams(parameters);
      setLoading(false);
    });
  }, [nodeId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  const onChangeNorm = (index: number, value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setParams((prev) =>
      prev.map((p) => (p.index === index ? { ...p, value: clamped } : p)),
    );
    void nativeSetNodeParameter(nodeId, index, clamped);
  };

  if (loading) {
    return (
      <div className="text-[10px] text-text-secondary py-4 text-center">
        Loading parameters…
      </div>
    );
  }

  if (params.length === 0) {
    return (
      <div className="text-[10px] text-text-secondary py-4 text-center leading-relaxed">
        No automatable parameters for this block (internal routing or host-only
        node).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {params.map((p) => {
        const label = (p.label ?? p.name).trim() || `Param ${p.index}`;
        if (p.boolean) {
          const on = p.value >= 0.5;
          return (
            <div
              key={p.index}
              className="flex items-center justify-between gap-2"
            >
              <span className="text-[10px] text-text-secondary truncate flex-1">
                {label}
              </span>
              <NeuButton
                size="sm"
                variant={on ? "active" : "default"}
                onClick={() => onChangeNorm(p.index, on ? 0 : 1)}
              >
                {on ? "ON" : "OFF"}
              </NeuButton>
            </div>
          );
        }

        const min = typeof p.min === "number" ? p.min : 0;
        const max = typeof p.max === "number" ? p.max : 1;
        const hasRange = max > min;
        const display = formatParamDisplay(p);

        return (
          <div key={p.index} className="space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-[10px] text-text-secondary truncate">
                {label}
              </span>
              <span className="text-[10px] font-bold text-text-primary tabular shrink-0">
                {display}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              step={p.stepped ? 1 : undefined}
              value={Math.round(p.value * 1000)}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChangeNorm(p.index, n / 1000);
              }}
              className="w-full h-1.5 rounded-full appearance-none bg-[#131317] accent-generator cursor-pointer"
              aria-label={label}
            />
            {hasRange && (
              <div className="flex justify-between text-[9px] text-text-dim tabular">
                <span>{String(min)}</span>
                <span>{String(max)}</span>
              </div>
            )}
          </div>
        );
      })}
      <NeuButton size="sm" className="w-full mt-2" onClick={reload}>
        Refresh parameters
      </NeuButton>
    </div>
  );
}

function ProjectOverview() {
  const nodes = useGraphStore(selectNodes);
  const edges = useGraphStore(selectEdges);
  const totalCpu = nodes.reduce((sum, n) => sum + n.cpuLoad, 0);
  const health = usePerformStore(selectLiveHealth);
  const projectName = usePerformStore(selectSessionName);

  const sampleRate = health.sampleRateLabel;
  const buffer =
    typeof health.buffer === "number" && health.buffer > 0
      ? `${health.buffer} spl`
      : "—";
  const device = health.clock && health.clock !== "—" ? health.clock : "—";
  const latency =
    typeof health.latency === "number" && health.latency > 0
      ? `${health.latency.toFixed(1)} ms`
      : "—";

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
        Project Overview
      </div>
      <div className="text-[10px] text-text-primary font-bold truncate">
        {projectName}
      </div>
      {[
        { label: "BLOCKS", value: String(nodes.length) },
        { label: "CABLES", value: String(edges.length) },
        { label: "TOTAL CPU", value: `${totalCpu.toFixed(1)}%` },
        { label: "HOST CPU", value: `${health.cpu.toFixed(1)}%` },
        { label: "SAMPLE RATE", value: sampleRate },
        { label: "BUFFER", value: buffer },
        { label: "DEVICE LATENCY", value: latency },
        { label: "DEVICE", value: device },
      ].map(({ label, value }) => (
        <div key={label} className="flex justify-between items-center gap-2">
          <span className="text-[10px] text-text-secondary shrink-0">
            {label}
          </span>
          <span className="text-[10px] font-bold text-text-primary tabular text-right truncate">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function LogPanel() {
  const lines = useHostExtrasStore((s) => s.logLines);
  const tail = lines.slice(-300);
  return (
    <div className="font-mono text-[9px] text-text-secondary max-h-[min(480px,60vh)] overflow-y-auto space-y-0.5 pr-1">
      {tail.length === 0 ? (
        <div className="text-text-dim uppercase tracking-widest text-center pt-6">
          No log lines yet (hosted in Element)
        </div>
      ) : (
        tail.map((line, i) => (
          <div
            key={`${i}-${line.slice(0, 24)}`}
            className="whitespace-pre-wrap break-words border-b border-white/5 pb-0.5"
          >
            {line}
          </div>
        ))
      )}
    </div>
  );
}

function MetersPanel() {
  const health = usePerformStore(selectLiveHealth);
  const nCables = useCableMeterStore((s) => Object.keys(s.levels).length);
  return (
    <div className="space-y-3 text-[10px] text-text-secondary">
      <NeuDisplay className="h-auto p-3 space-y-2">
        <div className="font-bold text-text-primary uppercase tracking-widest">
          Host
        </div>
        <div className="flex justify-between">
          <span>CPU est.</span>
          <span className="text-text-primary font-bold tabular">
            {health.cpu.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span>Device latency</span>
          <span className="text-text-primary font-bold tabular">
            {health.latency > 0 ? `${health.latency.toFixed(1)} ms` : "—"}
          </span>
        </div>
      </NeuDisplay>
      <div className="text-text-dim">
        Smart cables: {nCables} level channel(s) from engine.
      </div>
    </div>
  );
}

function PluginEditorControls({ block }: { block: BlockData }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [embedded, setEmbedded] = useState(false);
  const isPlugin = block.format !== "INT";

  const readSlotBounds = useCallback(() => {
    const el = slotRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.max(120, Math.round(r.width)),
      h: Math.max(80, Math.round(r.height)),
    };
  }, []);

  useLayoutEffect(() => {
    if (!embedded || !isPlugin) return;
    const b = readSlotBounds();
    if (b) void nativePluginEditorOpen(block.id, b.x, b.y, b.w, b.h);
    return () => {
      void nativePluginEditorClose();
    };
  }, [embedded, isPlugin, block.id, readSlotBounds]);

  useLayoutEffect(() => {
    if (!embedded || !isPlugin) return;
    const el = slotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const b = readSlotBounds();
      if (b) void nativePluginEditorSetBounds(b.x, b.y, b.w, b.h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [embedded, isPlugin, readSlotBounds]);

  if (!isPlugin) return null;

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
        Plugin window
      </div>
      <div className="flex flex-wrap gap-2">
        <NeuButton
          size="sm"
          variant={embedded ? "active" : "default"}
          onClick={() => setEmbedded((v) => !v)}
        >
          {embedded ? "Close embed" : "Embed in shell"}
        </NeuButton>
        <NeuButton
          size="sm"
          onClick={() => {
            void nativePluginEditorFloat();
            setEmbedded(false);
          }}
        >
          Float window
        </NeuButton>
      </div>
      <div
        ref={slotRef}
        className="min-h-[200px] rounded-lg bg-pressed shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 flex items-center justify-center"
      >
        {!embedded ? (
          <span className="text-[10px] text-text-dim px-2 text-center">
            Embed area — host places the native editor here (coordinates from
            this panel).
          </span>
        ) : (
          <span className="text-[9px] text-text-dim px-2 text-center">
            Native plugin UI is drawn above this region by the host.
          </span>
        )}
      </div>
    </div>
  );
}

// ── Cable Inspector (shows when a cable is selected) ──

function CableInspector({ cableId }: { cableId: string }) {
  const edges = useGraphStore(selectEdges);
  const nodes = useGraphStore(selectNodes);
  const edge = edges.find((e) => e.id === cableId);
  const level = useCableMeterStore((s) => s.levels[cableId] ?? 0);

  if (!edge) {
    return (
      <div className="text-[10px] text-text-dim text-center py-4">
        Cable not found
      </div>
    );
  }

  // Get cable data - React Flow wraps our data in a `data` property
  const cable = edge.data as { signalType?: string; channelCount?: number; isSidechain?: boolean; sourcePort?: string; targetPort?: string } | undefined;
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const signalType = cable?.signalType || "audio";
  const channelCount = cable?.channelCount || 2;

  const signalColor =
    signalType === "audio"
      ? "text-generator"
      : signalType === "midi"
        ? "text-logic"
        : "text-modifier";

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
        Cable Properties
      </div>

      {/* Source → Target */}
      <div className="bg-surface rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-text-secondary">From:</span>
          <span className="font-bold text-text-primary">{sourceNode?.name || "Unknown"}</span>
          <span className="text-text-dim">({edge.sourceHandle || cable?.sourcePort || "out"})</span>
        </div>
        <div className="flex items-center justify-center text-text-dim">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.01 11H4v2h12.01v3L20 12l-3.99-4z" />
          </svg>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-text-secondary">To:</span>
          <span className="font-bold text-text-primary">{targetNode?.name || "Unknown"}</span>
          <span className="text-text-dim">({edge.targetHandle || cable?.targetPort || "in"})</span>
        </div>
      </div>

      {/* Signal info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-pressed rounded-lg p-2 text-center">
          <div className="text-[9px] text-text-secondary uppercase">Type</div>
          <div className={`text-[11px] font-bold ${signalColor} uppercase`}>
            {signalType}
          </div>
        </div>
        <div className="bg-pressed rounded-lg p-2 text-center">
          <div className="text-[9px] text-text-secondary uppercase">Channels</div>
          <div className="text-[11px] font-bold text-text-primary">
            {channelCount === 1 ? "Mono" : channelCount === 2 ? "Stereo" : `${channelCount}ch`}
          </div>
        </div>
      </div>

      {/* Live level */}
      <div className="bg-pressed rounded-lg p-3 space-y-2">
        <div className="text-[9px] text-text-secondary uppercase">Signal Level</div>
        <div className="h-3 bg-[#131317] rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              level > 0.8 ? "bg-error" : level > 0.5 ? "bg-modifier" : "bg-logic"
            }`}
            style={{ width: `${level * 100}%` }}
          />
        </div>
        <div className="text-[10px] font-bold text-text-primary tabular text-center">
          {(level * 100).toFixed(0)}%
        </div>
      </div>

      {cable?.isSidechain && (
        <div className="flex items-center gap-2 px-3 py-2 bg-modifier/10 rounded border border-modifier/30">
          <span className="text-[10px] font-bold text-modifier uppercase">Sidechain</span>
        </div>
      )}
    </div>
  );
}

// ── Notes field for blocks ──

function BlockNotesField({ nodeId }: { nodeId: string }) {
  const [notes, setNotes] = useState("");
  
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
        Notes
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes about this block..."
        className="w-full h-20 px-3 py-2 text-[10px] text-text-primary bg-pressed rounded-lg shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 resize-none focus:outline-none focus:border-generator/30"
      />
    </div>
  );
}

export function InspectorHub() {
  const [activeTab, setActiveTab] = useState<Tab>("inspector");
  const selectedBlock = useGraphStore(selectSelectedNode);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const toggleMute = useGraphStore((s) => s.toggleMute);
  const toggleMuteInput = useGraphStore((s) => s.toggleMuteInput);

  const tabs: { id: Tab; label: string }[] = [
    { id: "inspector", label: "INSPECTOR" },
    { id: "log", label: "LOG" },
    { id: "meters", label: "METERS" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-white/5 text-[10px] font-bold tracking-tight text-text-secondary">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 py-3 text-center transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-generator text-text-primary bg-surface"
                : "hover:bg-white/5 cursor-pointer",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === "inspector" && (
          <>
            {selectedBlock ? (
              <>
                <BlockHeader block={selectedBlock} />

                {/* Quick controls - knobs row */}
                <div className="flex justify-around py-3 bg-pressed rounded-lg shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] border border-white/5">
                  {[
                    { label: "FREQ", value: "440.0 Hz", color: "text-generator" },
                    { label: "RESO", value: "0.42", color: "text-modifier" },
                    { label: "DETUNE", value: "+12.0", color: "text-logic" },
                  ].map((ctrl) => (
                    <div key={ctrl.label} className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-surface shadow-[-2px_-2px_6px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/10 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-pressed shadow-[inset_1px_1px_3px_rgba(0,0,0,0.3)] relative">
                          <div className="absolute top-1 left-1/2 w-0.5 h-2 bg-white/40 -translate-x-1/2 rounded-full" />
                        </div>
                      </div>
                      <span className="text-[9px] text-text-secondary uppercase">{ctrl.label}</span>
                      <span className={`text-[10px] font-bold tabular ${ctrl.color}`}>{ctrl.value}</span>
                    </div>
                  ))}
                </div>

                {/* Gain/Pan row */}
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-text-secondary">GAIN</span>
                      <span className="text-modifier font-bold">+2.4 dB</span>
                    </div>
                    <div className="h-2 bg-pressed rounded-full shadow-[inset_1px_1px_3px_rgba(0,0,0,0.4)] relative overflow-hidden">
                      <div className="h-full w-3/4 bg-modifier rounded-full" />
                      <div className="absolute right-2 top-0 h-full w-1 bg-surface/80" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-text-secondary">PAN</span>
                      <span className="text-text-primary font-bold">L 0.4</span>
                    </div>
                    <div className="h-2 bg-pressed rounded-full shadow-[inset_1px_1px_3px_rgba(0,0,0,0.4)] relative overflow-hidden">
                      <div className="absolute left-1/2 h-full w-px bg-white/20" />
                      <div className="absolute left-1/4 w-1/4 h-full bg-white/40 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Bypass / Solo row */}
                <div className="grid grid-cols-2 gap-2">
                  <NeuButton
                    variant={selectedBlock.bypassed ? "active" : "default"}
                    size="sm"
                    onClick={() => toggleBypass(selectedBlock.id)}
                    className={selectedBlock.bypassed ? "!text-generator" : ""}
                  >
                    <span className={`w-2 h-2 rounded-full mr-2 ${selectedBlock.bypassed ? "bg-generator" : "bg-white/20"}`} />
                    {selectedBlock.bypassed ? "BYPASSED" : "BYPASS"}
                  </NeuButton>
                  <NeuButton
                    variant={selectedBlock.muted ? "active" : "default"}
                    size="sm"
                    onClick={() => toggleMute(selectedBlock.id)}
                  >
                    SOLO
                  </NeuButton>
                </div>

                <IOResponseCurve />

                <div className="p-3 bg-pressed rounded-lg shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] space-y-3">
                  <BlockParameterList nodeId={selectedBlock.id} />
                </div>

                <PluginEditorControls
                  key={selectedBlock.id}
                  block={selectedBlock}
                />

                <div className="grid grid-cols-1 gap-2">
                  <NeuButton
                    variant={selectedBlock.muted ? "active" : "default"}
                    size="sm"
                    onClick={() => toggleMute(selectedBlock.id)}
                  >
                    {selectedBlock.muted ? "MUTED" : "MUTE"}
                  </NeuButton>
                  <NeuButton
                    variant={selectedBlock.muteInput ? "active" : "default"}
                    size="sm"
                    onClick={() => toggleMuteInput(selectedBlock.id)}
                  >
                    {selectedBlock.muteInput ? "IN MUTED" : "MUTE INPUTS"}
                  </NeuButton>
                </div>

                <BlockMetrics block={selectedBlock} />

                <BlockNotesField nodeId={selectedBlock.id} />
              </>
            ) : selectedEdgeId ? (
              <CableInspector cableId={selectedEdgeId} />
            ) : (
              <ProjectOverview />
            )}
          </>
        )}

        {activeTab === "log" && <LogPanel />}

        {activeTab === "meters" && <MetersPanel />}
      </div>
    </div>
  );
}
