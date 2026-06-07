/**
 * useQuickAddResults — engine tests (N3).
 *
 * Exercises the shared results engine directly (via renderHook) to cover the
 * rail filter, the alias-aware browse stack, the port filter, and search-mode
 * ordering — without going through the rendered popup.
 */

import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useQuickAddResults } from "../useQuickAddResults";
import type { QuickAddPlugin } from "../fuzzyScore";

function p(over: Partial<QuickAddPlugin> & { id: string; name: string }): QuickAddPlugin {
  return {
    category: "audiofx",
    format: "VST3",
    rawCategory: "EQ",
    manufacturer: "Acme",
    signalOut: "audio",
    usageCount: 0,
    isFavorite: false,
    recentRank: -1,
    ...over,
  };
}

const LIB: QuickAddPlugin[] = [
  p({ id: "synth", name: "Surge XT", category: "instrument", signalOut: "audio", isFavorite: true }),
  p({ id: "eq", name: "Pro-Q 4", category: "audiofx", signalOut: "audio", recentRank: 1 }),
  p({ id: "verb", name: "Vintage Verb", category: "audiofx", signalOut: "audio", recentRank: 0 }),
  p({ id: "arp", name: "Arp Pro", category: "midifx", signalOut: "midi" }),
  p({ id: "lfo", name: "LFO Tool", category: "modulator", signalOut: "value" }),
];

function run(args: Partial<Parameters<typeof useQuickAddResults>[0]> = {}) {
  return renderHook(() =>
    useQuickAddResults({
      plugins: LIB,
      search: "",
      railFilter: "all",
      ...args,
    }),
  ).result.current;
}

describe("useQuickAddResults — browse mode", () => {
  it("orders Favorites → Recents → All and reports section counts", () => {
    const r = run();
    expect(r.isSearching).toBe(false);
    expect(r.favCount).toBe(1); // Surge XT (group favourite)
    expect(r.recentCount).toBe(2); // Vintage Verb (rank 0), Pro-Q 4 (rank 1)
    // First row is the favourite…
    expect(r.rows[0]!.plugin.id).toBe("synth");
    // …then recents ordered by recentRank (verb rank0 before eq rank1)…
    expect(r.rows[1]!.plugin.id).toBe("verb");
    expect(r.rows[2]!.plugin.id).toBe("eq");
    // …then the rest (arp, lfo) in stable order.
    expect(r.rows.slice(3).map((e) => e.plugin.id)).toEqual(["arp", "lfo"]);
  });

  it("group-level isFavorite pins a family even with no id-keyed set", () => {
    const r = run();
    expect(r.rows[0]!.plugin.isFavorite).toBe(true);
  });
});

describe("useQuickAddResults — rail filter", () => {
  it("category rail narrows to that block category (no fav/recents labels)", () => {
    const r = run({ railFilter: "audiofx" });
    const ids = r.rows.map((e) => e.plugin.id);
    expect(ids).toContain("eq");
    expect(ids).toContain("verb");
    expect(ids).not.toContain("synth"); // instrument
    expect(ids).not.toContain("arp"); // midifx
  });

  it("'favorites' rail shows only favourites", () => {
    const r = run({ railFilter: "favorites" });
    expect(r.rows.map((e) => e.plugin.id)).toEqual(["synth"]);
    expect(r.favCount).toBe(0); // focused view → no section labels
  });

  it("'recents' rail shows only recents, ordered by recentRank", () => {
    const r = run({ railFilter: "recents" });
    expect(r.rows.map((e) => e.plugin.id)).toEqual(["verb", "eq"]);
  });
});

describe("useQuickAddResults — port filter", () => {
  it("filters by real signalOut (audio port hides midi + value)", () => {
    const r = run({ portType: "audio" });
    const ids = r.rows.map((e) => e.plugin.id);
    expect(ids).toEqual(expect.arrayContaining(["synth", "eq", "verb"]));
    expect(ids).not.toContain("arp");
    expect(ids).not.toContain("lfo");
  });

  it("composes port + category rail", () => {
    const r = run({ portType: "audio", railFilter: "instrument" });
    expect(r.rows.map((e) => e.plugin.id)).toEqual(["synth"]);
  });
});

describe("useQuickAddResults — search mode", () => {
  it("returns a flat scored list with no section labels", () => {
    const r = run({ search: "pro" });
    expect(r.isSearching).toBe(true);
    expect(r.favCount).toBe(0);
    expect(r.recentCount).toBe(0);
    const ids = r.rows.map((e) => e.plugin.id);
    expect(ids).toContain("eq"); // "Pro-Q 4"
    expect(ids).toContain("arp"); // "Arp Pro"
  });

  it("search respects the port filter", () => {
    const r = run({ search: "pro", portType: "midi" });
    expect(r.rows.map((e) => e.plugin.id)).toEqual(["arp"]);
  });
});
