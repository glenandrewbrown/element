import { describe, expect, it } from "vitest";
import { inferFunctionGroup, getFunctionMeta } from "../functionGroup";

describe("inferFunctionGroup — instrument category", () => {
  it("returns synth for generic instrument", () => {
    expect(inferFunctionGroup("Surge XT", "instrument")).toBe("synth");
  });

  it("returns drum for names containing 'drum'", () => {
    expect(inferFunctionGroup("Drum Machine", "instrument")).toBe("drum");
  });

  it("returns drum for names containing 'kick'", () => {
    expect(inferFunctionGroup("Kick Factory", "instrument")).toBe("drum");
  });

  it("returns drum for names containing 'snare'", () => {
    expect(inferFunctionGroup("Snare Synth", "instrument")).toBe("drum");
  });

  it("returns drum for names containing 'hat'", () => {
    expect(inferFunctionGroup("Hi-Hat Machine", "instrument")).toBe("drum");
  });

  it("returns drum for names containing 'hihat'", () => {
    expect(inferFunctionGroup("Hihat Sculpt", "instrument")).toBe("drum");
  });

  it("returns sampler for names containing 'sampl'", () => {
    expect(inferFunctionGroup("Sampler Pro", "instrument")).toBe("sampler");
  });

  it("returns sampler for names containing 'kontakt'", () => {
    expect(inferFunctionGroup("Kontakt 7", "instrument")).toBe("sampler");
  });
});

describe("inferFunctionGroup — audiofx category", () => {
  it("returns eq for names containing 'eq'", () => {
    expect(inferFunctionGroup("Graphic EQ 10", "audiofx")).toBe("eq");
  });

  it("returns eq for names containing 'equal'", () => {
    expect(inferFunctionGroup("Equalizer APO", "audiofx")).toBe("eq");
  });

  it("returns filter for names containing 'filter'", () => {
    expect(inferFunctionGroup("Moog Filter", "audiofx")).toBe("filter");
  });

  it("returns filter for names containing 'ladder'", () => {
    expect(inferFunctionGroup("Ladder Filter", "audiofx")).toBe("filter");
  });

  it("returns dynamics for names containing 'comp'", () => {
    expect(inferFunctionGroup("Pro Compressor", "audiofx")).toBe("dynamics");
  });

  it("returns dynamics for names containing 'limit'", () => {
    expect(inferFunctionGroup("Limiter 6", "audiofx")).toBe("dynamics");
  });

  it("returns dynamics for names containing 'gate'", () => {
    expect(inferFunctionGroup("Gate Pro", "audiofx")).toBe("dynamics");
  });

  it("returns dynamics for names containing 'expand'", () => {
    expect(inferFunctionGroup("Expander", "audiofx")).toBe("dynamics");
  });

  it("returns distortion for names containing 'sat'", () => {
    expect(inferFunctionGroup("Saturator", "audiofx")).toBe("distortion");
  });

  it("returns distortion for names containing 'drive'", () => {
    expect(inferFunctionGroup("Overdrive", "audiofx")).toBe("distortion");
  });

  it("returns distortion for names containing 'dist'", () => {
    expect(inferFunctionGroup("Distortion Box", "audiofx")).toBe("distortion");
  });

  it("returns distortion for names containing 'crush'", () => {
    expect(inferFunctionGroup("Bit Crusher", "audiofx")).toBe("distortion");
  });

  it("returns distortion for names containing 'fuzz'", () => {
    expect(inferFunctionGroup("Fuzz Machine", "audiofx")).toBe("distortion");
  });

  it("returns reverb for names containing 'reverb'", () => {
    expect(inferFunctionGroup("Valhalla Reverb", "audiofx")).toBe("reverb");
  });

  it("returns reverb for names containing 'verb'", () => {
    expect(inferFunctionGroup("Supermassive Verb", "audiofx")).toBe("reverb");
  });

  it("returns reverb for names containing 'plate'", () => {
    expect(inferFunctionGroup("Plate 140", "audiofx")).toBe("reverb");
  });

  it("returns reverb for names containing 'hall'", () => {
    expect(inferFunctionGroup("Concert Hall", "audiofx")).toBe("reverb");
  });

  it("returns reverb for names containing 'room'", () => {
    expect(inferFunctionGroup("Room Reverb", "audiofx")).toBe("reverb");
  });

  it("returns delay for names containing 'delay'", () => {
    expect(inferFunctionGroup("Delay Plus", "audiofx")).toBe("delay");
  });

  it("returns delay for names containing 'echo'", () => {
    expect(inferFunctionGroup("Echo Chamber", "audiofx")).toBe("delay");
  });

  it("returns delay for names containing 'tape'", () => {
    expect(inferFunctionGroup("Tape Delay", "audiofx")).toBe("delay");
  });

  it("returns modulation for names containing 'chorus'", () => {
    expect(inferFunctionGroup("Chorus XL", "audiofx")).toBe("modulation");
  });

  it("returns modulation for names containing 'phaser'", () => {
    expect(inferFunctionGroup("Phaser Pro", "audiofx")).toBe("modulation");
  });

  it("returns modulation for names containing 'flange'", () => {
    expect(inferFunctionGroup("Flanger", "audiofx")).toBe("modulation");
  });

  it("returns modulation for names containing 'trem'", () => {
    expect(inferFunctionGroup("Tremolo", "audiofx")).toBe("modulation");
  });

  it("returns imager for names containing 'imager'", () => {
    expect(inferFunctionGroup("Imager Pro", "audiofx")).toBe("imager");
  });

  it("returns imager for names containing 'stereo'", () => {
    expect(inferFunctionGroup("Stereo Widener", "audiofx")).toBe("imager");
  });

  it("returns imager for names containing 'width'", () => {
    expect(inferFunctionGroup("Width Controller", "audiofx")).toBe("imager");
  });

  it("returns imager for names containing 'm/s'", () => {
    expect(inferFunctionGroup("M/S Plugin", "audiofx")).toBe("imager");
  });

  it("returns meter for names containing 'meter'", () => {
    expect(inferFunctionGroup("LUFS Meter", "audiofx")).toBe("meter");
  });

  it("returns meter for names containing 'analy'", () => {
    expect(inferFunctionGroup("Spectrum Analyser", "audiofx")).toBe("meter");
  });

  it("returns meter for names containing 'scope'", () => {
    expect(inferFunctionGroup("Oscilloscope", "audiofx")).toBe("meter");
  });

  it("returns meter for names containing 'tuner'", () => {
    expect(inferFunctionGroup("Chromatic Tuner", "audiofx")).toBe("meter");
  });

  it("falls back to eq for unknown audiofx names", () => {
    expect(inferFunctionGroup("Unknown Plugin XYZ", "audiofx")).toBe("eq");
  });
});

describe("inferFunctionGroup — midifx category", () => {
  it("returns midi-gen for names containing 'arp'", () => {
    expect(inferFunctionGroup("Arpeggiator", "midifx")).toBe("midi-gen");
  });

  it("returns midi-transform for generic MIDI names", () => {
    expect(inferFunctionGroup("Chord Maker", "midifx")).toBe("midi-transform");
  });
});

describe("inferFunctionGroup — modulator category", () => {
  it("returns modulation for names containing 'lfo'", () => {
    expect(inferFunctionGroup("LFO Tool", "modulator")).toBe("modulation");
  });

  it("returns modulation for names containing 'env'", () => {
    expect(inferFunctionGroup("Envelope Follower", "modulator")).toBe("modulation");
  });

  it("returns modulation for names containing 'mod'", () => {
    expect(inferFunctionGroup("Modulation Matrix", "modulator")).toBe("modulation");
  });

  it("returns logic for generic modulator names", () => {
    expect(inferFunctionGroup("Signal Router", "modulator")).toBe("logic");
  });
});

describe("inferFunctionGroup — case insensitive", () => {
  it("matches uppercase EQ", () => {
    expect(inferFunctionGroup("PARAMETRIC EQ", "audiofx")).toBe("eq");
  });

  it("matches uppercase REVERB", () => {
    expect(inferFunctionGroup("SPRING REVERB", "audiofx")).toBe("reverb");
  });

  it("matches mixed-case Kontakt", () => {
    expect(inferFunctionGroup("Native Instruments Kontakt", "instrument")).toBe("sampler");
  });
});

describe("getFunctionMeta", () => {
  it("returns correct meta for eq group", () => {
    const meta = getFunctionMeta("Graphic EQ 10", "audiofx");
    expect(meta.group).toBe("eq");
    expect(meta.label).toBe("Equalizer");
    expect(meta.code).toBe("EQ");
    expect(meta.iconPath).toBeTruthy();
  });

  it("returns correct meta for reverb group", () => {
    const meta = getFunctionMeta("Valhalla Reverb", "audiofx");
    expect(meta.group).toBe("reverb");
    expect(meta.label).toBe("Reverb");
    expect(meta.code).toBe("RV");
  });

  it("returns correct meta for synth group", () => {
    const meta = getFunctionMeta("Surge XT", "instrument");
    expect(meta.group).toBe("synth");
    expect(meta.label).toBe("Synthesizer");
    expect(meta.code).toBe("SYN");
  });

  it("returns correct meta for drum group", () => {
    const meta = getFunctionMeta("Kick Drum Synth", "instrument");
    expect(meta.group).toBe("drum");
    expect(meta.label).toBe("Drum Synth");
    expect(meta.code).toBe("DRM");
  });

  it("includes iconPath for all groups", () => {
    const groups: Array<[string, import("../types").BlockCategory]> = [
      ["Sampler", "instrument"],
      ["Reverb", "audiofx"],
      ["Arpeggiator", "midifx"],
      ["LFO", "modulator"],
    ];
    for (const [name, cat] of groups) {
      const meta = getFunctionMeta(name, cat);
      expect(meta.iconPath.length, `iconPath missing for ${name}`).toBeGreaterThan(0);
    }
  });
});
