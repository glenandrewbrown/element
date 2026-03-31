import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { NeuInput } from "../neu";
import type { BlockCategory } from "../../data/types";

// ── Plugin entries (same data as ToolPalette) ──

interface PluginEntry {
  id: string;
  name: string;
  category: BlockCategory;
}

const plugins: PluginEntry[] = [
  { id: "osc-core", name: "OSCILLATOR_CORE_V3", category: "generator" },
  { id: "wave-gen", name: "WAVETABLE_GEN", category: "generator" },
  { id: "ladder-filt", name: "LADDER_FILTER_24DB", category: "modifier" },
  { id: "peak-lim", name: "PEAK_LIMITER", category: "modifier" },
  { id: "audio-in", name: "Audio Input", category: "generator" },
  { id: "audio-out", name: "Audio Output", category: "modifier" },
  { id: "midi-router", name: "MIDI Router", category: "logic" },
  { id: "proq3", name: "FabFilter Pro-Q 3", category: "modifier" },
  { id: "valhalla", name: "Valhalla Room", category: "modifier" },
  { id: "lfo-tool", name: "LFO Tool", category: "logic" },
];

// ── Category dot ──

const catDot: Record<string, string> = {
  generator: "w-1.5 h-1.5 rounded-full bg-[#4A90D9]",
  modifier: "w-1.5 h-1.5 rotate-45 bg-[#E8A838]",
  logic: "w-1.5 h-1.5 bg-[#2BC4C4]",
};

// ── Props ──

interface QuickAddPopupProps {
  x: number;
  y: number;
  onClose: () => void;
  onInsert?: (pluginId: string) => void;
}

export function QuickAddPopup({ x, y, onClose, onInsert }: QuickAddPopupProps) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = plugins.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Auto-focus on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Reset selection when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = useCallback(
    (id: string) => {
      onInsert?.(id);
      onClose();
    },
    [onInsert, onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[activeIndex]) {
            handleSelect(filtered[activeIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, activeIndex, handleSelect, onClose],
  );

  // Clamp position so popup doesn't overflow viewport
  const popupW = 224;
  const popupMaxH = 320;
  const clampedX = Math.min(x, window.innerWidth - popupW - 8);
  const clampedY = Math.min(y, window.innerHeight - popupMaxH - 8);

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popup */}
      <div
        className="fixed z-50"
        style={{ left: clampedX, top: clampedY }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="w-56 bg-panel rounded overflow-hidden"
          style={{
            boxShadow:
              "-2px -2px 8px rgba(255,255,255,0.04), 2px 2px 8px rgba(0,0,0,0.35), 0 8px 32px rgba(0,0,0,0.5)",
            outline: "1px solid rgba(139, 145, 156, 0.15)",
          }}
        >
          {/* Search */}
          <div className="p-2">
            <NeuInput
              ref={inputRef}
              placeholder="Add block..."
              value={search}
              onChange={setSearch}
            />
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-52 overflow-y-auto px-1 pb-1.5 space-y-px"
          >
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-[10px] text-text-dim text-center uppercase tracking-widest">
                No matches
              </div>
            )}
            {filtered.map((plugin, i) => (
              <button
                key={plugin.id}
                onClick={() => handleSelect(plugin.id)}
                onMouseEnter={() => setActiveIndex(i)}
                className={[
                  "w-full text-left px-2.5 py-1.5 text-[11px] rounded flex items-center gap-2.5 transition-colors",
                  i === activeIndex
                    ? "bg-elevated text-text-primary"
                    : "text-text-secondary hover:text-text-primary",
                ].join(" ")}
              >
                <div className={catDot[plugin.category] ?? catDot.generator} />
                <span className="truncate">{plugin.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
