import { create } from "zustand";
import { invokeElementNative } from "../bridge/juceBackend";
import { logBridgeError } from "../bridge/bridgeError";
import { nativeToggleFavorite } from "../bridge/nativeGraph";
import type { BlockCategory, SignalType } from "../data/types";

/**
 * N2 / Decision D-1 — one format variant of a plugin family. The host emits a
 * structured array (never a concatenated string) so the "also available as AU"
 * reveal can insert using the variant's REAL identifier.
 */
export type PluginVariant = {
  /** juce pluginFormatName: "VST3" | "AudioUnit" | "CLAP" | "VST" | "LV2" | … */
  format: string;
  /** The variant's exact PluginDescription identifier (createIdentifierString). */
  identifier: string;
};

export type BrowserPlugin = {
  identifier: string;
  /**
   * The plugin/node's real NAME — the row TITLE (e.g. "MIDI Output Device",
   * "Audio Mixer"). N1 fix: internal Element nodes set `descriptiveName` to a
   * sentence DESCRIPTION ("Sends MIDI to a hardware…"); that must NEVER be the
   * title. We bind `name` here and surface the description separately.
   */
  name: string;
  /**
   * Secondary, human description (juce PluginDescription.descriptiveName).
   * Subtitle / tooltip only — never the row title. Empty string when none /
   * same as the name. The store always populates it from the live snapshot.
   */
  description: string;
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
  /**
   * Real persisted use-count from PluginUsageTracker, AGGREGATED across the
   * family's aliases by the host (N2). 0 if never used / absent.
   */
  usageCount: number;

  // ── N2 / D-1 alias-aware group fields (precomputed native-side) ────────────
  // The store ALWAYS populates these (deriving a single-variant group when an
  // older host omits them — see refresh()), so they are part of the row
  // contract the QuickAdd / palette consumers read directly.
  /**
   * All variant identifiers in this plugin family (incl. this primary row's own
   * id). Length 1 for a solitary plugin. The reveal affordance lists the
   * non-primary entries; Favourites/Recents membership is decided on the GROUP
   * so a starred/recent AU is never orphaned when its VST3 primary is shown.
   */
  aliases: string[];
  /** Structured {format, identifier} per variant, primary-first. */
  variants: PluginVariant[];
  /** True when ANY alias is starred (star an AU ⇒ the family stays favourited). */
  isFavorite: boolean;
  /** Best (lowest) Recents rank across aliases, or -1 when no alias is recent. */
  recentRank: number;
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
  /**
   * I4-B — toggle a plugin's persistent favourite status (does NOT insert a
   * Block). Optimistically flips the id in `favoriteIdentifiers` for instant UI
   * feedback, then calls the native bridge which persists it on the
   * PluginUsageTracker. The optimistic state reconciles to the host's truth on
   * the next `refresh()` (the favourite set is re-read from the snapshot).
   */
  toggleFavorite: (identifier: string) => void;
}

export const usePluginBrowserStore = create<PluginBrowserState>()((set) => ({
  plugins: [],
  favoriteIdentifiers: new Set(),
  recentIdentifiers: [],

  toggleFavorite: (identifier: string) => {
    if (!identifier) return;
    // Optimistic flip — new Set so subscribers re-render (Zustand uses
    // reference equality). Reconciles to the persisted snapshot on next refresh.
    set((state) => {
      const next = new Set(state.favoriteIdentifiers);
      if (next.has(identifier)) next.delete(identifier);
      else next.add(identifier);
      return { favoriteIdentifiers: next };
    });
    void nativeToggleFavorite(identifier);
  },

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
            aliases?: unknown[];
            variants?: unknown[];
            isFavorite?: boolean;
            recentRank?: number;
          }>
        | undefined;
      if (!Array.isArray(list)) return;
      const plugins: BrowserPlugin[] = list
        .filter((p) => p.identifier)
        .map((p) => {
          const identifier = String(p.identifier);
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
          const format = String(p.format ?? "");

          // N2 group fields. An older host build that predates the grouping
          // emits no aliases/variants → derive an honest single-variant group
          // from this row, and decide favourite/recent from the id-keyed sets
          // (the legacy behaviour) so nothing silently breaks.
          const aliases: string[] = Array.isArray(p.aliases)
            ? p.aliases.filter((x): x is string => typeof x === "string")
            : [identifier];
          const variants: PluginVariant[] = Array.isArray(p.variants)
            ? p.variants
                .map((v) =>
                  v && typeof v === "object"
                    ? {
                        format: String((v as { format?: unknown }).format ?? ""),
                        identifier: String(
                          (v as { identifier?: unknown }).identifier ?? "",
                        ),
                      }
                    : null,
                )
                .filter(
                  (v): v is PluginVariant => v != null && v.identifier !== "",
                )
            : [{ format, identifier }];
          const isFavorite =
            typeof p.isFavorite === "boolean"
              ? p.isFavorite
              : aliases.some((id) => fav.has(id));
          const recentRank =
            typeof p.recentRank === "number"
              ? p.recentRank
              : aliases.reduce((best, id) => {
                  const r = recent.indexOf(id);
                  if (r < 0) return best;
                  return best < 0 || r < best ? r : best;
                }, -1);

          // N1 fix: the row TITLE is the real NAME. Internal nodes put a
          // sentence description in `descriptiveName`, so preferring it (the old
          // behaviour) leaked "Sends MIDI to a hardware…" as the title. Prefer
          // `name`; the description ships as the separate secondary field.
          const realName = String(p.name || p.descriptiveName || identifier);
          const descriptiveName = String(p.descriptiveName ?? "");
          const description =
            descriptiveName && descriptiveName !== realName ? descriptiveName : "";

          return {
            identifier,
            name: realName,
            description,
            manufacturer: String(p.manufacturer ?? ""),
            format,
            category,
            blockCategory,
            signalOut,
            usageCount: typeof p.usageCount === "number" ? p.usageCount : 0,
            aliases,
            variants,
            isFavorite,
            recentRank,
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
