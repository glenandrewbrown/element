import { useEffect, useState } from "react";
import { Icon } from "../neu/Icon";
import { categoryIconName } from "../neu/iconForCategory";
import type { BlockCategory } from "../../data/types";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { nativeSessionListFiles, nativeSessionOpenPath, nativeSessionRecover, type SessionFileEntry } from "../../bridge/nativeSession";
import { PaletteSearch } from "./palette/PaletteSearch";
import { CategoryChips, CATEGORY_FILTERS } from "./palette/CategoryChips";
import { ScanControls } from "./palette/ScanControls";
import { FavouritesSection } from "./palette/FavouritesSection";
import { RecentsSection } from "./palette/RecentsSection";
import { MoleculesSection } from "./palette/MoleculesSection";
import { BoardsSection } from "./palette/BoardsSection";
import { PluginList } from "./palette/PluginList";
import { PaletteFooter } from "./palette/PaletteFooter";
import { usePaletteFilters } from "./palette/usePaletteFilters";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";

// ── Collapsed-rail category icon ─────────────────────────────────────────────
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

// ── ToolPalette ───────────────────────────────────────────────────────────────

/**
 * Edit-mode left browser panel. Tabs: Plugins | Projects.
 *
 * Plugins tab IA (top → bottom):
 *   1. Tab row
 *   2. Search input + gear disclosure → ScanControls
 *   3. Category filter chips
 *   4. Favourites (collapsible, default open, hidden when empty)
 *   5. Recent plugins (collapsible, default open, hidden when empty)
 *   6. ALL PLUGINS — virtualized flat list (list mode) / grid
 *   7. Molecules (collapsible, default collapsed, hidden when empty)
 *   8. Boards (collapsible, default collapsed)
 *
 * Projects tab: search + Project files (host scan) + Recent Projects.
 *
 * Footer: CPU meter only.
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

  const refreshPlugins = usePluginBrowserStore((s) => s.refresh);
  const recentFiles = useSessionStore((s) => s.recentFiles);
  const sessionGraphs = useSessionStore((s) => s.graphs);
  const molecules = useHostExtrasStore((s) => s.molecules);
  const activeGraphOutline = useHostExtrasStore((s) => s.activeGraphOutline);

  const { plugins, favPlugins, recentPlugins, filtered, favoriteIds } =
    usePaletteFilters(search, activeCategory);

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

  const filteredSessions = sessionFiles.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q);
  });
  // 4b — autosave recoverables get their own group + a real recovery action
  // (nativeSessionRecover), distinct from opening a named `.els` directly.
  const recoverableSessions = filteredSessions.filter((e) => e.isRecoverable);
  const namedSessions = filteredSessions.filter((e) => !e.isAutosave);

  // ── Collapsed rail ──────────────────────────────────────────────────────────
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

  // ── Expanded panel ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* ── Header: tabs + view controls ── */}
      <div className="p-3 pb-2 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Tab row */}
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

          {/* View controls */}
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

        {/* Search row + gear disclosure */}
        <PaletteSearch
          tab={browseTab}
          value={search}
          onChange={setSearch}
          showScan={showScan}
          onToggleScan={() => setShowScan((v) => !v)}
        />

        {/* Category chips (Plugins tab only) */}
        {browseTab === "plugins" ? (
          <CategoryChips
            activeCategory={activeCategory}
            onSelect={setActiveCategory}
          />
        ) : null}
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 min-h-0">
        {/* Scan controls disclosure (Plugins tab, gear button toggles) */}
        {browseTab === "plugins" && showScan ? (
          <ScanControls />
        ) : null}

        {/* ── Projects tab ── */}
        {browseTab === "projects" ? (
          <>
            {/* Recoverable autosaves (E1) — distinct group + recovery action */}
            {recoverableSessions.length > 0 ? (
              <div className="mb-3 space-y-1">
                <div className="text-[9px] font-bold text-accent-teal tracking-widest uppercase px-1">
                  Recover
                </div>
                {recoverableSessions.map((e) => (
                  <button
                    key={e.path}
                    type="button"
                    className="w-full text-left text-[10px] px-2 py-1.5 rounded-md text-text-secondary hover:bg-elevated hover:neu-raised hover:text-accent-teal truncate transition-[box-shadow,background-color,color] duration-150 ease-out"
                    title={`Recover autosave — ${e.path}`}
                    onClick={() => void nativeSessionRecover(e.path)}
                  >
                    {e.name}{" "}
                    <span className="text-text-dim normal-case">(autosave)</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mb-3 space-y-1">
              <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase px-1">
                Project files (host scan)
              </div>
              {namedSessions.length === 0 ? (
                <div className="text-[10px] text-text-dim py-2 px-1">
                  No matches or host returned an empty list.
                </div>
              ) : (
                namedSessions.map((e) => (
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

            {/* Recent Projects (moved from footer into Projects tab) */}
            {recentFiles.length > 0 ? (
              <div className="border-t border-white/5 pt-2 space-y-0.5">
                <span className="text-[9px] font-bold tracking-widest text-text-secondary block mb-1 px-1 uppercase">
                  Recent Projects
                </span>
                <ul className="space-y-0.5">
                  {recentFiles.map((path) => {
                    const label = path.replace(/^.*[/\\]/, "");
                    return (
                      <li key={path}>
                        <button
                          type="button"
                          className="text-left w-full text-[10px] text-text-secondary hover:text-accent-blue truncate transition-colors px-1"
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
          </>
        ) : null}

        {/* ── Plugins tab ── */}
        {browseTab === "plugins" ? (
          <>
            {/* 4. Favourites — collapsible, default open */}
            <FavouritesSection
              favPlugins={favPlugins}
              favoriteIds={favoriteIds}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            {/* 5. Recent plugins — collapsible, default open */}
            <RecentsSection
              recentPlugins={recentPlugins}
              favoriteIds={favoriteIds}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            {/* 6. ALL PLUGINS — primary surface, virtualized list / grid */}
            <PluginList
              plugins={plugins}
              filtered={filtered}
              favoriteIds={favoriteIds}
              selectedId={selectedId}
              viewMode={viewMode}
              activeCategory={activeCategory}
              onSelect={setSelectedId}
            />

            {/* 7. Molecules — collapsible, default collapsed */}
            <MoleculesSection molecules={molecules} />

            {/* 8. Boards — collapsible, default collapsed */}
            <BoardsSection
              sessionGraphs={sessionGraphs}
              activeGraphOutline={activeGraphOutline}
            />
          </>
        ) : null}
      </div>

      {/* ── Footer: CPU meter only ── */}
      <PaletteFooter />
    </div>
  );
}
