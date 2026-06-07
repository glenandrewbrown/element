/**
 * useQuickAddResults — the shared results engine for QuickAdd (N3).
 *
 * Combines, in order:
 *   1. port-type filter   (Opt+drop / cable-drag — real per-plugin signalOut)
 *   2. rail filter        (★Favorites / ◷Recents / 4 categories / All)
 *   3. search             (empty = Favorites→Recents→All browse stack;
 *                          typed  = flat fuzzy-scored list ranked by score then
 *                          real most-used weight)
 *
 * Returns a single FLAT, render-ready row list (`rows`) plus the section
 * boundaries (`favCount`/`recentCount`) so the renderer can draw "Favorites /
 * Recents / All" labels without re-deriving the split. Keeping it flat is what
 * lets the result list be virtualized by a single index.
 *
 * Perf: the search index (sep-normalised fields) is built ONCE per plugin set
 * via `buildIndex` (memoised on `plugins`); a keystroke only re-runs the O(n)
 * score pass over the indexed entries + a sort — never the normalise regex.
 */

import { useMemo } from "react";
import type { SignalType } from "../../../data/types";
import {
  buildIndex,
  scoreEntry,
  aliasSignalFor,
  normaliseSeps,
  type QuickAddPlugin,
  type QuickAddIndexEntry,
} from "./fuzzyScore";
import { isCategoryFilter, type RailFilter } from "./railFilter";

export interface QuickAddResults {
  /** Flat, render-ordered rows (already port + rail + search filtered). */
  rows: QuickAddIndexEntry[];
  /** Whether the user has typed a query (search mode vs browse mode). */
  isSearching: boolean;
  /**
   * In browse mode: index ranges for the section labels. `favCount` rows are
   * Favorites, the next `recentCount` are Recents, the rest are "All". In
   * search mode both are 0 (flat scored list, no section labels).
   */
  favCount: number;
  recentCount: number;
}

export interface UseQuickAddResultsArgs {
  plugins: QuickAddPlugin[];
  search: string;
  /** Active rail filter ("all" = no rail constraint). */
  railFilter: RailFilter;
  /** Port-type constraint (Opt+drop). Undefined = generic mode. */
  portType?: SignalType;
}

export function useQuickAddResults({
  plugins,
  search,
  railFilter,
  portType,
}: UseQuickAddResultsArgs): QuickAddResults {
  // Index is rebuilt only when the scanned plugin set changes — NOT per keystroke.
  const index = useMemo(() => buildIndex(plugins), [plugins]);

  return useMemo((): QuickAddResults => {
    const isSearching = search.trim().length > 0;

    // ── Composable predicates (port + rail) ──────────────────────────────────
    const passesPort = (p: QuickAddPlugin) =>
      !portType || p.signalOut === portType;

    // Rail filter: category rows constrain by blockCategory; favorites/recents
    // are handled by the browse stack itself, so as a row-level predicate they
    // are a pass-through (the section composition does the work). When a
    // category rail is active we collapse to a single scored/flat list of that
    // category.
    const railIsCategory = isCategoryFilter(railFilter);
    const passesRail = (p: QuickAddPlugin) =>
      !railIsCategory || p.category === railFilter;

    // ── most-used weight (real usageCount + GROUP favorite + GROUP recency) ──
    // Alias-aware (N2): favourite + recency come from the precomputed group
    // fields so a starred/recent AU still boosts the family's VST3 primary.
    const mostUsedWeight = (p: QuickAddPlugin): number => {
      let w = p.usageCount * 4;
      if (p.isFavorite) w += 60;
      if (p.recentRank >= 0) w += Math.max(30 - p.recentRank * 3, 0);
      return w;
    };

    // ── SEARCH MODE — flat scored list ───────────────────────────────────────
    if (isSearching) {
      const qNorm = normaliseSeps(search);
      const aliasSig = aliasSignalFor(search);
      const scored: Array<{ e: QuickAddIndexEntry; s: number; w: number }> = [];
      for (const e of index) {
        if (!passesPort(e.plugin) || !passesRail(e.plugin)) continue;
        const s = scoreEntry(e, qNorm, aliasSig);
        if (s !== null) scored.push({ e, s, w: mostUsedWeight(e.plugin) });
      }
      scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : b.w - a.w));
      return {
        rows: scored.map((x) => x.e),
        isSearching: true,
        favCount: 0,
        recentCount: 0,
      };
    }

    // ── BROWSE MODE — favorites → recents → all (port + rail filtered) ───────
    // Favourite/recent membership is GROUP-level (alias-aware): a family whose
    // AU variant is starred shows under Favorites; Recents is ordered by the
    // best (lowest) recentRank across the family's aliases.
    const favs: QuickAddIndexEntry[] = [];
    const recs: QuickAddIndexEntry[] = [];
    const rest: QuickAddIndexEntry[] = [];

    // When the rail filter IS "favorites" or "recents", show ONLY that section
    // (focused view — Bitwig's only-favorites star).
    if (railFilter === "favorites") {
      for (const e of index) {
        if (!passesPort(e.plugin)) continue;
        if (e.plugin.isFavorite) rest.push(e);
      }
      return { rows: rest, isSearching: false, favCount: 0, recentCount: 0 };
    }
    if (railFilter === "recents") {
      const recentEntries = index.filter(
        (e) => passesPort(e.plugin) && e.plugin.recentRank >= 0,
      );
      recentEntries.sort((a, b) => a.plugin.recentRank - b.plugin.recentRank);
      return {
        rows: recentEntries,
        isSearching: false,
        favCount: 0,
        recentCount: 0,
      };
    }

    // Favorites (stable plugin order)
    for (const e of index) {
      if (!passesPort(e.plugin) || !passesRail(e.plugin)) continue;
      if (e.plugin.isFavorite) favs.push(e);
    }
    // Recents (ordered by recentRank, excluding favorites)
    const recentCandidates = index.filter(
      (e) =>
        passesPort(e.plugin) &&
        passesRail(e.plugin) &&
        e.plugin.recentRank >= 0 &&
        !e.plugin.isFavorite,
    );
    recentCandidates.sort((a, b) => a.plugin.recentRank - b.plugin.recentRank);
    recs.push(...recentCandidates);
    // Others
    for (const e of index) {
      if (!passesPort(e.plugin) || !passesRail(e.plugin)) continue;
      if (e.plugin.isFavorite || e.plugin.recentRank >= 0) continue;
      rest.push(e);
    }

    return {
      rows: [...favs, ...recs, ...rest],
      isSearching: false,
      favCount: favs.length,
      recentCount: recs.length,
    };
  }, [index, search, railFilter, portType]);
}
