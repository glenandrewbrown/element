import type { BlockCategory } from "../../../data/types";
import { categoryIconName } from "../../neu/iconForCategory";
import { Icon } from "../../neu/Icon";
import { CATEGORY_FILTERS } from "./CategoryChips";
import { StarGlyph } from "./PluginCard";

function CategoryShape({ category }: { category: BlockCategory }) {
  const color = `hsl(var(--cat-${category}))`;
  const iconName = categoryIconName(category);
  return (
    <span className="inline-flex shrink-0" style={{ color }}>
      <Icon name={iconName} size={12} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

const CHIP_BASE =
  "flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-sm transition-colors";

interface FacetChipsProps {
  activeCategory: BlockCategory | null;
  onSelectCategory: (cat: BlockCategory | null) => void;
  favouritesOnly: boolean;
  onToggleFavourites: () => void;
  /** Disable the ★ chip when there are no favourites to filter to. */
  hasFavourites: boolean;
  recentSort: boolean;
  onToggleRecent: () => void;
  /** Disable the ⏱ chip when there is nothing recent to sort by. */
  hasRecents: boolean;
}

/**
 * Single faceting chip row for the search-first browser (Task 3.D). Replaces
 * the old stacked Favourites/Recents *sections* above the list: the 4-category
 * quick-filter and the ★ Favourites / ⏱ Recent toggles are all CHIPS that
 * refine the ONE primary list, so the virtualized list stays the dominant
 * surface and nothing pushes it below the fold.
 *
 *   ● INST  ▲ MIDI  ◆ FX  ⬡ MOD        ★ Fav   ⏱ Recent
 *
 * - Category chips are single-select (click active = clear), matching the old
 *   CategoryChips behaviour exactly.
 * - ★ Fav restricts the list to favourited GROUPS (group-aware — a starred AU
 *   keeps its VST3-primary family). Disabled (not hidden) when no favourites.
 * - ⏱ Recent sorts the list most-recently-used first. Disabled when nothing
 *   is recent.
 */
export function FacetChips({
  activeCategory,
  onSelectCategory,
  favouritesOnly,
  onToggleFavourites,
  hasFavourites,
  recentSort,
  onToggleRecent,
  hasRecents,
}: FacetChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* ── Category facets ── */}
      <button
        type="button"
        onClick={() => onSelectCategory(null)}
        aria-pressed={activeCategory === null}
        className={[
          CHIP_BASE,
          activeCategory === null
            ? "bg-elevated text-text-primary neu-inset"
            : "bg-pressed text-text-secondary neu-inset hover:text-text-primary",
        ].join(" ")}
      >
        All
      </button>
      {CATEGORY_FILTERS.map(({ cat, label }) => {
        const isActive = activeCategory === cat;
        const accent = `hsl(var(--cat-${cat}))`;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelectCategory(isActive ? null : cat)}
            aria-pressed={isActive}
            className={`${CHIP_BASE} neu-inset bg-pressed`}
            style={
              isActive
                ? {
                    color: accent,
                    background: `color-mix(in srgb, ${accent} 18%, transparent)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 50%, transparent)`,
                  }
                : undefined
            }
            title={`Filter: ${label}`}
          >
            <CategoryShape category={cat} />
            {label}
          </button>
        );
      })}

      {/* ── Spacer pushes the two scope facets to the right edge ── */}
      <span className="flex-1 min-w-2" aria-hidden />

      {/* ── ★ Favourites facet ── */}
      <button
        type="button"
        onClick={onToggleFavourites}
        aria-pressed={favouritesOnly}
        aria-label="Show favourites only"
        disabled={!hasFavourites}
        title={
          hasFavourites
            ? "Show favourites only"
            : "No favourites yet — star a plugin to add one"
        }
        className={[
          CHIP_BASE,
          "neu-inset",
          !hasFavourites
            ? "bg-pressed text-text-dim opacity-40 cursor-not-allowed"
            : favouritesOnly
              ? "text-accent-orange"
              : "bg-pressed text-text-secondary hover:text-accent-orange",
        ].join(" ")}
        style={
          favouritesOnly && hasFavourites
            ? {
                background:
                  "color-mix(in srgb, hsl(var(--cat-audiofx)) 18%, transparent)",
                boxShadow:
                  "inset 0 0 0 1px color-mix(in srgb, hsl(var(--cat-audiofx)) 50%, transparent)",
              }
            : undefined
        }
      >
        <StarGlyph size={9} filled={favouritesOnly} />
        Fav
      </button>

      {/* ── ⏱ Recent facet ── */}
      <button
        type="button"
        onClick={onToggleRecent}
        aria-pressed={recentSort}
        aria-label="Sort by most recently used"
        disabled={!hasRecents}
        title={
          hasRecents
            ? "Sort by most recently used"
            : "Nothing used recently yet"
        }
        className={[
          CHIP_BASE,
          "neu-inset",
          !hasRecents
            ? "bg-pressed text-text-dim opacity-40 cursor-not-allowed"
            : recentSort
              ? "text-accent-teal"
              : "bg-pressed text-text-secondary hover:text-accent-teal",
        ].join(" ")}
        style={
          recentSort && hasRecents
            ? {
                background:
                  "color-mix(in srgb, hsl(var(--cat-midifx)) 18%, transparent)",
                boxShadow:
                  "inset 0 0 0 1px color-mix(in srgb, hsl(var(--cat-midifx)) 50%, transparent)",
              }
            : undefined
        }
      >
        <Icon name="Clock" size={11} strokeWidth={2} aria-hidden />
        Recent
      </button>
    </div>
  );
}
