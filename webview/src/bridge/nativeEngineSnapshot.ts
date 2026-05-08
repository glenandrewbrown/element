// US-002 / Wave 2 — engine status snapshot bridge wrapper.
//
// Calls the C++ `elementGetEngineSnapshot` handler registered in
// `src/ui/element_webview_host.cpp`. The C++ side returns a JSON string
// (see the handler comment block in element_webview_host.cpp for the schema).
// We parse it here and expose a typed result so consumers do not have to
// re-validate the payload shape.
import { invokeElementNative } from "./juceBackend";

export interface EngineSnapshot {
  /** Audio-thread CPU usage as a fraction 0..1 (multiply by 100 for %). */
  cpu: number;
  /** True when an audio device is currently open. */
  engineRunning: boolean;
  /** Sample rate in Hz (0 when no device). */
  sampleRate: number;
  /** Buffer size in samples (0 when no device). */
  bufferSize: number;
  /** Current audio device name ("" when no device). */
  deviceName: string;
  /** Round-trip latency components in milliseconds (0 when no device). */
  deviceLatencyInputMs: number;
  deviceLatencyOutputMs: number;
  /** Transport state mirrored from `Transport::Monitor`. */
  transportPlaying: boolean;
  transportRecording: boolean;
  tempoBpm: number;
  /** Time signature [numerator, denominator]. */
  timeSig: [number, number];
  /** Lossless playhead position in audio frames (samples). */
  transportFrame: number;
  /** Display-ready BBT string from `Monitor::getBarsAndBeats`, 1-indexed
   *  ("1.1.0" = top of bar 1). Engine returns "1.1.0" when no transport. */
  transportTimecode: string;
}

export const DEFAULT_ENGINE_SNAPSHOT: EngineSnapshot = {
  cpu: 0,
  engineRunning: false,
  sampleRate: 0,
  bufferSize: 0,
  deviceName: "",
  deviceLatencyInputMs: 0,
  deviceLatencyOutputMs: 0,
  transportPlaying: false,
  transportRecording: false,
  tempoBpm: 120,
  timeSig: [4, 4],
  transportFrame: 0,
  transportTimecode: "1.1.0",
};

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Fetch an engine snapshot from the host. Returns `null` in pure dev
 * (no `__JUCE__` bridge) so the caller can fall back to existing demo data.
 */
export async function nativeGetEngineSnapshot(): Promise<EngineSnapshot | null> {
  let raw: unknown;
  try {
    raw = await invokeElementNative("elementGetEngineSnapshot", []);
  } catch {
    return null;
  }
  if (raw == null) return null;
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === "object") {
    parsed = raw as Record<string, unknown>;
  }
  if (parsed == null) return null;

  const tsRaw = parsed.timeSig;
  let timeSig: [number, number] = [4, 4];
  if (Array.isArray(tsRaw) && tsRaw.length >= 2)
    timeSig = [num(tsRaw[0], 4), num(tsRaw[1], 4)];

  const tcRaw = parsed.transportTimecode;
  const transportTimecode =
    typeof tcRaw === "string" && tcRaw.length > 0 ? tcRaw : "1.1.0";

  return {
    cpu: num(parsed.cpu),
    engineRunning: bool(parsed.engineRunning),
    sampleRate: num(parsed.sampleRate),
    bufferSize: num(parsed.bufferSize),
    deviceName: str(parsed.deviceName),
    deviceLatencyInputMs: num(parsed.deviceLatencyInputMs),
    deviceLatencyOutputMs: num(parsed.deviceLatencyOutputMs),
    transportPlaying: bool(parsed.transportPlaying),
    transportRecording: bool(parsed.transportRecording),
    tempoBpm: num(parsed.tempoBpm, 120),
    timeSig,
    transportFrame: num(parsed.transportFrame),
    transportTimecode,
  };
}
