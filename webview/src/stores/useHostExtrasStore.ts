import { create } from "zustand";

export type AudioSetupSnapshot = {
  outputDeviceName: string;
  inputDeviceName: string;
  sampleRate: number;
  bufferSize: number;
  audioDeviceType: string;
  deviceTypes: string[];
  outputDevices: string[];
  inputDevices: string[];
  bufferSizes: number[];
  sampleRates: number[];
};

export type OscHostSnapshot = {
  enabled: boolean;
  port: number;
};

/** One MIDI device row from the host snapshot (real CoreMIDI/ALSA/Win-MIDI device). */
export type MidiDeviceRow = {
  name: string;
  identifier: string;
  /** Inputs only: whether the device is currently enabled in MidiEngine. */
  enabled?: boolean;
  /** Outputs only: whether this is the default MIDI output. */
  isDefault?: boolean;
};

export type MidiSetupSnapshot = {
  inputs: MidiDeviceRow[];
  outputs: MidiDeviceRow[];
  defaultOutputId: string;
};

export type MoleculeRow = { name: string; description: string };

export type CanvasSnapshot = {
  snapToGrid: boolean;
  gridSize: number;
  viewport: { x: number; y: number; zoom: number };
  graphBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
};

export type MidiMapRow = {
  index: number;
  deviceName: string;
  controlName: string;
  nodeName: string;
  nodeId: string;
  parameterIndex: number;
  valid: boolean;
};

export type GraphOutlineNode = {
  id: string;
  name: string;
  isContainer?: boolean;
  children?: GraphOutlineNode[];
};

interface HostExtrasState {
  audioSetup: AudioSetupSnapshot | null;
  midiSetup: MidiSetupSnapshot | null;
  oscHost: OscHostSnapshot | null;
  molecules: MoleculeRow[];
  canvas: CanvasSnapshot;
  midiMapping: { learning: boolean; maps: MidiMapRow[] };
  activeGraphOutline: GraphOutlineNode[];
  logLines: string[];
  hydrateFromSnapshot: (data: {
    audioSetup?: Partial<AudioSetupSnapshot>;
    midiSetup?: {
      inputs?: Array<Partial<MidiDeviceRow> & { identifier?: string }>;
      outputs?: Array<Partial<MidiDeviceRow> & { identifier?: string }>;
      defaultOutputId?: string;
    };
    oscHost?: Partial<OscHostSnapshot>;
    molecules?: Array<{ name?: string; description?: string }>;
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
    midiMapping?: {
      learning?: boolean;
      maps?: Array<Partial<MidiMapRow> & { index?: number }>;
    };
    activeGraphOutline?: GraphOutlineNode[];
  }) => void;
  setLogLines: (lines: string[]) => void;
}

const defaultCanvas: CanvasSnapshot = {
  snapToGrid: false,
  gridSize: 8,
  viewport: { x: 0, y: 0, zoom: 1 },
  graphBounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
};

export const useHostExtrasStore = create<HostExtrasState>()((set) => ({
  audioSetup: null,
  midiSetup: null,
  oscHost: null,
  molecules: [],
  canvas: { ...defaultCanvas },
  midiMapping: { learning: false, maps: [] },
  activeGraphOutline: [],
  logLines: [],

  hydrateFromSnapshot: (data) =>
    set((s) => {
      const next: Partial<HostExtrasState> = {};
      if (data.audioSetup != null) {
        const a = data.audioSetup;
        const prev = s.audioSetup;
        next.audioSetup = {
          outputDeviceName: String(
            a.outputDeviceName ?? prev?.outputDeviceName ?? "",
          ),
          inputDeviceName: String(
            a.inputDeviceName ?? prev?.inputDeviceName ?? "",
          ),
          sampleRate: Number(a.sampleRate ?? prev?.sampleRate ?? 0),
          bufferSize: Number(a.bufferSize ?? prev?.bufferSize ?? 0),
          audioDeviceType: String(
            a.audioDeviceType ?? prev?.audioDeviceType ?? "",
          ),
          deviceTypes: Array.isArray(a.deviceTypes)
            ? a.deviceTypes.filter((x): x is string => typeof x === "string")
            : (prev?.deviceTypes ?? []),
          outputDevices: Array.isArray(a.outputDevices)
            ? a.outputDevices.filter((x): x is string => typeof x === "string")
            : (prev?.outputDevices ?? []),
          inputDevices: Array.isArray(a.inputDevices)
            ? a.inputDevices.filter((x): x is string => typeof x === "string")
            : (prev?.inputDevices ?? []),
          bufferSizes: Array.isArray(a.bufferSizes)
            ? a.bufferSizes.filter((x): x is number => typeof x === "number")
            : (prev?.bufferSizes ?? []),
          sampleRates: Array.isArray(a.sampleRates)
            ? a.sampleRates.filter((x): x is number => typeof x === "number")
            : (prev?.sampleRates ?? []),
        };
      }
      if (data.midiSetup != null) {
        const m = data.midiSetup;
        const prev = s.midiSetup;
        const sanitizeRows = (
          rows: Array<Partial<MidiDeviceRow> & { identifier?: string }> | undefined,
          fallback: MidiDeviceRow[],
        ): MidiDeviceRow[] =>
          Array.isArray(rows)
            ? rows
                .filter(
                  (r): r is Partial<MidiDeviceRow> & { identifier: string } =>
                    typeof r?.identifier === "string",
                )
                .map((r) => ({
                  name: String(r.name ?? ""),
                  identifier: String(r.identifier),
                  ...(typeof r.enabled === "boolean"
                    ? { enabled: r.enabled }
                    : {}),
                  ...(typeof r.isDefault === "boolean"
                    ? { isDefault: r.isDefault }
                    : {}),
                }))
            : fallback;
        next.midiSetup = {
          inputs: sanitizeRows(m.inputs, prev?.inputs ?? []),
          outputs: sanitizeRows(m.outputs, prev?.outputs ?? []),
          defaultOutputId: String(
            m.defaultOutputId ?? prev?.defaultOutputId ?? "",
          ),
        };
      }
      if (data.oscHost != null) {
        const o = data.oscHost;
        next.oscHost = {
          enabled:
            typeof o.enabled === "boolean"
              ? o.enabled
              : (s.oscHost?.enabled ?? false),
          port: typeof o.port === "number" ? o.port : (s.oscHost?.port ?? 9001),
        };
      }
      if (data.molecules != null) {
        next.molecules = data.molecules.map((m) => ({
          name: String(m.name ?? ""),
          description: String(m.description ?? ""),
        }));
      }
      if (data.canvas != null) {
        const c = data.canvas;
        const vp = c.viewport;
        const gb = c.graphBounds;
        next.canvas = {
          snapToGrid:
            typeof c.snapToGrid === "boolean"
              ? c.snapToGrid
              : s.canvas.snapToGrid,
          gridSize:
            typeof c.gridSize === "number" && c.gridSize > 0
              ? Math.round(c.gridSize)
              : s.canvas.gridSize,
          viewport: {
            x: typeof vp?.x === "number" ? vp.x : s.canvas.viewport.x,
            y: typeof vp?.y === "number" ? vp.y : s.canvas.viewport.y,
            zoom:
              typeof vp?.zoom === "number" && vp.zoom > 0
                ? vp.zoom
                : s.canvas.viewport.zoom,
          },
          graphBounds: {
            minX:
              typeof gb?.minX === "number"
                ? gb.minX
                : s.canvas.graphBounds.minX,
            minY:
              typeof gb?.minY === "number"
                ? gb.minY
                : s.canvas.graphBounds.minY,
            maxX:
              typeof gb?.maxX === "number"
                ? gb.maxX
                : s.canvas.graphBounds.maxX,
            maxY:
              typeof gb?.maxY === "number"
                ? gb.maxY
                : s.canvas.graphBounds.maxY,
          },
        };
      }
      if (data.midiMapping != null) {
        const mm = data.midiMapping;
        const mapsRaw = Array.isArray(mm.maps) ? mm.maps : [];
        const maps: MidiMapRow[] = mapsRaw.map((m, i) => ({
          index: typeof m.index === "number" ? m.index : i,
          deviceName: String(m.deviceName ?? ""),
          controlName: String(m.controlName ?? ""),
          nodeName: String(m.nodeName ?? ""),
          nodeId: String(m.nodeId ?? ""),
          parameterIndex:
            typeof m.parameterIndex === "number" ? m.parameterIndex : -1,
          valid: m.valid !== false,
        }));
        next.midiMapping = {
          learning:
            typeof mm.learning === "boolean"
              ? mm.learning
              : s.midiMapping.learning,
          maps,
        };
      }
      if (data.activeGraphOutline != null)
        next.activeGraphOutline = data.activeGraphOutline;
      return next;
    }),

  setLogLines: (lines) => set({ logLines: [...lines] }),
}));
