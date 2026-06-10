import { useRef, useReducer } from "react";
import { EmptyState } from "../../neu";
import { nativeGraphAddPlugin } from "../../../bridge/nativeGraph";
import { usePluginBrowserStore } from "../../../stores/usePluginBrowserStore";
import { EV_OPEN_PREFERENCES } from "../../../events";
import { PluginCard } from "./PluginCard";
import { groupBySubType, type PluginEntry } from "./usePaletteFilters";
import { CATEGORY_FILTERS } from "./CategoryChips";
import type { BlockCategory } from "../../../data/types";

// ── Virtualization constants ──────────────────────────────────────────────────
//
// List mode: each PluginCard is 34px tall (py-1.5 = 6px × 2 + 11px text +
// line-height ≈ 16px = ~34px). We use 34px as the fixed row height.
//
// Grid mode (2-col): each card is h-[58px] + 6px gap = 64px per row.
// Virtualizing grid requires computing which row the scroll offset lands in —
// the math works but adds complexity (2 items per row, partial row at the end).
// Grid is used much less; we virtualize list mode only and keep grid as a
// simple flat render. This is documented here and in T6 report.

const LIST_ROW_H = 34; // px — matches PluginCard list height
const OVERSCAN = 5;    // extra rows rendered above/below the visible window

interface PluginListProps {
  plugins: PluginEntry[];
  filtered: PluginEntry[];
  favoriteIds: Set<string>;
  selectedId: string | null;
  viewMode: "grid" | "list";
  activeCategory: BlockCategory | null;
  onSelect: (id: string) => void;
  /**
   * V2 — render sub-type dividers within the list (Variation 2 category-led).
   * Only honoured in list view; the divider grouping itself self-gates on list
   * length (see groupBySubType / SUBTYPE_DIVIDER_MIN). Default off so the flat
   * search list and grid view are unchanged.
   */
  grouped?: boolean;
  /** V2 — show the vendor column on each row (category-led layout). */
  showVendor?: boolean;
  /** V2 — hide the built-in "<Category> plugins · N" sticky heading (the list
   *  pane supplies its own category titlebar). */
  hideHeading?: boolean;
}

/**
 * Primary plugin surface. List mode is virtualized (O(viewport) rows) using a
 * dependency-free window-math approach: a fixed-height scroll container holds a
 * full-height spacer, and only the visible slice of items is rendered with an
 * absolute offset. Grid mode stays un-virtualized (see comment above).
 */
export function PluginList({
  plugins,
  filtered,
  favoriteIds,
  selectedId,
  viewMode,
  activeCategory,
  onSelect,
  grouped = false,
  showVendor = false,
  hideHeading = false,
}: PluginListProps) {
  const toggleFavorite = usePluginBrowserStore((s) => s.toggleFavorite);
  const scrollRef = useRef<HTMLDivElement>(null);
  // PluginList now owns the panel's SINGLE scroll region (Task 3.D), so a
  // scroll no longer rides a parent re-render — we force a cheap local one.
  // `scrollTop` is still read synchronously from the DOM ref at render time
  // (no scroll value held in state → no value churn), the tick just schedules
  // the recompute of the visible window. Search/category/facet changes also
  // re-render via their own state and recompute the slice.
  const [, forceTick] = useReducer((n: number) => n + 1, 0);
  const scrollTop = scrollRef.current?.scrollTop ?? 0;

  const categoryLabel =
    activeCategory
      ? CATEGORY_FILTERS.find((c) => c.cat === activeCategory)?.label
      : "All";

  // ── Sticky section heading ────────────────────────────────────────────────
  // Lives INSIDE the single scroll region (PluginList owns the only scroll now
  // — Task 3.D), pinned to the top so the "All plugins · N" count stays visible
  // while the list scrolls. `bg-panel` so rows don't show through behind it.
  const heading = hideHeading ? null : (
    <div className="sticky top-0 z-10 bg-panel text-[9px] font-bold text-text-secondary tracking-widest uppercase px-1 pt-1 pb-1 flex items-center justify-between">
      <span>{categoryLabel} plugins</span>
      {filtered.length > 0 ? (
        <span className="text-text-dim tabular font-bold">{filtered.length}</span>
      ) : null}
    </div>
  );

  // Shared row factory so the flat virtualized path and the grouped (divider)
  // path render identical PluginCards — only the layout around them differs.
  const renderRow = (plugin: PluginEntry) => (
    <PluginCard
      plugin={plugin}
      view="list"
      selected={plugin.id === selectedId}
      isFavourite={favoriteIds.has(plugin.id)}
      onSelect={() => onSelect(plugin.id)}
      onAdd={() => void nativeGraphAddPlugin(plugin.id)}
      onAddVariant={(id) => void nativeGraphAddPlugin(id)}
      onToggleFavourite={() => toggleFavorite(plugin.id)}
      showVendor={showVendor}
    />
  );

  // ── Empty / no-results states ───────────────────────────────────────────────
  // The list is the panel's SINGLE scroll region (search-first IA): it owns
  // `flex-1 min-h-0 overflow-y-auto`; the parent body must NOT also scroll.
  if (plugins.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-2" data-testid="plugin-list-scroll">
        {heading}
        <div className="px-2 py-4">
          <EmptyState
            illustration="no-plugins"
            size="sm"
            tone="audio"
            title="No plugins scanned"
            description="Open Preferences to scan AU/VST3/CLAP/LV2 plugins on this system."
            action={
              <button
                type="button"
                className="px-3 py-1 rounded bg-pressed text-[11px] uppercase tracking-widest text-accent-blue hover:bg-elevated transition-colors"
                onClick={() => window.dispatchEvent(new Event(EV_OPEN_PREFERENCES))}
              >
                Open Preferences
              </button>
            }
          />
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-2" data-testid="plugin-list-scroll">
        {heading}
        <div className="px-2 py-3 text-[10px] text-text-dim text-center">
          No plugins match the current filter.
        </div>
      </div>
    );
  }

  // ── Grid mode (simple, no virtualization) ───────────────────────────────────
  if (viewMode === "grid") {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-2" data-testid="plugin-list-scroll">
        {heading}
        <div className="grid grid-cols-2 gap-1.5 px-1 pb-1">
          {filtered.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              view="grid"
              selected={plugin.id === selectedId}
              isFavourite={favoriteIds.has(plugin.id)}
              onSelect={() => onSelect(plugin.id)}
              onAdd={() => void nativeGraphAddPlugin(plugin.id)}
              onAddVariant={(id) => void nativeGraphAddPlugin(id)}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── List mode — grouped (V2 category-led, sub-type dividers) ────────────────
  // Used when the caller opts in (a category is active) AND the list is long
  // enough for dividers to help (groupBySubType self-gates on length). Not
  // virtualized — divider rows break the uniform-height window math, and a
  // single category's list is bounded; the flat "All" list keeps virtualization.
  if (grouped) {
    const items = groupBySubType(filtered);
    return (
      <div
        className="flex-1 min-h-0 overflow-y-auto px-2"
        data-testid="plugin-list-grouped"
      >
        {heading}
        {items.map((item, i) =>
          item.kind === "divider" ? (
            <div
              key={`div-${item.label}-${i}`}
              className="px-1 pt-2 pb-1 text-[8.5px] font-bold uppercase tracking-widest text-text-dim border-t border-white/[0.03] first:border-t-0 first:pt-1"
            >
              {item.label}
            </div>
          ) : (
            <div key={item.plugin.id}>{renderRow(item.plugin)}</div>
          ),
        )}
      </div>
    );
  }

  // ── List mode — virtualized ─────────────────────────────────────────────────
  const totalH = filtered.length * LIST_ROW_H;
  // Viewport height: 400px is a safe minimum; actual height is unknown at
  // render time without ResizeObserver. The overscan (OVERSCAN rows) covers
  // the visible area regardless of actual height for lists up to ~1000 items.
  // For larger lists (the Synthetic1000 story) we compute from the DOM height
  // when available.
  const viewportH = scrollRef.current?.clientHeight ?? 400;
  const visibleCount = Math.ceil(viewportH / LIST_ROW_H) + OVERSCAN * 2;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / LIST_ROW_H) - OVERSCAN,
  );
  const endIndex = Math.min(filtered.length, startIndex + visibleCount);
  const slice = filtered.slice(startIndex, endIndex);
  const offsetTop = startIndex * LIST_ROW_H;

  return (
    // The single scroll region of the whole browser body (search-first IA —
    // Task 3.D): `flex-1 min-h-0 overflow-y-auto`. The sticky heading rides
    // inside it; the parent body intentionally does NOT scroll (no nested
    // scroll context to fight the expert's wheel).
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto px-2"
      data-testid="plugin-list-virtual"
      onScroll={forceTick}
    >
      {heading}
      {/* Full-height spacer so the scrollbar thumb is accurate */}
      <div style={{ height: totalH, position: "relative" }}>
        <div style={{ position: "absolute", top: offsetTop, left: 0, right: 0 }}>
          {slice.map((plugin) => (
            <div key={plugin.id} style={{ height: LIST_ROW_H }}>
              {renderRow(plugin)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
