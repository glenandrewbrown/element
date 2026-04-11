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
import { useGraphStore } from "../stores/useGraphStore";
import { usePerformStore } from "../stores/usePerformStore";
import { usePluginBrowserStore } from "../stores/usePluginBrowserStore";
import { useSessionStore } from "../stores/useSessionStore";
import { useCableMeterStore } from "../stores/useCableMeterStore";
import {
  useHostExtrasStore,
  type GraphOutlineNode,
} from "../stores/useHostExtrasStore";
import { useAppStore } from "../stores/useAppStore";

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
  if (b.isContainer) return "logic";
  const name = b.name.toLowerCase();
  if (name.includes("midi") || name.includes("router")) return "logic";
  if (
    name.includes("input") ||
    name.includes("osc") ||
    name.includes("generator")
  )
    return "generator";
  return "modifier";
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
    category: inferCategory(b),
    format: inferFormat(b),
    position: { x: b.x ?? 0, y: b.y ?? 0 },
    ports: mapPorts(b),
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: !!b.bypassed,
    muted: !!b.muted,
    muteInput: !!b.muteInput,
    hostColor:
      typeof b.color === "string" && b.color.length > 0 ? b.color : undefined,
    error: false,
    isMacroTagged: false,
    containerNodeCount: b.containerNodeCount,
    isPortal: false,
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
    latencyMs =
      ((inputLatencySamples + outputLatencySamples) / sampleRate) * 1000;

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
    timecode: sampleRateLabel,
    sampleRateLabel,
    latencyMs,
  });

  useHostExtrasStore.getState().hydrateFromSnapshot({
    audioSetup: s.audioSetup,
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
}

export type ElementNativeHooks = {
  onGraphState?: (payload: unknown) => void;
  onMetering?: (peak: number) => void;
  /** Per-cable levels from host (~60 Hz); id matches graph snapshot cable ids. */
  onCableLevels?: (items: Array<{ id: string; level: number }>) => void;
  /** Main log history (from host Log::Listener). */
  onLogHistory?: (lines: string[]) => void;
};

declare global {
  interface Window {
    __elementNative?: ElementNativeHooks;
  }
}

export { invokeElementNative } from "../bridge/juceBackend";

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
          } catch {
            /* ignore malformed */
          }
        }
      },
      onMetering: (peak: number) => {
        prev.onMetering?.(peak);
        const cpu = Math.min(99.9, Math.max(0, peak * 320));
        usePerformStore.setState((st) => ({
          liveHealth: { ...st.liveHealth, cpu },
        }));
      },
      onCableLevels: (items: Array<{ id: string; level: number }>) => {
        prev.onCableLevels?.(items);
        if (Array.isArray(items))
          useCableMeterStore.getState().setCableLevels(items);
      },
      onLogHistory: (lines: string[]) => {
        prev.onLogHistory?.(lines);
        if (Array.isArray(lines))
          useHostExtrasStore.getState().setLogLines(lines);
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
      } catch {
        /* Embedded web dev without native bridge */
      }
    })();

    return () => {
      window.__elementNative = prev;
    };
  }, []);
}
