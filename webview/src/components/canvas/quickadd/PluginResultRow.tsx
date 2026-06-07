/**
 * PluginResultRow — one dense row in the QuickAdd results list (N3).
 *
 * Layout (research DECISION §"dense virtualized rows"): the block NAME is the
 * semibold visual anchor and truncates LAST; the muted manufacturer gives way
 * first; a fixed-width category badge aligns into a clean right column; a
 * per-row favourite star sits far-right. A leading category shape-glyph (●▲◆⬡
 * via iconForCategory) + hue carries the colour-blind-safe category read.
 *
 * Extracted unchanged-in-behaviour from QuickAddPopup.tsx's PluginRow so the
 * row can be reused by the sidebar browser (shared engine, forked chrome).
 */

import type { BlockCategory } from "../../../data/types";
import { Icon } from "../../neu";
import { iconForCategory } from "../../neu/iconForCategory";

// Category → hue (from --cat-* design-system vars) and glow var for the ring.
const CAT_COLOR: Record<BlockCategory, string> = {
  instrument: "hsl(var(--cat-instrument))",
  audiofx: "hsl(var(--cat-audiofx))",
  midifx: "hsl(var(--cat-midifx))",
  modulator: "hsl(var(--cat-modulator))",
};
const CAT_GLOW_VAR: Record<BlockCategory, string> = {
  instrument: "var(--cat-instrument)",
  audiofx: "var(--cat-audiofx)",
  midifx: "var(--cat-midifx)",
  modulator: "var(--cat-modulator)",
};

const FAV_STAR_GOLD = "#E8A838";

function CategoryIcon({ category, name }: { category: BlockCategory; name: string }) {
  const iconName = iconForCategory(category, name);
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center"
      style={{ color: CAT_COLOR[category] ?? CAT_COLOR.audiofx }}
      aria-hidden="true"
    >
      <Icon name={iconName} size={12} strokeWidth={1.75} />
    </span>
  );
}

function CategoryLabel({
  category,
  rawCategory,
}: {
  category: BlockCategory;
  rawCategory: string;
}) {
  if (!rawCategory || rawCategory === "Uncategorised" || rawCategory === "MIDI")
    return null;
  const color = CAT_COLOR[category] ?? CAT_COLOR.audiofx;
  return (
    <span
      className="shrink-0 text-[8px] px-1 py-0.5 rounded uppercase font-bold leading-none tracking-wider truncate text-center"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 15%, #1E1E22)`,
        maxWidth: 56,
        minWidth: 28,
      }}
      title={rawCategory}
    >
      {rawCategory}
    </span>
  );
}

function FavoriteStar({
  isFavorite,
  onToggle,
}: {
  isFavorite: boolean;
  onToggle: () => void;
}) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={isFavorite ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={isFavorite}
      title={isFavorite ? "Remove from favourites" : "Add to favourites"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      className={[
        "shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-sm cursor-pointer",
        "transition-colors duration-100",
        isFavorite
          ? "text-[#E8A838]"
          : "text-text-dim opacity-50 hover:opacity-100 hover:text-text-secondary",
      ].join(" ")}
    >
      <Icon
        name="Star"
        size={12}
        strokeWidth={1.75}
        style={{ fill: isFavorite ? FAV_STAR_GOLD : "none" }}
      />
    </span>
  );
}

export interface PluginResultRowProps {
  id: string;
  name: string;
  category: BlockCategory;
  rawCategory: string;
  manufacturer: string;
  isActive: boolean;
  isFavorite: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onHover: () => void;
  /** Optional fixed height (used by the virtualized list for layout). */
  style?: React.CSSProperties;
}

export function PluginResultRow({
  id,
  name,
  category,
  rawCategory,
  manufacturer,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
  onHover,
  style,
}: PluginResultRowProps) {
  const glowVar = CAT_GLOW_VAR[category] ?? CAT_GLOW_VAR.audiofx;
  return (
    <button
      type="button"
      data-quickadd-row
      onClick={() => onSelect(id)}
      onMouseEnter={onHover}
      style={{
        ...style,
        ...(isActive
          ? {
              boxShadow: `inset 0 0 0 1px hsl(${glowVar} / 0.30), 0 0 10px hsl(${glowVar} / 0.20)`,
            }
          : undefined),
      }}
      className={[
        "w-full text-left px-3 py-1.5 text-[11px] rounded flex items-center gap-2",
        "transition-all duration-100 cursor-pointer",
        isActive
          ? "bg-elevated text-text-primary"
          : "text-text-secondary hover:text-text-primary",
      ].join(" ")}
    >
      <CategoryIcon category={category} name={name} />
      <span className="truncate flex-1 min-w-0 font-semibold">{name}</span>
      {manufacturer && (
        <span className="shrink-[6] min-w-0 max-w-[84px] text-[9px] text-text-dim truncate text-right">
          {manufacturer}
        </span>
      )}
      <CategoryLabel category={category} rawCategory={rawCategory} />
      <FavoriteStar isFavorite={isFavorite} onToggle={() => onToggleFavorite(id)} />
    </button>
  );
}
