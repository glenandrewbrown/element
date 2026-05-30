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
import {
  useEngineSnapshotStore,
  selectCpuPercent,
  selectSampleRate,
  selectBufferSize,
  selectDeviceName,
  selectDeviceLatencyMs,
  selectHasHostData,
} from "../../stores/useEngineSnapshotStore";
import { NeuButton, NeuDisplay } from "../neu";
import type { BlockData } from "../../data/types";
import {
  nativeGetNodeParameters,
  nativeGraphSetNodeNote,
  nativeSetNodeParameter,
  nativePresetSnapshot,
  nativePresetSwap,
  nativePresetSave,
  nativePresetLoad,
  nativePresetList,
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

import { ConnectionEditor } from "./ConnectionEditor";
import { ScriptEditor } from "../canvas/ScriptEditor";
import { BusInspector } from "./BusInspector";
import { NeuPromptModal } from "./NeuPromptModal";

type Tab = "inspector" | "script" | "log" | "meters" | "connections";

function isScriptNode(block: BlockData): boolean {
  return (
    block.name?.toLowerCase().includes("script") === true ||
    (block.format === "INT" && block.name === "Script")
  );
}

// ── P1-10: Preset Bank A/B Compare ───────────────────────────────────────

type PresetSlot = "A" | "B";

function PresetStrip({ nodeId }: { nodeId: string }) {
  const [activeSlot, setActiveSlot] = useState<PresetSlot>("A");
  const [presets, setPresets] = useState<string[]>([]);
  // W-1: NeuPromptModal replaces window.prompt() for Save/Load.
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);

  const refreshPresets = () => {
    void nativePresetList("").then((r) => {
      if (r.ok) setPresets(r.presets);
    });
  };

  // T-P6-7: When `nodeId` changes mid-fetch the prior request's
  // resolution would race the new fetch and briefly display the
  // previous node's preset list. Reset the visible list immediately
  // and use a `cancelled` ref-style flag to drop stale resolutions.
  useEffect(() => {
    let cancelled = false;
    setPresets([]);
    void nativePresetList("").then((r) => {
      if (cancelled) return;
      if (r.ok) setPresets(r.presets);
    });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  // Snapshot current live values into slot, then activate it.
  const snapshotAndActivate = async (slot: PresetSlot) => {
    if (slot === activeSlot) return;
    await nativePresetSnapshot(nodeId, slot);
    setActiveSlot(slot);
  };

  // Apply the OTHER slot's stored values to the live processor.
  const swap = async () => {
    const target: PresetSlot = activeSlot === "A" ? "B" : "A";
    await nativePresetSwap(nodeId, target);
    // Keep the active slot label unchanged — the values just swapped underneath.
  };

  const openSavePrompt = () => setSaveOpen(true);

  const openLoadMenu = () => {
    if (presets.length === 0) {
      void refreshPresets();
      return;
    }
    setLoadOpen(true);
  };

  const handleSaveConfirm = (name: string) => {
    setSaveOpen(false);
    void nativePresetSave(nodeId, name).then((r) => {
      if (r.ok) refreshPresets();
    });
  };

  const handleLoadConfirm = (name: string) => {
    setLoadOpen(false);
    void nativePresetLoad(nodeId, name);
  };

  const loadDescription =
    presets.length > 0
      ? `Available presets: ${presets.join(", ")}`
      : undefined;

  const activeBtn =
    "px-2 py-0.5 text-[10px] font-bold rounded border-b-2 border-generator text-generator bg-pressed shadow-[inset_1px_1px_4px_rgba(0,0,0,0.4)]";
  const inactiveBtn =
    "px-2 py-0.5 text-[10px] font-bold rounded text-text-secondary bg-surface hover:bg-elevated transition-colors shadow-[-1px_-1px_4px_rgba(255,255,255,0.04),1px_1px_4px_rgba(0,0,0,0.3)]";
  const swapBtn =
    "px-2 py-0.5 text-[10px] rounded text-text-secondary bg-surface hover:bg-elevated transition-colors shadow-[-1px_-1px_4px_rgba(255,255,255,0.04),1px_1px_4px_rgba(0,0,0,0.3)]";
  const textBtn =
    "text-[10px] text-text-secondary hover:text-text-primary transition-colors underline underline-offset-2";

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5">
      <span className="text-[9px] uppercase tracking-widest text-text-secondary mr-1">
        Presets
      </span>
      <button
        className={activeSlot === "A" ? activeBtn : inactiveBtn}
        onClick={() => void snapshotAndActivate("A")}
      >
        A
      </button>
      <button
        className={activeSlot === "B" ? activeBtn : inactiveBtn}
        onClick={() => void snapshotAndActivate("B")}
      >
        B
      </button>
      <button className={swapBtn} onClick={() => void swap()} title="Swap A↔B">
        ⇄
      </button>
      <span className="flex-1" />
      <button className={textBtn} onClick={openSavePrompt}>
        Save…
      </button>
      <button className={textBtn} onClick={openLoadMenu}>
        Load…
      </button>
      <NeuPromptModal
        open={saveOpen}
        title="Save preset"
        description="Saves the current parameter values under the name you enter."
        placeholder="Preset name"
        confirmLabel="Save"
        onConfirm={handleSaveConfirm}
        onCancel={() => setSaveOpen(false)}
      />
      <NeuPromptModal
        open={loadOpen}
        title="Load preset"
        description={loadDescription}
        placeholder="Preset name"
        confirmLabel="Load"
        onConfirm={handleLoadConfirm}
        onCancel={() => setLoadOpen(false)}
      />
    </div>
  );
}

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

/**
 * Free-form per-block note (blueprint §7.4.11).
 * Edits flush to the engine ~400ms after the user stops typing so we don't
 * spam the bridge on every keystroke. Re-syncs from the upstream `block.note`
 * on selection change so the field always reflects engine truth.
 */
function BlockNoteEditor({ block }: { block: BlockData }) {
  const [draft, setDraft] = useState<string>(block.note ?? "");
  const lastUpstream = useRef<string>(block.note ?? "");
  const flushTimer = useRef<number | null>(null);

  // Re-hydrate when the selected block changes OR the engine pushes a new note.
  useEffect(() => {
    const upstream = block.note ?? "";
    if (upstream !== lastUpstream.current) {
      lastUpstream.current = upstream;
      setDraft(upstream);
    }
  }, [block.id, block.note]);

  // Debounce-flush to engine.
  useEffect(() => {
    if (draft === lastUpstream.current) return;
    if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => {
      void nativeGraphSetNodeNote(block.id, draft);
      lastUpstream.current = draft;
      flushTimer.current = null;
    }, 400);
    return () => {
      if (flushTimer.current != null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
    };
  }, [draft, block.id]);

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
        Notes
      </label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note for this block…"
        rows={3}
        className="w-full text-[11px] bg-pressed text-text-primary rounded-md p-2 outline-none border border-white/5 focus:border-generator/40 placeholder-text-secondary/60 resize-y shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]"
        spellCheck={false}
      />
    </div>
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
  const projectName = usePerformStore(selectSessionName);

  // US-002 / C-2: subscribe directly to the engine snapshot store for the
  // live audio-engine fields. The previous implementation read from
  // usePerformStore.liveHealth, which depended on the OLD onGraphState
  // poll that dropped the engine block on empty graphs (now fixed in C++)
  // AND was previously fed a fake `peak * 320` CPU value (cleared by
  // commit e7130f6f). Direct subscription removes both failure modes.
  const engineCpuPercent = useEngineSnapshotStore(selectCpuPercent);
  const engineSampleRate = useEngineSnapshotStore(selectSampleRate);
  const engineBufferSize = useEngineSnapshotStore(selectBufferSize);
  const engineDeviceName = useEngineSnapshotStore(selectDeviceName);
  const engineDeviceLatencyMs = useEngineSnapshotStore(selectDeviceLatencyMs);
  const hasHostData = useEngineSnapshotStore(selectHasHostData);

  // Match StatusBar formatting so PROJECT OVERVIEW and the native footer
  // present identical numbers.
  const cpuLabel = hasHostData ? `${engineCpuPercent.toFixed(1)}%` : "—";
  const sampleRateLabel =
    engineSampleRate > 0
      ? `${(engineSampleRate / 1000).toFixed(1)} kHz`
      : "—";
  const bufferLabel = engineBufferSize > 0 ? `${engineBufferSize} smp` : "—";
  const deviceLatencyLabel =
    engineDeviceLatencyMs > 0
      ? `${engineDeviceLatencyMs.toFixed(1)} ms`
      : "—";
  const deviceLabel =
    engineDeviceName.length > 0 ? engineDeviceName : "—";

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
        // TOTAL CPU and HOST CPU both surface the audio-thread CPU from the
        // engine snapshot. Previously TOTAL CPU was a graph-level sum of
        // per-node `cpuLoad` placeholders — that placeholder is no longer
        // populated, and the engine `cpu` field is the only authoritative
        // measurement. Both rows are kept so the layout matches the
        // existing inspector grid; HOST CPU is the canonical value and
        // TOTAL CPU mirrors it until per-node CPU is wired (separate work).
        { label: "TOTAL CPU", value: cpuLabel },
        { label: "HOST CPU", value: cpuLabel },
        { label: "SAMPLE RATE", value: sampleRateLabel },
        { label: "BUFFER", value: bufferLabel },
        { label: "DEVICE LATENCY", value: deviceLatencyLabel },
        { label: "DEVICE", value: deviceLabel },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="flex justify-between items-center gap-2"
          aria-label={`${label}: ${value}`}
        >
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
    <div className="tabular text-[9px] text-text-secondary max-h-[min(480px,60vh)] overflow-y-auto space-y-0.5 pr-1">
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

/**
 * Tabbed right-hand inspector for the selected Block. Use it as the primary
 * detail surface in Edit mode: the INSPECTOR tab shows the Block header,
 * A/B preset compare, parameter sliders, plugin-window embed, bypass/mute
 * controls and notes; CABLES, LOG and METERS tabs cover routing and
 * diagnostics, and a SCRIPT tab appears for Script Blocks. With no Block
 * selected it falls back to a Project Overview plus the wireless Bus inspector.
 */
export function InspectorHub() {
  const [activeTab, setActiveTab] = useState<Tab>("inspector");
  const selectedBlock = useGraphStore(selectSelectedNode);
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const toggleMute = useGraphStore((s) => s.toggleMute);
  const toggleMuteInput = useGraphStore((s) => s.toggleMuteInput);

  const showScriptTab = selectedBlock != null && isScriptNode(selectedBlock);

  const tabs: { id: Tab; label: string }[] = [
    { id: "inspector", label: "INSPECTOR" },
    ...(showScriptTab ? [{ id: "script" as Tab, label: "SCRIPT" }] : []),
    { id: "connections", label: "CABLES" },
    { id: "log", label: "LOG" },
    { id: "meters", label: "METERS" },
  ];

  // If the script tab is active but the selected block is no longer a script node, reset
  const effectiveTab: Tab =
    activeTab === "script" && !showScriptTab ? "inspector" : activeTab;

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-white/5 text-[10px] font-bold tracking-tight text-text-secondary">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 py-3 text-center transition-colors",
              effectiveTab === tab.id
                ? "border-b-2 border-generator text-text-primary bg-surface"
                : "hover:bg-white/5 cursor-pointer",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {effectiveTab === "script" && selectedBlock && (
          <div className="h-full min-h-[400px]">
            <ScriptEditor nodeId={selectedBlock.id} />
          </div>
        )}

        {effectiveTab === "inspector" && (
          <>
            {selectedBlock ? (
              <>
                <BlockHeader block={selectedBlock} />
                <PresetStrip nodeId={selectedBlock.id} />

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

                <BlockNoteEditor block={selectedBlock} />
              </>
            ) : (
              <div className="space-y-6">
                <ProjectOverview />
                <BusInspector />
              </div>
            )}
          </>
        )}

        {effectiveTab === "connections" && <ConnectionEditor />}

        {effectiveTab === "log" && <LogPanel />}

        {effectiveTab === "meters" && <MetersPanel />}
      </div>
    </div>
  );
}
