import { useEffect, useMemo, useState } from "react";
import { NeuInput } from "../neu";
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

// ── SVG icon paths ──

const ICON_GRID =
  "M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z";
const ICON_LIST =
  "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z";
const ICON_SEARCH =
  "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z";
const ICON_LIBRARY = "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z";
const ICON_STAR = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";
const ICON_STAR_OUTLINE = "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z";
const ICON_HISTORY = "M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z";
const ICON_SETTINGS = "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z";

type SidebarTab = "plugins" | "favs" | "recent" | "config";

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, string> = {
    VST3: "bg-generator/20 text-generator border-generator/30",
    AU: "bg-modifier/20 text-modifier border-modifier/30",
    CLAP: "bg-logic/20 text-logic border-logic/30",
    LV2: "bg-error/20 text-error border-error/30",
    CORE: "bg-white/10 text-text-secondary border-white/10",
  };
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded border ${colors[format] || colors.CORE}`}>
      {format}
    </span>
  );
}

function Icon({
  d,
  size = 14,
  className = "",
}: {
  d: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

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

const pluginsDemoFallback: PluginEntry[] = [
  {
    id: "osc-core",
    name: "OSCILLATOR_CORE_V3",
    category: "generator",
    icon: "radio",
  },
  {
    id: "wave-gen",
    name: "WAVETABLE_GEN",
    category: "generator",
    icon: "waves",
  },
  {
    id: "ladder-filt",
    name: "LADDER_FILTER_24DB",
    category: "modifier",
    icon: "filter_alt",
  },
  {
    id: "peak-lim",
    name: "PEAK_LIMITER",
    category: "modifier",
    icon: "compress",
  },
];

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
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("plugins");
  const [browseTab, setBrowseTab] = useState<"plugins" | "projects">("plugins");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<BlockCategory | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sessionFiles, setSessionFiles] = useState<SessionFileEntry[]>([]);

  const sidebarItems: { id: SidebarTab; icon: string; label: string }[] = [
    { id: "plugins", icon: ICON_LIBRARY, label: "Plugins" },
    { id: "favs", icon: ICON_STAR, label: "Favs" },
    { id: "recent", icon: ICON_HISTORY, label: "Recent" },
    { id: "config", icon: ICON_SETTINGS, label: "Config" },
  ];

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
    if (nativePlugins.length === 0) return pluginsDemoFallback;
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
    <div className="flex h-full">
      {/* Left sidebar icons */}
      <div className="w-14 shrink-0 flex flex-col items-center py-3 border-r border-white/5 bg-pressed">
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setSidebarTab(item.id)}
            className={[
              "w-10 h-10 flex flex-col items-center justify-center rounded-lg mb-1 transition-colors",
              sidebarTab === item.id
                ? "bg-generator/20 text-generator"
                : "text-text-secondary hover:bg-white/5 hover:text-text-primary",
            ].join(" ")}
            title={item.label}
          >
            <Icon d={item.icon} size={18} />
            <span className="text-[8px] mt-0.5 uppercase">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-bold tracking-widest text-text-secondary">
              {sidebarTab === "plugins" ? "BROWSER" : sidebarTab === "favs" ? "FAVOURITES" : sidebarTab === "recent" ? "RECENT" : "CONFIG"}
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
              <Icon d={ICON_GRID} />
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
              <Icon d={ICON_LIST} />
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
            <Icon d={ICON_SEARCH} size={16} />
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
            {filtered.map((plugin) => {
              const isSelected = plugin.id === selectedId;
              const nativePlugin = nativePlugins.find((p) => p.identifier === plugin.id);
              const format = nativePlugin?.format?.toUpperCase() || "VST3";
              return (
                <div
                  key={plugin.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onClick={() => setSelectedId(plugin.id)}
                  onDoubleClick={() => void nativeGraphAddPlugin(plugin.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/element-plugin", plugin.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter")
                      void nativeGraphAddPlugin(plugin.id);
                  }}
                  className={[
                    "p-2 flex items-center gap-3 rounded transition-all cursor-grab active:cursor-grabbing",
                    isSelected
                      ? "bg-surface shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/5 text-generator"
                      : "text-text-secondary opacity-70 hover:opacity-100 hover:bg-elevated",
                  ].join(" ")}
                >
                  <PluginIcon icon={plugin.icon} />
                  <span className="flex-1 text-[11px] font-medium truncate">
                    {plugin.name}
                  </span>
                  <FormatBadge format={format} />
                </div>
              );
            })}
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
    </div>
  );
}
