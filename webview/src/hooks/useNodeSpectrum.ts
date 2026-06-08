import { useEffect, useRef, useState } from "react";
import {
  nativeGetNodeSpectrum,
  nativeSetNodeSpectrumWanted,
} from "../bridge/nativeNodeSpectrum";

/** Below this absolute delta a bin change is visually imperceptible. */
const BIN_EPSILON = 0.004;
/** Poll cadence — ~15Hz is plenty for a spectrum strip; halves bridge
 *  chatter vs the prior 30Hz setting and quarters it vs the 60Hz meter
 *  channel. Task 1.1 (Wave-3 perf).
 *  Exported for test assertions only — do not use outside this module. */
export const POLL_INTERVAL_MS = 66;

const EMPTY: number[] = [];

/** True when two magnitude arrays differ past epsilon on any bin (or length). */
function binsChanged(prev: number[], next: number[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; ++i) {
    if (Math.abs(prev[i] - next[i]) > BIN_EPSILON) return true;
  }
  return false;
}

/**
 * Live per-node FFT spectrum (G3-B item 1). While `active` is true and `nodeId`
 * is set, this subscribes the node's spectrum (so the audio thread starts
 * copying samples — zero cost otherwise) and polls the host ~15Hz for the
 * latest magnitude frame. On unmount or when `active` flips false it
 * unsubscribes so the audio thread stops computing for a node nobody is viewing.
 *
 * Returns the latest 0..1 magnitude bins, or an empty array when there is no
 * data (dev/no-bridge, silent node, no audio output, or not subscribed) — the
 * caller renders its honest "No spectrum" placeholder on `[]`. Never fabricates
 * bins. Re-render-safe: `setState` only fires when the bins change past epsilon.
 */
export function useNodeSpectrum(
  nodeId: string | undefined,
  active: boolean,
): number[] {
  const [bins, setBins] = useState<number[]>(EMPTY);
  // Latest bins kept in a ref so the poll loop can diff without re-subscribing.
  const binsRef = useRef<number[]>(EMPTY);

  useEffect(() => {
    if (!nodeId || !active) {
      // Inactive: ensure we are not holding stale bins on screen.
      if (binsRef.current.length > 0) {
        binsRef.current = EMPTY;
        setBins(EMPTY);
      }
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Subscribe so the host flips the opt-in flag (audio thread begins tapping).
    void nativeSetNodeSpectrumWanted(nodeId, true);

    const tick = async () => {
      if (stopped) return;
      const snap = await nativeGetNodeSpectrum(nodeId);
      if (stopped) return;
      const next = snap?.bins ?? EMPTY;
      if (binsChanged(binsRef.current, next)) {
        binsRef.current = next;
        setBins(next);
      }
      if (!stopped) timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };
    void tick();

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      // Unsubscribe so the audio thread stops computing for this node.
      void nativeSetNodeSpectrumWanted(nodeId, false);
      binsRef.current = EMPTY;
    };
  }, [nodeId, active]);

  return bins;
}
