import type { BlockCategory } from "../../../data/types";
import { Icon } from "../../neu/Icon";
import { categoryIconName } from "../../neu/iconForCategory";

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

export function FormatBadge({ format }: { format: string }) {
  if (!format) return null;
  const c = formatBadgeColor(format);
  return (
    <span
      className="text-[8px] font-bold leading-none px-1 py-[2px] rounded-sm tabular tracking-wide"
      style={{ color: c, background: "color-mix(in srgb, var(--color-pressed) 70%, transparent)" }}
    >
      {format}
    </span>
  );
}

export interface PluginEntry {
  id: string;
  name: string;
  category: BlockCategory;
  format: string;
}

interface PluginCardProps {
  plugin: PluginEntry;
  view: "grid" | "list";
  selected: boolean;
  isFavourite: boolean;
  onSelect: () => void;
  onAdd: () => void;
}

/**
 * Raised neumorphic plugin card for both grid (2-col) and list (1-col) views.
 * Double-click / Enter → add to Board. Single-click → select.
 */
export function PluginCard({
  plugin,
  view,
  selected,
  isFavourite,
  onSelect,
  onAdd,
}: PluginCardProps) {
  const accent = `hsl(var(--cat-${plugin.category}))`;
  const base =
    "group relative cursor-grab select-none rounded-md transition-[box-shadow,background-color,transform] duration-150 ease-out outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--cat-instrument))]";
  const surface = selected
    ? "bg-surface neu-raised"
    : "bg-panel hover:bg-elevated hover:neu-raised";

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
          title={plugin.name}
        >
          {plugin.name}
        </span>
      </div>
    );
  }

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
      className={`${base} ${surface} pl-2 pr-2 py-1.5 flex items-center gap-2`}
    >
      <CategoryShape category={plugin.category} />
      <span
        className={`text-[11px] font-medium truncate flex-1 ${selected ? "" : "text-text-secondary group-hover:text-text-primary"}`}
        style={selected ? { color: accent } : undefined}
        title={plugin.name}
      >
        {plugin.name}
      </span>
      {isFavourite ? (
        <span className="text-accent-orange shrink-0" aria-label="Favourite" role="img">
          <StarGlyph size={9} />
        </span>
      ) : null}
      <FormatBadge format={plugin.format} />
    </div>
  );
}
