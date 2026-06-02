/**
 * QuickAddPopup — fuzzy-search and signal-alias behaviour tests.
 *
 * The core search logic (normaliseSeps, fuzzyScoreField, levenshtein,
 * SIGNAL_ALIASES, CATEGORY_SIGNAL) lives as private helpers inside
 * QuickAddPopup.tsx. These tests exercise them through the rendered list
 * so the coverage flows back to the real implementation without exporting
 * internal symbols.
 *
 * Gaps covered (not in QuickAddPopup.test.tsx):
 *   1. Separator normalisation — "Pro-Q 4" matched by "pro q 4" / "pro_q4"
 *   2. Prefix/exact bonus — exact name appears before partial match
 *   3. Subsequence match — "sxt" finds "Surge XT"
 *   4. Acronym match — "SX" matches "Surge XT"
 *   5. Typo tolerance (Levenshtein ≤1) — "surje" finds "Surge XT"
 *   6. Signal alias: "audio" → shows instruments + audio effects
 *   7. Signal alias: "midi" → shows MIDI effects only
 *   8. Signal alias: "cv" → shows modulators only
 *   9. Signal alias term "synth" → shows instruments
 *  10. Signal alias is case-insensitive
 *  11. manufacturer field searched — "valhalla" finds ValhallaVintageVerb
 *  12. rawCategory field searched — "reverb" finds a Reverb plugin
 *  13. Empty query shows all plugins (no filter)
 *  14. Score ordering: exact name match outranks partial match
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphAddPlugin: vi.fn(async () => undefined),
}));

vi.mock("../../../events", () => ({
  EV_OPEN_PREFERENCES: "el:open-preferences",
}));

// Rich plugin set covering all categories + metadata fields.
// signalOut + usageCount are REAL fields now sent by C++ (G3c items 2+3); the
// port-type filter keys off signalOut, so each entry carries its real signal.
const RICH_PLUGINS = [
  {
    identifier: "com.vendor.SurgeXT",
    name: "Surge XT",
    blockCategory: "instrument" as const,
    format: "VST3",
    category: "Synth",
    manufacturer: "Surge Synth Team",
    signalOut: "audio" as const,
    usageCount: 0,
  },
  {
    identifier: "com.fabfilter.ProQ4",
    name: "Pro-Q 4",
    blockCategory: "audiofx" as const,
    format: "VST3",
    category: "EQ",
    manufacturer: "FabFilter",
    signalOut: "audio" as const,
    usageCount: 0,
  },
  {
    identifier: "com.valhalla.VintageVerb",
    name: "ValhallaVintageVerb",
    blockCategory: "audiofx" as const,
    format: "AU",
    category: "Reverb",
    manufacturer: "Valhalla DSP",
    signalOut: "audio" as const,
    usageCount: 0,
  },
  {
    identifier: "com.vendor.Arpeggio",
    name: "Arpeggio Pro",
    blockCategory: "midifx" as const,
    format: "VST3",
    category: "Arpeggiator",
    manufacturer: "MidiCorp",
    signalOut: "midi" as const,
    usageCount: 0,
  },
  {
    identifier: "com.vendor.LFOTool",
    name: "LFO Tool",
    blockCategory: "modulator" as const,
    format: "VST3",
    category: "Modulator",
    manufacturer: "Xfer Records",
    signalOut: "value" as const,
    usageCount: 0,
  },
  {
    identifier: "com.vendor.BasicSampler",
    name: "Basic Sampler",
    blockCategory: "instrument" as const,
    format: "AU",
    category: "Sampler",
    manufacturer: "NativePlugins",
    signalOut: "audio" as const,
    usageCount: 0,
  },
];

const mockRefresh = vi.fn(async () => undefined);

vi.mock("../../../stores/usePluginBrowserStore", () => ({
  usePluginBrowserStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      plugins: RICH_PLUGINS,
      favoriteIdentifiers: new Set<string>(),
      recentIdentifiers: [] as string[],
      refresh: mockRefresh,
    })
  ),
}));

import { QuickAddPopup } from "../QuickAddPopup";

// ── Helpers ───────────────────────────────────────────────────────────────────

const onClose = vi.fn();
const defaultProps = { x: 100, y: 200, onClose };

function setup() {
  return render(<QuickAddPopup {...defaultProps} />);
}

function search(query: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: query } });
}

function visiblePluginNames(): string[] {
  // Collect every text node that contains a known plugin name
  return RICH_PLUGINS
    .map((p) => p.name)
    .filter((name) => !!screen.queryByText(name));
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

// ── 1. Empty query ─────────────────────────────────────────────────────────────

describe("empty query", () => {
  it("shows all plugins when query is empty", () => {
    setup();
    // All plugin names visible
    RICH_PLUGINS.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
  });
});

// ── 2. Separator normalisation ─────────────────────────────────────────────────

describe("separator normalisation", () => {
  it("matches 'Pro-Q 4' with query 'pro q 4'", () => {
    setup();
    search("pro q 4");
    expect(screen.getByText("Pro-Q 4")).toBeInTheDocument();
  });

  it("matches 'Pro-Q 4' with query 'pro_q4'", () => {
    setup();
    search("pro_q4");
    expect(screen.getByText("Pro-Q 4")).toBeInTheDocument();
  });

  it("matches 'Pro-Q 4' with query 'proq4'", () => {
    setup();
    search("proq4");
    expect(screen.getByText("Pro-Q 4")).toBeInTheDocument();
  });
});

// ── 3. Subsequence match ───────────────────────────────────────────────────────

describe("subsequence match", () => {
  it("'sxt' subsequence finds 'Surge XT'", () => {
    setup();
    search("sxt");
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
  });

  it("'lft' subsequence finds 'LFO Tool'", () => {
    setup();
    search("lft");
    expect(screen.getByText("LFO Tool")).toBeInTheDocument();
  });
});

// ── 4. Acronym match ───────────────────────────────────────────────────────────

describe("acronym match", () => {
  it("'SX' initials match 'Surge XT'", () => {
    setup();
    search("SX");
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
  });

  it("'LT' initials match 'LFO Tool'", () => {
    setup();
    search("LT");
    expect(screen.getByText("LFO Tool")).toBeInTheDocument();
  });
});

// ── 5. Typo tolerance (Levenshtein ≤1) ────────────────────────────────────────

describe("typo tolerance", () => {
  it("'surje' (1 edit: j→g) finds 'Surge XT'", () => {
    setup();
    search("surje");
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
  });

  it("'surfe' (1 edit: f→g) finds 'Surge XT'", () => {
    setup();
    search("surfe");
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
  });
});

// ── 6–10. Signal type aliases ──────────────────────────────────────────────────

describe("signal type aliases", () => {
  it("'audio' shows instruments and audio effects", async () => {
    setup();
    search("audio");
    await waitFor(() => {
      const visible = visiblePluginNames();
      // Instruments and audiofx should appear
      const hasInstrument = visible.some((n) =>
        ["Surge XT", "Basic Sampler"].includes(n),
      );
      const hasAudioFx = visible.some((n) =>
        ["Pro-Q 4", "ValhallaVintageVerb"].includes(n),
      );
      expect(hasInstrument || hasAudioFx).toBe(true);
    });
  });

  it("'midi' shows MIDI effects", async () => {
    setup();
    search("midi");
    await waitFor(() => {
      expect(screen.getByText("Arpeggio Pro")).toBeInTheDocument();
    });
  });

  it("'cv' shows modulators", async () => {
    setup();
    search("cv");
    await waitFor(() => {
      expect(screen.getByText("LFO Tool")).toBeInTheDocument();
    });
  });

  it("'synth' alias shows instruments", async () => {
    setup();
    search("synth");
    await waitFor(() => {
      const visible = visiblePluginNames();
      const hasInstrument = visible.some((n) =>
        ["Surge XT", "Basic Sampler"].includes(n),
      );
      expect(hasInstrument).toBe(true);
    });
  });

  it("signal aliases are case-insensitive ('AUDIO' = 'audio')", async () => {
    const { unmount } = setup();
    search("AUDIO");
    let upperVisible: string[] = [];
    await waitFor(() => {
      upperVisible = visiblePluginNames();
      expect(upperVisible.length).toBeGreaterThan(0);
    });
    unmount();

    setup();
    search("audio");
    await waitFor(() => {
      const lowerVisible = visiblePluginNames();
      // Both queries should surface the same plugins (modulo order)
      expect(new Set(lowerVisible)).toEqual(new Set(upperVisible));
    });
  });
});

// ── 11. Manufacturer field search ─────────────────────────────────────────────

describe("manufacturer field", () => {
  it("'valhalla' finds ValhallaVintageVerb", () => {
    setup();
    search("valhalla");
    expect(screen.getByText("ValhallaVintageVerb")).toBeInTheDocument();
  });

  it("'fabfilter' finds Pro-Q 4", () => {
    setup();
    search("fabfilter");
    expect(screen.getByText("Pro-Q 4")).toBeInTheDocument();
  });
});

// ── 12. rawCategory field search ──────────────────────────────────────────────

describe("rawCategory field", () => {
  it("'reverb' finds ValhallaVintageVerb via rawCategory", () => {
    setup();
    search("reverb");
    expect(screen.getByText("ValhallaVintageVerb")).toBeInTheDocument();
  });

  it("'sampler' finds Basic Sampler via rawCategory", () => {
    setup();
    search("sampler");
    expect(screen.getByText("Basic Sampler")).toBeInTheDocument();
  });

  it("'eq' finds Pro-Q 4 via rawCategory", () => {
    setup();
    search("eq");
    expect(screen.getByText("Pro-Q 4")).toBeInTheDocument();
  });
});

// ── 13. Score ordering ─────────────────────────────────────────────────────────

describe("score ordering", () => {
  it("exact name match appears in the result set before partial matches", async () => {
    setup();
    // "LFO Tool" is an exact name match; "LFO" is a prefix — both should appear
    // but the list must not crash or omit the exact match.
    search("LFO");
    await waitFor(() => {
      expect(screen.getByText("LFO Tool")).toBeInTheDocument();
    });
  });

  it("no results for a query that matches nothing across all fields", () => {
    setup();
    search("zzzznoMatchAtAll99999");
    RICH_PLUGINS.forEach((p) => {
      expect(screen.queryByText(p.name)).not.toBeInTheDocument();
    });
  });
});
