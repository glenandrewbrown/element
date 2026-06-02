import { create } from "zustand";
import { invokeElementNative } from "../bridge/juceBackend";
import { logBridgeError } from "../bridge/bridgeError";
import type { BlockCategory, SignalType } from "../data/types";

export type BrowserPlugin = {
  identifier: string;
  name: string;
  manufacturer: string;
  format: string;
  category: string;
  /** Inferred for UI chrome */
  blockCategory: BlockCategory;
  /**
   * Signal type the plugin emits, from the REAL juce::PluginDescription fields
   * (isInstrument / numOutputChannels / category) sent by C++. When an older
   * host build omits it, this is derived from blockCategory as an honest
   * fallback (see categorySignalFallback).
   */
  signalOut: SignalType;
  /** Real persisted use-count from PluginUsageTracker (0 if never used / absent). */
  usageCount: number;
};

/**
 * Honest fallback when the host build predates the per-plugin signalOut field:
 * derive the signal type from the inferred block category. This is the same
 * coarse mapping QuickAdd used before real data existed — labelled, not faked.
 */
function categorySignalFallback(c: BlockCategory): SignalType {
  switch (c) {
    case "midifx":
      return "midi";
    case "modulator":
      return "value";
    case "instrument":
    case "audiofx":
    default:
      return "audio";
  }
}

function inferBlockCategory(raw: string): BlockCategory {
  const u = raw.toLowerCase();
  if (
    u.includes("midi") ||
    u.includes("sequen") ||
    u.includes("arp") ||
    u.includes("chord")
  )
    return "midifx";
  if (
    u.includes("lfo") ||
    u.includes("modulat") ||
    u.includes("envelope") ||
    u.includes("utility") ||
    u.includes("analy")
  )
    return "modulator";
  if (
    u.includes("generat") ||
    u.includes("instrument") ||
    u.includes("synth") ||
    u.includes("ampler")
  )
    return "instrument";
  return "audiofx";
}

interface PluginBrowserState {
  plugins: BrowserPlugin[];
  favoriteIdentifiers: Set<string>;
  recentIdentifiers: string[];
  refresh: () => Promise<void>;
}

export const usePluginBrowserStore = create<PluginBrowserState>()((set) => ({
  plugins: [],
  favoriteIdentifiers: new Set(),
  recentIdentifiers: [],

  refresh: async () => {
    try {
      const raw = await invokeElementNative("elementGetPluginList", []);
      if (import.meta.env.DEV) {
        // Dev observability for D-1 — surfaces shape/empty-list mismatches in
        // the browser console without breaking the embedded WebView host.
        // eslint-disable-next-line no-console
        console.debug("[usePluginBrowserStore.refresh] raw payload:", raw);
      }
      // deep-review.md 4.4 — distinguish "scan complete with 0 plugins"
      // from "bridge unavailable". `raw == null` means no bridge response
      // at all (dev mode or pre-scan); not a parse error, but worth a
      // breadcrumb for the D-1 retry-poll diagnostics.
      if (raw == null) {
        logBridgeError("usePluginBrowserStore.refresh", "bridge returned null");
        return;
      }
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const favRaw = parsed?.favoriteIdentifiers as unknown[] | undefined;
      const recRaw = parsed?.recentIdentifiers as unknown[] | undefined;
      const fav = new Set<string>();
      if (Array.isArray(favRaw))
        for (const x of favRaw)
          if (typeof x === "string") fav.add(x);
      const recent: string[] = [];
      if (Array.isArray(recRaw))
        for (const x of recRaw)
          if (typeof x === "string") recent.push(x);
      const list = parsed?.plugins as
        | Array<{
            identifier?: string;
            name?: string;
            descriptiveName?: string;
            manufacturer?: string;
            format?: string;
            category?: string;
            signalOut?: string;
            isInstrument?: boolean;
            numInputChannels?: number;
            numOutputChannels?: number;
            usageCount?: number;
          }>
        | undefined;
      if (!Array.isArray(list)) return;
      const plugins: BrowserPlugin[] = list
        .filter((p) => p.identifier)
        .map((p) => {
          const category = String(p.category ?? "Uncategorised");
          const blockCategory = inferBlockCategory(category);
          // Prefer the REAL per-plugin signal from C++; fall back to the
          // category-derived signal only when the host build omits it.
          const signalOut: SignalType =
            p.signalOut === "audio" ||
            p.signalOut === "midi" ||
            p.signalOut === "value"
              ? p.signalOut
              : categorySignalFallback(blockCategory);
          return {
            identifier: String(p.identifier),
            name: String(p.descriptiveName || p.name || p.identifier),
            manufacturer: String(p.manufacturer ?? ""),
            format: String(p.format ?? ""),
            category,
            blockCategory,
            signalOut,
            usageCount: typeof p.usageCount === "number" ? p.usageCount : 0,
          };
        });
      set({ plugins, favoriteIdentifiers: fav, recentIdentifiers: recent });
    } catch (err) {
      // Replaces an ad-hoc `if (import.meta.env.DEV)` warn block; the helper
      // surfaces bridge errors uniformly across the webview (deep-review 8.16).
      logBridgeError("usePluginBrowserStore.refresh", err);
    }
  },
}));
