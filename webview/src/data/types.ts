export type SignalType = "audio" | "midi" | "value";
export type BlockCategory = "generator" | "modifier" | "logic";
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
  name: string;
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
  error: boolean;
  isMacroTagged: boolean;
  /** Number of child nodes inside a Container block */
  containerNodeCount?: number;
  isPortal?: boolean;
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
