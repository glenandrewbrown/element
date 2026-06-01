import { useEffect, useMemo, useState } from "react";
import { NeuInput, EmptyState } from "../neu";
import { Icon } from "../neu/Icon";
import { categoryIconName } from "../neu/iconForCategory";
import type { BlockCategory } from "../../data/types";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import {
  nativeGraphAddPlugin,
  nativeMoleculeInsert,
} from "../../bridge/nativeGraph";
import {
  nativeSessionExportGraph,
  nativeSessionImportGraph,
  nativeSessionListFiles,
  nativeSessionOpenPath,
  nativeSessionSetActiveGraph,
  type SessionFileEntry,
} from "../../bridge/nativeSession";
import { useSessionStore } from "../../stores/useSessionStore";
import { usePerformStore } from "../../stores/usePerformStore";
import {
  useHostExtrasStore,
  type GraphOutlineNode,
} from "../../stores/useHostExtrasStore";
import { EV_OPEN_PREFERENCES } from "../../events";

// ── Category icon components (meaningful icons, colour-blind safe) ──
//
// Previously used geometric shapes (●◆▲⬡) which Glen flagged as meaningless.
// Now uses meaningful Lucide icons via iconForCategory — the single source of
// truth. Colour is still applied (category hue) for the dopamine micro-glow;
// the icon carries the semantic load.

function CategoryShape({ category }: { category: BlockCategory }) {
  const color = `hsl(var(--cat-${category}))`;
  const iconName = categoryIconName(category);
  return (
    <span className="inline-flex shrink-0" style={{ color }}>
      <Icon name={iconName} size={12} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

// Collapsed-rail icons per category — meaningful Lucide glyphs replace the
// old Unicode geometric shapes (●▲◆⬡). Rendered via CategoryShape so the
// single source (iconForCategory.ts) drives all surfaces.
function RailCategoryIcon({ category, active }: { category: BlockCategory; active: boolean }) {
  const color = `hsl(var(--cat-${category}))`;
  const iconName = categoryIconName(category);
  return (
    <span
      className="inline-flex"
      style={{ color, opacity: active ? 1 : 0.5, transition: "opacity 150ms ease" }}
    >
      <Icon name={iconName} size={14} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

// Inline glyphs not in the Icon allowlist (Icon.tsx is out of scope this wave).
// 1.5px stroke / 24-grid to match the canonical <Icon /> grammar.
function StarGlyph({ size = 9, filled = true }: { size?: number; filled?: boolean }) {
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

function RescanGlyph({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

// ── Format badge ──
// Real scanned plugins report formats like VST3 / AU / CLAP / LV2 / INT. The
// `--color-badge-*` tokens are frozen in @theme; unknown formats fall back to
// the neutral LV2 grey rather than inventing a colour.
function formatBadgeColor(format: string): string {
  const f = format.toUpperCase();
  if (f === "VST3" || f === "VST") return "var(--color-badge-vst3)";
  if (f === "AU" || f === "AUDIOUNIT") return "var(--color-badge-au)";
  if (f === "CLAP") return "var(--color-badge-clap)";
  return "var(--color-badge-lv2)"; // LV2, INT, unknown → neutral
}

function FormatBadge({ format }: { format: string }) {
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

interface PluginEntry {
  id: string;
  name: string;
  category: BlockCategory;
  format: string;
}

function OutlineRow({ node, depth }: { node: GraphOutlineNode; depth: number }) {
  return (
    <div className="pl-1">
      <div
        className={`text-[10px] truncate ${node.isContainer ? "text-accent-teal font-bold" : "text-text-dim"}`}
        style={{ paddingLeft: depth * 10 }}
        title={node.id}
      >
        {node.name || "—"}
      </div>
      {node.children?.map((c) => (
        <OutlineRow key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

// ── Reusable plugin card (search-first flat list + grid). Raised neu on
//    hover/active, recessed when idle. Star toggles favourite (local-only —
//    favourites persist via the host's GetPluginList payload, not yet writable
//    from the webview; see scan-bridge report). ──
function PluginCard({
  plugin,
  view,
  selected,
  isFavourite,
  onSelect,
  onAdd,
}: {
  plugin: PluginEntry;
  view: "grid" | "list";
  selected: boolean;
  isFavourite: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
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

// ── Scan / rescan / paths / format-toggles ──
// NATIVE GAP (verdict #5, "#1 native gap"): the webview bridge exposes only
// `elementGetPluginList` (read-only). There is NO scan/rescan/add-path/
// remove-path/format-enable call registered in element_webview_host.cpp.
// Per Glen's hard rule "nothing fake", these controls render but are DISABLED
// and labelled "not wired" — they trigger no fake scan. The single working
// affordance is "Open Preferences", which dispatches the existing
// EV_OPEN_PREFERENCES event (the native plugin manager already lives there).
const PLUGIN_FORMATS = ["VST3", "AU", "CLAP", "LV2"] as const;

function ScanControls() {
  return (
    <div className="mb-3 pb-3 border-b border-white/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-text-secondary tracking-widest uppercase">
          Plugin Scan
        </span>
        <span
          className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-[2px] rounded-sm text-accent-orange"
          style={{ background: "color-mix(in srgb, var(--color-accent-orange) 14%, transparent)" }}
          title="No native bridge yet — scan/rescan/paths are wired through Preferences for now."
        >
          via Preferences
        </span>
      </div>

      {/* Scan + Rescan — DISABLED until a native bridge exists. They route the
          user to Preferences (the working path) via title + the CTA below. */}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex-1 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider py-1.5 rounded-md bg-pressed neu-inset text-text-dim cursor-not-allowed opacity-70"
          title="Not wired: no elementScanPlugins bridge yet. Use Open Preferences to scan."
        >
          <Icon name="Search" size={10} aria-hidden />
          Scan
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex-1 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider py-1.5 rounded-md bg-pressed neu-inset text-text-dim cursor-not-allowed opacity-70"
          title="Not wired: no elementRescanPlugins bridge yet. Use Open Preferences to rescan."
        >
          <RescanGlyph size={10} />
          Rescan
        </button>
      </div>

      {/* Format enable toggles — DISABLED, honest. Reflect no live state; once a
          bridge reports enabled formats these become real switches. */}
      <div>
        <div className="text-[8px] font-bold text-text-dim tracking-widest uppercase mb-1">
          Formats
        </div>
        <div className="flex flex-wrap gap-1">
          {PLUGIN_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              disabled
              aria-disabled="true"
              className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-[3px] rounded-sm bg-pressed neu-inset text-text-dim cursor-not-allowed opacity-70"
              title={`Not wired: no elementSetPluginFormatEnabled bridge yet (${f}).`}
              style={{ color: `color-mix(in srgb, ${formatBadgeColor(f)} 55%, var(--color-text-dim))` }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Search paths — DISABLED row + add affordance, honest. */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-bold text-text-dim tracking-widest uppercase">
            Scan Paths
          </span>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="text-[8px] font-bold uppercase tracking-wider text-text-dim cursor-not-allowed opacity-70 flex items-center gap-0.5"
            title="Not wired: no elementGetPluginPaths / elementAddPluginPath bridge yet."
          >
            <Icon name="Plus" size={9} aria-hidden />
            Add
          </button>
        </div>
        <div className="text-[9px] text-text-dim px-2 py-1.5 rounded-md bg-pressed neu-inset">
          Managed in Preferences — no in-panel path bridge yet.
        </div>
      </div>

      {/* The one working affordance. */}
      <button
        type="button"
        className="w-full text-[9px] font-bold uppercase tracking-widest py-1.5 rounded-md bg-pressed text-accent-blue hover:bg-elevated hover:neu-raised transition-[box-shadow,background-color] duration-150 ease-out"
        onClick={() => window.dispatchEvent(new Event(EV_OPEN_PREFERENCES))}
      >
        Open Preferences to Scan
      </button>
    </div>
  );
}

const CATEGORY_FILTERS = [
  { cat: "instrument" as const, label: "INST" },
  { cat: "audiofx" as const, label: "FX" },
  { cat: "midifx" as const, label: "MIDI" },
  { cat: "modulator" as const, label: "MOD" },
];

// ── ToolPalette ──

/**
 * Edit-mode left browser panel for adding Blocks to the Board. Search-first:
 * a single search field + category quick-filter chips drive a flat, scannable
 * plugin list (grid or list view) of the real host-scanned AU/VST3/CLAP/LV2
 * plugins, each a raised neumorphic card with a format badge. Tabs between this
 * Plugins view (favourites, recents, molecules, Boards, .elg import/export) and
 * a Projects view (host-scanned session files). Includes a plugin-scan control
 * group (currently routed to Preferences — no native scan bridge yet), the
 * active Board outline, recent sessions, a collapsible rail, and a live CPU
 * meter. Primary source for dragging/double-clicking instruments and effects
 * onto the canvas.
 */
export function ToolPalette({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
} = {}) {
  const [browseTab, setBrowseTab] = useState<"plugins" | "projects">("plugins");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<BlockCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showScan, setShowScan] = useState(false);
  const [sessionFiles, setSessionFiles] = useState<SessionFileEntry[]>([]);

  const nativePlugins = usePluginBrowserStore((s) => s.plugins);
  const favoriteIds = usePluginBrowserStore((s) => s.favoriteIdentifiers);
  const recentPluginIds = usePluginBrowserStore((s) => s.recentIdentifiers);
  const refreshPlugins = usePluginBrowserStore((s) => s.refresh);
  const recentFiles = useSessionStore((s) => s.recentFiles);
  const sessionGraphs = useSessionStore((s) => s.graphs);
  const molecules = useHostExtrasStore((s) => s.molecules);
  const activeGraphOutline = useHostExtrasStore((s) => s.activeGraphOutline);
  const cpuLoad = usePerformStore((s) => s.liveHealth.cpu);

  useEffect(() => {
    void refreshPlugins();
  }, [refreshPlugins]);

  useEffect(() => {
    if (browseTab !== "projects") return;
    let cancelled = false;
    void nativeSessionListFiles().then((entries) => {
      if (!cancelled) setSessionFiles(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [browseTab]);

  const plugins = useMemo(
    (): PluginEntry[] =>
      nativePlugins.map((p) => ({
        id: p.identifier,
        name: p.name,
        category: p.blockCategory,
        format: p.format,
      })),
    [nativePlugins],
  );

  const favPlugins = useMemo(() => {
    if (favoriteIds.size === 0) return [];
    return nativePlugins.filter((p) => favoriteIds.has(p.identifier));
  }, [nativePlugins, favoriteIds]);

  const recentPlugins = useMemo(() => {
    if (recentPluginIds.length === 0) return [];
    const map = new Map(nativePlugins.map((p) => [p.identifier, p] as const));
    return recentPluginIds
      .map((id) => map.get(id))
      .filter((p): p is (typeof nativePlugins)[0] => p != null);
  }, [nativePlugins, recentPluginIds]);

  const filtered = useMemo(
    () =>
      plugins.filter((p) => {
        if (activeCategory && p.category !== activeCategory) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q))
            return false;
        }
        return true;
      }),
    [plugins, activeCategory, search],
  );

  const filteredSessions = sessionFiles.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q);
  });

  // ── Collapsed rail ──
  if (collapsed) {
    return (
      <div className="w-10 shrink-0 flex flex-col items-center py-2 gap-2 bg-panel border-r border-panel-border h-full">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-surface neu-raised text-text-secondary hover:text-accent-blue transition-colors"
          title="Expand browser (⌘1)"
          aria-label="Expand browser"
        >
          <Icon name="Search" size={13} aria-hidden />
        </button>
        <div className="w-5 border-t border-white/5" />
        {CATEGORY_FILTERS.map(({ cat }) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setActiveCategory(activeCategory === cat ? null : cat);
              onToggleCollapse?.();
            }}
            className="w-6 h-6 flex items-center justify-center transition-opacity hover:opacity-100"
            title={`Filter: ${cat}`}
            aria-label={`Filter ${cat}`}
          >
            <RailCategoryIcon
              category={cat}
              active={activeCategory === null || activeCategory === cat}
            />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded overflow-hidden border border-white/10 text-[9px] font-bold uppercase">
            <button
              type="button"
              className={
                browseTab === "plugins"
                  ? "px-2.5 py-1 bg-accent-blue/25 text-accent-blue"
                  : "px-2.5 py-1 text-text-secondary hover:bg-white/5 transition-colors"
              }
              onClick={() => setBrowseTab("plugins")}
            >
              Plugins
            </button>
            <button
              type="button"
              className={
                browseTab === "projects"
                  ? "px-2.5 py-1 bg-accent-blue/25 text-accent-blue"
                  : "px-2.5 py-1 text-text-secondary hover:bg-white/5 transition-colors"
              }
              onClick={() => setBrowseTab("projects")}
            >
              Projects
            </button>
          </div>
          <div className="flex gap-1 items-center">
            <button
              type="button"
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              className={[
                "p-1 rounded transition-colors",
                viewMode === "grid"
                  ? "neu-inset text-accent-blue"
                  : "text-text-secondary hover:bg-white/5",
              ].join(" ")}
            >
              <Icon name="LayoutGrid" size={14} aria-hidden />
            </button>
            <button
              type="button"
              title="List view"
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={[
                "p-1 rounded transition-colors",
                viewMode === "list"
                  ? "neu-inset text-accent-blue"
                  : "text-text-secondary hover:bg-white/5",
              ].join(" ")}
            >
              <Icon name="List" size={14} aria-hidden />
            </button>
            {onToggleCollapse ? (
              <button
                type="button"
                title="Collapse (⌘1)"
                aria-label="Collapse browser"
                onClick={onToggleCollapse}
                className="p-1 rounded text-text-secondary hover:bg-white/5 transition-colors"
              >
                <Icon name="ChevronLeft" size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {/* Search — primary affordance */}
        <div className="relative">
          <NeuInput
            placeholder={
              browseTab === "plugins" ? "Search plugins…" : "Search project files…"
            }
            value={search}
            onChange={setSearch}
            className="pl-8"
          />
          <span className="absolute left-2 top-1.5 text-text-secondary">
            <Icon name="Search" size={16} aria-hidden />
          </span>
        </div>

        {/* Category quick-filter chips (Plugins only) */}
        {browseTab === "plugins" ? (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
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
                  onClick={() => setActiveCategory(isActive ? null : cat)}
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
        ) : null}
      </div>

      {/* Plugin / project list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {browseTab === "projects" ? (
          <div className="mb-3 space-y-1">
            <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase px-1">
              Session files (host scan)
            </div>
            {filteredSessions.length === 0 ? (
              <div className="text-[10px] text-text-dim py-2 px-1">
                No matches or host returned an empty list.
              </div>
            ) : (
              filteredSessions.map((e) => (
                <button
                  key={e.path}
                  type="button"
                  className="w-full text-left text-[10px] px-2 py-1.5 rounded-md text-text-secondary hover:bg-elevated hover:neu-raised hover:text-accent-blue truncate transition-[box-shadow,background-color,color] duration-150 ease-out"
                  title={e.path}
                  onClick={() => void nativeSessionOpenPath(e.path)}
                  onDoubleClick={() => void nativeSessionOpenPath(e.path)}
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        ) : null}

        {browseTab === "plugins" ? (
          <>
            {/* Scan controls — collapsible (#1 native gap). */}
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowScan((v) => !v)}
                aria-expanded={showScan}
                className="w-full flex items-center gap-1.5 px-1 py-1 text-[9px] font-bold text-text-secondary tracking-widest uppercase hover:text-text-primary transition-colors"
              >
                <Icon
                  name="ChevronRight"
                  size={11}
                  aria-hidden
                  className={`transition-transform duration-150 ${showScan ? "rotate-90" : ""}`}
                />
                Plugin Scan &amp; Paths
              </button>
              {showScan ? <ScanControls /> : null}
            </div>

            <div className="mb-3 pb-2 border-b border-white/5 space-y-1">
              {sessionGraphs.length > 0 && (
                <>
                  <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase px-1">
                    Boards
                  </div>
                  {sessionGraphs.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`w-full text-left text-[10px] px-2 py-1 rounded-md truncate transition-colors ${
                        g.active
                          ? "bg-accent-blue/20 text-accent-blue"
                          : "text-text-secondary hover:bg-white/5"
                      }`}
                      onClick={() => void nativeSessionSetActiveGraph(g.index)}
                    >
                      {g.name}
                    </button>
                  ))}
                </>
              )}
              {activeGraphOutline.length > 0 ? (
                <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase pt-2 px-1">
                  Board outline
                </div>
              ) : null}
              {activeGraphOutline.map((n) => (
                <OutlineRow key={n.id} node={n} depth={0} />
              ))}
              <div className="flex gap-1 pt-1">
                <button
                  type="button"
                  className="flex-1 text-[9px] py-1.5 rounded-md bg-pressed text-text-secondary uppercase tracking-wider hover:bg-elevated hover:text-text-primary transition-colors"
                  onClick={() => void nativeSessionImportGraph()}
                >
                  Import .elg
                </button>
                <button
                  type="button"
                  className="flex-1 text-[9px] py-1.5 rounded-md bg-pressed text-text-secondary uppercase tracking-wider hover:bg-elevated hover:text-text-primary transition-colors"
                  onClick={() => void nativeSessionExportGraph()}
                >
                  Export .elg
                </button>
              </div>
            </div>

            {favPlugins.length > 0 && (
              <div className="mb-3 pb-2 border-b border-white/5 space-y-1">
                <div className="text-[9px] font-bold text-accent-orange tracking-widest uppercase px-1 flex items-center gap-1">
                  <StarGlyph size={9} />
                  Favourites
                </div>
                {favPlugins.map((p) => (
                  <PluginCard
                    key={p.identifier}
                    plugin={{
                      id: p.identifier,
                      name: p.name,
                      category: p.blockCategory,
                      format: p.format,
                    }}
                    view="list"
                    selected={p.identifier === selectedId}
                    isFavourite
                    onSelect={() => setSelectedId(p.identifier)}
                    onAdd={() => void nativeGraphAddPlugin(p.identifier)}
                  />
                ))}
              </div>
            )}

            {recentPlugins.length > 0 && (
              <div className="mb-3 pb-2 border-b border-white/5 space-y-1">
                <div className="text-[9px] font-bold text-accent-teal tracking-widest uppercase px-1">
                  Recent plugins
                </div>
                {recentPlugins.map((p) => (
                  <PluginCard
                    key={p.identifier}
                    plugin={{
                      id: p.identifier,
                      name: p.name,
                      category: p.blockCategory,
                      format: p.format,
                    }}
                    view="list"
                    selected={p.identifier === selectedId}
                    isFavourite={favoriteIds.has(p.identifier)}
                    onSelect={() => setSelectedId(p.identifier)}
                    onAdd={() => void nativeGraphAddPlugin(p.identifier)}
                  />
                ))}
              </div>
            )}

            {molecules.length > 0 && (
              <div className="mb-3 pb-2 border-b border-white/5 space-y-1">
                <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase px-1">
                  Molecules
                </div>
                {molecules.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    className="w-full text-left text-[10px] px-2 py-1.5 rounded-md text-text-secondary hover:bg-elevated hover:neu-raised hover:text-accent-blue truncate transition-[box-shadow,background-color,color] duration-150 ease-out"
                    title={m.description || "Insert molecule at default position"}
                    onClick={() => void nativeMoleculeInsert(m.name, 140, 140)}
                  >
                    {m.name || "Untitled"}
                  </button>
                ))}
              </div>
            )}

            {/* Section heading for the main list */}
            <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase px-1 pt-1 pb-1 flex items-center justify-between">
              <span>{activeCategory ? CATEGORY_FILTERS.find((c) => c.cat === activeCategory)?.label : "All"} plugins</span>
              {filtered.length > 0 ? (
                <span className="text-text-dim tabular font-bold">{filtered.length}</span>
              ) : null}
            </div>

            {/* Plugin items — search-first flat list / grid */}
            {plugins.length === 0 ? (
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
            ) : filtered.length === 0 ? (
              <div className="px-2 py-3 text-[10px] text-text-dim text-center">
                No plugins match the current filter.
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 gap-1.5 px-1">
                {filtered.map((plugin) => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    view="grid"
                    selected={plugin.id === selectedId}
                    isFavourite={favoriteIds.has(plugin.id)}
                    onSelect={() => setSelectedId(plugin.id)}
                    onAdd={() => void nativeGraphAddPlugin(plugin.id)}
                  />
                ))}
              </div>
            ) : (
              filtered.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  view="list"
                  selected={plugin.id === selectedId}
                  isFavourite={favoriteIds.has(plugin.id)}
                  onSelect={() => setSelectedId(plugin.id)}
                  onAdd={() => void nativeGraphAddPlugin(plugin.id)}
                />
              ))
            )}
          </>
        ) : null}
      </nav>

      {recentFiles.length > 0 ? (
        <div className="px-3 py-2 border-t border-white/5 max-h-28 overflow-y-auto">
          <span className="text-[10px] font-bold tracking-widest text-text-secondary block mb-1">
            RECENT SESSIONS
          </span>
          <ul className="space-y-0.5">
            {recentFiles.map((path) => {
              const label = path.replace(/^.*[/\\]/, "");
              return (
                <li key={path}>
                  <button
                    type="button"
                    className="text-left w-full text-[10px] text-text-secondary hover:text-accent-blue truncate transition-colors"
                    title={path}
                    onClick={() => void nativeSessionOpenPath(path)}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* CPU Load footer */}
      <div className="p-4 border-t border-white/5 bg-pressed">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-end">
            <span className="text-[10px] text-text-secondary">CPU LOAD</span>
            <span className="text-[10px] text-accent-teal font-bold tabular">
              {cpuLoad.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#131317] rounded-full neu-inset overflow-hidden">
            <div
              className="h-full bg-accent-teal rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, cpuLoad))}%`,
                boxShadow: "0 0 8px rgba(43, 196, 196, 0.4)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
