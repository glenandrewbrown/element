/**
 * Tests for usePluginBrowserStore — plugin list refresh + inferBlockCategory.
 * Exercises the async refresh path, bridge null/error/malformed handling,
 * favorites/recents parsing, and blockCategory inference.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JuceBridgeMock } from "../../test/mockJuceBridge";
import { installJuceBridgeMock } from "../../test/mockJuceBridge";
import { usePluginBrowserStore } from "../usePluginBrowserStore";

function resetStore() {
  usePluginBrowserStore.setState({
    plugins: [],
    favoriteIdentifiers: new Set(),
    recentIdentifiers: [],
  });
}

describe("usePluginBrowserStore.refresh", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
  });

  afterEach(() => bridge.uninstall());

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("populates plugins from bridge response", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        {
          identifier: "vst3.Reverb",
          name: "Reverb",
          descriptiveName: "Hall Reverb",
          manufacturer: "Acme",
          format: "VST3",
          category: "Reverb",
        },
      ],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const { plugins } = usePluginBrowserStore.getState();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].identifier).toBe("vst3.Reverb");
    // N1: title is the real NAME; the descriptiveName is the secondary field.
    expect(plugins[0].name).toBe("Reverb");
    expect(plugins[0].description).toBe("Hall Reverb");
    expect(plugins[0].manufacturer).toBe("Acme");
    expect(plugins[0].format).toBe("VST3");
  });

  // N1 fix: the row TITLE is the real NAME, NOT the descriptiveName. Internal
  // Element nodes put a sentence DESCRIPTION in `descriptiveName` ("Sends MIDI
  // to a hardware…"), so preferring it leaked the description as the title.
  it("titles by NAME, not descriptiveName, and carries the description separately", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        {
          identifier: "el.MidiOut",
          name: "MIDI Output Device",
          descriptiveName: "Sends MIDI to a hardware or virtual output device",
        },
      ],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const p = usePluginBrowserStore.getState().plugins[0];
    expect(p.name).toBe("MIDI Output Device"); // real name is the title
    expect(p.description).toBe("Sends MIDI to a hardware or virtual output device");
  });

  it("leaves description empty when it equals the name (no redundant subtitle)", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [{ identifier: "vst3.Verb", name: "BigVerb", descriptiveName: "BigVerb" }],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    expect(usePluginBrowserStore.getState().plugins[0].description).toBe("");
  });

  it("falls back to descriptiveName then identifier for the title when name absent", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        { identifier: "au.Synth", descriptiveName: "LongSynth Name" },
        { identifier: "fallback-id" },
      ],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const ps = usePluginBrowserStore.getState().plugins;
    // No `name` → descriptiveName is the best available title.
    expect(ps[0].name).toBe("LongSynth Name");
    // Neither → identifier.
    expect(ps[1].name).toBe("fallback-id");
  });

  it("populates favoriteIdentifiers Set", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [],
      favoriteIdentifiers: ["vst3.A", "vst3.B"],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const { favoriteIdentifiers } = usePluginBrowserStore.getState();
    expect(favoriteIdentifiers.has("vst3.A")).toBe(true);
    expect(favoriteIdentifiers.has("vst3.B")).toBe(true);
  });

  it("populates recentIdentifiers list", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [],
      favoriteIdentifiers: [],
      recentIdentifiers: ["vst3.Recent1", "vst3.Recent2"],
    });
    await usePluginBrowserStore.getState().refresh();
    expect(usePluginBrowserStore.getState().recentIdentifiers).toEqual([
      "vst3.Recent1",
      "vst3.Recent2",
    ]);
  });

  it("filters plugins missing identifier", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        { name: "No ID" },
        { identifier: "vst3.HasId", name: "Good" },
      ],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const { plugins } = usePluginBrowserStore.getState();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].identifier).toBe("vst3.HasId");
  });

  it("accepts JSON string response and parses it", async () => {
    const payload = JSON.stringify({
      plugins: [{ identifier: "vst3.FromString", name: "String Plugin" }],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    bridge.mock.mockResolvedValueOnce(payload);
    await usePluginBrowserStore.getState().refresh();
    expect(usePluginBrowserStore.getState().plugins).toHaveLength(1);
  });

  // ── Null / missing bridge ───────────────────────────────────────────────────

  it("no-op when bridge returns null", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    await usePluginBrowserStore.getState().refresh();
    expect(usePluginBrowserStore.getState().plugins).toEqual([]);
  });

  it("no-op when plugins field is not an array", async () => {
    bridge.mock.mockResolvedValueOnce({ plugins: "not-array" });
    await usePluginBrowserStore.getState().refresh();
    expect(usePluginBrowserStore.getState().plugins).toEqual([]);
  });

  it("no-op when bridge throws", async () => {
    bridge.mock.mockRejectedValueOnce(new Error("network error"));
    await usePluginBrowserStore.getState().refresh();
    expect(usePluginBrowserStore.getState().plugins).toEqual([]);
  });

  it("skips non-string entries in favoriteIdentifiers", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [],
      // Intentional bad input — mixed types; refresh() must skip non-strings.
      favoriteIdentifiers: ["vst3.Good", 42, null, "vst3.Also"],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const { favoriteIdentifiers } = usePluginBrowserStore.getState();
    expect(favoriteIdentifiers.size).toBe(2);
    expect(favoriteIdentifiers.has("vst3.Good")).toBe(true);
    expect(favoriteIdentifiers.has("vst3.Also")).toBe(true);
  });

  // ── inferBlockCategory via blockCategory field ──────────────────────────────

  const categoryTests: Array<[string, string, "instrument" | "audiofx" | "midifx" | "modulator"]> = [
    ["Instrument", "Synth Bass", "instrument"],
    ["synth lead", "SynthMaster", "instrument"],
    ["sampler", "Kontakt", "instrument"],
    ["Generator", "Kick Gen", "instrument"],
    ["MIDI", "Arp+", "midifx"],
    ["Sequencer", "Step Seq", "midifx"],
    ["Utility", "Gain Trim", "modulator"],
    ["Analysis", "Spectrum", "modulator"],
    ["Reverb", "Hall Verb", "audiofx"],
    ["Delay", "Tape Echo", "audiofx"],
    ["Uncategorised", "Unknown", "audiofx"],
    ["", "No Category", "audiofx"],
  ];

  it.each(categoryTests)(
    "category '%s' -> blockCategory '%s'",
    async (rawCategory, _pluginName, expected) => {
      bridge.mock.mockResolvedValueOnce({
        plugins: [{ identifier: "test.id", category: rawCategory }],
        favoriteIdentifiers: [],
        recentIdentifiers: [],
      });
      await usePluginBrowserStore.getState().refresh();
      expect(usePluginBrowserStore.getState().plugins[0].blockCategory).toBe(expected);
    },
  );

  // ── G3c item 2: real signalOut + item 3: real usageCount ────────────────────

  it("carries the real per-plugin signalOut + usageCount from C++", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        {
          identifier: "vst3.Synth",
          name: "Synth",
          category: "Synth",
          signalOut: "audio",
          isInstrument: true,
          numInputChannels: 0,
          numOutputChannels: 2,
          usageCount: 12,
        },
      ],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const p = usePluginBrowserStore.getState().plugins[0];
    expect(p.signalOut).toBe("audio");
    expect(p.usageCount).toBe(12);
  });

  it("honours signalOut even when it contradicts the inferred category", async () => {
    // category "Modulator" would infer blockCategory "modulator" → CV by the
    // old logic; the REAL signalOut "audio" must win.
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        {
          identifier: "vst3.ShaperBox",
          category: "Modulator",
          signalOut: "audio",
        },
      ],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const p = usePluginBrowserStore.getState().plugins[0];
    expect(p.blockCategory).toBe("modulator");
    expect(p.signalOut).toBe("audio"); // real field, not category-derived
  });

  it("ignores a malformed signalOut and falls back to category-derived signal", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        { identifier: "vst3.Midi", category: "MIDI", signalOut: "bogus" },
      ],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    // "MIDI" → blockCategory "midifx" → fallback signal "midi".
    expect(usePluginBrowserStore.getState().plugins[0].signalOut).toBe("midi");
  });

  it("falls back when C++ omits signalOut/usageCount (older host build)", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [{ identifier: "vst3.Reverb", category: "Reverb" }],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const p = usePluginBrowserStore.getState().plugins[0];
    // "Reverb" → audiofx → audio (graceful, labelled fallback).
    expect(p.signalOut).toBe("audio");
    // usageCount absent → 0, never undefined/NaN.
    expect(p.usageCount).toBe(0);
  });

  const signalFallbackTests: Array<[string, "audio" | "midi" | "value"]> = [
    ["Instrument", "audio"],
    ["Reverb", "audio"],
    ["MIDI", "midi"],
    ["Sequencer", "midi"],
    ["Utility", "value"],
    ["Uncategorised", "audio"],
  ];

  it.each(signalFallbackTests)(
    "category '%s' (no signalOut) -> fallback signal '%s'",
    async (rawCategory, expected) => {
      bridge.mock.mockResolvedValueOnce({
        plugins: [{ identifier: "test.id", category: rawCategory }],
        favoriteIdentifiers: [],
        recentIdentifiers: [],
      });
      await usePluginBrowserStore.getState().refresh();
      expect(usePluginBrowserStore.getState().plugins[0].signalOut).toBe(expected);
    },
  );
});

// ── N2 / D-1: alias-aware group fields consumption ──────────────────────────

describe("usePluginBrowserStore.refresh — N2 group fields", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
  });

  afterEach(() => bridge.uninstall());

  it("consumes the host-precomputed group fields verbatim", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        {
          identifier: "vst3:BigVerb",
          name: "BigVerb",
          format: "VST3",
          aliases: ["vst3:BigVerb", "au:BigVerb"],
          variants: [
            { format: "VST3", identifier: "vst3:BigVerb" },
            { format: "AudioUnit", identifier: "au:BigVerb" },
          ],
          usageCount: 7,
          isFavorite: true,
          recentRank: 2,
        },
      ],
      favoriteIdentifiers: ["au:BigVerb"],
      recentIdentifiers: ["x", "y", "au:BigVerb"],
    });
    await usePluginBrowserStore.getState().refresh();
    const p = usePluginBrowserStore.getState().plugins[0];
    expect(p.aliases).toEqual(["vst3:BigVerb", "au:BigVerb"]);
    expect(p.variants).toHaveLength(2);
    expect(p.variants[1]).toEqual({ format: "AudioUnit", identifier: "au:BigVerb" });
    expect(p.usageCount).toBe(7); // aggregated by host
    expect(p.isFavorite).toBe(true);
    expect(p.recentRank).toBe(2);
  });

  it("derives a single-variant group when an older host omits the group fields", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [{ identifier: "vst3:Solo", name: "Solo", format: "VST3" }],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const p = usePluginBrowserStore.getState().plugins[0];
    expect(p.aliases).toEqual(["vst3:Solo"]);
    expect(p.variants).toEqual([{ format: "VST3", identifier: "vst3:Solo" }]);
    expect(p.isFavorite).toBe(false);
    expect(p.recentRank).toBe(-1);
  });

  it("derives isFavorite/recentRank from aliases when host omits them (older build)", async () => {
    // The AU alias is starred + recent; the derived group must reflect it even
    // though the host sent no isFavorite/recentRank.
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        {
          identifier: "vst3:BigVerb",
          name: "BigVerb",
          format: "VST3",
          aliases: ["vst3:BigVerb", "au:BigVerb"],
          // no isFavorite / recentRank fields
        },
      ],
      favoriteIdentifiers: ["au:BigVerb"],
      recentIdentifiers: ["z", "au:BigVerb"],
    });
    await usePluginBrowserStore.getState().refresh();
    const p = usePluginBrowserStore.getState().plugins[0];
    expect(p.isFavorite).toBe(true); // starred AU alias keeps the group favourited
    expect(p.recentRank).toBe(1); // best alias rank
  });
});

// ── I4-B: persistent favourite-star toggle (optimistic + bridge call) ────────

describe("usePluginBrowserStore.toggleFavorite", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    resetStore();
  });

  afterEach(() => bridge.uninstall());

  it("optimistically ADDS an unstarred id to favoriteIdentifiers", () => {
    usePluginBrowserStore.getState().toggleFavorite("vst3.Reverb");
    expect(usePluginBrowserStore.getState().favoriteIdentifiers.has("vst3.Reverb")).toBe(
      true,
    );
  });

  it("optimistically REMOVES an already-starred id", () => {
    usePluginBrowserStore.setState({ favoriteIdentifiers: new Set(["vst3.Synth"]) });
    usePluginBrowserStore.getState().toggleFavorite("vst3.Synth");
    expect(usePluginBrowserStore.getState().favoriteIdentifiers.has("vst3.Synth")).toBe(
      false,
    );
  });

  it("produces a NEW Set reference (so subscribers re-render)", () => {
    const before = usePluginBrowserStore.getState().favoriteIdentifiers;
    usePluginBrowserStore.getState().toggleFavorite("vst3.A");
    const after = usePluginBrowserStore.getState().favoriteIdentifiers;
    expect(after).not.toBe(before);
  });

  it("calls the native bridge with elementToggleFavorite + identifier", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    usePluginBrowserStore.getState().toggleFavorite("vst3.Reverb");
    // The bridge handshake resolves on a microtask; flush it before asserting.
    await Promise.resolve();
    await Promise.resolve();
    expect(bridge.mock).toHaveBeenCalledWith("elementToggleFavorite", ["vst3.Reverb"]);
  });

  it("does NOT insert a Block (never calls elementGraphAddPlugin)", async () => {
    usePluginBrowserStore.getState().toggleFavorite("vst3.Reverb");
    await Promise.resolve();
    await Promise.resolve();
    expect(bridge.callsOf("elementGraphAddPlugin")).toHaveLength(0);
  });

  it("no-ops on an empty identifier (no state change, no bridge call)", async () => {
    const before = usePluginBrowserStore.getState().favoriteIdentifiers;
    usePluginBrowserStore.getState().toggleFavorite("");
    await Promise.resolve();
    expect(usePluginBrowserStore.getState().favoriteIdentifiers).toBe(before);
    expect(bridge.callsOf("elementToggleFavorite")).toHaveLength(0);
  });

  it("reconciles to the host snapshot on the next refresh (truth wins)", async () => {
    // Optimistically star two ids locally...
    usePluginBrowserStore.getState().toggleFavorite("vst3.A");
    usePluginBrowserStore.getState().toggleFavorite("vst3.B");
    await Promise.resolve();
    // ...then the host snapshot only confirms one (e.g. B failed to resolve).
    bridge.mock.mockResolvedValueOnce({
      plugins: [],
      favoriteIdentifiers: ["vst3.A"],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    const fav = usePluginBrowserStore.getState().favoriteIdentifiers;
    expect(fav.has("vst3.A")).toBe(true);
    expect(fav.has("vst3.B")).toBe(false); // snapshot truth overrides optimistic
  });
});
