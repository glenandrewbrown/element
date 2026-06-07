/**
 * QuickAdd sources/filter-rail model (N3).
 *
 * The left rail is a single-level FILTER (research DECISION: "a filter, not a
 * tree — no nesting, no flyouts"). A rail selection scopes the results list;
 * the null/"All" selection falls through to the Favorites → Recents → All
 * browse stack. Backed by NN/G's anti-hover-cascade finding.
 */

import type { BlockCategory } from "../../../data/types";

/**
 * A rail filter is either a pseudo-section (favorites / recents / all) or one
 * of the 4 Element block categories.
 */
export type RailFilter =
  | "all"
  | "favorites"
  | "recents"
  | BlockCategory; // "instrument" | "audiofx" | "midifx" | "modulator"

export interface RailItem {
  key: RailFilter;
  label: string;
  /** Lucide icon name (category items use the shape-glyph icon). */
  iconName: string;
  /** Number key (1-6) for the zero-traverse hotkey pick (Ableton Collections model). */
  hotkey: number;
}

/**
 * The ordered rail: ★ Favorites · ◷ Recents · then the 4 categories with their
 * shape-glyph icons. "All" is the implicit default (no rail row needed beyond a
 * top entry). Number keys 1–6 mirror Ableton's Collections muscle memory.
 */
export const RAIL_ITEMS: RailItem[] = [
  { key: "all", label: "All", iconName: "LayoutGrid", hotkey: 1 },
  { key: "favorites", label: "Favorites", iconName: "Star", hotkey: 2 },
  { key: "recents", label: "Recents", iconName: "Clock", hotkey: 3 },
  { key: "instrument", label: "Instruments", iconName: "Piano", hotkey: 4 },
  { key: "audiofx", label: "Audio FX", iconName: "SlidersHorizontal", hotkey: 5 },
  { key: "midifx", label: "MIDI FX", iconName: "GitBranch", hotkey: 6 },
  { key: "modulator", label: "Modulators", iconName: "Waves", hotkey: 7 },
];

/** True when the rail filter is one of the 4 block categories. */
export function isCategoryFilter(f: RailFilter): f is BlockCategory {
  return (
    f === "instrument" ||
    f === "audiofx" ||
    f === "midifx" ||
    f === "modulator"
  );
}
