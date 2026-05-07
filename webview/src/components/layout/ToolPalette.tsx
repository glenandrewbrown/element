import { useEffect, useMemo, useState } from "react";
import { NeuInput, EmptyState } from "../neu";
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
import { Icon } from "../neu";
import { EV_OPEN_PREFERENCES } from "../../events";

// ── Category shape components ──

function GenShape() {
  return <div className="w-2 h-2 rounded-full bg-generator" />;
}
function ModShape() {
  return <div className="w-2 h-2 rotate-45 bg-modifier" />;
}
function LogicShape() {
  return (
    <div
      className="w-2 h-2 bg-logic"
      style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
    />
  );
}

interface PluginEntry {
  id: string;
  name: string;
  category: BlockCategory;
  icon: string;
}

function OutlineRow({
  node,
  depth,
}: {
  node: GraphOutlineNode;
  depth: number;
}) {
  return (
    <div className="pl-1">
      <div
        className={`text-[10px] truncate ${node.isContainer ? "text-logic font-bold" : "text-text-dim"}`}
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

const iconPaths: Record<string, string> = {
  radio: "M20 6H8l-4 4h16l-4-4zm2 6H2v8h20v-8zM4 16h2v2H4v-2z",
  waves:
    "M17 16.99c-1.35 0-2.2.42-2.95.8-.65.33-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6-.75-.38-1.57-.8-2.95-.8s-2.2.42-2.95.8c-.65.33-1.18.6-2.05.6v2c1.35 0 2.2-.42 2.95-.8.65-.33 1.18-.6 2.05-.6.9 0 1.4.25 2.05.6.75.38 1.57.8 2.95.8s2.2-.42 2.95-.8c.65-.33 1.18-.6 2.05-.6v-2c-.9 0-1.4.25-2.05.6-.75.38-1.57.8-2.95.8zm0-4.5c-1.35 0-2.2.43-2.95.8-.65.32-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6-.75-.38-1.57-.8-2.95-.8s-2.2.43-2.95.8c-.65.32-1.18.6-2.05.6v2c1.35 0 2.2-.43 2.95-.8.65-.32 1.18-.6 2.05-.6.9 0 1.4.25 2.05.6.75.38 1.57.8 2.95.8s2.2-.43 2.95-.8c.65-.32 1.18-.6 2.05-.6v-2c-.9 0-1.4.25-2.05.6-.75.38-1.57.8-2.95.8zm2.95-4.8c-.65.32-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6C15.1 7.37 14.27 6.95 12.9 6.95s-2.2.43-2.95.8c-.65.32-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6C5.1 7.37 4.27 6.95 2.9 6.95v2c1.35 0 2.2.43 2.95.8.65.32 1.18.6 2.05.6.9 0 1.4-.25 2.05-.6.75-.38 1.57-.8 2.95-.8s2.2.43 2.95.8c.65.32 1.18.6 2.05.6v-2c-.9 0-1.4-.25-2.05-.6z",
  filter_alt: "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z",
  compress: "M4 9v2h16V9H4zm0 4v2h16v-2H4z",
};

function PluginIcon({ icon }: { icon: string }) {
  const d = iconPaths[icon];
  if (!d) return null;
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}

// ── ToolPalette ──

export function ToolPalette() {
  const [browseTab, setBrowseTab] = useState<"plugins" | "projects">("plugins");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<BlockCategory | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
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

  const plugins = useMemo((): PluginEntry[] => {
    return nativePlugins.map((p) => ({
      id: p.identifier,
      name: p.name,
      category: p.blockCategory,
      icon:
        p.blockCategory === "generator"
          ? "radio"
          : p.blockCategory === "logic"
            ? "waves"
            : "filter_alt",
    }));
  }, [nativePlugins]);

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

  const filtered = plugins.filter((p) => {
    if (activeCategory && p.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  const filteredSessions = sessionFiles.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] font-bold tracking-widest text-text-secondary">
            BROWSER
          </span>
          <div className="flex rounded overflow-hidden border border-white/10 text-[9px] font-bold uppercase">
            <button
              type="button"
              className={
                browseTab === "plugins"
                  ? "px-2 py-1 bg-generator/25 text-generator"
                  : "px-2 py-1 text-text-secondary hover:bg-white/5"
              }
              onClick={() => setBrowseTab("plugins")}
            >
              Plugins
            </button>
            <button
              type="button"
              className={
                browseTab === "projects"
                  ? "px-2 py-1 bg-generator/25 text-generator"
                  : "px-2 py-1 text-text-secondary hover:bg-white/5"
              }
              onClick={() => setBrowseTab("projects")}
            >
              Projects
            </button>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode("grid")}
              className={[
                "p-1 rounded",
                viewMode === "grid"
                  ? "shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] text-generator"
                  : "text-text-secondary hover:bg-white/5",
              ].join(" ")}
            >
              <Icon name="LayoutGrid" size={14} aria-label="Grid view" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={[
                "p-1 rounded",
                viewMode === "list"
                  ? "shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] text-generator"
                  : "text-text-secondary hover:bg-white/5",
              ].join(" ")}
            >
              <Icon name="List" size={14} aria-label="List view" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <NeuInput
            placeholder={
              browseTab === "plugins"
                ? "Search plugins…"
                : "Search project files…"
            }
            value={search}
            onChange={setSearch}
            className="pl-8"
          />
          <span className="absolute left-2 top-1.5 text-text-secondary">
            <Icon name="Search" size={16} aria-hidden />
          </span>
        </div>
      </div>

      {/* Plugin / project list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {browseTab === "projects" ? (
          <div className="mb-3 space-y-1">
            <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase">
              Session files (host scan)
            </div>
            {filteredSessions.length === 0 ? (
              <div className="text-[10px] text-text-dim py-2">
                No matches or host returned an empty list.
              </div>
            ) : (
              filteredSessions.map((e) => (
                <button
                  key={e.path}
                  type="button"
                  className="w-full text-left text-[10px] px-2 py-1 rounded text-text-secondary hover:bg-white/5 hover:text-generator truncate"
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
            <div className="mb-3 pb-2 border-b border-white/5 space-y-1">
              {sessionGraphs.length > 0 && (
                <>
                  <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase">
                    Boards
                  </div>
                  {sessionGraphs.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`w-full text-left text-[10px] px-2 py-1 rounded truncate ${
                        g.active
                          ? "bg-generator/20 text-generator"
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
                <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase pt-2">
                  Board outline
                </div>
              ) : null}
              {activeGraphOutline.map((n) => (
                <OutlineRow key={n.id} node={n} depth={0} />
              ))}
              <div className="flex gap-1 pt-1">
                <button
                  type="button"
                  className="flex-1 text-[9px] py-1 rounded bg-pressed text-text-secondary uppercase"
                  onClick={() => void nativeSessionImportGraph()}
                >
                  Import .elg
                </button>
                <button
                  type="button"
                  className="flex-1 text-[9px] py-1 rounded bg-pressed text-text-secondary uppercase"
                  onClick={() => void nativeSessionExportGraph()}
                >
                  Export .elg
                </button>
              </div>
            </div>

            {favPlugins.length > 0 && (
              <div className="mb-3 pb-2 border-b border-white/5 space-y-1">
                <div className="text-[9px] font-bold text-modifier tracking-widest uppercase">
                  Favourites
                </div>
                {favPlugins.map((p) => (
                  <button
                    key={p.identifier}
                    type="button"
                    className="w-full text-left text-[10px] px-2 py-1 rounded text-text-primary hover:bg-white/5 truncate"
                    onClick={() => void nativeGraphAddPlugin(p.identifier)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {recentPlugins.length > 0 && (
              <div className="mb-3 pb-2 border-b border-white/5 space-y-1">
                <div className="text-[9px] font-bold text-logic tracking-widest uppercase">
                  Recent plugins
                </div>
                {recentPlugins.map((p) => (
                  <button
                    key={p.identifier}
                    type="button"
                    className="w-full text-left text-[10px] px-2 py-1 rounded text-text-secondary hover:bg-white/5 truncate"
                    onClick={() => void nativeGraphAddPlugin(p.identifier)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {molecules.length > 0 && (
              <div className="mb-3 pb-2 border-b border-white/5 space-y-1">
                <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase">
                  Molecules
                </div>
                {molecules.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    className="w-full text-left text-[10px] px-2 py-1 rounded text-text-secondary hover:bg-white/5 hover:text-generator truncate"
                    title={
                      m.description || "Insert molecule at default position"
                    }
                    onClick={() => void nativeMoleculeInsert(m.name, 140, 140)}
                  >
                    {m.name || "Untitled"}
                  </button>
                ))}
              </div>
            )}

            {/* Category filters */}
            <div className="flex justify-around py-2 border-b border-white/5 mb-2">
              {(
                [
                  { cat: "generator" as const, label: "GEN", Shape: GenShape },
                  { cat: "modifier" as const, label: "MOD", Shape: ModShape },
                  { cat: "logic" as const, label: "LOGIC", Shape: LogicShape },
                ] as const
              ).map(({ cat, label, Shape }) => (
                <button
                  key={cat}
                  onClick={() =>
                    setActiveCategory(activeCategory === cat ? null : cat)
                  }
                  className={[
                    "flex flex-col items-center gap-1 cursor-pointer transition-opacity",
                    activeCategory === null || activeCategory === cat
                      ? "opacity-100"
                      : "opacity-60 hover:opacity-100",
                  ].join(" ")}
                >
                  <Shape />
                  <span className="text-[10px] text-text-secondary">
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {/* Plugin items */}
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
                      className="px-3 py-1 rounded bg-pressed text-[11px] uppercase tracking-widest text-generator hover:bg-elevated transition-colors"
                      onClick={() =>
                        window.dispatchEvent(new Event(EV_OPEN_PREFERENCES))
                      }
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
            ) : (
              filtered.map((plugin) => {
                const isSelected = plugin.id === selectedId;
                return (
                  <div
                    key={plugin.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(plugin.id)}
                    onDoubleClick={() => void nativeGraphAddPlugin(plugin.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter")
                        void nativeGraphAddPlugin(plugin.id);
                    }}
                    className={[
                      "p-2 flex items-center gap-3 rounded transition-all cursor-pointer",
                      isSelected
                        ? "bg-surface shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/5 text-generator"
                        : "text-text-secondary opacity-60 hover:opacity-100 hover:bg-elevated",
                    ].join(" ")}
                  >
                    <PluginIcon icon={plugin.icon} />
                    <span className="text-[11px] font-medium truncate">
                      {plugin.name}
                    </span>
                  </div>
                );
              })
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
                    className="text-left w-full text-[10px] text-text-secondary hover:text-generator truncate"
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
            <span className="text-[10px] text-logic font-bold tabular">
              {cpuLoad.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#131317] rounded-full shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] overflow-hidden">
            <div
              className="h-full bg-logic rounded-full"
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
