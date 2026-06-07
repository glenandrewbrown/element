/**
 * SourcesRail — the QuickAdd left filter rail (N3).
 *
 * A single-level, click/keyboard-selectable filter column (research DECISION:
 * NEVER hover-revealed — backed by NN/G's diagonal-problem + 0.5s-hover-tax
 * findings). Rows: ★ Favorites · ◷ Recents · the 4 Element categories with
 * their shape-glyph icons + hue · All. Selecting a row scopes the results;
 * "All" falls through to the Favorites → Recents → All browse stack.
 *
 * Keyboard: when the rail has focus, ↑/↓ move the highlighted rail row and
 * apply it live (Ableton sidebar-label model); the parent shell owns the
 * focus-zone switch (Tab/← into the rail, →/Enter/Tab back to results) and the
 * 1–7 number-key hotkeys.
 */

import { useRef, useEffect } from "react";
import type { BlockCategory } from "../../../data/types";
import { Icon } from "../../neu";
import { RAIL_ITEMS, isCategoryFilter, type RailFilter } from "./railFilter";

const CAT_COLOR: Record<BlockCategory, string> = {
  instrument: "hsl(var(--cat-instrument))",
  audiofx: "hsl(var(--cat-audiofx))",
  midifx: "hsl(var(--cat-midifx))",
  modulator: "hsl(var(--cat-modulator))",
};

export interface SourcesRailProps {
  active: RailFilter;
  onSelect: (f: RailFilter) => void;
  /** True when keyboard focus is currently in the rail zone (drives the ring). */
  focused: boolean;
}

export function SourcesRail({ active, onSelect, focused }: SourcesRailProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the active rail row in view when it changes (keyboard nav).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      className="shrink-0 w-[136px] bg-pressed border-r border-white/5 overflow-y-auto py-1.5"
      role="listbox"
      aria-label="Filter sources"
      aria-activedescendant={`quickadd-rail-${active}`}
    >
      {RAIL_ITEMS.map((item) => {
        const isActive = item.key === active;
        const catColor = isCategoryFilter(item.key)
          ? CAT_COLOR[item.key]
          : undefined;
        return (
          <button
            key={item.key}
            id={`quickadd-rail-${item.key}`}
            ref={isActive ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={isActive}
            tabIndex={-1}
            onClick={() => onSelect(item.key)}
            className={[
              "w-full flex items-center gap-2 px-2.5 py-[5px] text-[10px] text-left",
              "transition-colors duration-100 cursor-pointer rounded-sm",
              isActive
                ? "bg-elevated text-text-primary font-semibold"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
            style={
              isActive && focused
                ? { boxShadow: "inset 0 0 0 1px hsl(var(--sig-audio) / 0.45)" }
                : undefined
            }
          >
            <span
              className="shrink-0 inline-flex items-center justify-center w-3.5"
              style={catColor ? { color: catColor } : undefined}
              aria-hidden="true"
            >
              <Icon name={item.iconName} size={12} strokeWidth={1.75} />
            </span>
            <span className="truncate flex-1 min-w-0">{item.label}</span>
            <span className="shrink-0 text-[8px] text-text-dim tabular opacity-60">
              {item.hotkey}
            </span>
          </button>
        );
      })}
    </div>
  );
}
