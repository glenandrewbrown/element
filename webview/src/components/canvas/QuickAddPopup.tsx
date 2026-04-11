import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import { NeuInput } from "../neu";
import type { BlockCategory } from "../../data/types";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { nativeGraphAddPlugin } from "../../bridge/nativeGraph";

interface PluginEntry {
  id: string;
  name: string;
  category: BlockCategory;
}

const demoPlugins: PluginEntry[] = [
  { id: "osc-core", name: "OSCILLATOR_CORE_V3", category: "generator" },
  { id: "wave-gen", name: "WAVETABLE_GEN", category: "generator" },
  { id: "ladder-filt", name: "LADDER_FILTER_24DB", category: "modifier" },
  { id: "peak-lim", name: "PEAK_LIMITER", category: "modifier" },
];

const catDot: Record<string, string> = {
  generator: "w-1.5 h-1.5 rounded-full bg-[#4A90D9]",
  modifier: "w-1.5 h-1.5 rotate-45 bg-[#E8A838]",
  logic: "w-1.5 h-1.5 bg-[#2BC4C4]",
};

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
    }));
  }, [nativePlugins]);

  const filtered = plugins.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
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
              "-2px -2px 8px rgba(255,255,255,0.04), 2px 2px 8px rgba(0,0,0,0.35), 0 8px 32px rgba(0,0,0,0.5)",
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
                type="button"
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
