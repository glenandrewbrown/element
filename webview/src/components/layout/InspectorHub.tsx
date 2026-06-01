import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useGraphStore,
  selectSelectedNode,
  selectSelectedEdge,
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
import type {
  BlockCategory,
  BlockData,
  CableData,
  Port,
  SignalType,
} from "../../data/types";
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

import { ScriptEditor } from "../canvas/ScriptEditor";
import { BusInspector } from "./BusInspector";
import { LiveHealth } from "./LiveHealth";
import { NeuPromptModal } from "./NeuPromptModal";
import { Icon } from "../neu/Icon";
// Wizard R2 (icon P0): category + function glyphs come from the SINGLE shared
// source `iconForCategory` (meaningful line icons — piano / faders / branch /
// waves + function-keyword overrides), rendered through the canonical <Icon>.
// This replaces the old locally-reconstructed FunctionIcon SVG so the Block,
// ToolPalette, QuickAdd and Inspector never diverge on what a category looks like.
import { iconForCategory } from "../neu/iconForCategory";

// Verdict #6 — the docked tabbed shell: Block / Bus / Cable / Health. The
// per-block detail (params, A/B, plugin embed, notes, script) lives under Block;
// the live BUS activity + auditor under Bus; the live CABLE signal monitor under
// Cable; engine vitals + meters + log under Health. Wizard R1: Cable is now a
// real-time monitor (level/peak/signal-type from useCableMeterStore), NOT a
// routing editor; Bus gains live activity meters + sidechain + open-editor.
// Every previously-wired surface is re-homed here — nothing is dropped.
type Tab = "block" | "bus" | "cable" | "health";

// Lets nested tab bodies request a tab switch — e.g. the Bus tab's "Open editor"
// affordance dives a bus's destination block and jumps to the Block tab so its
// effects (a reverb on the bus, say) surface for editing. Provided by
// InspectorHub; consumers no-op if unprovided (e.g. a body rendered in isolation).
const InspectorTabContext = createContext<((tab: Tab) => void) | null>(null);

// Category accent (raw HSL triplet so we can alpha-compose for the gradient
// header + glow, exactly as Block.tsx resolves its accent). Frozen W0 tokens.
const catAccent: Record<BlockCategory, string> = {
  instrument: "var(--cat-instrument)",
  audiofx: "var(--cat-audiofx)",
  midifx: "var(--cat-midifx)",
  modulator: "var(--cat-modulator)",
};

const catLabel: Record<BlockCategory, string> = {
  instrument: "Virtual Instrument",
  audiofx: "Audio Effect",
  midifx: "MIDI Effect",
  modulator: "Modulator / Utility",
};

// ── Signal-type vocabulary (Cable + Bus monitors) ──
// The SEPARATE signal-type system (W0-TOKENS §3): cables/ports are coloured by
// what flows through them, not by block category. Audio = blue, MIDI = teal,
// Value/CV = amber — the SAME palette `Cable.tsx` strokes with.
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

// What the live 0–1 reading from `useCableMeterStore` actually MEANS per signal
// type — honesty: it is a true RMS amplitude for audio, but for MIDI/value the
// host packs note/CV ACTIVITY into the same field, so we label it as such
// rather than implying a calibrated dB meter on a non-audio wire.
const sigMeterKind: Record<SignalType, string> = {
  audio: "RMS LEVEL",
  midi: "MIDI ACTIVITY",
  value: "CV ACTIVITY",
};

// Channel-count → human label (mono / stereo / 5.1). CableData.channelCount is
// the locked 1 | 2 | 6 union.
const channelLabel: Record<number, string> = {
  1: "Mono",
  2: "Stereo",
  6: "5.1",
};

// Convert a 0–1 linear amplitude to a dBFS string. Honest: a true silent wire
// reads −∞; we floor the display at −60 dB (below audibility) like a hardware
// meter scale. Only meaningful for AUDIO; callers gate it by signal type.
function toDbfs(amp: number): string {
  if (amp <= 0.0009) return "−∞";
  const db = 20 * Math.log10(amp);
  return `${db <= -60 ? "−60" : (db < 0 ? "−" : "+") + Math.abs(db).toFixed(1)}`;
}

/**
 * Faithful digital-VU LED ladder — the SAME ramp language as `Block.tsx`'s
 * `RmsMeter` (green floor → amber shoulder (last ~5) → red ceiling (last ~2)),
 * scaled up here for the Inspector's monitoring surface. The ramp is by
 * POSITION (universal VU language); `level` is the real 0–1 reading and the
 * lit-cell count is the only thing it drives — never fabricated motion.
 *
 * `vertical` renders a tall column (per-channel L/R stack on the Cable tab);
 * the default is a wide horizontal strip (bus rows, overview rows).
 */
function VuLadder({
  level,
  active,
  segments = 24,
  vertical = false,
  height = 8,
}: {
  level: number;
  active: boolean;
  segments?: number;
  vertical?: boolean;
  height?: number;
}) {
  const amp = Math.min(1, Math.max(0, level));
  const lit = Math.round(amp * segments);
  const cells = Array.from({ length: segments }).map((_, i) => {
    // Position on the ramp. For vertical, index 0 is the BOTTOM cell (green),
    // so the column fills upward into amber/red like a real meter bridge.
    const pos = vertical ? segments - 1 - i : i;
    const isClipSeg = pos >= segments - 2;
    const isWarnSeg = pos >= segments - 5;
    const litThis = pos < lit;
    const segColor = isClipSeg
      ? "hsl(var(--status-clip))"
      : isWarnSeg
        ? "hsl(var(--status-warn))"
        : "hsl(var(--status-ok))";
    return (
      <div
        key={i}
        className={vertical ? "w-full rounded-[1px]" : "flex-1 rounded-[1px]"}
        style={{
          flex: vertical ? "1 1 0" : undefined,
          background: segColor,
          opacity: litThis ? (active ? 1 : 0.4) : 0.14,
          boxShadow: litThis
            ? `0 0 2px ${segColor}, inset 0 0.5px 0 rgba(255,255,255,0.3)`
            : "inset 0 0.5px 1px rgba(0,0,0,0.6)",
        }}
      />
    );
  });
  return (
    <div
      className={vertical ? "flex flex-col gap-[2px]" : "flex gap-[2px] items-stretch"}
      style={{
        padding: 2,
        borderRadius: 3,
        ...(vertical ? { width: 9, height: "100%" } : { height }),
        // Recessed near-black well so the cells sit INSIDE the chassis (mockup
        // VU bridge), shadow recipe from W0-TOKENS port-well family.
        background: "hsl(240 12% 6%)",
        boxShadow:
          "inset 1.5px 1.5px 2.5px rgba(0,0,0,0.85), inset -0.5px -0.5px 1px rgba(255,255,255,0.04)",
      }}
    >
      {cells}
    </div>
  );
}

// Function-type icon — the MEANINGFUL glyph (piano / faders / branch / waves,
// plus function-keyword overrides like reverb→Waves, delay→Clock) resolved from
// the SHARED `iconForCategory` source and drawn through the canonical <Icon>.
// Wizard R2 icon-P0: one source feeds Block + ToolPalette + QuickAdd + Inspector
// so a category never looks different in two places; the abstract geometric
// shape Glen called meaningless is gone everywhere.
//
// <Icon> colours only via the semantic `tone` palette, but the gradient header
// needs a raw near-black glyph — so we tint through `currentColor` on a wrapping
// span (lucide inherits `currentColor` when no explicit colour is set).
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
  return (
    <span style={{ color, display: "inline-flex" }} className="shrink-0">
      <Icon
        name={iconForCategory(category, name)}
        size={size}
        strokeWidth={2}
        aria-hidden
      />
    </span>
  );
}

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
    "px-2 py-0.5 text-[10px] font-bold rounded border-b-2 border-accent-blue text-accent-blue bg-pressed shadow-[inset_1px_1px_4px_rgba(0,0,0,0.4)]";
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

// ── BlockHeader — the mockup's docked gradient header (verdict #6) ──
//
// Full-width category-gradient bar (the same language as Block.tsx's chassis
// header), the function-inferred FunctionIcon (NOT the old generic radio SVG),
// the block name, category label + format pill, and a live state read
// (ACTIVE / BYPASS / MUTED) lifted from the mockup's InspectorPanel header.
function BlockHeader({ block }: { block: BlockData }) {
  const { name, category, format } = block;
  const accent = `hsl(${catAccent[category]})`;

  const portSummary = `${block.ports.filter((p) => p.direction === "input").length} in · ${block.ports.filter((p) => p.direction === "output").length} out`;

  const stateLabel = block.muted
    ? "MUTED"
    : block.bypassed
      ? "BYPASS"
      : "ACTIVE";
  const stateColor = block.muted
    ? "hsl(var(--status-clip))"
    : block.bypassed
      ? "hsl(var(--muted-foreground))"
      : "hsl(var(--status-ok))";
  const stateGlyph = block.muted ? "✕" : block.bypassed ? "○" : "●";

  return (
    <div
      className="rounded-lg overflow-hidden neu-raised"
      style={{ background: "hsl(var(--surface))" }}
    >
      {/* Full-width gradient category bar — mockup language (matches Block.tsx
          chassis header). Dark glyph + dark title on the bright accent. */}
      <div
        className="flex items-center gap-2 px-2.5"
        style={{
          height: 30,
          background: `linear-gradient(180deg, ${accent} 0%, hsl(${catAccent[category]} / 0.72) 100%)`,
          color: "#15151A",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.3)",
        }}
      >
        <FunctionIcon name={name} category={category} size={14} />
        <span className="text-[12px] font-bold truncate flex-1 leading-none tracking-wide">
          {name}
        </span>
        <span
          className="text-[8px] font-mono font-bold px-1 rounded leading-none shrink-0"
          style={{ background: "rgba(0,0,0,0.32)", color: "rgba(255,255,255,0.9)" }}
        >
          {format}
        </span>
      </div>
      {/* Sub-row — category label · port summary · live state */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span className="text-[10px] text-text-secondary">
          {catLabel[category]}
        </span>
        <span className="text-[10px] text-text-dim">·</span>
        <span className="text-[10px] text-text-dim uppercase tabular-nums">
          {portSummary}
        </span>
        <div className="flex-1" />
        <span
          className="text-[9px] font-mono font-bold tabular-nums shrink-0"
          style={{ color: stateColor }}
        >
          {stateGlyph} {stateLabel}
        </span>
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

// Lives inside an InspectorSection now, so it drops its own header. Two compact
// metric rows (CPU + latency); "Ports" moved to the dedicated I/O Ports section.
function BlockMetrics({ block }: { block: BlockData }) {
  const rows = [
    { label: "CPU (est.)", value: `${block.cpuLoad.toFixed(1)}%` },
    {
      label: "Latency",
      value: block.latencyMs > 0 ? `${block.latencyMs.toFixed(1)} ms` : "—",
    },
  ];
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between text-[10px]">
          <span className="text-text-secondary">{r.label}</span>
          <span className="font-bold text-text-primary tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// Signal colour for a Port — the SEPARATE signal-type palette (audio blue / midi
// teal / value amber), the STANDING design bar's port colour-coding.
const portSigAccent: Record<SignalType, string> = {
  audio: "var(--sig-audio)",
  midi: "var(--sig-midi)",
  value: "var(--sig-value)",
};

/**
 * I/O Ports list — every port on the Block, colour-coded by signal type, grouped
 * inputs then outputs, with a connected dot. The STANDING bar wants ports +
 * labels signal-coloured and the port count obvious; the header only showed a
 * bare "N in · M out" summary before. Lives in a (collapsed-by-default) section.
 */
function BlockPortList({ block }: { block: BlockData }) {
  const inputs = block.ports.filter((p) => p.direction === "input");
  const outputs = block.ports.filter((p) => p.direction === "output");

  const Row = ({ p }: { p: Port }) => {
    const accent = `hsl(${portSigAccent[p.type]})`;
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            background: p.connected ? accent : "hsl(var(--muted-foreground))",
            boxShadow: p.connected ? `0 0 4px ${accent}` : "none",
          }}
        />
        <span
          className="text-[10px] font-medium truncate"
          style={{ color: p.connected ? accent : "hsl(var(--muted-foreground))" }}
          title={`${p.label} · ${sigLabel[p.type]}${p.connected ? "" : " · unpatched"}`}
        >
          {p.label}
        </span>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      <div className="space-y-1.5">
        <div className="text-[8px] font-bold uppercase tracking-widest text-text-dim leading-none">
          In · {inputs.length}
        </div>
        {inputs.length === 0 ? (
          <div className="text-[9px] text-text-dim">none</div>
        ) : (
          inputs.map((p) => <Row key={p.id} p={p} />)
        )}
      </div>
      <div className="space-y-1.5">
        <div className="text-[8px] font-bold uppercase tracking-widest text-text-dim leading-none">
          Out · {outputs.length}
        </div>
        {outputs.length === 0 ? (
          <div className="text-[9px] text-text-dim">none</div>
        ) : (
          outputs.map((p) => <Row key={p.id} p={p} />)
        )}
      </div>
    </div>
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

  // Headerless — the wrapping InspectorSection ("Notes") supplies the label.
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder="Add a note for this block…"
      rows={3}
      aria-label="Block note"
      className="w-full text-[11px] bg-pressed text-text-primary rounded-md p-2 outline-none border border-white/5 focus:border-accent-blue/40 placeholder-text-secondary/60 resize-y shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]"
      spellCheck={false}
    />
  );
}

/**
 * Live parameter subscription for a node — lifted OUT of the list component so
 * the parent (BlockTabBody) can gate section visibility on the real count
 * (Wizard R2 smart-layout: hide the params section entirely when a node exposes
 * none, rather than burying the page in a "no parameters" placeholder).
 *
 * `setParam` writes the optimistic value locally + flushes to the engine.
 */
interface NodeParams {
  params: NodeParameterRow[];
  loading: boolean;
  setParam: (index: number, value: number) => void;
  reload: () => void;
}

function useNodeParameters(nodeId: string): NodeParams {
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

  const setParam = useCallback(
    (index: number, value: number) => {
      const clamped = Math.max(0, Math.min(1, value));
      setParams((prev) =>
        prev.map((p) => (p.index === index ? { ...p, value: clamped } : p)),
      );
      void nativeSetNodeParameter(nodeId, index, clamped);
    },
    [nodeId],
  );

  return { params, loading, setParam, reload };
}

function BlockParameterList({
  params,
  loading,
  onChangeNorm,
  onReload,
}: {
  params: NodeParameterRow[];
  loading: boolean;
  onChangeNorm: (index: number, value: number) => void;
  onReload: () => void;
}) {
  if (loading) {
    return (
      <div className="text-[10px] text-text-secondary py-4 text-center">
        Loading parameters…
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
              className="w-full h-1.5 rounded-full appearance-none bg-[#131317] accent-accent-blue cursor-pointer"
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
      <NeuButton size="sm" className="w-full mt-2" onClick={onReload}>
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
    <div className="tabular text-[9px] text-text-secondary max-h-[min(320px,42vh)] overflow-y-auto space-y-0.5 pr-1">
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

// ════════════════════════════════════════════════════════════════════════
//  CABLE TAB (P1 rework) — live signal monitor for the selected cable(s).
//
//  This is NOT a routing editor (that moved off this tab per Wizard R1: it
//  was "wrong on both Element AND mockup"). It is a rich, real-time read of
//  the signal flowing through the selected Cable, sourced from the SAME
//  `useCableMeterStore` 60Hz feed that drives `Cable.tsx`'s stroke and the
//  Block VU. Nothing here is fabricated: the meter's lit-cell count and every
//  numeric is the engine's real per-edge level, and anything with no bridge
//  yet (spectrum, phase correlation) shows an explicit "not wired" state.
// ════════════════════════════════════════════════════════════════════════

/**
 * Live per-edge level subscription — the canonical Cable-tab data source.
 * Returns the real 0–1 reading keyed by edge id (RMS for audio, packed
 * activity for MIDI/value), exactly as `Cable.tsx` reads it. Selector returns
 * a primitive number → `Object.is` short-circuits re-renders on a steady wire
 * (re-render-safe; mirrors the store's epsilon-diff contract).
 */
function useCableLevel(edgeId: string | undefined): number {
  return useCableMeterStore((s) => (edgeId ? (s.levels[edgeId] ?? 0) : 0));
}

/**
 * Honest peak-hold: tracks the MAX observed level since selection and decays
 * it slowly back toward the live level (classic meter ballistics). This is a
 * DERIVED real statistic — it only ever holds a value the engine actually
 * pushed, never a fabricated one. Re-render-safe: the rAF loop writes a ref
 * and only `setState`s when the displayed peak actually moves.
 */
function usePeakHold(level: number, resetKey: string | undefined): number {
  const [peak, setPeak] = useState(0);
  const peakRef = useRef(0);
  const levelRef = useRef(level);
  levelRef.current = level;

  // Reset the hold when the monitored cable changes.
  useEffect(() => {
    peakRef.current = 0;
    setPeak(0);
  }, [resetKey]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const live = levelRef.current;
      let next = peakRef.current;
      if (live >= next) {
        next = live; // instant attack to a new peak
      } else {
        next = Math.max(live, next - 0.004); // ~slow release
      }
      if (Math.abs(next - peakRef.current) > 0.001) {
        peakRef.current = next;
        setPeak(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return peak;
}

// Small signal-coloured icon used in the Cable/Bus monitor headers — the
// MEANINGFUL signal glyph (audio waveform / MIDI note / CV wave), drawn through
// the canonical <Icon> so it shares the allowlisted lucide set. Signal glyphs
// are a SEPARATE axis from `iconForCategory` (which is category-only), so the
// signal→icon map lives here: audio = AudioWaveform, midi = Music, value = Waves.
const SIGNAL_ICON: Record<SignalType, string> = {
  audio: "AudioWaveform",
  midi: "Music",
  value: "Waves",
};

function SignalGlyph({ type, size = 13, color }: { type: SignalType; size?: number; color: string }) {
  return (
    <span style={{ color, display: "inline-flex" }} className="shrink-0">
      <Icon name={SIGNAL_ICON[type]} size={size} strokeWidth={2} aria-hidden />
    </span>
  );
}

// A labelled numeric read-out cell — recessed well, value in white, caption in
// secondary. Used across the Cable monitor stat grid.
function StatCell({
  label,
  value,
  valueColor,
  mono = true,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
}) {
  return (
    <div className="px-2 py-1.5 rounded-md bg-pressed shadow-[inset_2px_2px_5px_rgba(0,0,0,0.45),inset_-1px_-1px_3px_rgba(255,255,255,0.04)]">
      <div className="text-[8px] font-bold uppercase tracking-widest text-text-secondary leading-none">
        {label}
      </div>
      <div
        className={[
          "mt-1 text-[13px] font-bold leading-none tabular-nums",
          mono ? "font-mono" : "",
          valueColor ? "" : "text-text-primary",
        ].join(" ")}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

// An honest "no bridge yet" tile — explicitly NOT data. Used for monitors the
// engine does not expose a feed for (spectrum, phase correlation). Glen's hard
// rule: never fake data; show the gap instead.
function NotWiredTile({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="px-2.5 py-2 rounded-md bg-pressed/60 border border-dashed border-white/10 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] font-bold uppercase tracking-widest text-text-dim leading-none">
          {label}
        </span>
        <span className="text-[7px] font-bold uppercase tracking-wider text-text-dim/80 px-1 py-0.5 rounded bg-white/5 leading-none">
          not wired
        </span>
      </div>
      <div className="mt-1.5 text-[9px] text-text-dim leading-snug">{detail}</div>
    </div>
  );
}

/** Resolve a cable's source/target block + port labels for the route line. */
function useCableRoute(cable: CableData | undefined) {
  const nodes = useGraphStore(selectNodes);
  return useMemo(() => {
    if (!cable) return null;
    const src = nodes.find((n) => n.id === cable.source);
    const tgt = nodes.find((n) => n.id === cable.target);
    const portLabel = (b: BlockData | undefined, portId: string) =>
      b?.ports.find((p) => p.id === portId)?.label ?? portId;
    return {
      sourceName: src?.name ?? cable.source,
      sourceCat: src?.category ?? ("audiofx" as BlockCategory),
      sourcePort: portLabel(src, cable.sourcePort),
      targetName: tgt?.name ?? cable.target,
      targetCat: tgt?.category ?? ("audiofx" as BlockCategory),
      targetPort: portLabel(tgt, cable.targetPort),
    };
  }, [cable, nodes]);
}

// ── Flow-metadata inference (Wizard R2 — MIDI + logic/utility/command) ──
//
// CableData carries no per-message MIDI/CV telemetry (no bridge yet), but the
// PORT LABELS the cable connects to encode real routing semantics the user set
// up — "Gate", "Trigger", "CC 1", "Note", "Clock", "Velocity", "Mod". Surfacing
// those turns the monitor into a flow-DEBUGGING aid (what kind of event is this
// wire actually carrying?) and a conditional-routing reference, all from real
// graph data — never invented. Anything needing a live per-message feed is shown
// as an explicit honest gap, not faked.

interface FlowTag {
  label: string;
  /** semantic role, drives ordering/emphasis */
  kind: "trigger" | "data" | "clock" | "note" | "mod" | "command" | "generic";
}

/** Infer routing tags from a port label (real, user-authored). */
function inferFlowTags(portLabel: string): FlowTag[] {
  const l = portLabel.toLowerCase();
  const tags: FlowTag[] = [];
  const add = (label: string, kind: FlowTag["kind"]) => {
    if (!tags.some((t) => t.label === label)) tags.push({ label, kind });
  };
  if (/gate/.test(l)) add("Gate", "trigger");
  if (/trig/.test(l)) add("Trigger", "trigger");
  if (/\bcc\b|control change|\bcc\s*\d+/.test(l)) add("CC", "data");
  if (/note|key/.test(l)) add("Note", "note");
  if (/vel/.test(l)) add("Velocity", "data");
  if (/clock|sync|tempo/.test(l)) add("Clock", "clock");
  if (/mod|lfo|env/.test(l)) add("Mod", "mod");
  if (/pitch|bend|pb/.test(l)) add("Pitch", "data");
  if (/cmd|command|program|prog/.test(l)) add("Command", "command");
  if (/cv|control.?volt/.test(l)) add("CV", "data");
  return tags;
}

// Raw token name per tag kind so we can compose the same `hsl(var(--x) / a)`
// alpha syntax the rest of the file uses (no color-mix dependency).
const flowTagToken: Record<FlowTag["kind"], string> = {
  trigger: "--status-warn",
  clock: "--sig-midi",
  note: "--sig-midi",
  data: "--sig-value",
  mod: "--cat-modulator",
  command: "--cat-modulator",
  generic: "--muted-foreground",
};

function FlowTagPill({ tag }: { tag: FlowTag }) {
  const token = flowTagToken[tag.kind];
  return (
    <span
      className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded leading-none"
      style={{ background: `hsl(var(${token}) / 0.16)`, color: `hsl(var(${token}))` }}
    >
      {tag.label}
    </span>
  );
}

/** One label/value metadata line inside a flow panel. */
function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 min-h-[16px]">
      <span className="text-[9px] uppercase tracking-wider text-text-secondary shrink-0 w-[68px]">
        {label}
      </span>
      <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}

/**
 * Flow-metadata panel for NON-audio cables (MIDI / Value-CV) — the R2 enrichment.
 * Derives the carried-event tags from the real source/target port labels and the
 * live activity, framed for flow-debugging + conditional routing. Per-message-type
 * counters (how many Note-Ons/CCs/sec) have no bridge → shown as an honest gap.
 */
function FlowMetaPanel({
  cable,
  sourcePort,
  targetPort,
  active,
  accent,
}: {
  cable: CableData;
  sourcePort: string;
  targetPort: string;
  active: boolean;
  accent: string;
}) {
  const isMidi = cable.signalType === "midi";
  const srcTags = inferFlowTags(sourcePort);
  const tgtTags = inferFlowTags(targetPort);
  // Merge for the "carries" summary (unique by label).
  const carries: FlowTag[] = [];
  for (const t of [...srcTags, ...tgtTags])
    if (!carries.some((c) => c.label === t.label)) carries.push(t);
  // A wire is "conditional" routing when either end is a gate/trigger/command —
  // the classic logic-gate / utility / command case Glen called out.
  const isConditional = carries.some(
    (t) => t.kind === "trigger" || t.kind === "command",
  );

  return (
    <div className="rounded-lg bg-surface neu-raised p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          {isMidi ? "MIDI flow" : "Control flow"}
        </span>
        {isConditional && (
          <span
            className="text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded leading-none"
            style={{
              background: "hsl(var(--status-warn) / 0.16)",
              color: "hsl(var(--status-warn))",
            }}
            title="This wire gates / triggers / commands downstream — conditional routing"
          >
            Conditional
          </span>
        )}
        <div className="flex-1" />
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: active ? accent : "hsl(var(--muted-foreground))",
            boxShadow: active ? `0 0 5px ${accent}` : "none",
          }}
        />
      </div>

      <MetaRow label="Carries">
        {carries.length > 0 ? (
          carries.map((t) => <FlowTagPill key={t.label} tag={t} />)
        ) : (
          <span className="text-[9px] text-text-dim">
            {isMidi ? "Generic MIDI stream" : "Generic control signal"}
          </span>
        )}
      </MetaRow>
      <MetaRow label="From">
        <span className="text-[10px] text-text-primary font-medium truncate">
          {sourcePort}
        </span>
      </MetaRow>
      <MetaRow label="To">
        <span className="text-[10px] text-text-primary font-medium truncate">
          {targetPort}
        </span>
      </MetaRow>
      <MetaRow label="State">
        <span
          className="text-[9px] font-bold uppercase tracking-wider"
          style={{ color: active ? "hsl(var(--status-ok))" : "hsl(var(--muted-foreground))" }}
        >
          {active ? (isMidi ? "Events flowing" : "Modulating") : "Idle"}
        </span>
      </MetaRow>

      {/* Honest gap — per-message-type counters need a bridge the engine
          doesn't expose; only the packed activity level is live. */}
      <div className="text-[8px] text-text-dim leading-snug pt-0.5 border-t border-white/5">
        {isMidi
          ? "Per-message counters (Note-On / CC / PB per sec) aren't bridged yet — only packed activity is live. Tags are inferred from the real port wiring. Pillar-2."
          : "Per-step value read-out isn't bridged yet — only packed activity is live. Tags are inferred from the real port wiring. Pillar-2."}
      </div>
    </div>
  );
}

/** The full monitor for ONE selected cable. */
function CableMonitor({ cable }: { cable: CableData }) {
  const sig = (cable.signalType ?? "audio") as SignalType;
  const accent = `hsl(${sigAccent[sig]})`;
  const level = useCableLevel(cable.id);
  const peak = usePeakHold(level, cable.id);
  const route = useCableRoute(cable);
  const amp = Math.min(1, Math.max(0, level));
  const active = amp > 0.01;
  const isAudio = sig === "audio";
  const channels = cable.channelCount ?? 2;

  return (
    <div className="space-y-3">
      {/* Signal-typed header bar — gradient in the cable's signal colour, the
          MEANINGFUL signal glyph, the live route, and an ACTIVE/IDLE state. */}
      <div
        className="rounded-lg overflow-hidden neu-raised"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div
          className="flex items-center gap-2 px-2.5"
          style={{
            height: 30,
            background: `linear-gradient(180deg, ${accent} 0%, hsl(${sigAccent[sig]} / 0.72) 100%)`,
            color: "#15151A",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.3)",
          }}
        >
          <SignalGlyph type={sig} size={14} color="#15151A" />
          <span className="text-[12px] font-bold truncate flex-1 leading-none tracking-wide">
            {sigLabel[sig]} Cable
          </span>
          {cable.isSidechain && (
            <span
              className="text-[8px] font-mono font-bold px-1 rounded leading-none shrink-0"
              style={{ background: "rgba(0,0,0,0.32)", color: "rgba(255,255,255,0.92)" }}
            >
              SIDECHAIN
            </span>
          )}
          <span
            className="text-[8px] font-mono font-bold px-1 rounded leading-none shrink-0"
            style={{ background: "rgba(0,0,0,0.32)", color: "rgba(255,255,255,0.9)" }}
          >
            {channelLabel[channels] ?? `${channels}ch`}
          </span>
        </div>
        {/* Route sub-row: source · port → target · port */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px]">
          <span className="text-text-primary font-bold truncate max-w-[40%]">
            {route?.sourceName}
          </span>
          <span className="text-text-dim truncate">{route?.sourcePort}</span>
          <span className="shrink-0" style={{ color: accent }}>
            →
          </span>
          <span className="text-text-primary font-bold truncate max-w-[40%]">
            {route?.targetName}
          </span>
          <span className="text-text-dim truncate">{route?.targetPort}</span>
        </div>
      </div>

      {/* Live program meter — tall VU ladder + numeric readouts beside it.
          The ladder is the real per-edge reading; the dB scale labels frame
          the column like a hardware meter bridge. */}
      <div className="flex gap-3 p-3 rounded-lg bg-surface neu-raised">
        {/* Scale ticks — dBFS for audio, % for MIDI/CV (honest: a non-audio
            wire has no dB scale, so its activity reads 0–100, not dBFS). */}
        <div className="flex flex-col justify-between text-[7px] font-mono text-text-dim tabular-nums py-0.5 leading-none">
          {(isAudio
            ? ["0", "-6", "-18", "-∞"]
            : ["100", "66", "33", "0"]
          ).map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        {/* The meter column (~120px tall) */}
        <div style={{ height: 120 }}>
          <VuLadder level={amp} active={active} segments={28} vertical />
        </div>
        {/* Peak-hold ghost column — a second thin ladder driven by the held
            peak so the user sees recent maxima next to the live level. */}
        <div style={{ height: 120 }}>
          <VuLadder level={peak} active={peak > 0.01} segments={28} vertical />
        </div>

        {/* Numerics */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div className="space-y-1.5">
            <div className="text-[8px] font-bold uppercase tracking-widest text-text-secondary leading-none">
              {sigMeterKind[sig]}
            </div>
            <div
              className="text-[26px] font-bold font-mono leading-none tabular-nums"
              style={{ color: active ? accent : "hsl(var(--muted-foreground))" }}
            >
              {isAudio ? `${toDbfs(amp)}` : `${Math.round(amp * 100)}`}
              <span className="text-[11px] text-text-dim ml-1">
                {isAudio ? "dB" : "%"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{
                  background: active ? "hsl(var(--status-ok))" : "hsl(var(--muted-foreground))",
                  boxShadow: active ? "0 0 5px hsl(var(--status-ok))" : "none",
                }}
              />
              <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary">
                {active ? "Signal present" : "Idle"}
              </span>
            </div>
          </div>
          <div className="text-[8px] text-text-dim leading-snug">
            Peak hold{" "}
            <span className="font-mono font-bold text-text-secondary">
              {isAudio ? `${toDbfs(peak)} dB` : `${Math.round(peak * 100)}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Stat grid — signal type, channels, peak, sidechain. Real metadata
          off the CableData model + the live store. */}
      <div className="grid grid-cols-2 gap-2">
        <StatCell label="Signal" value={sigLabel[sig]} valueColor={accent} mono={false} />
        <StatCell
          label="Channels"
          value={`${channelLabel[channels] ?? channels} · ${channels}ch`}
          mono={false}
        />
        <StatCell
          label={isAudio ? "Peak (dBFS)" : "Peak"}
          value={isAudio ? `${toDbfs(peak)} dB` : `${Math.round(peak * 100)}%`}
        />
        <StatCell
          label="Sidechain"
          value={cable.isSidechain ? "Yes" : "No"}
          valueColor={cable.isSidechain ? "hsl(var(--cat-audiofx))" : undefined}
          mono={false}
        />
      </div>

      {/* Flow metadata — MIDI + logic/utility/command enrichment (Wizard R2).
          Real routing tags inferred from the port wiring, for flow-debugging +
          conditional routing. Audio cables skip this (they get spectrum/phase). */}
      {!isAudio && route && (
        <FlowMetaPanel
          cable={cable}
          sourcePort={route.sourcePort}
          targetPort={route.targetPort}
          active={active}
          accent={accent}
        />
      )}

      {/* Honest gaps — monitors with no engine bridge yet. */}
      <div className="space-y-2">
        {isAudio && (
          <NotWiredTile
            label="Spectrum"
            detail="Per-cable FFT bins are not exposed by the engine bridge yet — only summed RMS is. Pillar-2."
          />
        )}
        {isAudio && channels >= 2 && (
          <NotWiredTile
            label="Phase / correlation"
            detail="Stereo correlation metering needs a per-channel L/R feed; the bridge currently sends one summed RMS per cable. Pillar-2."
          />
        )}
      </div>
    </div>
  );
}

/** One row in the no-selection cable overview — a live mini-meter per cable. */
function CableOverviewRow({
  cable,
  blockNames,
  onSelect,
}: {
  cable: CableData;
  blockNames: Map<string, string>;
  onSelect: () => void;
}) {
  const sig = (cable.signalType ?? "audio") as SignalType;
  const accent = `hsl(${sigAccent[sig]})`;
  const level = useCableLevel(cable.id);
  const amp = Math.min(1, Math.max(0, level));
  const active = amp > 0.01;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface text-left t-precision shadow-[-1px_-1px_4px_rgba(255,255,255,0.03),1px_1px_4px_rgba(0,0,0,0.3)] hover:bg-elevated hover:shadow-[0_0_0_1px_var(--row-accent),-1px_-1px_4px_rgba(255,255,255,0.04),1px_1px_5px_rgba(0,0,0,0.4)]"
      style={{ ["--row-accent" as string]: `hsl(${sigAccent[sig]} / 0.5)` }}
    >
      <SignalGlyph type={sig} size={12} color={accent} />
      <span className="text-[10px] font-bold text-text-primary truncate shrink min-w-0">
        {blockNames.get(cable.source) ?? cable.source}
      </span>
      <span className="shrink-0 text-[9px]" style={{ color: accent }}>
        →
      </span>
      <span className="text-[10px] font-bold text-text-primary truncate shrink min-w-0 flex-1">
        {blockNames.get(cable.target) ?? cable.target}
      </span>
      <div className="w-16 shrink-0">
        <VuLadder level={amp} active={active} segments={12} height={7} />
      </div>
    </button>
  );
}

/** No-selection resting state for the Cable tab — a live board-wide monitor. */
function CableOverview() {
  const edges = useGraphStore(selectEdges) as CableData[];
  const nodes = useGraphStore(selectNodes);
  const selectEdgeOnGraph = useGraphStore((s) => s.selectEdge);
  const blockNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.name);
    return m;
  }, [nodes]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
          Cable Monitor
        </span>
        <span className="text-[10px] text-text-dim tabular-nums">
          {edges.length} cable{edges.length === 1 ? "" : "s"}
        </span>
      </div>
      {edges.length === 0 ? (
        <div className="text-[10px] text-text-dim leading-relaxed py-4 text-center">
          No cables on this Board. Select a cable on the canvas to monitor its
          live level, peak and signal type here.
        </div>
      ) : (
        <>
          <div className="text-[9px] text-text-dim leading-snug">
            Live level per cable (real engine RMS / activity). Select one for the
            full monitor.
          </div>
          <div className="space-y-1.5">
            {edges.map((cable) => (
              <CableOverviewRow
                key={cable.id}
                cable={cable}
                blockNames={blockNames}
                onSelect={() => selectEdgeOnGraph(cable.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Cable tab dispatcher — selected cable → full monitor, else overview. */
function CableTabBody() {
  const selectedCable = useGraphStore(selectSelectedEdge) as
    | CableData
    | undefined;
  if (!selectedCable) return <CableOverview />;
  return <CableMonitor cable={selectedCable} />;
}

// ════════════════════════════════════════════════════════════════════════
//  BUS TAB (Wizard R1 #4 + R2) — the IO send/receive auditor (BusInspector).
//
//  BusInspector now carries the full live surface: SEPARATE Send + Receive
//  activity meters per bus (real per-cable RMS / activity), a live volume per
//  side, sidechain DISPLAY, and a direct "Open editor" affordance that dives the
//  bus's destination block so its effects (e.g. a reverb) open in the Block tab.
//
//  DECISION (Wizard R1 #4): buses are IO blocks that SEND TO / RECEIVE FROM a
//  named bus (Bus Send / Bus Receive), NOT "wireless cables". All framing here
//  follows that model — no "wireless" language anywhere. The broader send/receive
//  Bus-block model is a separate queued task; this surface audits/opens EXISTING
//  buses and must not contradict the decision.
// ════════════════════════════════════════════════════════════════════════

/** Bus tab body — the enriched BusInspector, wired to open a block in the Block tab. */
function BusTabBody() {
  const selectNodeOnGraph = useGraphStore((s) => s.selectNode);
  const setActiveTabRef = useContext(InspectorTabContext);

  // Open a bus's destination block in the Block tab: select it + switch tab.
  const openBlock = useCallback(
    (blockId: string) => {
      selectNodeOnGraph(blockId);
      setActiveTabRef?.("block");
    },
    [selectNodeOnGraph, setActiveTabRef],
  );

  return <BusInspector onOpenBlock={openBlock} />;
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
 * Collapsible inspector section — the smart-layout primitive (Wizard R2). Stacks
 * panels into one scrollable column without competing full-height headers, and
 * carries an optional right-aligned `summary` (e.g. a param count, a state pill)
 * so a collapsed section still tells you what's inside without expanding.
 *
 * Callers HIDE a section entirely (don't render it) when it has nothing to show
 * — this component only handles the open/closed state of a section that exists.
 * `accent` tints the disclosure chevron + hover for category-hue dopamine.
 */
function InspectorSection({
  title,
  defaultOpen = true,
  summary,
  accent,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  summary?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-lg bg-surface border border-white/5 overflow-hidden t-precision shadow-[-2px_-2px_8px_rgba(255,255,255,0.03),2px_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_0_0_1px_var(--sec-accent),-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.4)]"
      style={accent ? ({ ["--sec-accent" as string]: accent } as React.CSSProperties) : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        <span
          className="text-[9px] transition-transform shrink-0"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            color: accent ?? "hsl(var(--muted-foreground))",
          }}
        >
          ▶
        </span>
        <span className="truncate">{title}</span>
        <div className="flex-1" />
        {summary != null && (
          <span className="text-[9px] font-mono font-bold tabular-nums text-text-dim normal-case tracking-normal shrink-0">
            {summary}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/**
 * Back-compat thin alias — the Health tab (APPROVED, untouched) keeps calling
 * `HealthSection`; it is now `InspectorSection` with the same surface.
 */
function HealthSection(props: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return <InspectorSection {...props} />;
}

/**
 * The Block tab body — SMART relevance-ordered layout (Wizard R2). Sections are
 * ordered by how often you reach for them and EMPTY ones are hidden entirely so
 * the important info is never buried under dead placeholders ("screen space is
 * precious"):
 *
 *   1. Header (always)            5. I/O Ports — collapsed, signal-coloured
 *   2. Presets A/B (always)       6. State (bypass/mute) — collapsed
 *   3. Parameters — only if the   7. Metrics (CPU/latency) — collapsed
 *      node exposes any (or       8. Notes — collapsed, shows • when written
 *      while loading); open       9. Script editor — script Blocks only
 *   4. Plugin window — plugins only (self-gated)
 *
 * No Block selected: the Project Overview resting state.
 */
function BlockTabBody({
  selectedBlock,
}: {
  selectedBlock: BlockData | null | undefined;
}) {
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const toggleMute = useGraphStore((s) => s.toggleMute);
  const toggleMuteInput = useGraphStore((s) => s.toggleMuteInput);

  // Lifted so we can gate the whole Parameters section on the real count.
  // (Hooks must run unconditionally — call before the early return; nodeId is
  // "" when nothing is selected, and the bridge returns an empty list for it.)
  const nodeId = selectedBlock?.id ?? "";
  const { params, loading, setParam, reload } = useNodeParameters(nodeId);

  if (!selectedBlock) {
    return <ProjectOverview />;
  }

  const accent = `hsl(${catAccent[selectedBlock.category]})`;
  const isPlugin = selectedBlock.format !== "INT";
  const hasParams = loading || params.length > 0;
  const hasNote = (selectedBlock.note ?? "").trim().length > 0;
  const stateSummary = selectedBlock.muted
    ? "MUTED"
    : selectedBlock.bypassed
      ? "BYPASS"
      : "active";

  return (
    <>
      <BlockHeader block={selectedBlock} />
      <PresetStrip nodeId={selectedBlock.id} />

      {/* PARAMETERS — the primary surface; hidden entirely when the node has
          none (internal routing / host-only), so no "no parameters" filler. */}
      {hasParams && (
        <InspectorSection
          title="Parameters"
          accent={accent}
          summary={loading ? "…" : params.length}
        >
          <div className="p-3 bg-pressed rounded-lg shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] space-y-3">
            <BlockParameterList
              params={params}
              loading={loading}
              onChangeNorm={setParam}
              onReload={reload}
            />
          </div>
        </InspectorSection>
      )}

      {/* PLUGIN WINDOW — self-gates to null for internal nodes. */}
      {isPlugin && (
        <PluginEditorControls key={selectedBlock.id} block={selectedBlock} />
      )}

      {/* I/O PORTS — signal-coloured, collapsed by default. */}
      <InspectorSection
        title="I/O Ports"
        accent={accent}
        defaultOpen={false}
        summary={`${selectedBlock.ports.filter((p) => p.direction === "input").length} · ${selectedBlock.ports.filter((p) => p.direction === "output").length}`}
      >
        <BlockPortList block={selectedBlock} />
      </InspectorSection>

      {/* STATE — bypass / mute / mute-inputs. Collapsed when the block is in its
          default ACTIVE state (the header already says so), but AUTO-OPENS when
          something is engaged (bypassed / muted / inputs muted) so the live
          toggle is right there — smart-layout surfacing what's relevant. */}
      <InspectorSection
        title="State"
        accent={accent}
        defaultOpen={
          selectedBlock.bypassed ||
          Boolean(selectedBlock.muted) ||
          Boolean(selectedBlock.muteInput)
        }
        summary={stateSummary}
      >
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
      </InspectorSection>

      {/* METRICS — CPU / latency, collapsed. */}
      <InspectorSection title="Metrics" accent={accent} defaultOpen={false}>
        <BlockMetrics block={selectedBlock} />
      </InspectorSection>

      {/* NOTES — collapsed; a • in the summary flags when a note exists so you
          don't have to open it to know. */}
      <InspectorSection
        title="Notes"
        accent={accent}
        defaultOpen={false}
        summary={hasNote ? "•" : undefined}
      >
        <BlockNoteEditor block={selectedBlock} />
      </InspectorSection>

      {/* SCRIPT — folds the editor INTO the Block tab for Script Blocks (verdict
          #6 — the Script tab is retired; per-block editing belongs to the block).
          Hidden for every non-script Block. */}
      {isScriptNode(selectedBlock) && (
        <InspectorSection title="Script" accent={accent}>
          <div className="min-h-[360px] rounded-lg overflow-hidden border border-white/5">
            <ScriptEditor nodeId={selectedBlock.id} />
          </div>
        </InspectorSection>
      )}
    </>
  );
}

/**
 * Docked tabbed inspector shell (bake-off verdict #6). Four tabs —
 * **Block / Bus / Cable / Health** — house every previously-wired surface:
 *
 *  • **Block**  — per-Block detail: gradient header, A/B preset compare,
 *    parameter sliders, plugin-window embed, bypass/mute controls, metrics,
 *    notes, and the inline Script editor for Script Blocks. With nothing
 *    selected, the resting Project Overview.
 *  • **Bus**    — live per-bus activity (level/volume/sidechain) + an
 *    open-editor affordance, above the bus auditor (BusInspector). Buses are
 *    IO send/receive blocks, NOT wireless cables (Wizard R1 decision #4).
 *  • **Cable**  — the live signal monitor for the selected cable(s): a faithful
 *    digital-VU ladder, peak-hold, dBFS, signal type, channels and sidechain,
 *    all from the real 60Hz `useCableMeterStore` feed. With nothing selected, a
 *    board-wide live overview. NOT a routing editor (Wizard R1 P1).
 *  • **Health** — engine vitals (LiveHealth), host meters, and the log tail.
 *
 * Mockup supplies the docked-shell layout + gradient header; the wiring,
 * stores, and bridge calls are Element's. Nothing from the prior tab set
 * (Inspector / Script / Cables / Log / Meters) is dropped.
 */
export function InspectorHub() {
  const [activeTab, setActiveTab] = useState<Tab>("block");
  const selectedBlock = useGraphStore(selectSelectedNode);

  const tabs: { id: Tab; label: string }[] = [
    { id: "block", label: "BLOCK" },
    { id: "bus", label: "BUS" },
    { id: "cable", label: "CABLE" },
    { id: "health", label: "HEALTH" },
  ];

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "hsl(var(--panel))" }}
    >
      <div
        className="flex border-b border-panel-border text-[10px] font-bold tracking-tight text-text-secondary shrink-0"
        role="tablist"
        aria-label="Inspector sections"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex-1 py-3 text-center t-precision relative",
                isActive
                  ? "text-text-primary bg-surface"
                  : "hover:bg-white/5 hover:text-text-primary cursor-pointer",
              ].join(" ")}
            >
              {tab.label}
              {/* Active underline — a thin accent rail, neumorphic docked-shell
                  cue (mockup) rather than a hard border-box. */}
              {isActive && (
                <span
                  className="absolute left-0 right-0 bottom-0 h-[2px]"
                  style={{
                    background: "hsl(var(--cat-instrument))",
                    boxShadow: "0 0 6px hsl(var(--cat-instrument) / 0.55)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <InspectorTabContext.Provider value={setActiveTab}>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === "block" && <BlockTabBody selectedBlock={selectedBlock} />}

        {activeTab === "bus" && <BusTabBody />}

        {activeTab === "cable" && <CableTabBody />}

        {activeTab === "health" && (
          <div className="space-y-3">
            <HealthSection title="Engine vitals">
              {/* LiveHealth carries its own header + scroller; constrain it so
                  it composes inside the collapsible without a competing
                  full-height frame. */}
              <div className="rounded-md overflow-hidden bg-pressed shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]">
                <LiveHealth />
              </div>
            </HealthSection>
            <HealthSection title="Host meters">
              <MetersPanel />
            </HealthSection>
            <HealthSection title="Engine log" defaultOpen={false}>
              <LogPanel />
            </HealthSection>
          </div>
        )}
      </div>
      </InspectorTabContext.Provider>
    </div>
  );
}
