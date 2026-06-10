import type { BlockCategory } from "../../../data/types";
import { categoryIconName } from "../../neu/iconForCategory";
import { Icon } from "../../neu/Icon";
import { StarGlyph } from "./PluginCard";
import { CATEGORY_FILTERS } from "./CategoryChips";

/**
 * V2 (Category-Led) left nav rail — a fixed 52px column that is ALWAYS visible
 * and drives what the list pane shows. Replaces the old facet CHIP row: All / 4
 * categories / ★ Fav / ⏱ Recent are persistent entries here, plus a Projects
 * entry that flips the browser to the Projects tab.
 *
 * Selection model mirrors the prior `activeCategory` + `favouritesOnly` +
 * `recentSort` state exactly (so the host filter behaviour is unchanged — only
 * the surface moved from chips to a rail):
 *   - ALL          → activeCategory=null, favouritesOnly=off, recentSort=off
 *   - a category   → activeCategory=<cat>
 *   - ★ Fav        → favouritesOnly toggle (group-aware via the hook)
 *   - ⏱ Recent     → recentSort toggle
 *   - Projects     → switch browseTab to "projects"
 *
 * Each entry shows a category glyph (the same shape used on canvas Blocks, for a
 * consistent colour/shape read) + a tiny label + a live count. The active entry
 * gets a 2px left-edge accent bar in the category hue — the mockup's "active
 * edge bar mirrors the canvas block accent language" decision.
 */

export type RailSelection =
  | { kind: "all" }
  | { kind: "category"; category: BlockCategory }
  | { kind: "favourites" }
  | { kind: "recents" };

interface CategoryRailProps {
  activeTab: "plugins" | "projects";
  activeCategory: BlockCategory | null;
  favouritesOnly: boolean;
  recentSort: boolean;
  /** Per-category counts (full list, ignoring search) for the rail badges. */
  counts: { all: number; byCategory: Record<BlockCategory, number>; favourites: number };
  hasFavourites: boolean;
  hasRecents: boolean;
  onSelect: (sel: RailSelection) => void;
  onSelectProjects: () => void;
}

const CAT_LABEL: Record<BlockCategory, string> = {
  instrument: "VI",
  midifx: "MIDI",
  audiofx: "FX",
  modulator: "Mod",
};

// Rail order matches the mockup: Instruments ● / MIDI ▲ / Audio FX ◆ / Mod ⬡.
const RAIL_CATEGORY_ORDER: BlockCategory[] = [
  "instrument",
  "midifx",
  "audiofx",
  "modulator",
];

function RailEntry({
  active,
  accent,
  label,
  count,
  title,
  ariaLabel,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  accent: string;
  label: string;
  count?: number;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      className={[
        "relative w-10 flex flex-col items-center gap-[3px] px-1 pt-1.5 pb-1 rounded-md transition-colors",
        disabled
          ? "opacity-35 cursor-not-allowed"
          : active
            ? "bg-surface neu-inset"
            : "hover:bg-surface",
      ].join(" ")}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-[-1px] top-1/4 h-1/2 w-[2px] rounded-r"
          style={{ background: accent }}
        />
      ) : null}
      <span className="flex items-center justify-center h-[18px]">{children}</span>
      <span
        className="text-[7.5px] font-bold uppercase tracking-wide leading-none"
        style={{ color: active ? accent : undefined }}
      >
        {label}
      </span>
      {typeof count === "number" ? (
        <span className="text-[7px] text-text-dim tabular leading-none">{count}</span>
      ) : null}
    </button>
  );
}

export function CategoryRail({
  activeTab,
  activeCategory,
  favouritesOnly,
  recentSort,
  counts,
  hasFavourites,
  hasRecents,
  onSelect,
  onSelectProjects,
}: CategoryRailProps) {
  const onPlugins = activeTab === "plugins";
  const allActive =
    onPlugins && activeCategory === null && !favouritesOnly && !recentSort;

  return (
    <div
      className="w-[52px] shrink-0 flex flex-col items-center gap-0.5 py-2 bg-pressed border-r border-white/5 h-full"
      role="group"
      aria-label="Plugin categories"
    >
      {/* ALL */}
      <RailEntry
        active={allActive}
        accent="var(--color-text-secondary)"
        label="All"
        count={counts.all}
        title="All Blocks"
        ariaLabel="All Blocks"
        onClick={() => onSelect({ kind: "all" })}
      >
        <span className="text-[10px] font-bold text-text-secondary leading-none">
          ALL
        </span>
      </RailEntry>

      <div className="w-7 h-px bg-white/5 my-0.5" aria-hidden />

      {/* 4 categories */}
      {RAIL_CATEGORY_ORDER.map((cat) => {
        const accent = `hsl(var(--cat-${cat}))`;
        const active = onPlugins && activeCategory === cat;
        const label =
          CATEGORY_FILTERS.find((c) => c.cat === cat)?.label ?? CAT_LABEL[cat];
        return (
          <RailEntry
            key={cat}
            active={active}
            accent={accent}
            label={CAT_LABEL[cat]}
            count={counts.byCategory[cat] ?? 0}
            title={`${label} Blocks`}
            ariaLabel={`${label} Blocks`}
            onClick={() => onSelect({ kind: "category", category: cat })}
          >
            <span style={{ color: accent }} className="inline-flex">
              <Icon name={categoryIconName(cat)} size={16} strokeWidth={1.75} aria-hidden />
            </span>
          </RailEntry>
        );
      })}

      <div className="w-7 h-px bg-white/5 my-0.5" aria-hidden />

      {/* ★ Favourites */}
      <RailEntry
        active={onPlugins && favouritesOnly}
        accent="hsl(var(--cat-audiofx))"
        label="Fav"
        count={counts.favourites}
        title={hasFavourites ? "Favourites only" : "No favourites yet — star a Block to add one"}
        ariaLabel="Favourites only"
        disabled={!hasFavourites}
        onClick={() => onSelect({ kind: "favourites" })}
      >
        <span style={{ color: "hsl(var(--cat-audiofx))" }} className="inline-flex">
          <StarGlyph size={13} filled={onPlugins && favouritesOnly} />
        </span>
      </RailEntry>

      {/* ⏱ Recent */}
      <RailEntry
        active={onPlugins && recentSort}
        accent="hsl(var(--cat-midifx))"
        label="Recent"
        title={hasRecents ? "Most recently used first" : "Nothing used recently yet"}
        ariaLabel="Most recently used first"
        disabled={!hasRecents}
        onClick={() => onSelect({ kind: "recents" })}
      >
        <span
          style={{ color: onPlugins && recentSort ? "hsl(var(--cat-midifx))" : undefined }}
          className="inline-flex text-text-secondary"
        >
          <Icon name="Clock" size={14} strokeWidth={2} aria-hidden />
        </span>
      </RailEntry>

      <div className="flex-1" aria-hidden />

      {/* Projects entry — switches the browser to the Projects tab */}
      <RailEntry
        active={activeTab === "projects"}
        accent="var(--color-text-secondary)"
        label="Proj"
        title="Projects"
        ariaLabel="Projects"
        onClick={onSelectProjects}
      >
        <span className="inline-flex text-text-secondary">
          <Icon name="Folder" size={14} strokeWidth={1.75} aria-hidden />
        </span>
      </RailEntry>
    </div>
  );
}
