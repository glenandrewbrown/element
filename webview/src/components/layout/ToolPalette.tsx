import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NeuInput, EmptyState, Icon } from "../neu";
import type { BlockCategory } from "../../data/types";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { catConfig } from "../canvas/Block";
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
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { EV_OPEN_PREFERENCES } from "../../events";

// ── Category filter descriptors ─────────────────────────────────────────────
// Colourblind-safe geometry (● ◆ ▲ ⬡). Label/hex sourced from catConfig
// (read-only import). These are presentational helpers — NOT a new Record.

const CAT_FILTERS: ReadonlyArray<{
  cat: BlockCategory;
  shape: string;
  shortLabel: string;
}> = [
  { cat: "instrument", shape: "●", shortLabel: "INST" },
  { cat: "audiofx",    shape: "◆", shortLabel: "FX"   },
  { cat: "midifx",     shape: "▲", shortLabel: "MIDI" },
  { cat: "modulator",  shape: "⬡", shortLabel: "MOD"  },
] as const;

// ── PluginRow ─────────────────────────────────────────────────────────────────

interface PluginItemData {
  id: string;
  name: string;
  category: BlockCategory;
  format: string;
}

function PluginRow({
  plugin,
  isSelected,
  onSelect,
}: {
  plugin: PluginItemData;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const shapeChar =
    CAT_FILTERS.find((c) => c.cat === plugin.category)?.shape ?? "●";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={plugin.name}
      aria-pressed={isSelected}
      onClick={() => onSelect(plugin.id)}
      onDoubleClick={() => void nativeGraphAddPlugin(plugin.id)}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") void nativeGraphAddPlugin(plugin.id);
      }}
      className={[
        "px-2 py-1.5 flex items-center gap-2 rounded cursor-pointer select-none transition-all",
        isSelected
          ? "bg-surface shadow-[-2px_-2px_6px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] text-text-primary"
          : "text-text-secondary hover:text-text-primary hover:bg-elevated",
      ].join(" ")}
    >
      <span
        className="shrink-0 text-[12px] leading-none"
        style={{ color: catConfig[plugin.category].hex }}
        aria-hidden
      >
        {shapeChar}
      </span>
      <span className="text-[var(--text-sm)] truncate flex-1 min-w-0">
        {plugin.name}
      </span>
      {plugin.format && plugin.format !== "INT" && (
        <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-white/10 text-text-dim uppercase font-bold leading-none">
          {plugin.format}
        </span>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 space-y-0.5">
      <div
        className={[
          "text-[var(--text-xs)] font-bold tracking-widest uppercase px-1 mb-1",
          accent ?? "text-text-secondary",
        ].join(" ")}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// ── ToolPalette ───────────────────────────────────────────────────────────────

/**
 * Edit-mode left browser panel for adding Blocks to the Board. Three tabs:
 * Plugins (4-category filter, favourites, recents, full scanned list),
 * Molecules (prebuilt snippets — saved Block+Cable groups), and Projects
 * (boards, session files, import/export). Search filters the active tab.
 */
export function ToolPalette() {
  const [browseTab, setBrowseTab] = useState<
    "plugins" | "molecules" | "projects"
  >("plugins");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<BlockCategory | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessionFiles, setSessionFiles] = useState<SessionFileEntry[]>([]);

  const nativePlugins = usePluginBrowserStore((s) => s.plugins);
  const favoriteIds   = usePluginBrowserStore((s) => s.favoriteIdentifiers);
  const recentIds     = usePluginBrowserStore((s) => s.recentIdentifiers);
  const refreshPlugins = usePluginBrowserStore((s) => s.refresh);
  const recentFiles   = useSessionStore((s) => s.recentFiles);
  const sessionGraphs = useSessionStore((s) => s.graphs);
  const molecules     = useHostExtrasStore((s) => s.molecules);

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

  // ── Derived plugin lists ──
  const allPlugins = useMemo(
    () =>
      nativePlugins.map((p) => ({
        id: p.identifier,
        name: p.name,
        category: p.blockCategory,
        format: p.format,
      })),
    [nativePlugins],
  );

  const favPlugins = useMemo(
    () => allPlugins.filter((p) => favoriteIds.has(p.id)),
    [allPlugins, favoriteIds],
  );

  const recentPlugins = useMemo(() => {
    const map = new Map(allPlugins.map((p) => [p.id, p] as const));
    return recentIds
      .map((id) => map.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [allPlugins, recentIds]);

  const filteredPlugins = useMemo(
    () =>
      allPlugins.filter((p) => {
        if (activeCategory && p.category !== activeCategory) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
          );
        }
        return true;
      }),
    [allPlugins, activeCategory, search],
  );

  const filteredMolecules = useMemo(() => {
    if (!search) return molecules;
    const q = search.toLowerCase();
    return molecules.filter((m) => m.name.toLowerCase().includes(q));
  }, [molecules, search]);

  const filteredSessions = useMemo(() => {
    if (!search) return sessionFiles;
    const q = search.toLowerCase();
    return sessionFiles.filter(
      (e) =>
        e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q),
    );
  }, [sessionFiles, search]);

  // ── Tab labels ──
  const searchPlaceholder =
    browseTab === "plugins"
      ? "Search plugins…"
      : browseTab === "molecules"
        ? "Search molecules…"
        : "Search projects…";

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-[var(--panel-padding-md)] pt-[var(--panel-padding-md)] pb-2 space-y-2 border-b border-white/5">
        <span className="text-[var(--text-xs)] font-bold tracking-widest text-text-secondary">
          BROWSER
        </span>

        {/* Type tabs */}
        <div
          role="tablist"
          aria-label="Browser tabs"
          className="flex rounded overflow-hidden shadow-[inset_1px_1px_4px_rgba(0,0,0,0.5),inset_-1px_-1px_2px_rgba(255,255,255,0.03)] bg-pressed"
        >
          {(["plugins", "molecules", "projects"] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={browseTab === tab}
              onClick={() => {
                setBrowseTab(tab);
                setSearch("");
                setActiveCategory(null);
              }}
              className={[
                "flex-1 h-[var(--control-h-sm)] text-[var(--text-xs)] font-bold uppercase tracking-wider transition-all",
                browseTab === tab
                  ? "bg-elevated text-text-primary shadow-[-2px_-2px_4px_rgba(255,255,255,0.04),2px_2px_6px_rgba(0,0,0,0.35)]"
                  : "text-text-dim hover:text-text-secondary",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <NeuInput
            placeholder={searchPlaceholder}
            value={search}
            onChange={setSearch}
            className="pl-8"
          />
          <span className="absolute left-2 top-1.5 text-text-dim pointer-events-none">
            <Icon name="Search" size={16} aria-hidden />
          </span>
        </div>

        {/* Category filter chips — Plugins tab only */}
        {browseTab === "plugins" && (
          <div
            role="group"
            aria-label="Category filter"
            className="flex justify-around py-1"
          >
            {CAT_FILTERS.map(({ cat, shape, shortLabel }) => {
              const dimmed =
                activeCategory !== null && activeCategory !== cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-label={`Filter by ${catConfig[cat].label}`}
                  aria-pressed={activeCategory === cat}
                  onClick={() =>
                    setActiveCategory(activeCategory === cat ? null : cat)
                  }
                  style={{ color: catConfig[cat].hex }}
                  className={[
                    "flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-opacity",
                    dimmed ? "opacity-30 hover:opacity-60" : "opacity-100",
                  ].join(" ")}
                >
                  <span className="text-[13px] leading-none">{shape}</span>
                  <span className="text-[var(--text-xs)] text-text-secondary leading-none">
                    {shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <nav
        aria-label="Block browser"
        className="flex-1 overflow-y-auto px-2 py-2"
      >
        {/* ── Plugins tab ── */}
        {browseTab === "plugins" && (
          <>
            {favPlugins.length > 0 && (
              <Section label="Favorites" accent="text-accent-orange">
                {favPlugins.map((p) => (
                  <PluginRow
                    key={p.id}
                    plugin={p}
                    isSelected={selectedId === p.id}
                    onSelect={setSelectedId}
                  />
                ))}
              </Section>
            )}

            {recentPlugins.length > 0 && (
              <Section label="Recent" accent="text-accent-teal">
                {recentPlugins.map((p) => (
                  <PluginRow
                    key={p.id}
                    plugin={p}
                    isSelected={selectedId === p.id}
                    onSelect={setSelectedId}
                  />
                ))}
              </Section>
            )}

            {allPlugins.length === 0 ? (
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
                      className="px-3 py-1 rounded bg-pressed text-[var(--text-xs)] uppercase tracking-widest text-accent-blue hover:bg-elevated transition-colors"
                      onClick={() =>
                        window.dispatchEvent(new Event(EV_OPEN_PREFERENCES))
                      }
                    >
                      Open Preferences
                    </button>
                  }
                />
              </div>
            ) : filteredPlugins.length === 0 ? (
              <p className="px-2 py-3 text-[var(--text-xs)] text-text-dim text-center">
                No plugins match the current filter.
              </p>
            ) : (
              <Section
                label={
                  activeCategory
                    ? catConfig[activeCategory].label
                    : "All Plugins"
                }
              >
                {filteredPlugins.map((p) => (
                  <PluginRow
                    key={p.id}
                    plugin={p}
                    isSelected={selectedId === p.id}
                    onSelect={setSelectedId}
                  />
                ))}
              </Section>
            )}
          </>
        )}

        {/* ── Molecules tab ── */}
        {browseTab === "molecules" && (
          <>
            {filteredMolecules.length === 0 ? (
              <div className="px-2 py-4">
                <EmptyState
                  illustration="no-connections"
                  size="sm"
                  tone="audio"
                  title={molecules.length === 0 ? "No snippets yet" : "No matches"}
                  description={
                    molecules.length === 0
                      ? "Snippets are prebuilt groups of Blocks and Cables. Save a selection to build your library."
                      : "No snippets match the search."
                  }
                />
              </div>
            ) : (
              <Section label="Snippets &amp; Molecules">
                {filteredMolecules.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    className="w-full text-left text-[var(--text-sm)] px-2 py-1.5 rounded text-text-secondary hover:bg-white/5 hover:text-accent-blue truncate flex items-center gap-2 transition-colors"
                    title={m.description || "Insert molecule at default position"}
                    onClick={() => void nativeMoleculeInsert(m.name, 140, 140)}
                  >
                    <span
                      className="shrink-0 text-[12px] leading-none"
                      style={{ color: catConfig.modulator.hex }}
                      aria-hidden
                    >
                      ⬡
                    </span>
                    <span className="truncate">{m.name || "Untitled"}</span>
                  </button>
                ))}
              </Section>
            )}
          </>
        )}

        {/* ── Projects tab ── */}
        {browseTab === "projects" && (
          <>
            {sessionGraphs.length > 0 && (
              <Section label="Boards">
                {sessionGraphs.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={[
                      "w-full text-left text-[var(--text-sm)] px-2 py-1.5 rounded truncate flex items-center gap-2 transition-colors",
                      g.active
                        ? "bg-accent-blue/20 text-accent-blue"
                        : "text-text-secondary hover:bg-white/5",
                    ].join(" ")}
                    onClick={() => void nativeSessionSetActiveGraph(g.index)}
                  >
                    <Icon name="LayoutGrid" size={12} aria-hidden />
                    <span className="truncate">{g.name}</span>
                  </button>
                ))}
              </Section>
            )}

            {/* .elg import / export */}
            <div className="flex gap-2 px-1 py-1 mb-3">
              <button
                type="button"
                className="flex-1 text-[var(--text-xs)] h-[var(--control-h-sm)] rounded bg-pressed text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors"
                onClick={() => void nativeSessionImportGraph()}
              >
                Import .elg
              </button>
              <button
                type="button"
                className="flex-1 text-[var(--text-xs)] h-[var(--control-h-sm)] rounded bg-pressed text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors"
                onClick={() => void nativeSessionExportGraph()}
              >
                Export .elg
              </button>
            </div>

            {filteredSessions.length > 0 && (
              <Section label="Session Files">
                {filteredSessions.map((e) => (
                  <button
                    key={e.path}
                    type="button"
                    className="w-full text-left text-[var(--text-sm)] px-2 py-1.5 rounded text-text-secondary hover:bg-white/5 hover:text-accent-blue truncate transition-colors"
                    title={e.path}
                    onClick={() => void nativeSessionOpenPath(e.path)}
                  >
                    {e.name}
                  </button>
                ))}
              </Section>
            )}

            {recentFiles.length > 0 && (
              <Section label="Recent Sessions">
                {recentFiles.map((path) => {
                  const label = path.replace(/^.*[/\\]/, "");
                  return (
                    <button
                      key={path}
                      type="button"
                      className="w-full text-left text-[var(--text-sm)] text-text-secondary hover:text-accent-blue truncate px-2 py-1 transition-colors"
                      title={path}
                      onClick={() => void nativeSessionOpenPath(path)}
                    >
                      {label}
                    </button>
                  );
                })}
              </Section>
            )}

            {sessionGraphs.length === 0 &&
              filteredSessions.length === 0 &&
              recentFiles.length === 0 && (
                <p className="px-2 py-4 text-[var(--text-xs)] text-text-dim text-center">
                  No projects found.
                </p>
              )}
          </>
        )}
      </nav>
    </div>
  );
}
