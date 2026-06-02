import { describe, expect, it } from "vitest";
import { categoryIconName, iconForCategory } from "../iconForCategory";
import type { BlockCategory } from "../../../data/types";

describe("categoryIconName", () => {
  it("returns Piano for instrument", () => {
    expect(categoryIconName("instrument")).toBe("Piano");
  });

  it("returns SlidersHorizontal for audiofx", () => {
    expect(categoryIconName("audiofx")).toBe("SlidersHorizontal");
  });

  it("returns GitBranch for midifx", () => {
    expect(categoryIconName("midifx")).toBe("GitBranch");
  });

  it("returns Waves for modulator", () => {
    expect(categoryIconName("modulator")).toBe("Waves");
  });

  it("covers every BlockCategory without fallback", () => {
    const categories: BlockCategory[] = ["instrument", "audiofx", "midifx", "modulator"];
    for (const cat of categories) {
      const icon = categoryIconName(cat);
      expect(typeof icon).toBe("string");
      expect(icon.length).toBeGreaterThan(0);
    }
  });
});

describe("iconForCategory — no blockType falls back to category icon", () => {
  it("no blockType → category fallback", () => {
    expect(iconForCategory("instrument")).toBe("Piano");
    expect(iconForCategory("audiofx")).toBe("SlidersHorizontal");
    expect(iconForCategory("midifx")).toBe("GitBranch");
    expect(iconForCategory("modulator")).toBe("Waves");
  });

  it("undefined blockType → category fallback", () => {
    expect(iconForCategory("instrument", undefined)).toBe("Piano");
  });
});

describe("iconForCategory — instrument keyword matching", () => {
  const cases: Array<[string, string]> = [
    ["Yamaha Grand Piano", "Piano"],
    ["Serum Keys", "Piano"],
    ["drum machine", "Activity"],
    ["Kick Pro", "Activity"],
    ["Snare Rush", "Activity"],
    ["hi-hat step", "Activity"],
    ["Perc FX", "Activity"],
    ["Beat Station", "Activity"],
    ["Kontakt 7", "Layers"],
    ["Battery 4", "Layers"],
    ["deep sub bass", "Waves"],
    ["microphone vocal", "AudioWaveform"],
    ["Voice FX", "AudioWaveform"],
  ];

  it.each(cases)("'%s' → icon '%s'", (name, icon) => {
    expect(iconForCategory("instrument", name)).toBe(icon);
  });
});

describe("iconForCategory — audiofx keyword matching", () => {
  const cases: Array<[string, string]> = [
    ["Pro-Q 3 EQ", "SlidersHorizontal"],
    ["Parametric EQ", "SlidersHorizontal"],
    ["Pro-C Compressor", "Activity"],
    ["Limiter 6", "Activity"],
    ["Gate FX", "Activity"],
    ["Expander Plus", "Activity"],
    ["Dynamo", "Activity"],
    ["Seventh Heaven Reverb", "Waves"],
    ["Hall Verb", "Waves"],
    ["Plate Spring", "Waves"],
    ["Tape Echo", "Clock"],
    ["Delay Lama", "Clock"],
    ["Ping-Pong Delay", "Clock"],
    ["Chorus Ensemble", "Waves"],
    ["Phaser Pro", "Waves"],
    ["Tremolo LFO", "Waves"],
    ["SoftSat Drive", "Activity"],
    ["Fuzz Box", "Activity"],
    ["Distort Pro", "Activity"],
    ["Ladder Filter", "SlidersHorizontal"],
    ["LowPass SVF", "SlidersHorizontal"],
    ["Stereo Imager", "Layers"],
    ["M/S Processor", "Layers"],
    ["Spectrum Meter", "Activity"],
    ["Tuner Pro", "Activity"],
    ["Gain Trim", "SlidersHorizontal"],
    ["Volume Level", "SlidersHorizontal"],
  ];

  it.each(cases)("'%s' → icon '%s'", (name, icon) => {
    expect(iconForCategory("audiofx", name)).toBe(icon);
  });
});

describe("iconForCategory — midifx keyword matching", () => {
  const cases: Array<[string, string]> = [
    ["Arpeggio Pro", "Music"],
    ["Chord Harmonizer", "Music"],
    ["Router Split", "GitBranch"],
    ["MIDI Merge", "GitBranch"],
    ["Fan Out", "GitBranch"],
    ["Transpose -12", "GitBranch"],
    ["PitchBend Map", "GitBranch"],
    ["Quantize Grid", "Clock"],
    ["Groove Quantizer", "Clock"],
  ];

  it.each(cases)("'%s' → icon '%s'", (name, icon) => {
    expect(iconForCategory("midifx", name)).toBe(icon);
  });
});

describe("iconForCategory — modulator keyword matching", () => {
  const cases: Array<[string, string]> = [
    ["LFO Pro", "Waves"],
    ["Low Frequency OSC", "Waves"],
    ["ADSR Envelope", "Activity"],
    ["ENV Follower", "Activity"],
    ["CV Control Volt", "Waves"],
    ["Sequencer Step", "Waves"],
    ["Lua Script Node", "Settings"],
    ["Code Runner", "Settings"],
    ["OSC Network Send", "Network"],
  ];

  it.each(cases)("'%s' → icon '%s'", (name, icon) => {
    expect(iconForCategory("modulator", name)).toBe(icon);
  });
});

describe("iconForCategory — unmatched keyword falls back to category", () => {
  it("unrecognised name falls back for instrument", () => {
    expect(iconForCategory("instrument", "Xyzzy Synth 9000")).toBe("Piano");
  });

  it("unrecognised name falls back for audiofx", () => {
    expect(iconForCategory("audiofx", "Unknown FX")).toBe("SlidersHorizontal");
  });

  it("empty blockType string uses category icon", () => {
    // Empty string: no keywords match → category fallback
    expect(iconForCategory("modulator", "")).toBe("Waves");
  });
});
