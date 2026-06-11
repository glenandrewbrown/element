export type SignalType = "audio" | "midi" | "value";
export type BlockCategory = "instrument" | "audiofx" | "midifx" | "modulator";
export type PluginFormat = "VST3" | "AU" | "CLAP" | "LV2" | "INT";
export type AppMode = "edit" | "perform";

export interface Port {
  id: string;
  type: SignalType;
  direction: "input" | "output";
  label: string;
  connected: boolean;
}

export interface BlockData {
  [key: string]: unknown; // React Flow compat
  id: string;
  /**
   * The Block's DISPLAY name and the SINGLE source of truth for naming a placed
   * Block — rendered identically by the canvas Block title and the Inspector
   * header (Task 3.A / left-panel brief §2). Hydrated from the graph snapshot
   * (`n.getName()`); mutated by in-place rename (Cmd+R). NEVER re-derived from
   * the plugin catalog (`usePluginBrowserStore`) — the catalog names un-placed
   * plugins, a different object that is allowed to differ from a renamed instance.
   */
  name: string;
  /**
   * Task 3.A — the immutable catalog `PluginDescription.name` for this Block's
   * plugin family (the SAME field the browser's `BrowserPlugin.name` shows; NEVER
   * `descriptiveName`). The host emits it ONLY when it is known AND differs from
   * the live `name` (i.e. the user renamed the Block). The Inspector header then
   * shows a muted "Renamed from: <catalogName>" line so the rename relationship is
   * explicit without merging the two fields. Absent for internal/IO/unrenamed
   * Blocks (their `name` already IS the catalog name).
   */
  catalogName?: string;
  category: BlockCategory;
  format: PluginFormat;
  position: { x: number; y: number };
  ports: Port[];
  /** 0–100 */
  cpuLoad: number;
  latencyMs: number;
  bypassed: boolean;
  /** Host node mute (output) */
  muted?: boolean;
  /** Host input mute */
  muteInput?: boolean;
  /** JUCE Colour::toString from graph model */
  hostColor?: string;
  /** Oversampling factor from Processor::getOversamplingFactor() (1|2|4|8). */
  oversample?: number;
  error: boolean;
  isMacroTagged: boolean;
  /** Number of child nodes inside a Container block */
  containerNodeCount?: number;
  isPortal?: boolean;
  /**
   * T17 — Optional mini-graph topology preview for Container/Portal blocks.
   * Emitted by the host when the container's internal graph is available.
   * `children` = array of {category, x, y} with x/y normalised 0..1 within
   * the container's bounding box. `cables` = array of {from, to} index pairs
   * into `children`. When ABSENT the ContainerMiniGraph falls back honestly:
   * >MINI_GRAPH_THRESHOLD children → density-bar heatmap; otherwise a neutral
   * bar driven by containerNodeCount alone. NOTHING-fake: never invent child
   * data; absent data = the honest fallback path always renders.
   */
  containerPreview?: {
    /** Mini pill-nodes, normalised position 0..1. */
    children: Array<{ category: BlockCategory; x: number; y: number }>;
    /** Cable index pairs into `children`. */
    cables: Array<{ from: number; to: number }>;
  };
  /** Portal linked file path (shown in the filename row below the thumbnail). */
  portalFilename?: string;
  /**
   * Free-form user note (per blueprint §7.4.11). Edited in the Inspector,
   * persists in the Node ValueTree as "userNote" so it survives save/load.
   */
  note?: string;
  /**
   * Per-block hidden parameter-port ids (Configure Parameters… popover, Glen
   * 2026-06-03). The Value/CV (`type === "value"`) param ports the user chose
   * to HIDE on this Block. Filtered out of the Block's param-port group and
   * excluded from the "▸ N params" count. Persists in the Node ValueTree as the
   * "userHiddenParams" CSV (mirrors `note`/userNote) so it survives save/load.
   * Default/empty = [] → all params present (current behaviour preserved).
   */
  hiddenParams?: string[];
  /**
   * TOTAL param (Control/value) port count on the node, from the host. The
   * snapshot caps UNCONNECTED param ports at 64 emitted rows (a 4096-param
   * plugin like Kontakt otherwise ships a ~400KB snapshot), so the visible
   * value-port array can be shorter than the truth — the "▸ N params" lane
   * count uses THIS. Absent ⇒ the emitted port array is complete.
   */
  paramPortsTotal?: number;
  /**
   * Persisted collapse TIER (Wave-3 Task 2.0; widens the legacy `collapsed`
   * boolean). 'title' = header only · 'macro' = header + curated Macro row
   * (lean default) · 'expanded' = full control deck. Persisted in the Node
   * ValueTree as the "collapseTier" string property (see contract). Double-click
   * title cycles (Task 2.4). A loading node is pinned to 'title'.
   * ABSENT ⇒ 'macro' (the lean default) — and a legacy node that only carried
   * the old boolean is migrated: collapsed=true → 'title', false → 'macro'.
   */
  collapseTier?: "title" | "macro" | "expanded";
  /**
   * Transient node lifecycle state (Wave-3 loading-node contract; Phase 4 async
   * plugin load emits it). "loading" = the real processor is still being
   * instantiated: the Block shows an honest loading face (name + "loading…"),
   * exposes NO connectable ports, and is pinned to the Title-only tier (the
   * 3-tier cycle does not apply while loading). "ready" = the real processor is
   * live and ports/meters are real. ABSENT ⇒ "ready" — every node that predates
   * async-load decodes as ready (back-compat). NOTHING-fake: while loading, the
   * only real data are the name and the fact that it is loading.
   */
  loadState?: "loading" | "ready";
  /**
   * Internal node identifier from the engine snapshot (e.g. "element.compare").
   * Present for all blocks; lets inline Block controls branch on built-in type.
   */
  identifier?: string;
  /**
   * Engine-truth integer mode for built-in logic/comparator nodes
   * (element.compare → operator, element.logic → mode). Absent for all other
   * blocks (the host emits nothing when the processor cast misses — no fake value).
   */
  intMode?: number;
  /**
   * P3 (out-of-process plugin hosting) — true when this block's processor runs
   * in a separate crash-isolated worker process (a SandboxedProcessorNode in the
   * engine; detected host-side by the same cast the editor-open bridge uses).
   * Engine-truth, never guessed. When set, double-clicking the Block opens the
   * plugin's REAL GUI in the worker's own FLOATING window
   * (`elementOpenSandboxedEditor`) rather than the docked in-process embed
   * (`elementPluginEditorOpen`), which a sandboxed node has no editor for. ABSENT
   * / false ⇒ docked path (back-compat: every in-process node is not sandboxed).
   */
  isSandboxed?: boolean;
}

export interface CableData {
  [key: string]: unknown; // React Flow compat
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  signalType: SignalType;
  channelCount: 1 | 2 | 6;
  isSidechain: boolean;
  /**
   * Phase 5B — Wireless Patching (blueprint §7.2.8). When set, the cable is
   * still connected in the engine but renders as a named bus badge on each
   * end-port instead of as a drawn curve. Hydrated from the engine snapshot
   * (Arc.busName ValueTree property); mutated client-side via useBusStore.
   */
  busName?: string;
}

export interface SceneData {
  id: string;
  name: string;
  index: number;
  active: boolean;
  /** Host has a stored parameter snapshot for this scene */
  hasCapture?: boolean;
}

export interface MacroControl {
  id: string;
  name: string;
  sourceBlock: string;
  sourceParam: string;
  /** 0–100 */
  value: number;
  type: "knob" | "fader";
  signalType: SignalType;
}

export interface CommentBoxData {
  id: string;
  label: string;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface DemoGraph {
  blocks: BlockData[];
  cables: CableData[];
  commentBoxes: CommentBoxData[];
  scenes: SceneData[];
  macros: MacroControl[];
}

// ── Perform Mode types ──

export interface SignalChainEntry {
  id: string;
  name: string;
  format: PluginFormat;
  channelConfig: string;
  category: BlockCategory;
  active: boolean;
}

export interface EngineHealth {
  cpuPercent: number;
  bufferSize: number;
  latencyMs: number;
  clockSource: string;
  sampleRate: number;
  bpm: number;
  timecode: string;
  ioActivity: "nominal" | "warning" | "critical";
}

export interface AlertData {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
}

export interface DemoPerform {
  scenes: SceneData[];
  macros: MacroControl[];
  signalChain: SignalChainEntry[];
  health: EngineHealth;
  alerts: AlertData[];
}
