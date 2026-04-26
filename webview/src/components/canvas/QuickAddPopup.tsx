import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { NeuInput } from "../neu";
import type { BlockCategory } from "../../data/types";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { nativeGraphAddPlugin } from "../../bridge/nativeGraph";

interface PluginEntry {
  id: string;
  name: string;
  category: BlockCategory;
  format: string;
}

const demoPlugins: PluginEntry[] = [
  { id: "osc-core", name: "OSCILLATOR_CORE_V3", category: "generator", format: "INT" },
  { id: "wave-gen", name: "WAVETABLE_GEN", category: "generator", format: "INT" },
  { id: "ladder-filt", name: "LADDER_FILTER_24DB", category: "modifier", format: "INT" },
  { id: "peak-lim", name: "PEAK_LIMITER", category: "modifier", format: "INT" },
];

/** Filled circle for Instrument/Generator (●) */
function InstrumentDot() {
  return (
    <span
      className="shrink-0 text-[10px] leading-none"
      style={{ color: "#4A90D9" }}
      aria-label="Instrument"
    >
      ●
    </span>
  );
}

/** Filled diamond for Effect/Modifier (◆) */
function EffectDot() {
  return (
    <span
      className="shrink-0 text-[10px] leading-none"
      style={{ color: "#E8A838" }}
      aria-label="Effect"
    >
      ◆
    </span>
  );
}

/** Filled triangle for MIDI/Logic (▲) */
function MidiDot() {
  return (
    <span
      className="shrink-0 text-[10px] leading-none"
      style={{ color: "#2BC4C4" }}
      aria-label="MIDI"
    >
      ▲
    </span>
  );
}

const CAT_ICON: Record<BlockCategory, () => ReactElement> = {
  generator: InstrumentDot,
  modifier: EffectDot,
  logic: MidiDot,
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
  x: number;
  y: number;
  onClose: () => void;
}

export function QuickAddPopup({ x, y, onClose }: QuickAddPopupProps) {
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
    if (nativePlugins.length === 0) return demoPlugins;
    return nativePlugins.map((p) => ({
      id: p.identifier,
      name: p.name,
      category: p.blockCategory,
      format: p.format,
    }));
  }, [nativePlugins]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return plugins.filter((p) => p.name.toLowerCase().includes(q));
  }, [plugins, search]);

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
  const clampedX = Math.min(x, window.innerWidth - popupW - 8);
  const clampedY = Math.min(y, window.innerHeight - popupMaxH - 8);

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
            {flatList.length === 0 && (
              <div className="px-2 py-3 text-[10px] text-text-dim text-center uppercase tracking-widest">
                No matches
              </div>
            )}

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
