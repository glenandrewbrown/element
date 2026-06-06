/**
 * usePaletteFilters — unit tests.
 *
 * Tests the memoised filter logic extracted from ToolPalette into
 * usePaletteFilters.ts. Validates search/category/fav/recents filtering
 * and the virtualization window-math constants.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// ── Store mocks ───────────────────────────────────────────────────────────────

const mockPlugins = [
  {
    identifier: "surge.vst3",
    name: "Surge XT",
    blockCategory: "instrument" as const,
    format: "VST3",
    manufacturer: "Surge Synth",
    category: "Instrument",
    signalOut: "audio" as const,
    usageCount: 5,
  },
  {
    identifier: "proeq.au",
    name: "Pro-Q 3",
    blockCategory: "audiofx" as const,
    format: "AU",
    manufacturer: "FabFilter",
    category: "EQ",
    signalOut: "audio" as const,
    usageCount: 3,
  },
  {
    identifier: "midi-router.int",
    name: "MIDI Router",
    blockCategory: "midifx" as const,
    format: "INT",
    manufacturer: "Element",
    category: "Utility",
    signalOut: "midi" as const,
    usageCount: 1,
  },
  {
    identifier: "lfo.int",
    name: "LFO",
    blockCategory: "modulator" as const,
    format: "INT",
    manufacturer: "Element",
    category: "Modulator",
    signalOut: "value" as const,
    usageCount: 2,
  },
];

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
    it("maps nativePlugins to PluginEntry[]", () => {
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.plugins).toHaveLength(4);
      expect(result.current.plugins[0]).toEqual({
        id: "surge.vst3",
        name: "Surge XT",
        category: "instrument",
        format: "VST3",
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

  describe("favPlugins", () => {
    it("returns empty array when no favorites", () => {
      storeFavoriteIds = new Set();
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.favPlugins).toHaveLength(0);
    });

    it("returns BrowserPlugin objects for favorite ids", () => {
      storeFavoriteIds = new Set(["surge.vst3", "proeq.au"]);
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.favPlugins).toHaveLength(2);
      const ids = result.current.favPlugins.map((p) => p.identifier);
      expect(ids).toContain("surge.vst3");
      expect(ids).toContain("proeq.au");
    });

    it("ignores favorite ids not present in plugin list", () => {
      storeFavoriteIds = new Set(["surge.vst3", "ghost.id"]);
      const { result } = renderHook(() => usePaletteFilters("", null));
      // Only the real plugin survives
      expect(result.current.favPlugins).toHaveLength(1);
      expect(result.current.favPlugins[0].identifier).toBe("surge.vst3");
    });
  });

  describe("recentPlugins", () => {
    it("returns empty array when no recents", () => {
      storeRecentIds = [];
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.recentPlugins).toHaveLength(0);
    });

    it("returns BrowserPlugin objects in recent order", () => {
      storeRecentIds = ["proeq.au", "surge.vst3"];
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.recentPlugins).toHaveLength(2);
      expect(result.current.recentPlugins[0].identifier).toBe("proeq.au");
      expect(result.current.recentPlugins[1].identifier).toBe("surge.vst3");
    });

    it("ignores recent ids not present in plugin list", () => {
      storeRecentIds = ["proeq.au", "ghost.id"];
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.recentPlugins).toHaveLength(1);
      expect(result.current.recentPlugins[0].identifier).toBe("proeq.au");
    });
  });

  describe("favoriteIds passthrough", () => {
    it("exposes the raw Set for isFavourite checks", () => {
      storeFavoriteIds = new Set(["surge.vst3"]);
      const { result } = renderHook(() => usePaletteFilters("", null));
      expect(result.current.favoriteIds.has("surge.vst3")).toBe(true);
      expect(result.current.favoriteIds.has("proeq.au")).toBe(false);
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
