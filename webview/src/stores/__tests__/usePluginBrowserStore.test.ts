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
    expect(plugins[0].name).toBe("Hall Reverb");
    expect(plugins[0].manufacturer).toBe("Acme");
    expect(plugins[0].format).toBe("VST3");
  });

  it("prefers descriptiveName over name", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [
        { identifier: "au.Synth", name: "ShortName", descriptiveName: "LongSynth Name" },
      ],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    expect(usePluginBrowserStore.getState().plugins[0].name).toBe("LongSynth Name");
  });

  it("falls back to identifier when name and descriptiveName are absent", async () => {
    bridge.mock.mockResolvedValueOnce({
      plugins: [{ identifier: "fallback-id" }],
      favoriteIdentifiers: [],
      recentIdentifiers: [],
    });
    await usePluginBrowserStore.getState().refresh();
    expect(usePluginBrowserStore.getState().plugins[0].name).toBe("fallback-id");
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
