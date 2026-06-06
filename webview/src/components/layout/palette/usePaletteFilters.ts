import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePluginBrowserStore } from "../../../stores/usePluginBrowserStore";
import type { BlockCategory } from "../../../data/types";

export interface PluginEntry {
  id: string;
  name: string;
  category: BlockCategory;
  format: string;
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
  const favoriteIds = usePluginBrowserStore(useShallow((s) => s.favoriteIdentifiers));
  const recentPluginIds = usePluginBrowserStore(useShallow((s) => s.recentIdentifiers));

  const plugins = useMemo(
    (): PluginEntry[] =>
      nativePlugins.map((p) => ({
        id: p.identifier,
        name: p.name,
        category: p.blockCategory,
        format: p.format,
      })),
    [nativePlugins],
  );

  const favPlugins = useMemo(() => {
    if (favoriteIds.size === 0) return [];
    return nativePlugins.filter((p) => favoriteIds.has(p.identifier));
  }, [nativePlugins, favoriteIds]);

  const recentPlugins = useMemo(() => {
    if (recentPluginIds.length === 0) return [];
    const map = new Map(nativePlugins.map((p) => [p.identifier, p] as const));
    return recentPluginIds
      .map((id) => map.get(id))
      .filter((p): p is (typeof nativePlugins)[0] => p != null);
  }, [nativePlugins, recentPluginIds]);

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
