import { create } from "zustand";
import { invokeElementNative } from "../bridge/juceBackend";
import type { BlockCategory } from "../data/types";

export type BrowserPlugin = {
  identifier: string;
  name: string;
  manufacturer: string;
  format: string;
  category: string;
  /** Inferred for UI chrome */
  blockCategory: BlockCategory;
};

function inferBlockCategory(raw: string): BlockCategory {
  const u = raw.toLowerCase();
  if (
    u.includes("midi") ||
    u.includes("sequen") ||
    u.includes("utility") ||
    u.includes("analysis")
  )
    return "logic";
  if (
    u.includes("generat") ||
    u.includes("instrument") ||
    u.includes("synth") ||
    u.includes("ampler")
  )
    return "generator";
  return "modifier";
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
      if (raw == null) return;
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
          }>
        | undefined;
      if (!Array.isArray(list)) return;
      const plugins: BrowserPlugin[] = list
        .filter((p) => p.identifier)
        .map((p) => {
          const category = String(p.category ?? "Uncategorised");
          return {
            identifier: String(p.identifier),
            name: String(p.descriptiveName || p.name || p.identifier),
            manufacturer: String(p.manufacturer ?? ""),
            format: String(p.format ?? ""),
            category,
            blockCategory: inferBlockCategory(category),
          };
        });
      set({ plugins, favoriteIdentifiers: fav, recentIdentifiers: recent });
    } catch (err) {
      // Dev / no bridge — but surface errors when the bridge IS present.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[usePluginBrowserStore.refresh] failed:", err);
      }
    }
  },
}));
