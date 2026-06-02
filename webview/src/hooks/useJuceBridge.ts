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

type EngineBlock = {
  id: string;
  name: string;
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
    note:
      typeof (b as { note?: unknown }).note === "string"
        ? ((b as { note?: string }).note as string)
        : undefined,
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

  useGraphStore.getState().hydrateFromEngine({
    nodes: blockList.map(mapBlock),
    edges: cableList.map(mapCable),
    commentBoxes: comments,
    breadcrumbs,
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
  /** Per-cable levels from host (~60 Hz); id matches graph snapshot cable ids. */
  onCableLevels?: (items: Array<{ id: string; level: number }>) => void;
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
let pendingCableLevels: Array<{ id: string; level: number }> | null = null;
let cableLevelsRaf = 0;

function flushCableLevels(): void {
  cableLevelsRaf = 0;
  const items = pendingCableLevels;
  pendingCableLevels = null;
  if (items) useCableMeterStore.getState().setCableLevels(items);
}

function scheduleCableLevels(items: Array<{ id: string; level: number }>): void {
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
