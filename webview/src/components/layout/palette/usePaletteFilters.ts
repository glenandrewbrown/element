import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePluginBrowserStore } from "../../../stores/usePluginBrowserStore";
import type { PluginVariant } from "../../../stores/usePluginBrowserStore";
import type { BlockCategory } from "../../../data/types";

export interface PluginEntry {
  id: string;
  name: string;
  /** N1 — secondary human description (subtitle/tooltip only, never the title). */
  description: string;
  category: BlockCategory;
  format: string;
  /**
   * N2 — every format variant of this plugin family (primary-first). Length 1
   * for a solitary plugin. The "also available as AU" reveal lists the
   * non-primary entries; selecting one inserts with that variant's REAL id.
   */
  variants: PluginVariant[];
}

/**
 * Extracts and memoises the three plugin filter views used by ToolPalette:
 * - `plugins`        — full flat list mapped from the store
 * - `favPlugins`     — raw BrowserPlugin[] for the Favourites section
 * - `recentPlugins`  — raw BrowserPlugin[] for the Recents section (ordered)
 * - `filtered`       — plugins after applying `search` + `activeCategory`
 *
 * Extracted here so the heavy memo work lives outside the render function
 * and can be unit-tested in isolation.
 */
export function usePaletteFilters(
  search: string,
  activeCategory: BlockCategory | null,
) {
  const nativePlugins = usePluginBrowserStore(useShallow((s) => s.plugins));

  const plugins = useMemo(
    (): PluginEntry[] =>
      nativePlugins.map((p) => ({
        id: p.identifier,
        name: p.name,
        description: p.description ?? "",
        category: p.blockCategory,
        format: p.format,
        variants: p.variants ?? [{ format: p.format, identifier: p.identifier }],
      })),
    [nativePlugins],
  );

  // N2 — Favourites/Recents membership is decided on the GROUP (BrowserPlugin
  // carries the host-precomputed `isFavorite` / `recentRank` aggregated across
  // the family's aliases). So starring an AU keeps its VST3-primary family in
  // Favourites, and a recently-used AU surfaces the family in Recents — neither
  // is orphaned by the dedupe. We operate on the rows themselves, not the raw
  // id-keyed sets.
  const favPlugins = useMemo(
    () => nativePlugins.filter((p) => p.isFavorite),
    [nativePlugins],
  );

  const recentPlugins = useMemo(() => {
    return nativePlugins
      .filter((p) => p.recentRank >= 0)
      .sort((a, b) => a.recentRank - b.recentRank);
  }, [nativePlugins]);

  // Set of PRIMARY-row identifiers whose group is favourited — so the per-card
  // star glyph (consumed via `favoriteIds.has(entry.id)`) lights up the shown
  // VST3 row when its AU alias is the one actually starred (N2 — no orphaning).
  const favoriteIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of nativePlugins) if (p.isFavorite) s.add(p.identifier);
    return s;
  }, [nativePlugins]);

  const filtered = useMemo(
    () =>
      plugins.filter((p) => {
        if (activeCategory && p.category !== activeCategory) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q))
            return false;
        }
        return true;
      }),
    [plugins, activeCategory, search],
  );

  return { plugins, favPlugins, recentPlugins, filtered, favoriteIds };
}
