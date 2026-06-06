import { useRef } from "react";
import { EmptyState } from "../../neu";
import { nativeGraphAddPlugin } from "../../../bridge/nativeGraph";
import { EV_OPEN_PREFERENCES } from "../../../events";
import { PluginCard } from "./PluginCard";
import type { PluginEntry } from "./usePaletteFilters";
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
}: PluginListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // scrollTop is read synchronously from the DOM during render — no state
  // needed. The div re-renders when the parent re-renders (search/category
  // change always triggers a re-render).
  const scrollTop = scrollRef.current?.scrollTop ?? 0;

  const categoryLabel =
    activeCategory
      ? CATEGORY_FILTERS.find((c) => c.cat === activeCategory)?.label
      : "All";

  // ── Section heading ─────────────────────────────────────────────────────────
  const heading = (
    <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase px-1 pt-1 pb-1 flex items-center justify-between">
      <span>{categoryLabel} plugins</span>
      {filtered.length > 0 ? (
        <span className="text-text-dim tabular font-bold">{filtered.length}</span>
      ) : null}
    </div>
  );

  // ── Empty / no-results states ───────────────────────────────────────────────
  if (plugins.length === 0) {
    return (
      <>
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
      </>
    );
  }

  if (filtered.length === 0) {
    return (
      <>
        {heading}
        <div className="px-2 py-3 text-[10px] text-text-dim text-center">
          No plugins match the current filter.
        </div>
      </>
    );
  }

  // ── Grid mode (simple, no virtualization) ───────────────────────────────────
  if (viewMode === "grid") {
    return (
      <>
        {heading}
        <div className="grid grid-cols-2 gap-1.5 px-1">
          {filtered.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              view="grid"
              selected={plugin.id === selectedId}
              isFavourite={favoriteIds.has(plugin.id)}
              onSelect={() => onSelect(plugin.id)}
              onAdd={() => void nativeGraphAddPlugin(plugin.id)}
            />
          ))}
        </div>
      </>
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
    <>
      {heading}
      {/* Scroll container — fills remaining flex space via flex-1 in parent */}
      <div
        ref={scrollRef}
        className="overflow-y-auto flex-1"
        data-testid="plugin-list-virtual"
        onScroll={() => {
          // Force a synchronous re-render so the slice recalculates.
          // React batches this; the scrollRef.current.scrollTop read at the
          // top of this render picks up the new offset.
          scrollRef.current?.dispatchEvent(
            new CustomEvent("_palette-scroll-tick", { bubbles: false }),
          );
        }}
      >
        {/* Full-height spacer so the scrollbar thumb is accurate */}
        <div style={{ height: totalH, position: "relative" }}>
          <div style={{ position: "absolute", top: offsetTop, left: 0, right: 0 }}>
            {slice.map((plugin) => (
              <div key={plugin.id} style={{ height: LIST_ROW_H }}>
                <PluginCard
                  plugin={plugin}
                  view="list"
                  selected={plugin.id === selectedId}
                  isFavourite={favoriteIds.has(plugin.id)}
                  onSelect={() => onSelect(plugin.id)}
                  onAdd={() => void nativeGraphAddPlugin(plugin.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
