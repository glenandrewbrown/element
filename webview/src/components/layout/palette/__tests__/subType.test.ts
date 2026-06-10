/**
 * V2 (Category-Led) sub-type derivation + divider grouping.
 *
 * The category rail narrows the list to ONE category; within it the list pane
 * shows sub-type dividers (EQ / Dynamics / Reverb …). This is the load-bearing
 * IA of Variation 2, so the pure deriveSubType + groupBySubType helpers are
 * unit-tested directly (no host data required — derived from category + name).
 */
import { describe, it, expect } from "vitest";
import {
  deriveSubType,
  groupBySubType,
  SUBTYPE_DIVIDER_MIN,
  type PluginEntry,
} from "../usePaletteFilters";

function entry(
  name: string,
  category: PluginEntry["category"],
  subtype: string,
): PluginEntry {
  return {
    id: `id:${name}`,
    name,
    description: "",
    category,
    format: "VST3",
    manufacturer: "",
    subtype,
    variants: [{ format: "VST3", identifier: `id:${name}` }],
  };
}

describe("deriveSubType", () => {
  it("buckets Audio FX by name/tag keyword", () => {
    expect(deriveSubType("audiofx", "EQ", "Pro-Q 3")).toBe("Equalizers");
    expect(deriveSubType("audiofx", "Dynamics", "Pro-C 2")).toBe("Dynamics");
    expect(deriveSubType("audiofx", "", "ValhallaRoom")).toBe("Reverb");
    expect(deriveSubType("audiofx", "", "EchoBoy Delay")).toBe("Delay");
    expect(deriveSubType("audiofx", "", "iZotope RX De-noise")).toBe(
      "Repair / Spectral",
    );
  });

  it("buckets Instruments / MIDI / Modulators", () => {
    expect(deriveSubType("instrument", "", "Massive Synth")).toBe("Synths");
    expect(deriveSubType("instrument", "", "Kontakt")).toBe("Samplers");
    expect(deriveSubType("midifx", "", "Arpeggiator")).toBe("Arpeggiators");
    expect(deriveSubType("modulator", "", "LFO Tool")).toBe("LFOs");
    expect(deriveSubType("modulator", "", "Lua Script")).toBe("Scripting");
  });

  it("falls back to an honest 'Other …' bucket, never a fabricated label", () => {
    expect(deriveSubType("audiofx", "", "Mystery Box")).toBe("Other Effects");
    expect(deriveSubType("instrument", "", "Mystery Box")).toBe(
      "Other Instruments",
    );
    expect(deriveSubType("midifx", "", "Mystery Box")).toBe("Other MIDI");
    expect(deriveSubType("modulator", "", "Mystery Box")).toBe(
      "Other Utilities",
    );
  });
});

describe("groupBySubType", () => {
  it("returns a flat list (no dividers) at or under the divider minimum", () => {
    const few = Array.from({ length: SUBTYPE_DIVIDER_MIN }, (_, i) =>
      entry(`P${i}`, "audiofx", "Equalizers"),
    );
    const items = groupBySubType(few);
    expect(items.every((it) => it.kind === "row")).toBe(true);
    expect(items).toHaveLength(SUBTYPE_DIVIDER_MIN);
  });

  it("inserts a divider on the first row of each new sub-type when long enough", () => {
    const many: PluginEntry[] = [
      ...Array.from({ length: 6 }, (_, i) => entry(`EQ${i}`, "audiofx", "Equalizers")),
      ...Array.from({ length: 7 }, (_, i) => entry(`CO${i}`, "audiofx", "Dynamics")),
    ];
    const items = groupBySubType(many);
    const dividers = items.filter((it) => it.kind === "divider");
    expect(dividers.map((d) => (d.kind === "divider" ? d.label : ""))).toEqual([
      "Equalizers",
      "Dynamics",
    ]);
    // First item is the Equalizers divider, then its rows, then the Dynamics
    // divider — first-encounter order preserved (no re-sorting).
    expect(items[0]).toEqual({ kind: "divider", label: "Equalizers" });
    expect(items[1]).toMatchObject({ kind: "row" });
    expect(items[7]).toEqual({ kind: "divider", label: "Dynamics" });
  });

  it("preserves incoming order (respects an upstream facet sort)", () => {
    // 13 rows, deliberately interleaved sub-types — groupBySubType must NOT
    // reorder, only inject a divider whenever the sub-type changes.
    const seq: PluginEntry[] = [
      entry("a", "audiofx", "Reverb"),
      entry("b", "audiofx", "Reverb"),
      entry("c", "audiofx", "Delay"),
      entry("d", "audiofx", "Reverb"),
      ...Array.from({ length: 9 }, (_, i) => entry(`x${i}`, "audiofx", "Delay")),
    ];
    const items = groupBySubType(seq);
    const labels = items
      .filter((it) => it.kind === "divider")
      .map((d) => (d.kind === "divider" ? d.label : ""));
    // Reverb, Delay, Reverb (re-encountered), Delay — order honoured, not merged.
    expect(labels).toEqual(["Reverb", "Delay", "Reverb", "Delay"]);
  });
});
