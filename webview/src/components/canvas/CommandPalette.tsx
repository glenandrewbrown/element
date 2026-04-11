import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NeuInput } from "../neu";
import { useGraphStore } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { usePerformStore } from "../../stores/usePerformStore";
import {
  nativeUndo,
  nativeRedo,
  nativeGraphAddPlugin,
  nativeGraphCommentAdd,
} from "../../bridge/nativeGraph";
import { nativeSessionSave } from "../../bridge/nativeSession";

// ── Result types ──

type ResultCategory = "plugin" | "action" | "block" | "scene" | "setting";

interface PaletteResult {
  id: string;
  label: string;
  category: ResultCategory;
  hint?: string;
  onSelect: () => void;
}

// ── Category display ──

const categoryLabel: Record<ResultCategory, string> = {
  plugin: "Plugins",
  action: "Actions",
  block: "Blocks on Canvas",
  scene: "Scenes",
  setting: "Settings",
};

const categoryOrder: ResultCategory[] = [
  "action",
  "block",
  "plugin",
  "scene",
  "setting",
];

// ── Static action / plugin / scene / setting entries ──

const staticActions: Omit<PaletteResult, "onSelect">[] = [
  { id: "act-undo", label: "Undo", category: "action", hint: "Cmd+Z" },
  { id: "act-redo", label: "Redo", category: "action", hint: "Cmd+Shift+Z" },
  { id: "act-save", label: "Save Project", category: "action", hint: "Cmd+S" },
  { id: "act-bypass-all", label: "Bypass All Blocks", category: "action" },
  {
    id: "act-fit",
    label: "Fit Board to View",
    category: "action",
    hint: "Cmd+0",
  },
  {
    id: "act-toggle-mode",
    label: "Toggle Edit / Perform",
    category: "action",
    hint: "Cmd+Shift+M",
  },
  {
    id: "act-minimap",
    label: "Toggle Minimap",
    category: "action",
    hint: "Shift+M",
  },
  {
    id: "act-comment",
    label: "Create Comment Box",
    category: "action",
    hint: "Shift+C",
  },
];

const staticPlugins: Omit<PaletteResult, "onSelect">[] = [
  {
    id: "plug-osc",
    label: "OSCILLATOR_CORE_V3",
    category: "plugin",
    hint: "Generator",
  },
  {
    id: "plug-wave",
    label: "WAVETABLE_GEN",
    category: "plugin",
    hint: "Generator",
  },
  {
    id: "plug-filt",
    label: "LADDER_FILTER_24DB",
    category: "plugin",
    hint: "Modifier",
  },
  {
    id: "plug-lim",
    label: "PEAK_LIMITER",
    category: "plugin",
    hint: "Modifier",
  },
  {
    id: "plug-proq",
    label: "FabFilter Pro-Q 3",
    category: "plugin",
    hint: "VST3",
  },
  { id: "plug-val", label: "Valhalla Room", category: "plugin", hint: "VST3" },
  { id: "plug-lfo", label: "LFO Tool", category: "plugin", hint: "CLAP" },
];

const staticScenes: Omit<PaletteResult, "onSelect">[] = [
  { id: "scene-init", label: "Scene: Init", category: "scene" },
  { id: "scene-verse", label: "Scene: Verse A", category: "scene" },
  { id: "scene-chorus", label: "Scene: Chorus", category: "scene" },
  { id: "scene-drop", label: "Scene: Drop", category: "scene" },
];

const staticSettings: Omit<PaletteResult, "onSelect">[] = [
  { id: "set-audio", label: "Audio Device Settings", category: "setting" },
  { id: "set-midi", label: "MIDI Device Settings", category: "setting" },
  { id: "set-buffer", label: "Buffer Size", category: "setting" },
  { id: "set-shortcuts", label: "Keyboard Shortcuts", category: "setting" },
];

// ── Motion config ──

const EASE = [0.16, 1, 0.3, 1] as const;

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const panelVariants = {
  hidden: { opacity: 0, y: -12 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

// ── Props ──

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nodes = useGraphStore((s) => s.nodes);
  const toggleMinimap = useGraphStore((s) => s.toggleMinimap);
  const selectNode = useGraphStore((s) => s.selectNode);
  const toggleMode = useAppStore((s) => s.toggleMode);
  const nativePlugins = usePluginBrowserStore((s) => s.plugins);
  const scenes = usePerformStore((s) => s.scenes);
  const setActiveScene = useAppStore((s) => s.setScene);

  // Build results from blocks on canvas + statics + real plugins
  const allResults: PaletteResult[] = useMemo(() => {
    const close = () => onClose();
    
    // Canvas blocks - selecting focuses them
    const blockResults: PaletteResult[] = nodes.map((n) => ({
      id: `block-${n.id}`,
      label: n.name,
      category: "block" as const,
      hint: `${n.category} · ${n.format}`,
      onSelect: () => {
        selectNode(n.id);
        onClose();
      },
    }));

    // Actions with real handlers
    const actionResults: PaletteResult[] = [
      { id: "act-undo", label: "Undo", category: "action", hint: "Cmd+Z", onSelect: () => { void nativeUndo(); close(); } },
      { id: "act-redo", label: "Redo", category: "action", hint: "Cmd+Shift+Z", onSelect: () => { void nativeRedo(); close(); } },
      { id: "act-save", label: "Save Project", category: "action", hint: "Cmd+S", onSelect: () => { void nativeSessionSave(); close(); } },
      { id: "act-toggle-mode", label: "Toggle Edit / Perform", category: "action", hint: "Cmd+Shift+M", onSelect: () => { toggleMode(); close(); } },
      { id: "act-minimap", label: "Toggle Minimap", category: "action", hint: "Shift+M", onSelect: () => { toggleMinimap(); close(); } },
      { id: "act-comment", label: "Create Comment Box", category: "action", hint: "Shift+C", onSelect: () => { void nativeGraphCommentAdd(200, 200); close(); } },
    ];

    // Real plugins from native bridge
    const pluginResults: PaletteResult[] = nativePlugins.slice(0, 30).map((p) => ({
      id: `plug-${p.identifier}`,
      label: p.name,
      category: "plugin" as const,
      hint: p.formatName || p.blockCategory,
      onSelect: () => {
        void nativeGraphAddPlugin(p.identifier);
        onClose();
      },
    }));

    // Scenes
    const sceneResults: PaletteResult[] = scenes.map((s, idx) => ({
      id: `scene-${idx}`,
      label: `Scene: ${s.name}`,
      category: "scene" as const,
      onSelect: () => {
        setActiveScene(idx);
        onClose();
      },
    }));

    // Settings (still placeholders for now)
    const settingResults: PaletteResult[] = staticSettings.map((s) => ({ ...s, onSelect: close }));

    return [
      ...actionResults,
      ...blockResults,
      ...pluginResults,
      ...sceneResults,
      ...settingResults,
    ];
  }, [nodes, nativePlugins, scenes, onClose, selectNode, toggleMode, toggleMinimap, setActiveScene]);

  // Filter
  const filtered = useMemo(() => {
    if (!search) return allResults.slice(0, 12);
    const q = search.toLowerCase();
    return allResults.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.hint?.toLowerCase().includes(q) ||
        r.category.includes(q),
    );
  }, [search, allResults]);

  // Group by category in display order
  const grouped = useMemo(() => {
    const groups: { category: ResultCategory; items: PaletteResult[] }[] = [];
    for (const cat of categoryOrder) {
      const items = filtered.filter((r) => r.category === cat);
      if (items.length > 0) groups.push({ category: cat, items });
    }
    return groups;
  }, [filtered]);

  // Flat list for keyboard nav
  const flatList = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Reset on open/search change
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll into view
  useEffect(() => {
    const el = listRef.current?.querySelector(
      "[data-active='true']",
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          flatList[activeIndex]?.onSelect();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatList, activeIndex, onClose],
  );

  let runningIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-canvas/80"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.15, ease: EASE }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed z-[61] left-1/2 -translate-x-1/2"
            style={{ top: "40%" }}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.15, ease: EASE }}
            onKeyDown={handleKeyDown}
          >
            <div
              className="w-[520px] max-h-[420px] bg-panel rounded-lg overflow-hidden flex flex-col"
              style={{
                boxShadow:
                  "0 16px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
              }}
            >
              {/* Search */}
              <div className="p-3 border-b border-white/5">
                <NeuInput
                  ref={inputRef}
                  placeholder="Search plugins, actions, blocks, scenes..."
                  value={search}
                  onChange={setSearch}
                  className="!text-[13px] !py-2.5 !px-4"
                />
              </div>

              {/* Results */}
              <div ref={listRef} className="flex-1 overflow-y-auto py-2">
                {flatList.length === 0 && (
                  <div className="px-4 py-8 text-[11px] text-text-dim text-center uppercase tracking-widest">
                    No results
                  </div>
                )}
                {grouped.map((group) => (
                  <div key={group.category}>
                    <div className="px-4 pt-3 pb-1 text-[10px] text-text-dim font-bold uppercase tracking-widest">
                      {categoryLabel[group.category]}
                    </div>
                    {group.items.map((result) => {
                      const idx = runningIndex++;
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={result.id}
                          data-active={isActive}
                          onClick={result.onSelect}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={[
                            "w-full text-left px-4 py-1.5 flex items-center justify-between gap-4 transition-colors",
                            isActive
                              ? "bg-elevated text-text-primary"
                              : "text-text-secondary",
                          ].join(" ")}
                        >
                          <span className="text-[12px] truncate">
                            {result.label}
                          </span>
                          {result.hint && (
                            <span className="text-[10px] text-text-dim shrink-0 tabular">
                              {result.hint}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-2 border-t border-white/5 flex items-center gap-4 text-[10px] text-text-dim">
                <span>
                  <kbd className="px-1 py-0.5 bg-pressed rounded text-[10px]">
                    ↑↓
                  </kbd>{" "}
                  navigate
                </span>
                <span>
                  <kbd className="px-1 py-0.5 bg-pressed rounded text-[10px]">
                    ↵
                  </kbd>{" "}
                  select
                </span>
                <span>
                  <kbd className="px-1 py-0.5 bg-pressed rounded text-[10px]">
                    esc
                  </kbd>{" "}
                  close
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
