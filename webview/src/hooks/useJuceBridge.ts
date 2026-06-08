import { useEffect } from "react";
import type {
  BlockData,
  BlockCategory,
  CableData,
  CommentBoxData,
  PluginFormat,
  Port,
  SceneData,
  SignalType,
} from "../data/types";
import { invokeElementNative } from "../bridge/juceBackend";
import { logBridgeError } from "../bridge/bridgeError";
import { useGraphStore } from "../stores/useGraphStore";
import { usePerformStore } from "../stores/usePerformStore";
import { usePluginBrowserStore } from "../stores/usePluginBrowserStore";
import { useSessionStore } from "../stores/useSessionStore";
import { useCableMeterStore } from "../stores/useCableMeterStore";
import { useNodeMeterStore } from "../stores/useNodeMeterStore";
import { useNodeChannelMeterStore } from "../stores/useNodeChannelMeterStore";
import {
  useSandboxCrashStore,
  type SandboxEventPayload,
} from "../stores/useSandboxCrashStore";
import {
  useParameterStore,
  type ParameterDelta,
} from "../stores/useParameterStore";
import {
  useHostExtrasStore,
  type GraphOutlineNode,
} from "../stores/useHostExtrasStore";
import { useAppStore } from "../stores/useAppStore";
import { useEngineSnapshotStore } from "../stores/useEngineSnapshotStore";
import { useInstancesStore } from "../stores/useInstancesStore";

type EngineBlock = {
  id: string;
  name: string;
  /** Task 3.A — catalog PluginDescription.name; host emits it only when known
   *  AND it differs from `name` (i.e. the Block was renamed). Drives the muted
   *  "Renamed from: <catalog>" line in the Inspector header. */
  catalogName?: string;
  x?: number;
  y?: number;
  bypassed?: boolean;
  muted?: boolean;
  muteInput?: boolean;
  color?: string;
  isContainer?: boolean;
  containerNodeCount?: number;
  /** CPU load percentage 0..100 contributed by this block. Engine emits 0
   *  until a per-Processor CPU measurement layer lands (US-002 follow-up). */
  cpuLoad?: number;
  /** Per-block latency in milliseconds (host-reported + delay comp + OS). */
  latencyMs?: number;
  /** Real oversampling factor (Processor::getOversamplingFactor(), 1|2|4|8). */
  oversample?: number;
  /** Free-form user note (persisted "userNote"). */
  note?: string;
  /** CSV of hidden param-port ids (persisted "userHiddenParams"). */
  hiddenParams?: string;
  /** Persisted collapse tier (ValueTree "collapseTier"; Task 2.0). Host may
   *  still emit a legacy "collapsed" boolean from an old .els — see migration. */
  collapseTier?: "title" | "macro" | "expanded";
  /** Legacy boolean (pre-Wave-3). Read for back-compat migration only. */
  collapsed?: boolean;
  /** Transient node lifecycle state (loading-node contract; Phase 4 async load).
   *  Host emits "loading" while the real processor is instantiating, "ready"
   *  (or omits the key) once it has swapped in. ABSENT ⇒ "ready" (back-compat:
   *  every node that predates async-load decodes as ready). */
  loadState?: "loading" | "ready";
  /** Internal node identifier, e.g. "element.compare" (all blocks). */
  identifier?: string;
  /** Engine-truth integer mode for element.compare / element.logic only. */
  intMode?: number;
  ports?: Array<{
    id: string;
    label?: string;
    direction?: string;
    type?: string;
    signalType?: string;
  }>;
};

type EngineCable = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  signalType?: string;
  channelCount?: number;
  isSidechain?: boolean;
};

type EngineComment = {
  id: string;
  title?: string;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type EngineGraphRow = {
  id?: string;
  name?: string;
  index?: number;
  active?: boolean;
};

type AudioSetupPayload = {
  outputDeviceName?: string;
  inputDeviceName?: string;
  sampleRate?: number;
  bufferSize?: number;
  audioDeviceType?: string;
  deviceTypes?: string[];
  outputDevices?: string[];
  inputDevices?: string[];
  bufferSizes?: number[];
  sampleRates?: number[];
};

type MidiSetupPayload = {
  inputs?: Array<{ name?: string; identifier?: string; enabled?: boolean }>;
  outputs?: Array<{ name?: string; identifier?: string; isDefault?: boolean }>;
  defaultOutputId?: string;
};

type OscHostPayload = {
  enabled?: boolean;
  port?: number;
};

type MoleculeRow = { name?: string; description?: string };

type EngineSnapshot = {
  schema?: number;
  schemaVersion?: number;
  session?: {
    name?: string;
    tempo?: number;
    timeSigNumerator?: number;
    timeSigDenominator?: number;
    filePath?: string;
    dirty?: boolean;
    recentFiles?: string[];
    savedAtMs?: number;
  };
  graphs?: EngineGraphRow[];
  engine?: {
    deviceName?: string;
    sampleRate?: number;
    bufferSize?: number;
    isPlaying?: boolean;
    inputLatencySamples?: number;
    outputLatencySamples?: number;
  };
  perform?: {
    scenes?: Array<{
      id?: string;
      name?: string;
      index?: number;
      active?: boolean;
      hasCapture?: boolean;
    }>;
    activeSceneIndex?: number;
  };
  midiMapping?: {
    learning?: boolean;
    maps?: Array<{
      index?: number;
      deviceName?: string;
      controlName?: string;
      nodeName?: string;
      nodeId?: string;
      parameterIndex?: number;
      valid?: boolean;
    }>;
  };
  breadcrumbs?: string[];
  /** Present only when dived; names the nested Board the snapshot describes. */
  currentBoardId?: string;
  commentBoxes?: EngineComment[];
  blocks?: EngineBlock[];
  cables?: EngineCable[];
  audioSetup?: AudioSetupPayload;
  midiSetup?: MidiSetupPayload;
  oscHost?: OscHostPayload;
  molecules?: MoleculeRow[];
  canvas?: {
    snapToGrid?: boolean;
    gridSize?: number;
    viewport?: { x?: number; y?: number; zoom?: number };
    graphBounds?: {
      minX?: number;
      minY?: number;
      maxX?: number;
      maxY?: number;
    };
  };
  activeGraphOutline?: unknown[];
};

function inferCategory(b: EngineBlock): BlockCategory {
  if (b.isContainer) return "midifx";
  const name = b.name.toLowerCase();
  if (name.includes("midi")) return "midifx";
  // Split router: MIDI router → midifx; plain/audio router → audiofx (handled by default)
  if (name.includes("router") && name.includes("midi")) return "midifx";
  if (
    name.includes("lfo") ||
    name.includes("envelope") ||
    name.includes("modulat") ||
    name.includes("cv") ||
    name.includes("automation") ||
    name.includes("macro")
  )
    return "modulator";
  if (
    name.includes("synth") ||
    name.includes("sampler") ||
    name.includes("instrument") ||
    name.includes("osc") ||
    name.includes("generat") ||
    name.includes("input") ||
    name.includes("drum") ||
    name.includes("keys")
  )
    return "instrument";
  // output is a sink → audiofx (fixes pre-existing bug where "output" returned generator)
  return "audiofx";
}

function inferFormat(_b: EngineBlock): PluginFormat {
  return "INT";
}

function mapPorts(b: EngineBlock): Port[] {
  if (!b.ports?.length) return [];
  return b.ports.map((p) => {
    const st = p.signalType;
    const signalType: SignalType =
      st === "midi" || st === "value" ? st : "audio";
    return {
      id: p.id,
      type: signalType,
      direction: p.direction === "output" ? "output" : "input",
      label: p.label ?? p.id,
      connected: false,
    };
  });
}

function mapBlock(b: EngineBlock): BlockData {
  return {
    id: b.id,
    name: b.name,
    // Task 3.A — carry the catalog name only when it is a real, differing string
    // (defence-in-depth: the host already gates the emit on `!= name`, but a
    // legacy/odd snapshot must never surface a "Renamed from:" line equal to the
    // live name). `name` remains the single source for the displayed title.
    catalogName:
      typeof b.catalogName === "string" &&
      b.catalogName.length > 0 &&
      b.catalogName !== b.name
        ? b.catalogName
        : undefined,
    category: (b as any).category ?? inferCategory(b),
    format: typeof (b as any).format === "string" ? (b as any).format : inferFormat(b),
    position: { x: b.x ?? 0, y: b.y ?? 0 },
    ports: mapPorts(b),
    cpuLoad: typeof b.cpuLoad === "number" && b.cpuLoad >= 0 ? b.cpuLoad : 0,
    latencyMs:
      typeof b.latencyMs === "number" && b.latencyMs >= 0 ? b.latencyMs : 0,
    bypassed: !!b.bypassed,
    muted: !!b.muted,
    muteInput: !!b.muteInput,
    hostColor:
      typeof b.color === "string" && b.color.length > 0 ? b.color : undefined,
    oversample: typeof b.oversample === "number" ? b.oversample : 1,
    error: false,
    isMacroTagged: false,
    containerNodeCount: b.containerNodeCount,
    isPortal: false,
    note: typeof b.note === "string" ? b.note : undefined,
    // Hidden param-port ids: the host emits a CSV ("userHiddenParams"); split
    // into the array, trimming + dropping blanks so "" / "a,,b" hydrate cleanly
    // to [] / ["a","b"]. Empty → [] (all params visible — the default).
    hiddenParams:
      typeof b.hiddenParams === "string" && b.hiddenParams.length > 0
        ? b.hiddenParams
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [],
    // Collapse tier (Task 2.0). Prefer the new "collapseTier"; migrate a legacy
    // boolean snapshot (collapsed=true → "title", false → "macro"); default to
    // "macro" (lean) when neither is present. Mirrors the host read-path
    // coercion (defence-in-depth on BOTH read paths — critic CRITICAL-3).
    collapseTier:
      b.collapseTier === "title" ||
      b.collapseTier === "macro" ||
      b.collapseTier === "expanded"
        ? b.collapseTier
        : b.collapsed === true
          ? "title"
          : "macro",
    // Transient lifecycle (loading-node contract §1.2). ONLY the explicit
    // "loading" string flips it; anything else — including an absent key — is
    // "ready" (back-compat: every node that predates async-load is ready).
    loadState: b.loadState === "loading" ? "loading" : "ready",
    // Internal node identifier (all blocks) + engine-truth integer mode for
    // the built-in logic/comparator nodes. intMode is left undefined unless the
    // host actually emitted it (no fake value for non-logic blocks).
    identifier: typeof b.identifier === "string" ? b.identifier : undefined,
    intMode: typeof b.intMode === "number" ? b.intMode : undefined,
  };
}

function mapCable(c: EngineCable): CableData {
  const st = c.signalType;
  const signalType: SignalType = st === "midi" || st === "value" ? st : "audio";
  const ch = c.channelCount === 1 || c.channelCount === 6 ? c.channelCount : 2;
  return {
    id: c.id,
    source: c.source,
    sourcePort: c.sourceHandle ?? "out-0",
    target: c.target,
    targetPort: c.targetHandle ?? "in-0",
    signalType,
    channelCount: ch,
    isSidechain: !!c.isSidechain,
  };
}

function mapCommentBoxes(raw: EngineComment[]): CommentBoxData[] {
  return raw.map((c) => ({
    id: c.id,
    label: c.title ?? "",
    color: c.color ?? "#40808080",
    position: { x: c.x ?? 0, y: c.y ?? 0 },
    size: { width: c.width ?? 200, height: c.height ?? 150 },
  }));
}

function parseGraphOutline(raw: unknown): GraphOutlineNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    if (item == null || typeof item !== "object") {
      return { id: `o-${i}`, name: "" };
    }
    const o = item as Record<string, unknown>;
    return {
      id: String(o.id ?? `o-${i}`),
      name: String(o.name ?? ""),
      isContainer: !!o.isContainer,
      children: parseGraphOutline(o.children),
    };
  });
}

function applySnapshot(raw: unknown) {
  const s = raw as EngineSnapshot;
  if (s == null || typeof s !== "object") return;

  const blockList = Array.isArray(s.blocks) ? s.blocks : [];
  const cableList = Array.isArray(s.cables) ? s.cables : [];

  const comments = s.commentBoxes ? mapCommentBoxes(s.commentBoxes) : [];
  const breadcrumbs =
    s.breadcrumbs && s.breadcrumbs.length > 0 ? [...s.breadcrumbs] : undefined;
  // Present only when dived into a Container; the store coerces undefined → null.
  const currentBoardId =
    typeof s.currentBoardId === "string" && s.currentBoardId.length > 0
      ? s.currentBoardId
      : undefined;

  useGraphStore.getState().hydrateFromEngine({
    nodes: blockList.map(mapBlock),
    edges: cableList.map(mapCable),
    commentBoxes: comments,
    breadcrumbs,
    currentBoardId,
  });

  // Drop streamed parameter entries for nodes that no longer exist.
  useParameterStore.getState().pruneNodes(blockList.map((b) => b.id));

  const tempo =
    s.session?.tempo != null && !Number.isNaN(Number(s.session.tempo))
      ? Number(s.session.tempo)
      : undefined;
  const {
    sampleRate,
    bufferSize,
    deviceName,
    inputLatencySamples,
    outputLatencySamples,
  } = s.engine ?? {};
  const sampleRateLabel =
    typeof sampleRate === "number" && sampleRate > 0
      ? `${(sampleRate / 1000).toFixed(1)} kHz`
      : undefined;
  let latencyMs: number | undefined;
  if (
    typeof sampleRate === "number" &&
    sampleRate > 0 &&
    typeof inputLatencySamples === "number" &&
    typeof outputLatencySamples === "number"
  )
    latencyMs = Math.round(((inputLatencySamples + outputLatencySamples) / sampleRate) * 1000 * 10) / 10;

  const graphRows =
    s.graphs?.map((g, i) => ({
      id: String(g.id ?? `graph-${i}`),
      name: String(g.name ?? `Graph ${i + 1}`),
      index: typeof g.index === "number" ? g.index : i,
      active: !!g.active,
    })) ?? [];

  useSessionStore.getState().hydrateFromEngine({
    filePath:
      typeof s.session?.filePath === "string" ? s.session.filePath : undefined,
    dirty: typeof s.session?.dirty === "boolean" ? s.session.dirty : undefined,
    recentFiles: Array.isArray(s.session?.recentFiles)
      ? s.session.recentFiles
      : undefined,
    graphs: graphRows.length > 0 ? graphRows : undefined,
    savedAtMs:
      typeof s.session?.savedAtMs === "number"
        ? s.session.savedAtMs
        : undefined,
  });

  let scenesPayload: SceneData[] | undefined;
  if (s.perform?.scenes != null && s.perform.scenes.length > 0) {
    scenesPayload = s.perform.scenes.map((raw, i) => ({
      id: String(raw.id ?? `scene-${i}`),
      name: String(raw.name ?? `Scene ${i + 1}`),
      index: typeof raw.index === "number" ? raw.index : i,
      active: !!raw.active,
      hasCapture: !!raw.hasCapture,
    }));
  }

  usePerformStore.getState().hydrateFromEngine({
    sessionName:
      typeof s.session?.name === "string" && s.session.name.length > 0
        ? s.session.name
        : undefined,
    scenes: scenesPayload,
    activeSceneIndex: s.perform?.activeSceneIndex,
    bpm: tempo,
    buffer: typeof bufferSize === "number" ? bufferSize : undefined,
    clock: typeof deviceName === "string" ? deviceName : undefined,
    // `timecode` intentionally not written here — `useEngineSnapshotStore`
    // owns the transport timecode write-through (it polls ~4 Hz from
    // `elementGetEngineSnapshot.transportTimecode`). Previously this slot
    // mis-routed `sampleRateLabel` (e.g. "48.0 kHz") into `timecode`.
    sampleRateLabel,
    latencyMs,
    isPlaying:
      typeof s.engine?.isPlaying === "boolean" ? s.engine.isPlaying : undefined,
  });

  useHostExtrasStore.getState().hydrateFromSnapshot({
    audioSetup: s.audioSetup,
    midiSetup: s.midiSetup,
    oscHost: s.oscHost,
    molecules: s.molecules,
    canvas: s.canvas,
    midiMapping: s.midiMapping,
    activeGraphOutline: parseGraphOutline(
      Array.isArray(s.activeGraphOutline) ? s.activeGraphOutline : [],
    ),
  });

  if (typeof s.perform?.activeSceneIndex === "number")
    useAppStore.setState({ activeScene: s.perform.activeSceneIndex });

  useSessionStore.getState().markSessionLoaded();
}

export type ElementNativeHooks = {
  onGraphState?: (payload: unknown) => void;
  onMetering?: (peak: number) => void;
  /** Per-cable levels from host (~60 Hz); id matches graph snapshot cable ids.
   *  CV-sourced cables additionally carry `v` = the SIGNED last-rendered CV
   *  sample (flow-debug numeric readout) and `pk` = the block ABSOLUTE PEAK
   *  (A5 — activity gate; last-sample aliases on fast bipolar CV); other
   *  signal types omit both. */
  onCableLevels?: (items: Array<{ id: string; level: number; v?: number; pk?: number }>) => void;
  /** Per-NODE output levels from host (~60 Hz, Q-VU-PER-BLOCK); id = node UUID.
   *  Covers terminal/unconnected blocks the cable-derived path leaves idle. */
  onNodeLevels?: (items: Array<{ id: string; level: number }>) => void;
  /** Per-NODE PER-CHANNEL output levels from host (~60 Hz, G3-B item 2); id =
   *  node UUID, `ch` = one level per output lane. Feeds the BusInspector's
   *  per-lane surround/multi-channel VU columns. */
  onNodeChannelLevels?: (items: Array<{ id: string; ch: number[] }>) => void;
  /** Master output L/R + audio-input peak (~60 Hz, Q-VU-LR / Q-VU-INPUT). */
  onMasterLevels?: (payload: {
    outL?: number;
    outR?: number;
    input?: number;
  }) => void;
  /** Sandboxed (out-of-process) plugin lifecycle event (Lane-A R3). Fires only
   *  for sandboxed nodes; keyed by nodeUuid the React Block components use. */
  onSandboxEvent?: (payload: SandboxEventPayload) => void;
  /** Main log history (from host Log::Listener). */
  onLogHistory?: (lines: string[]) => void;
  /** ~15 Hz delta channel of changed AudioProcessorParameter values. */
  onParameterUpdate?: (deltas: ParameterDelta[]) => void;
  /**
   * Host pushes this whenever it tears down the embedded plugin editor —
   * from ANY path: the explicit close bridge (✕ / Esc / double-click toggle /
   * Float), a container dive/exit, or a node delete. The host's
   * `pluginEditorClose()` is the single teardown choke point and emits this
   * after clearing `pluginEmbedNodeUuid`, so the webview mirror
   * (`useAppStore.embeddedEditorNodeId`) can clear in lock-step. Without this,
   * host-initiated closes (dive/exit/delete) leave the mirror stale at the old
   * node id, so a later double-click on that Block takes the toggle's CLOSE
   * branch and dead-ends instead of re-opening. (P1-A reopen fix) */
  onEmbeddedEditorClosed?: () => void;
  /**
   * Host pushes this once the embedded plugin editor is actually MOUNTED and
   * ready (Wave-3 Phase 4 Task 4.2). It carries the node UUID that now owns the
   * embed. The webview uses it to finalise its mirror
   * (`useAppStore.embeddedEditorNodeId`) without the interim retry-poll backoff
   * that the synchronous-add era needed (the plugin's AudioProcessor used to be
   * absent for a few frames after the node appeared). Fired exactly once per
   * successful open, AFTER the editor exists. */
  onEmbeddedEditorReady?: (nodeId: string) => void;
};

declare global {
  interface Window {
    __elementNative?: ElementNativeHooks;
  }
}

export { invokeElementNative } from "../bridge/juceBackend";

// ── Cable-level rAF coalescing ──
//
// The host emits a FULL snapshot of every cable's level ~60Hz on
// `onCableLevels`. Forwarding each push straight to the store does a Zustand
// set() per host message; we instead keep only the LATEST snapshot and flush
// at most once per animation frame (session-drift perf plan Rank 1). The
// buffer is REPLACED (not accumulated) each call — every push is a complete
// snapshot, so an older buffered array would be stale.
let pendingCableLevels: Array<{ id: string; level: number; v?: number; pk?: number }> | null = null;
let cableLevelsRaf = 0;

function flushCableLevels(): void {
  cableLevelsRaf = 0;
  const items = pendingCableLevels;
  pendingCableLevels = null;
  if (items) useCableMeterStore.getState().setCableLevels(items);
}

function scheduleCableLevels(items: Array<{ id: string; level: number; v?: number; pk?: number }>): void {
  pendingCableLevels = items;
  if (cableLevelsRaf !== 0) return;
  if (typeof requestAnimationFrame === "function") {
    cableLevelsRaf = requestAnimationFrame(flushCableLevels);
  } else {
    // No rAF (non-browser host) — flush synchronously.
    flushCableLevels();
  }
}

function cancelCableLevels(): void {
  if (cableLevelsRaf !== 0 && typeof cancelAnimationFrame === "function")
    cancelAnimationFrame(cableLevelsRaf);
  cableLevelsRaf = 0;
  pendingCableLevels = null;
}

// ── Per-node-level rAF coalescing (Q-VU-PER-BLOCK) ──
//
// Identical discipline to the cable-level coalescing above: the host pushes a
// FULL snapshot of every node's output level ~60Hz on `onNodeLevels`; keep only
// the LATEST snapshot and flush at most once per animation frame. The buffer is
// REPLACED (not accumulated) — every push is a complete snapshot.
let pendingNodeLevels: Array<{ id: string; level: number }> | null = null;
let nodeLevelsRaf = 0;

function flushNodeLevels(): void {
  nodeLevelsRaf = 0;
  const items = pendingNodeLevels;
  pendingNodeLevels = null;
  if (items) useNodeMeterStore.getState().setNodeLevels(items);
}

function scheduleNodeLevels(items: Array<{ id: string; level: number }>): void {
  pendingNodeLevels = items;
  if (nodeLevelsRaf !== 0) return;
  if (typeof requestAnimationFrame === "function") {
    nodeLevelsRaf = requestAnimationFrame(flushNodeLevels);
  } else {
    flushNodeLevels();
  }
}

function cancelNodeLevels(): void {
  if (nodeLevelsRaf !== 0 && typeof cancelAnimationFrame === "function")
    cancelAnimationFrame(nodeLevelsRaf);
  nodeLevelsRaf = 0;
  pendingNodeLevels = null;
}

// ── Per-node-CHANNEL-level rAF coalescing (G3-B item 2) ──
//
// Identical discipline to the node-level coalescing above: the host pushes a
// FULL snapshot of every node's PER-CHANNEL output levels ~60Hz on
// `onNodeChannelLevels`; keep only the LATEST snapshot and flush at most once
// per animation frame. The buffer is REPLACED (not accumulated).
let pendingNodeChannelLevels: Array<{ id: string; ch: number[] }> | null = null;
let nodeChannelLevelsRaf = 0;

function flushNodeChannelLevels(): void {
  nodeChannelLevelsRaf = 0;
  const items = pendingNodeChannelLevels;
  pendingNodeChannelLevels = null;
  if (items) useNodeChannelMeterStore.getState().setNodeChannelLevels(items);
}

function scheduleNodeChannelLevels(
  items: Array<{ id: string; ch: number[] }>,
): void {
  pendingNodeChannelLevels = items;
  if (nodeChannelLevelsRaf !== 0) return;
  if (typeof requestAnimationFrame === "function") {
    nodeChannelLevelsRaf = requestAnimationFrame(flushNodeChannelLevels);
  } else {
    flushNodeChannelLevels();
  }
}

function cancelNodeChannelLevels(): void {
  if (nodeChannelLevelsRaf !== 0 && typeof cancelAnimationFrame === "function")
    cancelAnimationFrame(nodeChannelLevelsRaf);
  nodeChannelLevelsRaf = 0;
  pendingNodeChannelLevels = null;
}

/**
 * Wires `window.__elementNative` callbacks from Element's WebView host into Zustand.
 * Safe in pure Vite dev (no `__JUCE__`): keeps demo graph unless native state is requested.
 */
export function useJuceBridge() {
  useEffect(() => {
    const prev: ElementNativeHooks = { ...window.__elementNative };

    window.__elementNative = {
      ...prev,
      onGraphState: (payload: unknown) => {
        prev.onGraphState?.(payload);
        if (payload != null && typeof payload === "object")
          applySnapshot(payload);
        else if (typeof payload === "string") {
          try {
            applySnapshot(JSON.parse(payload));
          } catch (err) {
            logBridgeError("onGraphState.parse", err);
          }
        }
      },
      onMetering: (peak: number) => {
        prev.onMetering?.(peak);
        // US-002 Wave 2: do NOT derive CPU from peak. The real CPU value
        // is polled from `elementGetEngineSnapshot` via
        // `useEngineSnapshotStore`, which write-throughs the percentage
        // into `usePerformStore.liveHealth.cpu`. Keep the hook so future
        // consumers can latch onto the master peak meter explicitly.
        void peak;
      },
      onCableLevels: (items: Array<{ id: string; level: number }>) => {
        prev.onCableLevels?.(items);
        if (Array.isArray(items)) scheduleCableLevels(items);
      },
      onNodeLevels: (items: Array<{ id: string; level: number }>) => {
        prev.onNodeLevels?.(items);
        if (Array.isArray(items)) scheduleNodeLevels(items);
      },
      onNodeChannelLevels: (items: Array<{ id: string; ch: number[] }>) => {
        prev.onNodeChannelLevels?.(items);
        if (Array.isArray(items)) scheduleNodeChannelLevels(items);
      },
      onMasterLevels: (payload: {
        outL?: number;
        outR?: number;
        input?: number;
      }) => {
        prev.onMasterLevels?.(payload);
        if (payload != null && typeof payload === "object")
          usePerformStore.getState().setMasterLevels(payload);
      },
      onSandboxEvent: (payload: SandboxEventPayload) => {
        prev.onSandboxEvent?.(payload);
        if (payload != null && typeof payload === "object")
          useSandboxCrashStore.getState().applyEvent(payload);
      },
      onLogHistory: (lines: string[]) => {
        prev.onLogHistory?.(lines);
        if (Array.isArray(lines))
          useHostExtrasStore.getState().setLogLines(lines);
      },
      onParameterUpdate: (deltas: ParameterDelta[]) => {
        prev.onParameterUpdate?.(deltas);
        if (Array.isArray(deltas))
          useParameterStore.getState().applyDeltas(deltas);
      },
      onEmbeddedEditorClosed: () => {
        prev.onEmbeddedEditorClosed?.();
        // Host tore the embed down (any path) — clear the webview mirror so the
        // canvas double-click toggle + ✕ pill + Esc rung all agree "nothing is
        // embedded". Idempotent with the optimistic clear in
        // nativePluginEditorClose(). (P1-A reopen fix)
        useAppStore.getState().setEmbeddedEditorNodeId(null);
      },
      onEmbeddedEditorReady: (nodeId: string) => {
        prev.onEmbeddedEditorReady?.(nodeId);
        // Host confirmed the embedded editor is mounted (Phase 4 Task 4.2). Set
        // the mirror to this node so the double-click toggle + ✕ pill + Esc agree
        // an editor is open. Replaces the interim retry-poll backoff: the open
        // call is now single-shot and this push is the authoritative "it's open"
        // signal. Idempotent with the optimistic set in nativePluginEditorOpen().
        if (typeof nodeId === "string" && nodeId.length > 0)
          useAppStore.getState().setEmbeddedEditorNodeId(nodeId);
      },
    };

    void (async () => {
      try {
        const json = await invokeElementNative("elementGetGraphState", []);
        if (json !== undefined) {
          if (typeof json === "string") applySnapshot(JSON.parse(json));
          else applySnapshot(json);
        }
        await usePluginBrowserStore.getState().refresh();
      } catch (err) {
        // Note: in pure Vite dev with no `__JUCE__` bridge,
        // `invokeElementNative` resolves to `undefined` (not a throw), so
        // this catch only fires on a genuine bridge / parse failure. Log
        // it instead of swallowing — masks both dev-mode AND real
        // bridge failures (deep-review.md 8.15).
        logBridgeError("useJuceBridge.bootEffect", err);
      } finally {
        // T-P6-5: signal that the boot procedure has run to completion
        // regardless of outcome. Consumers gating startup loading UI
        // on `useAppStore.hostReady` will unblock now even when the
        // initial round-trip resolved to `undefined` (dev / pre-host).
        useAppStore.getState().markHostReady();
      }
    })();

    // US-002 Wave 2: start polling the engine snapshot at 4 Hz
    // (`elementGetEngineSnapshot`). Idempotent: subsequent calls with the
    // same interval are no-ops, so HMR / StrictMode double-mount is safe.
    useEngineSnapshotStore.getState().startPolling(250);

    // U11: start polling the live instance registry at 2 Hz
    // (`elementGetInstances`). Idempotent singleton like the engine poll above.
    useInstancesStore.getState().startListPolling(500);

    // D-1: PluginManager scan is async — list may still be empty at first
    // mount. Re-poll on a back-off until either (a) plugins arrive or
    // (b) we hit the bounded retry budget. This intentionally avoids adding
    // a new C++ push channel; the bridge `elementGetPluginList` is cheap.
    const pluginPollDelays = [1500, 3000, 5000, 8000, 12000]; // ms, total ~30s
    const pluginPollTimers: number[] = [];
    pluginPollDelays.forEach((delay) => {
      const id = window.setTimeout(() => {
        if (usePluginBrowserStore.getState().plugins.length === 0)
          void usePluginBrowserStore.getState().refresh();
      }, delay);
      pluginPollTimers.push(id);
    });

    // T-P6-1: Session-load → graph-populate race. The boot IIFE above may
    // resolve with `json === undefined` (host not yet ready) leaving the
    // graph empty. Mirror the plugin retry-poll: if `sessionLoaded` is
    // still false after each delay, re-issue `elementGetGraphState`.
    const sessionPollDelays = [500, 1500, 3000, 6000, 10000]; // ms
    const sessionPollTimers: number[] = [];
    sessionPollDelays.forEach((delay) => {
      const id = window.setTimeout(() => {
        if (useSessionStore.getState().sessionLoaded) return;
        void (async () => {
          try {
            const json = await invokeElementNative(
              "elementGetGraphState",
              [],
            );
            if (json === undefined) return;
            if (typeof json === "string") applySnapshot(JSON.parse(json));
            else applySnapshot(json);
          } catch (err) {
            logBridgeError("useJuceBridge.sessionRetryPoll", err);
          }
        })();
      }, delay);
      sessionPollTimers.push(id);
    });

    return () => {
      window.__elementNative = prev;
      pluginPollTimers.forEach((id) => window.clearTimeout(id));
      sessionPollTimers.forEach((id) => window.clearTimeout(id));
      cancelCableLevels();
      cancelNodeLevels();
      cancelNodeChannelLevels();
      // U11: stop the instance poll + close any open mirror on teardown.
      useInstancesStore.getState().stopListPolling();
      useInstancesStore.getState().setMirrorTarget(null);
    };
  }, []);

  // T-P6-4: re-fetch the full graph state whenever a consumer
  // increments `useAppStore.refreshNonce` (e.g. after `toggleMode`).
  // Skipping the initial render avoids a duplicate fetch on mount —
  // the boot effect above already handles first-load hydration.
  const refreshNonce = useAppStore((s) => s.refreshNonce);
  useEffect(() => {
    if (refreshNonce === 0) return;
    void (async () => {
      try {
        const json = await invokeElementNative("elementGetGraphState", []);
        if (json === undefined) return;
        if (typeof json === "string") applySnapshot(JSON.parse(json));
        else applySnapshot(json);
      } catch (err) {
        logBridgeError("useJuceBridge.refreshGraphState", err);
      }
    })();
  }, [refreshNonce]);
}
