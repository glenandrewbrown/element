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
 * Facet toggles applied ON TOP of the search + category filter. These replace
 * the old above-the-fold Favourites/Recents *sections* with one-tap facet
 * CHIPS over the single primary list (search-first IA, Task 3.D):
 *   - `favouritesOnly` — restrict the list to favourited GROUPS (group-aware,
 *     so a starred AU keeps its VST3-primary family — see `isFavorite` below).
 *   - `recentSort`     — sort the list most-recently-used first (Bitwig's
 *     default sort); non-recent rows fall to the bottom in stable order.
 */
export interface PaletteFacets {
  favouritesOnly: boolean;
  recentSort: boolean;
}

const NO_FACETS: PaletteFacets = { favouritesOnly: false, recentSort: false };

/**
 * Extracts and memoises the plugin filter views used by ToolPalette:
 * - `plugins`        — full flat list mapped from the store
 * - `favPlugins`     — raw BrowserPlugin[] (group-favourited rows)
 * - `recentPlugins`  — raw BrowserPlugin[] (group-recent rows, best-first)
 * - `favoriteIds`    — primary-id set of favourited groups (per-card star)
 * - `recentRankById` — id → group recentRank (for the ⏱ facet sort)
 * - `filtered`       — plugins after `search` + `activeCategory` + facets
 *
 * The facet layer (`favouritesOnly` / `recentSort`) is applied to `filtered`
 * so the ONE virtualized list is the single primary surface — Favourites and
 * Recents are no longer separate stacked sections, they are chips that refine
 * this list. `favPlugins` / `recentPlugins` are still returned for any caller
 * that wants the raw groups (and for unit-test coverage of group-favourites).
 *
 * Extracted here so the heavy memo work lives outside the render function
 * and can be unit-tested in isolation.
 */
export function usePaletteFilters(
  search: string,
  activeCategory: BlockCategory | null,
  facets: PaletteFacets = NO_FACETS,
) {
  const { favouritesOnly, recentSort } = facets;
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
  // This same set drives the ★ facet's "favourites only" filter, so starring
  // an AU keeps the family visible under the facet too (group-favourites
  // unregressed by the IA re-rank).
  const favoriteIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of nativePlugins) if (p.isFavorite) s.add(p.identifier);
    return s;
  }, [nativePlugins]);

  // id → group recentRank (>=0 means recent; -1 means not). Drives the ⏱ facet
  // sort. Aggregated across aliases by the host (best/lowest rank), so a
  // recently-used AU surfaces its VST3-primary family in the recent ordering.
  const recentRankById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of nativePlugins) m.set(p.identifier, p.recentRank);
    return m;
  }, [nativePlugins]);

  const filtered = useMemo(() => {
    const q = search ? search.toLowerCase() : "";
    let out = plugins.filter((p) => {
      if (activeCategory && p.category !== activeCategory) return false;
      // ★ facet — restrict to favourited GROUPS (group-aware via favoriteIds).
      if (favouritesOnly && !favoriteIds.has(p.id)) return false;
      if (q) {
        if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q))
          return false;
      }
      return true;
    });

    // ⏱ facet — most-recently-used first. Stable: recent rows (rank >= 0)
    // ascend by rank; non-recent rows keep their original relative order after
    // them. We sort a copy of indices to preserve stability without mutating
    // the filtered array's identity-stable elements.
    if (recentSort) {
      const indexed = out.map((p, i) => ({ p, i }));
      indexed.sort((a, b) => {
        const ra = recentRankById.get(a.p.id) ?? -1;
        const rb = recentRankById.get(b.p.id) ?? -1;
        const aRecent = ra >= 0;
        const bRecent = rb >= 0;
        if (aRecent && bRecent) return ra - rb || a.i - b.i;
        if (aRecent) return -1;
        if (bRecent) return 1;
        return a.i - b.i; // both non-recent → original order
      });
      out = indexed.map((x) => x.p);
    }

    return out;
  }, [
    plugins,
    activeCategory,
    search,
    favouritesOnly,
    recentSort,
    favoriteIds,
    recentRankById,
  ]);

  return {
    plugins,
    favPlugins,
    recentPlugins,
    filtered,
    favoriteIds,
    recentRankById,
  };
}
