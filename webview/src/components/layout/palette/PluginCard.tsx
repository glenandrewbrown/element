import { useState } from "react";
import type { BlockCategory } from "../../../data/types";
import type { PluginEntry } from "./usePaletteFilters";
import { Icon } from "../../neu/Icon";
import { categoryIconName } from "../../neu/iconForCategory";
import { setPluginDragData } from "../../../lib/pluginDrag";

export type { PluginEntry };

// ── Shared glyphs ────────────────────────────────────────────────────────────

function CategoryShape({ category }: { category: BlockCategory }) {
  const color = `hsl(var(--cat-${category}))`;
  const iconName = categoryIconName(category);
  return (
    <span className="inline-flex shrink-0" style={{ color }}>
      <Icon name={iconName} size={12} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

export function StarGlyph({ size = 9, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  );
}

function formatBadgeColor(format: string): string {
  const f = format.toUpperCase();
  if (f === "VST3" || f === "VST") return "var(--color-badge-vst3)";
  if (f === "AU" || f === "AUDIOUNIT") return "var(--color-badge-au)";
  if (f === "CLAP") return "var(--color-badge-clap)";
  return "var(--color-badge-lv2)";
}

/** Short, human label for a juce pluginFormatName ("AudioUnit" → "AU"). */
function formatLabel(format: string): string {
  return format.toUpperCase() === "AUDIOUNIT" ? "AU" : format.toUpperCase();
}

export function FormatBadge({ format }: { format: string }) {
  if (!format) return null;
  const c = formatBadgeColor(format);
  return (
    <span
      className="text-[8px] font-bold leading-none px-1 py-[2px] rounded-sm tabular tracking-wide"
      style={{ color: c, background: "color-mix(in srgb, var(--color-pressed) 70%, transparent)" }}
    >
      {formatLabel(format)}
    </span>
  );
}

interface PluginCardProps {
  plugin: PluginEntry;
  view: "grid" | "list";
  selected: boolean;
  isFavourite: boolean;
  onSelect: () => void;
  onAdd: () => void;
  /**
   * N2 — add a SPECIFIC format variant by its real identifier (the "also
   * available as AU" reveal). When omitted, the reveal is not rendered.
   */
  onAddVariant?: (identifier: string) => void;
  /**
   * T19 / V2 — toggle this plugin's persistent favourite (inline ★ per row).
   * When omitted the star is render-only (the prior read-only behaviour).
   */
  onToggleFavourite?: () => void;
  /**
   * V2 — show the vendor/manufacturer as a secondary column (list view). The
   * category-led layout surfaces the vendor; the flat search list does not.
   */
  showVendor?: boolean;
  /**
   * T19 — make the list row an HTML5 drag source so it can be dragged onto the
   * Board. Drop is handled by GraphCanvas via lib/pluginDrag. Click/double-click
   * add still works regardless. Default true in list view; ignored in grid.
   */
  draggable?: boolean;
}

/**
 * Raised neumorphic plugin card for both grid (2-col) and list (1-col) views.
 * Double-click / Enter → add to Board. Single-click → select.
 *
 * N2 (list view): when the plugin family has more than one format variant, a
 * small "also available as …" reveal chevron toggles a sub-list of the OTHER
 * variants. Selecting one inserts using that variant's real identifier — so a
 * user who needs the AU's distinct latency/behaviour can pick it explicitly,
 * even though the VST3 primary is what the list shows.
 */
export function PluginCard({
  plugin,
  view,
  selected,
  isFavourite,
  onSelect,
  onAdd,
  onAddVariant,
  onToggleFavourite,
  showVendor = false,
  draggable = true,
}: PluginCardProps) {
  const accent = `hsl(var(--cat-${plugin.category}))`;
  const base =
    "group relative cursor-grab select-none rounded-md transition-[box-shadow,background-color,transform] duration-150 ease-out outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--cat-instrument))]";
  const surface = selected
    ? "bg-surface neu-raised"
    : "bg-panel hover:bg-elevated hover:neu-raised";

  // The variants OTHER than the shown primary row (primary is variants[0]).
  const altVariants =
    plugin.variants && plugin.variants.length > 1 ? plugin.variants.slice(1) : [];
  const hasAlternatives = altVariants.length > 0 && onAddVariant != null;
  const [revealOpen, setRevealOpen] = useState(false);

  if (view === "grid") {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${plugin.name} (${plugin.format || "plugin"})`}
        onClick={onSelect}
        onDoubleClick={onAdd}
        onKeyDown={(e) => {
          if (e.key === "Enter") onAdd();
        }}
        className={`${base} ${surface} p-2 flex flex-col gap-1.5 h-[58px]`}
      >
        <div className="flex items-center justify-between">
          <CategoryShape category={plugin.category} />
          <FormatBadge format={plugin.format} />
        </div>
        <span
          className={`text-[10px] font-medium leading-tight line-clamp-2 ${selected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}
          style={selected ? { color: accent } : undefined}
          title={plugin.description || plugin.name}
        >
          {plugin.name}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${plugin.name} (${plugin.format || "plugin"})`}
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) =>
                setPluginDragData(e.dataTransfer, {
                  identifier: plugin.id,
                  name: plugin.name,
                })
            : undefined
        }
        onClick={onSelect}
        onDoubleClick={onAdd}
        onKeyDown={(e) => {
          if (e.key === "Enter") onAdd();
        }}
        className={`${base} ${surface} pl-2 pr-2 py-1 flex items-center gap-2`}
      >
        <CategoryShape category={plugin.category} />
        <span
          className={`text-[11px] font-medium truncate flex-1 min-w-0 ${selected ? "" : "text-text-secondary group-hover:text-text-primary"}`}
          style={selected ? { color: accent } : undefined}
          title={plugin.description ? `${plugin.name} — ${plugin.description}` : plugin.name}
        >
          {plugin.name}
        </span>
        {showVendor && plugin.manufacturer && plugin.manufacturer.toUpperCase() !== "ELEMENT" ? (
          <span
            className="text-[9px] text-text-dim tabular truncate max-w-[60px] shrink-0"
            title={plugin.manufacturer}
          >
            {plugin.manufacturer}
          </span>
        ) : null}
        {onToggleFavourite ? (
          <button
            type="button"
            aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={isFavourite}
            title={isFavourite ? "Remove from favourites" : "Add to favourites"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavourite();
            }}
            className={`shrink-0 transition-opacity ${
              isFavourite
                ? "text-accent-orange opacity-100"
                : "text-text-dim opacity-0 group-hover:opacity-60 hover:!opacity-100"
            }`}
          >
            <StarGlyph size={10} filled={isFavourite} />
          </button>
        ) : isFavourite ? (
          <span className="text-accent-orange shrink-0" aria-label="Favourite" role="img">
            <StarGlyph size={9} />
          </span>
        ) : null}
        {hasAlternatives ? (
          <button
            type="button"
            className={`shrink-0 flex items-center gap-0.5 rounded px-1 py-[2px] text-[8px] font-bold tracking-wide transition-colors ${
              revealOpen
                ? "text-accent-blue neu-inset"
                : "text-text-dim hover:text-text-secondary"
            }`}
            aria-label={`Other formats: ${altVariants.map((v) => formatLabel(v.format)).join(", ")}`}
            aria-expanded={revealOpen}
            title={`Also available as ${altVariants.map((v) => formatLabel(v.format)).join(", ")}`}
            onClick={(e) => {
              e.stopPropagation();
              setRevealOpen((v) => !v);
            }}
          >
            +{altVariants.length}
            <Icon name={revealOpen ? "ChevronUp" : "ChevronDown"} size={9} aria-hidden />
          </button>
        ) : null}
        <FormatBadge format={plugin.format} />
      </div>

      {/* N2 reveal — the OTHER format variants of this family. Absolutely
          positioned so it overlays rather than growing the row (the ALL-PLUGINS
          list is fixed-height virtualized; inline growth would break its row
          height math). Anchored under the row, above sibling rows via z-index. */}
      {hasAlternatives && revealOpen ? (
        <div
          className="absolute left-0 right-0 top-full z-20 mt-0.5 rounded-md bg-elevated neu-raised p-1 space-y-0.5"
          role="group"
          aria-label="Other formats"
        >
          {altVariants.map((v) => (
            <button
              key={v.identifier}
              type="button"
              className="w-full flex items-center gap-2 rounded px-1.5 py-1 text-left text-[10px] text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
              title={`Add the ${formatLabel(v.format)} variant`}
              onClick={(e) => {
                e.stopPropagation();
                onAddVariant?.(v.identifier);
                setRevealOpen(false);
              }}
            >
              <span className="text-text-dim">Add as</span>
              <FormatBadge format={v.format} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
