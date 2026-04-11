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

export function InspectorHub() {
  const [activeTab, setActiveTab] = useState<Tab>("inspector");
  const selectedBlock = useGraphStore(selectSelectedNode);
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

                <div className="p-3 bg-pressed rounded-lg shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] space-y-3">
                  <BlockParameterList nodeId={selectedBlock.id} />
                </div>

                <PluginEditorControls
                  key={selectedBlock.id}
                  block={selectedBlock}
                />

                <div className="grid grid-cols-1 gap-2">
                  <NeuButton
                    variant={selectedBlock.bypassed ? "active" : "default"}
                    size="sm"
                    onClick={() => toggleBypass(selectedBlock.id)}
                  >
                    {selectedBlock.bypassed ? "BYPASSED" : "BYPASS"}
                  </NeuButton>
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
              </>
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
