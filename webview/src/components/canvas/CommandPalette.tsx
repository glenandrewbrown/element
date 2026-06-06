import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NeuInput, Icon } from "../neu";
import { useGraphStore } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
// SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. usePerformStore /
// selectScenes no longer imported here (Scene results + mode toggle unwired).
// The store remains on disk; re-import to restore the Scene command results.
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import {
  nativeGraphAddPlugin,
  nativeGraphSetBypass,
  nativeRedo,
  nativeTransportSetRecording,
  nativeTransportTogglePlay,
  nativeUndo,
} from "../../bridge/nativeGraph";
import { nativeSessionOpen, nativeSessionSave } from "../../bridge/nativeSession";
import {
  nativeHideAllPluginWindows,
  nativeMappingSetLearning,
  nativeOpenGraphMixer,
  nativeOpenLuaConsole,
} from "../../bridge/nativePrefs";

// ── Result types ──

type ResultCategory = "plugin" | "action" | "block" | "scene" | "setting";

interface PaletteResult {
  id: string;
  label: string;
  category: ResultCategory;
  hint?: string;
  onSelect: () => void;
  /**
   * I4-B — when set, this result is a scannable plugin and the row shows a
   * far-right persistent favourite-star toggle keyed on this identifier
   * (BrowserPlugin.identifier). Absent for actions / blocks / settings.
   */
  pluginIdentifier?: string;
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

import {
  EV_FIT_BOARD,
  EV_CREATE_COMMENT,
  EV_OPEN_PREFERENCES,
} from "../../events";

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

interface CommandPaletteProps {
  /** Whether the palette is visible. Drives the mount/enter/exit animation. */
  open: boolean;
  /** Called to dismiss the palette (overlay click, Escape, or after a command runs). */
  onClose: () => void;
}

/**
 * CommandPalette — the Cmd+K "search everything" overlay, the keyboard-first
 * spine of Element's speed-first navigation. Use it to give expert users one
 * fuzzy-searchable entry point to actions (undo, save, bypass all, toggle
 * Edit/Perform), Blocks currently on the Board, scannable plugins, Scenes, and
 * host settings — each grouped and executed without leaving the keyboard
 * (↑↓ to move, ↵ to run, esc to close).
 *
 * Mount it once near the app root and toggle `open`; it aggregates its results
 * live from `useGraphStore`, `usePluginBrowserStore`, and `usePerformStore`,
 * and dispatches selected commands through the native bridge.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const nodes = useGraphStore((s) => s.nodes);
  const selectNode = useGraphStore((s) => s.selectNode);
  const toggleMinimap = useGraphStore((s) => s.toggleMinimap);
  const openBlockTab = useAppStore((s) => s.openBlockTab);
  // SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. toggleMode, setScene
  // and the usePerformStore scenes list are no longer read here: the
  // Edit/Perform toggle command and Scene results are removed from the palette.
  const nativePlugins = usePluginBrowserStore((s) => s.plugins);
  const favoriteIdentifiers = usePluginBrowserStore((s) => s.favoriteIdentifiers);
  const recentIdentifiers = usePluginBrowserStore((s) => s.recentIdentifiers);
  const refreshPlugins = usePluginBrowserStore((s) => s.refresh);
  const toggleFavorite = usePluginBrowserStore((s) => s.toggleFavorite);
  const mappingLearning = useHostExtrasStore((s) => s.midiMapping.learning);

  useEffect(() => {
    if (open) {
      void refreshPlugins();
    }
  }, [open, refreshPlugins]);

  const runAndClose = useCallback(
    (action: () => void | Promise<unknown>) => () => {
      void action();
      onClose();
    },
    [onClose],
  );

  const orderedPlugins = useMemo(() => {
    if (nativePlugins.length === 0) return [];
    const byRecent = new Map(recentIdentifiers.map((id, index) => [id, index]));
    return [...nativePlugins].sort((a, b) => {
      const aFav = favoriteIdentifiers.has(a.identifier) ? 0 : 1;
      const bFav = favoriteIdentifiers.has(b.identifier) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;

      const aRecent = byRecent.has(a.identifier)
        ? byRecent.get(a.identifier) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;
      const bRecent = byRecent.has(b.identifier)
        ? byRecent.get(b.identifier) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;
      if (aRecent !== bRecent) return aRecent - bRecent;

      return a.name.localeCompare(b.name);
    });
  }, [nativePlugins, favoriteIdentifiers, recentIdentifiers]);

  const allResults: PaletteResult[] = useMemo(() => {
    const actionResults: PaletteResult[] = [
      {
        id: "act-undo",
        label: "Undo",
        category: "action",
        hint: "Cmd+Z",
        onSelect: runAndClose(() => nativeUndo()),
      },
      {
        id: "act-redo",
        label: "Redo",
        category: "action",
        hint: "Cmd+Shift+Z",
        onSelect: runAndClose(() => nativeRedo()),
      },
      {
        id: "act-save",
        label: "Save Project",
        category: "action",
        hint: "Cmd+S",
        onSelect: runAndClose(() => nativeSessionSave()),
      },
      {
        id: "act-open",
        label: "Open Project…",
        category: "action",
        hint: "File dialog",
        onSelect: runAndClose(() => nativeSessionOpen()),
      },
      {
        id: "act-play",
        label: "Play / Pause Engine",
        category: "action",
        hint: "Transport",
        onSelect: runAndClose(() => nativeTransportTogglePlay()),
      },
      {
        id: "act-bypass-all",
        label: "Bypass All Blocks",
        category: "action",
        hint: `${nodes.length} blocks`,
        onSelect: runAndClose(async () => {
          await Promise.all(
            nodes
              .filter((node) => !node.bypassed)
              .map((node) => nativeGraphSetBypass(node.id, true)),
          );
        }),
      },
      {
        id: "act-fit",
        label: "Fit Board to View",
        category: "action",
        hint: "Cmd+0",
        onSelect: runAndClose(() => {
          window.dispatchEvent(new CustomEvent(EV_FIT_BOARD));
        }),
      },
      // SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. The
      // "Toggle Edit / Perform" command is removed (Perform mode shelved).
      // Restore by re-adding an action wired to `toggleMode`.
      {
        id: "act-minimap",
        label: "Toggle Minimap",
        category: "action",
        hint: "Shift+M",
        onSelect: runAndClose(() => {
          toggleMinimap();
        }),
      },
      {
        id: "act-comment",
        label: "Create Comment Box",
        category: "action",
        hint: "Shift+C",
        onSelect: runAndClose(() => {
          window.dispatchEvent(new CustomEvent(EV_CREATE_COMMENT));
        }),
      },
      // US-002: Record toggle
      {
        id: "act-record-on",
        label: "Start Recording",
        category: "action",
        hint: "Transport",
        onSelect: runAndClose(() => nativeTransportSetRecording(true)),
      },
      {
        id: "act-record-off",
        label: "Stop Recording",
        category: "action",
        hint: "Transport",
        onSelect: runAndClose(() => nativeTransportSetRecording(false)),
      },
      // US-004: Plugin windows
      {
        id: "act-hide-plugin-windows",
        label: "Hide All Plugin Windows",
        category: "action",
        hint: "Plugin editors",
        onSelect: runAndClose(() => nativeHideAllPluginWindows()),
      },
      {
        id: "act-virtual-keyboard",
        label: "Toggle Virtual Keyboard",
        category: "action",
        hint: "MIDI input · Shift+K",
        onSelect: runAndClose(() => useAppStore.getState().toggleVirtualKeyboard()),
      },
    ];

    const blockResults: PaletteResult[] = nodes.map((node) => ({
      id: `block-${node.id}`,
      label: node.name,
      category: "block",
      hint: `${node.category} · ${node.format}`,
      onSelect: runAndClose(() => {
        selectNode(node.id);
        openBlockTab(node.id);
      }),
    }));

    const pluginResults: PaletteResult[] = orderedPlugins.map((plugin) => ({
      id: `plugin-${plugin.identifier}`,
      label: plugin.name,
      category: "plugin",
      hint: [plugin.manufacturer, plugin.format].filter(Boolean).join(" · "),
      onSelect: runAndClose(() => nativeGraphAddPlugin(plugin.identifier)),
      pluginIdentifier: plugin.identifier,
    }));

    // SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. Scene results are
    // removed from the command palette (Scene/SceneLauncher system shelved).
    // usePerformStore + setScene remain on disk; re-add a sceneResults block
    // (mapped from `scenes`, wired to `setScene`) to restore.

    const settingResults: PaletteResult[] = [
      {
        id: "set-preferences",
        label: "Open Preferences",
        category: "setting",
        hint: "Host settings",
        onSelect: runAndClose(() => {
          window.dispatchEvent(new CustomEvent(EV_OPEN_PREFERENCES));
        }),
      },
      {
        id: "set-lua-console",
        label: "Open Lua Console",
        category: "setting",
        hint: "Native panel",
        onSelect: runAndClose(() => nativeOpenLuaConsole()),
      },
      {
        id: "set-graph-mixer",
        label: "Open Board Mixer",
        category: "setting",
        hint: "Native panel",
        onSelect: runAndClose(() => nativeOpenGraphMixer()),
      },
      {
        id: "set-midi-learn",
        label: mappingLearning ? "Stop MIDI Learn" : "Start MIDI Learn",
        category: "setting",
        hint: mappingLearning ? "Active" : "Mappings",
        onSelect: runAndClose(() => nativeMappingSetLearning(!mappingLearning)),
      },
    ];

    return [
      ...actionResults,
      ...blockResults,
      ...pluginResults,
      ...settingResults,
    ];
  }, [
    nodes,
    openBlockTab,
    orderedPlugins,
    runAndClose,
    selectNode,
    toggleMinimap,
    mappingLearning,
  ]);

  const filtered = useMemo(() => {
    if (!search) return allResults.slice(0, 16);
    const q = search.toLowerCase();
    return allResults.filter(
      (result) =>
        result.label.toLowerCase().includes(q) ||
        result.hint?.toLowerCase().includes(q) ||
        result.category.includes(q),
    );
  }, [search, allResults]);

  const grouped = useMemo(() => {
    const groups: { category: ResultCategory; items: PaletteResult[] }[] = [];
    for (const category of categoryOrder) {
      const items = filtered.filter((result) => result.category === category);
      if (items.length > 0) groups.push({ category, items });
    }
    return groups;
  }, [filtered]);

  const flatList = useMemo(() => grouped.flatMap((group) => group.items), [grouped]);

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

  useEffect(() => {
    const element = listRef.current?.querySelector(
      "[data-active='true']",
    ) as HTMLElement | null;
    element?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((index) => Math.min(index + 1, flatList.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((index) => Math.max(index - 1, 0));
          break;
        case "Enter":
          event.preventDefault();
          flatList[activeIndex]?.onSelect();
          break;
        // Escape is intentionally NOT handled here — it is routed through the
        // single window-level handler in useKeyboard (priority 1) so there is
        // exactly ONE Escape authority. Removing the element-level case fixes
        // the JUCE WKWebView swallow: NeuInput consumed the keydown before it
        // could bubble to this onKeyDown, so Esc never fired. The window
        // listener fires regardless of focus depth.
      }
    },
    [flatList, activeIndex],
  );

  let runningIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-canvas/80"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.15, ease: EASE }}
            onClick={onClose}
          />

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
              <div className="p-3 border-b border-white/5">
                <NeuInput
                  ref={inputRef}
                  placeholder="Search commands, plugins, blocks, scenes..."
                  value={search}
                  onChange={setSearch}
                  className="!text-[13px] !py-2.5 !px-4"
                />
              </div>

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
                          <span className="text-[12px] truncate">{result.label}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            {result.hint && (
                              <span className="text-[10px] text-text-dim tabular">
                                {result.hint}
                              </span>
                            )}
                            {/* I4-B — persistent favourite-star, plugin rows only. */}
                            {result.pluginIdentifier && (
                              <span
                                role="button"
                                tabIndex={-1}
                                aria-label={
                                  favoriteIdentifiers.has(result.pluginIdentifier)
                                    ? "Remove from favourites"
                                    : "Add to favourites"
                                }
                                aria-pressed={favoriteIdentifiers.has(
                                  result.pluginIdentifier,
                                )}
                                title={
                                  favoriteIdentifiers.has(result.pluginIdentifier)
                                    ? "Remove from favourites"
                                    : "Add to favourites"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleFavorite(result.pluginIdentifier!);
                                }}
                                className={[
                                  "inline-flex items-center justify-center w-4 h-4 rounded-sm cursor-pointer transition-colors duration-100",
                                  favoriteIdentifiers.has(result.pluginIdentifier)
                                    ? "text-[#E8A838]"
                                    : "text-text-dim opacity-50 hover:opacity-100 hover:text-text-secondary",
                                ].join(" ")}
                              >
                                <Icon
                                  name="Star"
                                  size={12}
                                  strokeWidth={1.75}
                                  style={{
                                    fill: favoriteIdentifiers.has(
                                      result.pluginIdentifier,
                                    )
                                      ? "#E8A838"
                                      : "none",
                                  }}
                                />
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

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
