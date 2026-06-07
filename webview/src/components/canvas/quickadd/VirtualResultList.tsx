/**
 * VirtualResultList — windowed results renderer for QuickAdd (N3).
 *
 * Renders the first visible window of rows immediately and only mounts rows
 * inside (and a small overscan around) the scroll viewport — capping the
 * DOM-mount cost that dominates per-keystroke time on the Intel reference
 * machine (research DECISION §"virtualize for ≤16ms/keystroke"; the ~6.5ms
 * scorer at 1000 plugins is dwarfed by mounting 1000 row <button>s).
 *
 * No virtualization dependency is in the webview, so this is a minimal
 * fixed-row-height windower: a flat list of "render items" (section LABEL or
 * plugin ROW), each with a known height, positioned absolutely over a spacer of
 * the total height. Keyboard scroll-into-view is handled by the parent via the
 * `scrollActiveIntoView` ref hook.
 */

import {
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
} from "react";
import type { QuickAddIndexEntry } from "./fuzzyScore";
import { PluginResultRow } from "./PluginResultRow";

const ROW_H = 30; // px — matches PluginResultRow py-1.5 + text-[11px] line box
const LABEL_H = 20; // px — section label row height
const OVERSCAN = 6; // rows rendered above/below the viewport

type RenderItem =
  | { kind: "label"; text: string; top: number; height: number }
  | {
      kind: "row";
      entry: QuickAddIndexEntry;
      /** Flat row index used for keyboard active-state + onHover. */
      rowIndex: number;
      top: number;
      height: number;
    };

export interface VirtualResultListHandle {
  /** Scroll the row at the given flat index into view (keyboard nav). */
  scrollRowIntoView: (rowIndex: number) => void;
}

export interface VirtualResultListProps {
  rows: QuickAddIndexEntry[];
  /** Browse-mode section boundaries (0 in search mode = no labels). */
  favCount: number;
  recentCount: number;
  isSearching: boolean;
  activeIndex: number;
  favoriteIdentifiers: Set<string>;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onHover: (rowIndex: number) => void;
  /** Viewport height in px (the scroll area). */
  height: number;
}

export const VirtualResultList = forwardRef<
  VirtualResultListHandle,
  VirtualResultListProps
>(function VirtualResultList(
  {
    rows,
    favCount,
    recentCount,
    isSearching,
    activeIndex,
    favoriteIdentifiers,
    onSelect,
    onToggleFavorite,
    onHover,
    height,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // ── Build the flat render-item list with cumulative tops ──────────────────
  // Labels only appear in browse mode AND only when the section is non-empty
  // AND only when there is more than one section (mirrors the old logic where a
  // single "All" section with no fav/recents drew no label).
  const items: RenderItem[] = [];
  let y = 0;
  const pushLabel = (text: string) => {
    items.push({ kind: "label", text, top: y, height: LABEL_H });
    y += LABEL_H;
  };
  const pushRow = (entry: QuickAddIndexEntry, rowIndex: number) => {
    items.push({ kind: "row", entry, rowIndex, top: y, height: ROW_H });
    y += ROW_H;
  };

  if (isSearching) {
    rows.forEach((e, i) => pushRow(e, i));
  } else {
    const otherCount = rows.length - favCount - recentCount;
    const multiSection =
      [favCount > 0, recentCount > 0, otherCount > 0].filter(Boolean).length > 1;
    let i = 0;
    if (favCount > 0) {
      if (multiSection) pushLabel("Favorites");
      for (let k = 0; k < favCount; k++) {
        pushRow(rows[i]!, i);
        i++;
      }
    }
    if (recentCount > 0) {
      if (multiSection) pushLabel("Recents");
      for (let k = 0; k < recentCount; k++) {
        pushRow(rows[i]!, i);
        i++;
      }
    }
    if (otherCount > 0) {
      if (multiSection) pushLabel("All");
      for (let k = 0; k < otherCount; k++) {
        pushRow(rows[i]!, i);
        i++;
      }
    }
  }
  const totalHeight = y;

  // ── Window: only render items intersecting [scrollTop, scrollTop+height] ──
  const viewTop = scrollTop - OVERSCAN * ROW_H;
  const viewBottom = scrollTop + height + OVERSCAN * ROW_H;
  const visible = items.filter(
    (it) => it.top + it.height >= viewTop && it.top <= viewBottom,
  );

  // ── Keyboard scroll-into-view (parent drives via ref) ─────────────────────
  useImperativeHandle(
    ref,
    () => ({
      scrollRowIntoView(rowIndex: number) {
        const el = scrollRef.current;
        if (!el) return;
        const it = items.find(
          (i) => i.kind === "row" && i.rowIndex === rowIndex,
        );
        if (!it) return;
        const top = it.top;
        const bottom = it.top + it.height;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (bottom > el.scrollTop + el.clientHeight)
          el.scrollTop = bottom - el.clientHeight;
      },
    }),
    // `items` is rebuilt every render from exactly these inputs, so listing them
    // invalidates the handle whenever the layout changes — the closure always
    // sees a fresh `items`. Depending on `items` itself would needlessly rebuild
    // the handle every render.
    [rows, favCount, recentCount, isSearching],
  );

  // Reset scroll to top whenever the list identity changes (new search/filter).
  // The DOM scrollTop reset is a ref mutation; the windowing state is reset in
  // lock-step so the first paint of the new list isn't windowed against a stale
  // offset.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [rows, favCount, recentCount, isSearching]);

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto px-1.5"
      style={{ height }}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visible.map((it) => {
          const base: CSSProperties = {
            position: "absolute",
            top: it.top,
            left: 0,
            right: 0,
            height: it.height,
          };
          if (it.kind === "label") {
            return (
              <div
                key={`label-${it.text}-${it.top}`}
                style={base}
                className="px-2 pt-1 pb-0.5 text-[9px] uppercase tracking-widest text-text-dim flex items-end"
              >
                {it.text}
              </div>
            );
          }
          const p = it.entry.plugin;
          // Star reflects the GROUP favourite (N2 alias-aware) OR the optimistic
          // id-keyed flip from toggleFavorite (instant feedback before the next
          // refresh re-derives the group flag).
          const isFav = p.isFavorite || favoriteIdentifiers.has(p.id);
          return (
            <PluginResultRow
              key={p.id}
              style={base}
              id={p.id}
              name={p.name}
              category={p.category}
              rawCategory={p.rawCategory}
              manufacturer={p.manufacturer}
              isActive={it.rowIndex === activeIndex}
              isFavorite={isFav}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              onHover={() => onHover(it.rowIndex)}
            />
          );
        })}
      </div>
    </div>
  );
});
