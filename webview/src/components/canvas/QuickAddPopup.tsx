import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import { NeuInput, EmptyState, Icon } from "../neu";
import type { SignalType } from "../../data/types";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { nativeGraphAddPlugin } from "../../bridge/nativeGraph";
import { EV_OPEN_PREFERENCES } from "../../events";
import type { QuickAddPlugin } from "./quickadd/fuzzyScore";
import { useQuickAddResults } from "./quickadd/useQuickAddResults";
import {
  RAIL_ITEMS,
  type RailFilter,
} from "./quickadd/railFilter";
import { SourcesRail } from "./quickadd/SourcesRail";
import {
  VirtualResultList,
  type VirtualResultListHandle,
} from "./quickadd/VirtualResultList";

// ── Signal-type metadata ─────────────────────────────────────────────────────
//
// Port-type filtering + the signal-alias search key off the REAL per-plugin
// signal output (BrowserPlugin.signalOut, derived in C++). Frozen accent tokens.
const SIGNAL_HSL: Record<SignalType, string> = {
  audio: "var(--sig-audio)",
  midi: "var(--sig-midi)",
  value: "var(--sig-value)",
};

/** Pill label per signal type. */
const SIGNAL_LABEL: Record<SignalType, string> = {
  audio: "AUDIO",
  midi: "MIDI",
  value: "CV",
};

// ── Panel geometry (research DECISION: ~520×460, viewport-clamped) ───────────
const POPUP_W = 520;
const POPUP_H = 460;
const POPUP_MIN_H = 320;

// ── Focus zones (keyboard model) ──────────────────────────────────────────────
type FocusZone = "results" | "rail";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface QuickAddPopupProps {
  /** Viewport X (clientX) where the popup opens; clamped to stay on-screen. */
  x: number;
  /** Viewport Y (clientY) where the popup opens; clamped to stay on-screen. */
  y: number;
  /**
   * Signal type of the port a Cable was dragged off (Opt+drop). When set, the
   * list is filtered to Blocks whose REAL signalOut matches, and a removable
   * accent pill is shown (Unreal "context-sensitive" model). When omitted
   * (right-click on empty canvas), the full plugin list is shown — generic mode.
   */
  portType?: SignalType;
  /**
   * Optional pick override (⌥+drop add-and-connect). When provided it REPLACES
   * the default `nativeGraphAddPlugin(id)` insert and owns dismissal.
   */
  onPick?: (pluginId: string) => void;
  /**
   * Task 5.1 — optional "Add Reroute" first-class quick option (drag-off-port →
   * empty canvas). When provided, a pinned signal-coloured row sits at the top
   * of the popup so the user can drop a signal-correct Reroute knot at the cursor
   * in one keystroke/click WITHOUT searching for it. Owns its own dismissal.
   */
  onAddReroute?: () => void;
  /** Dismiss the popup (backdrop click, Escape, or after a Block is inserted). */
  onClose: () => void;
}

/**
 * QuickAddPopup — the fastest path to add a Block to the Board (N3 rebuild).
 *
 * A cursor-anchored, keyboard-first command-palette popup with a left sources
 * filter rail and a visible, dismissible port-context pill. One component, two
 * modes (generic / port-typed). Layout per
 * `.omc/state/qa-wave-reports/quickadd-pattern-research.md` (Bitwig pop-up
 * browser + Ableton sidebar labels + Unreal context palette; NO hover-cascade).
 *
 *   Left rail   — ★Favorites · ◷Recents · 4 categories · All. Single-level
 *                 filter, click/keyboard-selectable, never hover-revealed.
 *   Results     — dense virtualized rows (Favorites→Recents→All browse stack
 *                 when empty; flat fuzzy-scored list when typed). Per-row shape
 *                 glyph + hue, maker, category badge, favourite star.
 *   Port pill   — removable accent chip in the search row (port-typed mode);
 *                 ✕ / Backspace-on-empty widens to all.
 *   Footer      — persistent faint keyboard-hint strip.
 *
 * Keyboard: type → flat results; ↑/↓ move the active row (visible glow ring);
 * Enter inserts; Tab/← focus the rail, ↑/↓ pick a filter, →/Enter/Tab back;
 * 1–7 jump-select rail filters; Backspace-on-empty clears rail/port; Esc closes.
 */
export function QuickAddPopup({
  x,
  y,
  portType: portTypeProp,
  onPick,
  onAddReroute,
  onClose,
}: QuickAddPopupProps) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [railFilter, setRailFilter] = useState<RailFilter>("all");
  const [focusZone, setFocusZone] = useState<FocusZone>("results");
  // Port filter is dismissible (the ✕ pill / Backspace-on-empty widens it).
  const [portCleared, setPortCleared] = useState(false);
  const portType = portCleared ? undefined : portTypeProp;

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<VirtualResultListHandle>(null);

  const nativePlugins = usePluginBrowserStore((s) => s.plugins);
  const favoriteIdentifiers = usePluginBrowserStore((s) => s.favoriteIdentifiers);
  const refreshPlugins = usePluginBrowserStore((s) => s.refresh);
  const toggleFavorite = usePluginBrowserStore((s) => s.toggleFavorite);

  useEffect(() => {
    void refreshPlugins();
  }, [refreshPlugins]);

  /**
   * Map the store's BrowserPlugin[] into the engine's QuickAddPlugin[].
   * N2 alias-aware: `isFavorite` + `recentRank` are GROUP-level (precomputed
   * across the family's format variants by the host) so a starred/recent AU
   * still surfaces the family's VST3 primary under Favorites/Recents.
   */
  const plugins = useMemo(
    (): QuickAddPlugin[] =>
      nativePlugins.map((p) => ({
        id: p.identifier,
        name: p.name,
        category: p.blockCategory,
        format: p.format,
        rawCategory: p.category,
        manufacturer: p.manufacturer,
        signalOut: p.signalOut,
        usageCount: p.usageCount,
        isFavorite: p.isFavorite,
        recentRank: p.recentRank,
      })),
    [nativePlugins],
  );

  const { rows, isSearching, favCount, recentCount } = useQuickAddResults({
    plugins,
    search,
    railFilter,
    portType,
  });

  // ── A4/F4 — type-ahead race fix (HIGH, ultraqa #1) ────────────────────────
  // Three layers so the FIRST keystroke after open goes ONLY to the search
  // field — never to a global shortcut, never spawning a stray block/editor:
  //  1. SYNCHRONOUS autofocus (useLayoutEffect, no rAF): the input owns the
  //     keyboard before the browser paints.
  //  2. Pre-focus keystroke buffer (capture-phase window listener): catches
  //     anything typed while the input does NOT yet have focus (slow WKWebView
  //     focus handoff), injects it into search, AND stops the event so no
  //     global handler (useKeyboard, transport) ever sees it.
  //  3. The popup's own onKeyDown calls stopPropagation on every handled key so
  //     navigation/commit keys never bubble to the window either.
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onCaptureKeyDown = (e: globalThis.KeyboardEvent) => {
      // While the rail zone is focused, ↑/↓/Enter belong to the rail — let the
      // popup's React onKeyDown handle them (it runs after this capture pass on
      // the same target only when the input has focus; here we just don't
      // swallow them so the controlled flow below works).
      if (document.activeElement === inputRef.current) return; // input owns it
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave real chords alone
      if (e.key.length === 1) {
        // A printable key typed before focus landed — buffer it into search and
        // grab focus. CRITICAL: stopImmediatePropagation (not just
        // stopPropagation) so the key reaches NO other window listener —
        // including same-target window-CAPTURE handlers (GraphCanvas ghost
        // accept at :689) and the window-BUBBLE global shortcut handler
        // (useKeyboard at :512). A plain stopPropagation would NOT stop a
        // sibling capture listener registered earlier (GraphCanvas mounts
        // first), so the first keystroke could still fire a global action /
        // spawn a stray block. This is the core ultraqa-#1 race fix.
        e.preventDefault();
        e.stopImmediatePropagation();
        setSearch((s) => s + e.key);
        setFocusZone("results");
        inputRef.current?.focus();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSearch((s) => s.slice(0, -1));
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onCaptureKeyDown, true);
    return () => window.removeEventListener("keydown", onCaptureKeyDown, true);
  }, []);

  // Reset active row when the result set changes (search / rail / port).
  useEffect(() => {
    setActiveIndex(0);
  }, [search, railFilter, portType]);

  // Keep the active row visible when keyboard nav moves it.
  useEffect(() => {
    listRef.current?.scrollRowIntoView(activeIndex);
  }, [activeIndex]);

  const handleSelect = useCallback(
    (id: string) => {
      if (onPick) {
        onPick(id);
        return;
      }
      void nativeGraphAddPlugin(id);
      onClose();
    },
    [onPick, onClose],
  );

  /** Clear the active rail filter and/or the port-context filter (widen). */
  const widen = useCallback(() => {
    if (railFilter !== "all") {
      setRailFilter("all");
      return;
    }
    if (portType) setPortCleared(true);
  }, [railFilter, portType]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Number-key hotkeys (1–7) jump-select rail filters — only when the
      // search field is empty so digits can still be typed into a query.
      if (
        search.length === 0 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        /^[1-7]$/.test(e.key)
      ) {
        const item = RAIL_ITEMS.find((r) => String(r.hotkey) === e.key);
        if (item) {
          e.preventDefault();
          e.stopPropagation();
          setRailFilter(item.key);
          setFocusZone("results");
          return;
        }
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === "rail") {
            const idx = RAIL_ITEMS.findIndex((r) => r.key === railFilter);
            const next = RAIL_ITEMS[Math.min(idx + 1, RAIL_ITEMS.length - 1)]!;
            setRailFilter(next.key);
          } else {
            setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === "rail") {
            const idx = RAIL_ITEMS.findIndex((r) => r.key === railFilter);
            const prev = RAIL_ITEMS[Math.max(idx - 1, 0)]!;
            setRailFilter(prev.key);
          } else {
            setActiveIndex((i) => Math.max(i - 1, 0));
          }
          break;
        case "ArrowLeft":
          // Only hop to the rail when the caret is at the start of the field
          // (so ← still edits text mid-query).
          if (
            focusZone === "results" &&
            inputRef.current?.selectionStart === 0
          ) {
            e.preventDefault();
            e.stopPropagation();
            setFocusZone("rail");
          }
          break;
        case "ArrowRight":
          if (focusZone === "rail") {
            e.preventDefault();
            e.stopPropagation();
            setFocusZone("results");
          }
          break;
        case "Tab":
          e.preventDefault();
          e.stopPropagation();
          setFocusZone((z) => (z === "rail" ? "results" : "rail"));
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === "rail") {
            setFocusZone("results");
          } else if (rows[activeIndex]) {
            handleSelect(rows[activeIndex]!.plugin.id);
          }
          break;
        case "Backspace":
          // Backspace on an EMPTY query widens (clear rail / clear port) — the
          // Unreal "uncheck Context Sensitive" escape hatch.
          if (search.length === 0 && (railFilter !== "all" || portType)) {
            e.preventDefault();
            e.stopPropagation();
            widen();
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    },
    [
      search,
      focusZone,
      railFilter,
      rows,
      activeIndex,
      portType,
      handleSelect,
      widen,
      onClose,
    ],
  );

  // ── Geometry — clamp the bigger panel to the viewport ─────────────────────
  const panelH = Math.min(POPUP_H, Math.max(POPUP_MIN_H, window.innerHeight - 16));
  const clampedX = Math.max(8, Math.min(x, window.innerWidth - POPUP_W - 8));
  const clampedY = Math.max(8, Math.min(y, window.innerHeight - panelH - 8));

  const signalHsl = portType ? SIGNAL_HSL[portType] : null;

  // List viewport height = panel − search row (~52) − footer (~24) − pill row.
  const headerH = 52;
  const footerH = 24;
  const listH = Math.max(160, panelH - headerH - footerH);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50"
        style={{ left: clampedX, top: clampedY }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="bg-panel rounded-lg overflow-hidden flex flex-col"
          style={{
            width: POPUP_W,
            height: panelH,
            boxShadow:
              "-4px -4px 8px rgba(255,255,255,0.04), 8px 8px 24px rgba(0,0,0,0.5)",
            outline: "1px solid rgba(139, 145, 156, 0.15)",
          }}
        >
          {/* ── Row A — search field + removable port-context pill ─────────── */}
          <div className="flex items-center gap-2 p-2 border-b border-white/5 shrink-0">
            {portType && signalHsl && (
              <button
                type="button"
                onClick={() => setPortCleared(true)}
                title="Clear signal-type filter (show all)"
                aria-label={`Clear ${SIGNAL_LABEL[portType]} filter`}
                className="shrink-0 flex items-center gap-1 text-[9px] font-bold tabular px-1.5 py-1 rounded uppercase leading-none cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: `hsl(${signalHsl} / 0.18)`,
                  color: `hsl(${signalHsl})`,
                  boxShadow: `0 0 6px hsl(${signalHsl} / 0.30)`,
                }}
              >
                {SIGNAL_LABEL[portType]}
                <Icon name="X" size={9} strokeWidth={2.5} aria-hidden />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <NeuInput
                ref={inputRef}
                placeholder="Search blocks, makers, categories…"
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  if (focusZone !== "results") setFocusZone("results");
                }}
              />
            </div>
          </div>

          {/* ── Task 5.1 — pinned "Add Reroute" quick option (drag-off-port) ── */}
          {onAddReroute && (
            <button
              type="button"
              data-testid="quick-add-reroute"
              onClick={() => {
                onAddReroute();
                onClose();
              }}
              title="Drop a reroute knot here and connect it"
              className="shrink-0 flex items-center gap-2 px-2.5 h-9 border-b border-white/5 text-left transition-colors hover:bg-elevated cursor-pointer"
            >
              <span
                aria-hidden
                className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded"
                style={
                  signalHsl
                    ? {
                        backgroundColor: `hsl(${signalHsl} / 0.18)`,
                        color: `hsl(${signalHsl})`,
                        boxShadow: `0 0 6px hsl(${signalHsl} / 0.30)`,
                      }
                    : undefined
                }
              >
                <Icon name="Cable" size={12} strokeWidth={2} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] font-medium text-text-primary leading-tight">
                  Add Reroute
                </span>
                <span className="block text-[9px] text-text-dim leading-tight">
                  Drop a {portType ? SIGNAL_LABEL[portType] : "signal"} knot at
                  the cursor
                </span>
              </span>
            </button>
          )}

          {/* ── Body — rail + results ──────────────────────────────────────── */}
          <div className="flex-1 flex min-h-0">
            <SourcesRail
              active={railFilter}
              onSelect={(f) => {
                setRailFilter(f);
                setFocusZone("results");
                inputRef.current?.focus();
              }}
              focused={focusZone === "rail"}
            />

            <div className="flex-1 min-w-0 flex flex-col">
              {plugins.length === 0 ? (
                <div className="px-2 py-3 flex-1 flex items-center justify-center">
                  <EmptyState
                    illustration="no-plugins"
                    size="sm"
                    tone="audio"
                    title="No plugins scanned"
                    description="Open Preferences to scan AU/VST3/CLAP/LV2 plugins."
                    action={
                      <button
                        type="button"
                        className="px-3 py-1 rounded bg-pressed text-[10px] uppercase tracking-widest text-accent-blue hover:bg-elevated transition-colors cursor-pointer"
                        onClick={() => {
                          window.dispatchEvent(new Event(EV_OPEN_PREFERENCES));
                          onClose();
                        }}
                      >
                        Open Preferences
                      </button>
                    }
                  />
                </div>
              ) : rows.length === 0 ? (
                <div className="px-2 py-6 flex-1 flex flex-col items-center justify-center gap-2 text-center">
                  <span className="text-[10px] text-text-dim uppercase tracking-widest">
                    {portType ? "No compatible blocks" : "No matches"}
                  </span>
                  {portType && (
                    <button
                      type="button"
                      onClick={() => setPortCleared(true)}
                      className="text-[9px] uppercase tracking-wider text-accent-blue hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Show all blocks
                    </button>
                  )}
                </div>
              ) : (
                <VirtualResultList
                  ref={listRef}
                  rows={rows}
                  favCount={favCount}
                  recentCount={recentCount}
                  isSearching={isSearching}
                  activeIndex={activeIndex}
                  favoriteIdentifiers={favoriteIdentifiers}
                  onSelect={handleSelect}
                  onToggleFavorite={toggleFavorite}
                  onHover={setActiveIndex}
                  height={listH}
                />
              )}
            </div>
          </div>

          {/* ── Row C — persistent keyboard-hint footer ────────────────────── */}
          <div
            className="shrink-0 flex items-center gap-3 px-3 h-6 border-t border-white/5 text-[8.5px] text-text-dim tracking-wider select-none"
            style={{ height: footerH }}
          >
            <span>
              <kbd className="font-sans">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-sans">⏎</kbd> insert
            </span>
            <span>
              <kbd className="font-sans">⇥</kbd> filter rail
            </span>
            <span>
              <kbd className="font-sans">⌫</kbd> widen
            </span>
            <span className="ml-auto">
              <kbd className="font-sans">esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
