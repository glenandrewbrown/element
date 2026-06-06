import type { BlockCategory } from "../../../data/types";
import { categoryIconName } from "../../neu/iconForCategory";
import { Icon } from "../../neu/Icon";

export const CATEGORY_FILTERS = [
  { cat: "instrument" as const, label: "INST" },
  { cat: "audiofx" as const, label: "FX" },
  { cat: "midifx" as const, label: "MIDI" },
  { cat: "modulator" as const, label: "MOD" },
] as const;

function CategoryShape({ category }: { category: BlockCategory }) {
  const color = `hsl(var(--cat-${category}))`;
  const iconName = categoryIconName(category);
  return (
    <span className="inline-flex shrink-0" style={{ color }}>
      <Icon name={iconName} size={12} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

interface CategoryChipsProps {
  activeCategory: BlockCategory | null;
  onSelect: (cat: BlockCategory | null) => void;
}

/**
 * "All / INST / FX / MIDI / MOD" quick-filter chip row for the Plugins tab.
 */
export function CategoryChips({ activeCategory, onSelect }: CategoryChipsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeCategory === null}
        className={[
          "text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-sm transition-colors",
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
            onClick={() => onSelect(isActive ? null : cat)}
            aria-pressed={isActive}
            className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-sm neu-inset transition-colors bg-pressed"
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
    </div>
  );
}
