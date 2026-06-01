import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { NeuInput, EmptyState } from "../neu";
import type { BlockCategory, SignalType } from "../../data/types";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { nativeGraphAddPlugin } from "../../bridge/nativeGraph";
import { EV_OPEN_PREFERENCES } from "../../events";

interface PluginEntry {
  id: string;
  name: string;
  category: BlockCategory;
  format: string;
}

/**
 * Signal type a Block emits / passes, derived from its category. Used to
 * port-type-filter the list when QuickAdd is opened from a cable-drag.
 *
 * Element's scanned-plugin metadata (`BrowserPlugin`) carries only
 * `blockCategory`, so this is a deterministic 1:1 map mirroring the locked
 * `--cat-*` ↔ `--sig-*` token parity in index.css (instrument/audiofx share
 * the audio/value hues, midifx = MIDI, modulator → value/CV). NOTE: the design
 * mockup hand-tags `acceptsType` per block and can split modulators between
 * audio and CV; we cannot reproduce that split from category alone (see the
 * task report — a per-plugin signal-output field on `BrowserPlugin` would be
 * needed for full parity).
 */
const CATEGORY_SIGNAL: Record<BlockCategory, SignalType> = {
  instrument: "audio",
  audiofx: "audio",
  midifx: "midi",
  modulator: "value",
};

/** Frozen signal-type accent tokens (HSL) — W0-TOKENS. */
const SIGNAL_HSL: Record<SignalType, string> = {
  audio: "var(--sig-audio)",
  midi: "var(--sig-midi)",
  value: "var(--sig-value)",
};

/** Header label per signal type — "ADD BLOCK ACCEPTING <LABEL>". */
const SIGNAL_LABEL: Record<SignalType, string> = {
  audio: "AUDIO",
  midi: "MIDI",
  value: "CV",
};

/** Filled circle for Instrument (●) */
function InstrumentDot() {
  return (
    <span
      className="shrink-0 text-[10px] leading-none"
      style={{ color: "hsl(var(--cat-instrument))" }}
      aria-label="Instrument"
    >
      ●
    </span>
  );
}

/** Filled diamond for AudioFx (◆) */
function EffectDot() {
  return (
    <span
      className="shrink-0 text-[10px] leading-none"
      style={{ color: "hsl(var(--cat-audiofx))" }}
      aria-label="Audio FX"
    >
      ◆
    </span>
  );
}

/** Filled triangle for MidiFx (▲) */
function MidiDot() {
  return (
    <span
      className="shrink-0 text-[10px] leading-none"
      style={{ color: "hsl(var(--cat-midifx))" }}
      aria-label="MIDI FX"
    >
      ▲
    </span>
  );
}

/** Hexagon for Modulator (⬡) */
function ModulatorDot() {
  return (
    <span
      className="shrink-0 text-[10px] leading-none"
      style={{ color: "hsl(var(--cat-modulator))" }}
      aria-label="Modulator"
    >
      ⬡
    </span>
  );
}

const CAT_ICON: Record<BlockCategory, () => ReactElement> = {
  instrument: InstrumentDot,
  audiofx: EffectDot,
  midifx: MidiDot,
  modulator: ModulatorDot,
};

function CategoryIcon({ category }: { category: BlockCategory }) {
  const Icon = CAT_ICON[category] ?? EffectDot;
  return <Icon />;
}

/** Small format pill badge */
function FormatBadge({ format }: { format: string }) {
  if (!format || format === "INT") return null;
  return (
    <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-white/10 text-text-dim uppercase font-bold leading-none">
      {format}
    </span>
  );
}

interface PluginRowProps {
  plugin: PluginEntry;
  isActive: boolean;
  onSelect: (id: string) => void;
  onHover: () => void;
}

function PluginRow({ plugin, isActive, onSelect, onHover }: PluginRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(plugin.id)}
      onMouseEnter={onHover}
      className={[
        "w-full text-left px-2.5 py-1.5 text-[11px] rounded flex items-center gap-2 transition-colors",
        isActive
          ? "bg-elevated text-text-primary"
          : "text-text-secondary hover:text-text-primary",
      ].join(" ")}
    >
      <CategoryIcon category={plugin.category} />
      <span className="truncate flex-1 min-w-0">{plugin.name}</span>
      <FormatBadge format={plugin.format} />
    </button>
  );
}

interface QuickAddPopupProps {
  /** Viewport X (clientX) of the cursor where the popup opens; clamped to keep the popup on-screen. */
  x: number;
  /** Viewport Y (clientY) of the cursor where the popup opens; clamped to keep the popup on-screen. */
  y: number;
  /**
   * Signal type of the port a Cable was dragged off, when opened from a
   * port-drag. When set, the list is filtered to Blocks that accept/pass that
   * signal type and the header reads "ADD BLOCK ACCEPTING <TYPE>". When
   * omitted (right-click on empty canvas), the full plugin list is shown with
   * favourites pinned — the generic QuickAdd. See `GraphCanvas` plumbing note
   * in the task report: today only the generic path is wired.
   */
  portType?: SignalType;
  /** Called to dismiss the popup (backdrop click, Escape, or after a Block is inserted). */
  onClose: () => void;
}

/**
 * QuickAddPopup — the fastest path to add a Block to the Board. A small,
 * keyboard-first search popup anchored at the cursor, opening focused with
 * favourites pinned on top, navigable entirely by keyboard (type to filter,
 * ↑↓ to move, ↵ to insert, esc to cancel). Each result is shape- and
 * colour-coded by category (● instrument / ◆ audio FX / ▲ MIDI FX / ⬡
 * modulator) so the signal role reads instantly.
 *
 * Two modes:
 *  - **Generic** (no `portType`) — mounted from `GraphCanvas`'s
 *    `onPaneContextMenu` (right-click empty canvas). Shows every scanned
 *    plugin, favourites first.
 *  - **Port-type-aware** (`portType` set) — opened by dragging a Cable off a
 *    port. Shows only Blocks that accept that signal type, under an
 *    "ADD BLOCK ACCEPTING <TYPE>" header tinted in the signal's hue.
 *
 * It reads the scanned plugin list from `usePluginBrowserStore` and, when no
 * plugins have been scanned, shows an empty state with a link to Preferences
 * instead of fabricated entries.
 */
export function QuickAddPopup({ x, y, portType, onClose }: QuickAddPopupProps) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const nativePlugins = usePluginBrowserStore((s) => s.plugins);
  const favoriteIdentifiers = usePluginBrowserStore((s) => s.favoriteIdentifiers);
  const refreshPlugins = usePluginBrowserStore((s) => s.refresh);

  useEffect(() => {
    void refreshPlugins();
  }, [refreshPlugins]);

  const plugins = useMemo((): PluginEntry[] => {
    return nativePlugins.map((p) => ({
      id: p.identifier,
      name: p.name,
      category: p.blockCategory,
      format: p.format,
    }));
  }, [nativePlugins]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return plugins.filter((p) => {
      // Port-type filter (when opened from a cable drag): keep only Blocks
      // whose derived signal type matches the dragged port.
      if (portType && CATEGORY_SIGNAL[p.category] !== portType) return false;
      return p.name.toLowerCase().includes(q);
    });
  }, [plugins, search, portType]);

  const { favorites, others } = useMemo(() => {
    const favs = filtered.filter((p) => favoriteIdentifiers.has(p.id));
    const rest = filtered.filter((p) => !favoriteIdentifiers.has(p.id));
    return { favorites: favs, others: rest };
  }, [filtered, favoriteIdentifiers]);

  /** Flat ordered list used for keyboard navigation */
  const flatList = useMemo(
    () => [...favorites, ...others],
    [favorites, others],
  );

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = useCallback(
    (id: string) => {
      void nativeGraphAddPlugin(id);
      onClose();
    },
    [onClose],
  );

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
          if (flatList[activeIndex]) {
            handleSelect(flatList[activeIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatList, activeIndex, handleSelect, onClose],
  );

  const popupW = 224;
  const popupMaxH = 320;
  // Clamp both axes — Math.min stops the popup escaping the right/bottom
  // edge, Math.max stops it from running off the left/top on small windows
  // or when invoked from a viewport corner.
  const clampedX = Math.max(
    8,
    Math.min(x, window.innerWidth - popupW - 8),
  );
  const clampedY = Math.max(
    8,
    Math.min(y, window.innerHeight - popupMaxH - 8),
  );

  const signalHsl = portType ? SIGNAL_HSL[portType] : null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50"
        style={{ left: clampedX, top: clampedY }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="w-56 bg-panel rounded overflow-hidden"
          style={{
            boxShadow:
              "-4px -4px 8px rgba(255,255,255,0.04), 8px 8px 24px rgba(0,0,0,0.5)",
            outline: "1px solid rgba(139, 145, 156, 0.15)",
          }}
        >
          {/* Port-type-aware header — only when opened from a cable drag. */}
          {portType && signalHsl && (
            <div
              className="flex items-center justify-between px-2.5 pt-2 pb-1.5 border-b border-white/5"
              style={{ borderColor: `hsl(${signalHsl} / 0.18)` }}
            >
              <span className="text-[8.5px] uppercase tracking-[0.16em] text-text-dim leading-none">
                Add block accepting
              </span>
              <span
                className="text-[9px] font-bold tabular px-1.5 py-0.5 rounded uppercase leading-none"
                style={{
                  backgroundColor: `hsl(${signalHsl} / 0.18)`,
                  color: `hsl(${signalHsl})`,
                  boxShadow: `0 0 6px hsl(${signalHsl} / 0.35)`,
                }}
              >
                {SIGNAL_LABEL[portType]}
              </span>
            </div>
          )}

          <div className="p-2">
            <NeuInput
              ref={inputRef}
              placeholder="Add block..."
              value={search}
              onChange={setSearch}
            />
          </div>

          <div
            ref={listRef}
            className="max-h-52 overflow-y-auto px-1 pb-1.5"
          >
            {plugins.length === 0 ? (
              // F-101 sibling fix: no demoPlugins fallback. Show real empty state
              // with a CTA to open Preferences (mirrors ToolPalette commit cadec9bd).
              <div className="px-2 py-3">
                <EmptyState
                  illustration="no-plugins"
                  size="sm"
                  tone="audio"
                  title="No plugins scanned"
                  description="Open Preferences to scan AU/VST3/CLAP/LV2 plugins."
                  action={
                    <button
                      type="button"
                      className="px-3 py-1 rounded bg-pressed text-[10px] uppercase tracking-widest text-accent-blue hover:bg-elevated transition-colors"
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
            ) : flatList.length === 0 ? (
              <div className="px-2 py-3 text-[10px] text-text-dim text-center uppercase tracking-widest">
                {portType ? "No compatible blocks" : "No matches"}
              </div>
            ) : null}

            {favorites.length > 0 && (
              <>
                <div className="px-2.5 pt-1 pb-0.5 text-[9px] uppercase tracking-widest text-text-dim">
                  Favorites
                </div>
                <div className="space-y-px">
                  {favorites.map((plugin, i) => (
                    <PluginRow
                      key={plugin.id}
                      plugin={plugin}
                      isActive={i === activeIndex}
                      onSelect={handleSelect}
                      onHover={() => setActiveIndex(i)}
                    />
                  ))}
                </div>
              </>
            )}

            {favorites.length > 0 && others.length > 0 && (
              <div className="mx-2 my-1 border-t border-white/5" />
            )}

            {others.length > 0 && (
              <div className="space-y-px">
                {others.map((plugin, i) => {
                  const flatIndex = favorites.length + i;
                  return (
                    <PluginRow
                      key={plugin.id}
                      plugin={plugin}
                      isActive={flatIndex === activeIndex}
                      onSelect={handleSelect}
                      onHover={() => setActiveIndex(flatIndex)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
