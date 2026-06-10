/**
 * usePaletteFilters — unit tests.
 *
 * Tests the memoised filter logic extracted from ToolPalette into
 * usePaletteFilters.ts. Validates search/category/fav/recents filtering
 * and the virtualization window-math constants.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { withGroupDefaults, type BrowserPluginSeed } from "../../../../test/pluginFixture";
import type { BrowserPlugin } from "../../../../stores/usePluginBrowserStore";

// ── Store mocks ───────────────────────────────────────────────────────────────
//
// N2 — Favourites/Recents now operate on the GROUP fields (isFavorite /
// recentRank) the store precomputes per row, NOT the raw id-keyed sets. Tests
// set those fields on the rows (via group()) to express favourite/recent intent.

const basePlugins: BrowserPlugin[] = (
  [
    {
      identifier: "surge.vst3",
      name: "Surge XT",
      blockCategory: "instrument",
      format: "VST3",
      manufacturer: "Surge Synth",
      category: "Instrument",
      signalOut: "audio",
      usageCount: 5,
    },
    {
      identifier: "proeq.au",
      name: "Pro-Q 3",
      blockCategory: "audiofx",
      format: "AU",
      manufacturer: "FabFilter",
      category: "EQ",
      signalOut: "audio",
      usageCount: 3,
    },
    {
      identifier: "midi-router.int",
      name: "MIDI Router",
      blockCategory: "midifx",
      format: "INT",
      manufacturer: "Element",
      category: "Utility",
      signalOut: "midi",
      usageCount: 1,
    },
    {
      identifier: "lfo.int",
      name: "LFO",
      blockCategory: "modulator",
      format: "INT",
      manufacturer: "Element",
      category: "Modulator",
      signalOut: "value",
      usageCount: 2,
    },
  ] satisfies BrowserPluginSeed[]
).map(withGroupDefaults);

const mockPlugins = basePlugins;

/** Clone the base list, overriding group fields per identifier. */
function group(
  overrides: Record<string, Partial<Pick<BrowserPlugin, "isFavorite" | "recentRank" | "aliases" | "variants">>>,
): BrowserPlugin[] {
  return basePlugins.map((p) => ({ ...p, ...(overrides[p.identifier] ?? {}) }));
}

let storePlugins = mockPlugins;
let storeFavoriteIds: Set<string> = new Set();
let storeRecentIds: string[] = [];

vi.mock("../../../../stores/usePluginBrowserStore", () => ({
  usePluginBrowserStore: (sel: (s: unknown) => unknown) =>
    sel({
      plugins: storePlugins,
      favoriteIdentifiers: storeFavoriteIds,
      recentIdentifiers: storeRecentIds,
    }),
}));

// useShallow is just identity in tests (returns same value)
vi.mock("zustand/react/shallow", () => ({
  useShallow: (sel: (s: unknown) => unknown) => sel,
}));

import { usePaletteFilters } from "../usePaletteFilters";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("usePaletteFilters", () => {
  beforeEach(() => {
    storePlugins = mockPlugins;
    storeFavoriteIds = new Set();
    storeRecentIds = [];
  });

  describe("plugins mapping", () => {
    it("maps nativePlugins to PluginEntry[] (incl. N2 description + variants)", () => {
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.plugins).toHaveLength(4);
      expect(result.current.plugins[0]).toEqual({
        id: "surge.vst3",
        name: "Surge XT",
        description: "",
        category: "instrument",
        format: "VST3",
        manufacturer: "Surge Synth",
        subtype: "Other Instruments",
        variants: [{ format: "VST3", identifier: "surge.vst3" }],
      });
    });
  });

  describe("filtered — search", () => {
    it("returns all plugins when search is empty", () => {
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.filtered).toHaveLength(4);
    });

    it("filters by plugin name (case-insensitive)", () => {
      const { result } = renderHook(() => usePaletteFilters("surge", null));
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("surge.vst3");
    });

    it("filters by plugin id (case-insensitive)", () => {
      const { result } = renderHook(() => usePaletteFilters("proeq", null));
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].name).toBe("Pro-Q 3");
    });

    it("returns empty array when no plugins match", () => {
      const { result } = renderHook(() => usePaletteFilters("zzznomatch", null));
      expect(result.current.filtered).toHaveLength(0);
    });

    it("is case-insensitive for both name and id", () => {
      const { result } = renderHook(() => usePaletteFilters("MIDI", null));
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("midi-router.int");
    });
  });

  describe("filtered — category", () => {
    it("filters to instrument only when activeCategory=instrument", () => {
      const { result } = renderHook(() => usePaletteFilters("", "instrument"));
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("surge.vst3");
    });

    it("filters to audiofx only", () => {
      const { result } = renderHook(() => usePaletteFilters("", "audiofx"));
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("proeq.au");
    });

    it("filters to midifx only", () => {
      const { result } = renderHook(() => usePaletteFilters("", "midifx"));
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("midi-router.int");
    });

    it("filters to modulator only", () => {
      const { result } = renderHook(() => usePaletteFilters("", "modulator"));
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("lfo.int");
    });

    it("combines search and category filters", () => {
      // Category=audiofx + search=pro → only Pro-Q 3
      const { result } = renderHook(() => usePaletteFilters("pro", "audiofx"));
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("proeq.au");
    });

    it("category+search combination can yield empty", () => {
      // Category=instrument + search=eq → no match
      const { result } = renderHook(() => usePaletteFilters("eq", "instrument"));
      expect(result.current.filtered).toHaveLength(0);
    });
  });

  describe("favPlugins (N2 — group-based)", () => {
    it("returns empty array when no group is favourited", () => {
      storePlugins = basePlugins; // none have isFavorite
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.favPlugins).toHaveLength(0);
    });

    it("returns rows whose GROUP isFavorite is set", () => {
      storePlugins = group({
        "surge.vst3": { isFavorite: true },
        "proeq.au": { isFavorite: true },
      });
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.favPlugins).toHaveLength(2);
      const ids = result.current.favPlugins.map((p) => p.identifier);
      expect(ids).toContain("surge.vst3");
      expect(ids).toContain("proeq.au");
    });

    it("starred AU keeps its VST3-primary family in Favourites (no orphaning)", () => {
      // A VST3 primary row carries the AU as an alias; the AU is the one starred,
      // so the host set isFavorite=true on the primary row. The family shows.
      storePlugins = group({
        "surge.vst3": {
          isFavorite: true,
          aliases: ["surge.vst3", "surge.au"],
          variants: [
            { format: "VST3", identifier: "surge.vst3" },
            { format: "AudioUnit", identifier: "surge.au" },
          ],
        },
      });
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.favPlugins).toHaveLength(1);
      expect(result.current.favPlugins[0].identifier).toBe("surge.vst3");
      // ...and the per-card star set marks the SHOWN (VST3) primary row.
      expect(result.current.favoriteIds.has("surge.vst3")).toBe(true);
    });
  });

  describe("recentPlugins (N2 — group-based, ranked)", () => {
    it("returns empty array when no group is recent", () => {
      storePlugins = basePlugins; // all recentRank === -1
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.recentPlugins).toHaveLength(0);
    });

    it("returns rows with recentRank >= 0, sorted best-first", () => {
      storePlugins = group({
        "proeq.au": { recentRank: 0 },
        "surge.vst3": { recentRank: 1 },
      });
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.recentPlugins).toHaveLength(2);
      expect(result.current.recentPlugins[0].identifier).toBe("proeq.au");
      expect(result.current.recentPlugins[1].identifier).toBe("surge.vst3");
    });
  });

  describe("favoriteIds (N2 — group favourite primary-id set)", () => {
    it("contains the primary id of every favourited group", () => {
      storePlugins = group({ "surge.vst3": { isFavorite: true } });
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.favoriteIds.has("surge.vst3")).toBe(true);
      expect(result.current.favoriteIds.has("proeq.au")).toBe(false);
    });
  });

  // ── Task 3.D — ★ / ⏱ facets over the single list ──────────────────────────
  describe("facet: favouritesOnly (★)", () => {
    it("does not filter when favouritesOnly is false", () => {
      storePlugins = group({ "surge.vst3": { isFavorite: true } });
      const { result } = renderHook(() =>
        usePaletteFilters("", null, { favouritesOnly: false, recentSort: false }),
      );
      expect(result.current.filtered).toHaveLength(4);
    });

    it("restricts the list to favourited GROUPS when on", () => {
      storePlugins = group({
        "surge.vst3": { isFavorite: true },
        "proeq.au": { isFavorite: true },
      });
      const { result } = renderHook(() =>
        usePaletteFilters("", null, { favouritesOnly: true, recentSort: false }),
      );
      expect(result.current.filtered).toHaveLength(2);
      const ids = result.current.filtered.map((p) => p.id);
      expect(ids).toContain("surge.vst3");
      expect(ids).toContain("proeq.au");
      expect(ids).not.toContain("midi-router.int");
    });

    it("GROUP-FAVOURITES UNREGRESSED: starring an AU keeps its VST3-primary family under the ★ facet", () => {
      // The host aggregates the starred AU onto its VST3-primary row
      // (isFavorite=true on the primary). The ★ facet reads that same
      // group-aware flag, so the family stays visible — no orphaning.
      storePlugins = group({
        "surge.vst3": {
          isFavorite: true,
          aliases: ["surge.vst3", "surge.au"],
          variants: [
            { format: "VST3", identifier: "surge.vst3" },
            { format: "AudioUnit", identifier: "surge.au" },
          ],
        },
      });
      const { result } = renderHook(() =>
        usePaletteFilters("", null, { favouritesOnly: true, recentSort: false }),
      );
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("surge.vst3");
    });

    it("combines with category + search", () => {
      storePlugins = group({
        "surge.vst3": { isFavorite: true },
        "proeq.au": { isFavorite: true },
      });
      // favourites-only + category=audiofx → only Pro-Q 3
      const { result } = renderHook(() =>
        usePaletteFilters("", "audiofx", {
          favouritesOnly: true,
          recentSort: false,
        }),
      );
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("proeq.au");
    });
  });

  describe("facet: recentSort (⏱)", () => {
    it("preserves original order when recentSort is false", () => {
      storePlugins = group({
        "lfo.int": { recentRank: 0 },
        "surge.vst3": { recentRank: 1 },
      });
      const { result } = renderHook(() =>
        usePaletteFilters("", null, { favouritesOnly: false, recentSort: false }),
      );
      // Original base order: surge, proeq, midi-router, lfo.
      expect(result.current.filtered.map((p) => p.id)).toEqual([
        "surge.vst3",
        "proeq.au",
        "midi-router.int",
        "lfo.int",
      ]);
    });

    it("sorts recent rows first (best rank first), non-recent after in original order", () => {
      storePlugins = group({
        "lfo.int": { recentRank: 0 }, // most recent
        "midi-router.int": { recentRank: 1 },
      });
      const { result } = renderHook(() =>
        usePaletteFilters("", null, { favouritesOnly: false, recentSort: true }),
      );
      const ids = result.current.filtered.map((p) => p.id);
      // Recent rows ascend by rank…
      expect(ids[0]).toBe("lfo.int");
      expect(ids[1]).toBe("midi-router.int");
      // …non-recent rows keep their original relative order after them.
      expect(ids.slice(2)).toEqual(["surge.vst3", "proeq.au"]);
    });

    it("does not drop non-recent rows (sort, not filter)", () => {
      storePlugins = group({ "lfo.int": { recentRank: 0 } });
      const { result } = renderHook(() =>
        usePaletteFilters("", null, { favouritesOnly: false, recentSort: true }),
      );
      expect(result.current.filtered).toHaveLength(4);
    });
  });
});

// ── Virtualization window-math tests ─────────────────────────────────────────
// These tests verify the arithmetic used in PluginList.tsx without mounting
// the full React component. The constants are imported directly.

describe("virtualization window math", () => {
  const LIST_ROW_H = 34;
  const OVERSCAN = 5;

  function computeSlice(
    totalItems: number,
    scrollTop: number,
    viewportH: number,
  ) {
    const visibleCount = Math.ceil(viewportH / LIST_ROW_H) + OVERSCAN * 2;
    const startIndex = Math.max(0, Math.floor(scrollTop / LIST_ROW_H) - OVERSCAN);
    const endIndex = Math.min(totalItems, startIndex + visibleCount);
    return { startIndex, endIndex, count: endIndex - startIndex };
  }

  it("at scroll=0 starts at row 0", () => {
    const { startIndex } = computeSlice(1000, 0, 400);
    expect(startIndex).toBe(0);
  });

  it("renders O(viewport) rows, not O(total)", () => {
    const { count } = computeSlice(1000, 0, 400);
    // ~400/34 ≈ 12 visible + 10 overscan = ~22 rows max; well under 1000
    expect(count).toBeLessThan(30);
    expect(count).toBeGreaterThan(10);
  });

  it("window shifts correctly when scrolled halfway through 1000 items", () => {
    const midScroll = 500 * LIST_ROW_H; // item 500 at top
    const { startIndex, endIndex } = computeSlice(1000, midScroll, 400);
    expect(startIndex).toBe(500 - OVERSCAN);
    expect(endIndex).toBeLessThanOrEqual(1000);
    expect(endIndex - startIndex).toBeLessThan(30);
  });

  it("clamps startIndex to 0 at negative scroll (overscan)", () => {
    // Scroll just 2 rows in — overscan would try to go negative
    const { startIndex } = computeSlice(1000, 2 * LIST_ROW_H, 400);
    expect(startIndex).toBe(0); // clamped: 2 - 5 = -3 → 0
  });

  it("clamps endIndex at totalItems near the bottom", () => {
    const nearBottomScroll = 990 * LIST_ROW_H;
    const { endIndex } = computeSlice(1000, nearBottomScroll, 400);
    expect(endIndex).toBe(1000);
  });

  it("total height spacer = totalItems × LIST_ROW_H", () => {
    expect(1000 * LIST_ROW_H).toBe(34000);
  });

  it("offsetTop = startIndex × LIST_ROW_H", () => {
    const { startIndex } = computeSlice(1000, 500 * LIST_ROW_H, 400);
    expect(startIndex * LIST_ROW_H).toBe(startIndex * 34);
  });
});
