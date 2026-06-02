// G3-B item 1 — per-node FFT spectrum bridge wrapper.
//
// Calls the C++ `elementGetNodeSpectrum` / `elementSetNodeSpectrumWanted`
// handlers registered in `src/ui/element_webview_host.cpp`. The host returns
// REAL magnitude bins computed by a juce::dsp::FFT run on the node's output
// samples (transported via a lock-free SPSC FIFO). NOTHING fake: when no
// consumer is subscribed, the node is silent, has no audio output, or not
// enough samples have accumulated, the host returns null and we surface null so
// the caller renders its honest "No spectrum" placeholder.
import { invokeElementNative } from "./juceBackend";
import { logBridgeError } from "./bridgeError";

export interface NodeSpectrum {
  /** Normalised 0..1 magnitude bins (length = fftSize/2). */
  bins: number[];
  /** FFT size used by the analyser (e.g. 2048). */
  fftSize: number;
  /** Sample rate the analyser is running at, in Hz. */
  sampleRate: number;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function toBins(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = new Array(v.length);
  for (let i = 0; i < v.length; ++i) out[i] = num(v[i], 0);
  return out;
}

/**
 * Fetch the latest spectrum frame for a node by UUID. Polling == subscribing:
 * the host flips the node's opt-in flag on the first call so the audio thread
 * begins copying samples into the analyser. Returns `null` in pure dev (no
 * `__JUCE__` bridge), when the host has no frame yet, or on a real failure —
 * the caller treats null as the honest "no spectrum" state.
 */
export async function nativeGetNodeSpectrum(
  uuid: string,
): Promise<NodeSpectrum | null> {
  let raw: unknown;
  try {
    raw = await invokeElementNative("elementGetNodeSpectrum", [uuid]);
  } catch (err) {
    logBridgeError("nativeGetNodeSpectrum.invoke", err);
    return null;
  }
  // `raw == null` is the dev-mode no-bridge fallback AND the host's honest
  // "no frame / not subscribed / no analyser" reply — NOT a silent failure.
  if (raw == null) return null;

  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      logBridgeError("nativeGetNodeSpectrum.parse", err);
      return null;
    }
  } else if (typeof raw === "object") {
    parsed = raw as Record<string, unknown>;
  }
  if (parsed == null) return null;

  const bins = toBins(parsed.bins);
  // Empty bins → honest no-data; let the caller fall back to the placeholder.
  if (bins.length === 0) return null;

  return {
    bins,
    fftSize: num(parsed.fftSize),
    sampleRate: num(parsed.sampleRate),
  };
}

/**
 * Subscribe / unsubscribe a node's FFT spectrum. Call with `wanted=false` on
 * unmount so the audio thread stops computing for a node nobody is viewing
 * (zero idle cost). Resolves to `true` when the host applied the flag.
 */
export async function nativeSetNodeSpectrumWanted(
  uuid: string,
  wanted: boolean,
): Promise<boolean> {
  try {
    const r = await invokeElementNative("elementSetNodeSpectrumWanted", [
      uuid,
      wanted,
    ]);
    return r === true;
  } catch (err) {
    logBridgeError("nativeSetNodeSpectrumWanted.invoke", err);
    return false;
  }
}
