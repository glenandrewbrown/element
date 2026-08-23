/**
 * QuickAdd search PERF regression guard (N3 AC: ≤16ms/keystroke).
 *
 * Profiles the indexed scorer (buildIndex once + scoreEntry over the full list
 * per keystroke + sort) against a synthetic library at realistic sizes, and
 * asserts the per-keystroke cost stays well under the 16ms frame budget. The
 * BEFORE/AFTER numbers from the one-off harness are recorded in w1-n3-report.md;
 * this test pins the AFTER behaviour so a future regression (e.g. re-introducing
 * the per-keystroke normalise) fails CI.
 *
 * Numbers are machine-relative — the assertion uses a generous ceiling (well
 * above the measured ~4ms@2000 on a fast Mac, with headroom for slow CI) so it
 * guards the ALGORITHM (indexing/capped-Levenshtein), not raw wall time. The
 * scorer is the ONLY per-keystroke CPU cost outside React's render (the row
 * mount cost is capped separately by VirtualResultList windowing).
 */

import { describe, it, expect } from "vitest";
import {
  buildIndex,
  scoreEntry,
  aliasSignalFor,
  normaliseSeps,
  type QuickAddPlugin,
} from "../fuzzyScore";
import type { BlockCategory, SignalType } from "../../../../data/types";

const VENDORS = [
  "FabFilter", "Valhalla DSP", "Xfer Records", "Native Instruments",
  "iZotope", "Soundtoys", "Waves", "u-he", "Arturia", "Spectrasonics",
];
const CATS = [
  "EQ", "Reverb", "Compressor", "Delay", "Synth", "Sampler",
  "Arpeggiator", "Modulator", "Limiter", "Saturation",
];
const BLOCKCATS: BlockCategory[] = ["instrument", "audiofx", "midifx", "modulator"];
const SIGS: SignalType[] = ["audio", "midi", "value"];
const WORDS = [
  "Pro", "Vintage", "Verb", "Bus", "Master", "Channel", "Tape", "Analog",
  "Studio", "Mono", "Stereo", "Deluxe", "Mini", "Max", "XL", "Ultra",
];

function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function makeLib(n: number): QuickAddPlugin[] {
  const r = rng(42);
  const lib: QuickAddPlugin[] = [];
  for (let i = 0; i < n; i++) {
    const w1 = WORDS[Math.floor(r() * WORDS.length)]!;
    const w2 = WORDS[Math.floor(r() * WORDS.length)]!;
    lib.push({
      id: "com.vendor.p" + i,
      name: `${w1}-${w2} ${i % 9}`,
      category: BLOCKCATS[Math.floor(r() * BLOCKCATS.length)]!,
      format: "VST3",
      rawCategory: CATS[Math.floor(r() * CATS.length)]!,
      manufacturer: VENDORS[Math.floor(r() * VENDORS.length)]!,
      signalOut: SIGS[Math.floor(r() * SIGS.length)]!,
      usageCount: Math.floor(r() * 30),
      isFavorite: false,
      recentRank: -1,
    });
  }
  return lib;
}

/** One keystroke = score the full indexed list + sort (the per-keystroke cost). */
function keystrokeMs(index: ReturnType<typeof buildIndex>, raw: string): number {
  const N = 20;
  let total = 0;
  for (let run = 0; run < N; run++) {
    const t0 = performance.now();
    const qNorm = normaliseSeps(raw);
    const aliasSig = aliasSignalFor(raw);
    const scored: Array<{ i: number; s: number; w: number }> = [];
    for (let k = 0; k < index.length; k++) {
      const s = scoreEntry(index[k]!, qNorm, aliasSig);
      if (s !== null) scored.push({ i: k, s, w: index[k]!.plugin.usageCount * 4 });
    }
    scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : b.w - a.w));
    total += performance.now() - t0;
  }
  return total / N;
}

describe("QuickAdd scorer perf (≤16ms/keystroke budget)", () => {
  // Representative keystroke sequence: incremental typing + a signal-alias term
  // + a vendor term + a category term (each re-scores the whole list).
  const SEQ = ["p", "pr", "pro", "prov", "provi", "provin", "audio", "fabfilter", "reverb"];

  // Generous ceiling — guards the algorithm, not raw wall-clock. The indexed
  // scorer measures ~1.6ms@1000 / ~4ms@2000 on a fast Mac; 16ms is the real
  // budget. The absolute ceiling is GENEROUS (the indexed scorer measures
  // ~1.2ms@1000 / ~2.7ms@2000 on a fast Mac) so it never flakes under heavy
  // parallel CI contention; the RELATIVE test below is the tight algorithmic
  // guard (immune to absolute machine speed).
  it("stays well under the 16ms frame budget at 1000 plugins", () => {
    const index = buildIndex(makeLib(1000));
    for (let i = 0; i < 30; i++) keystrokeMs(index, "pro");
    const worst = Math.max(...SEQ.map((q) => keystrokeMs(index, q)));
    // 16ms is the real per-keystroke frame budget; measured ~1.2ms.
    expect(worst).toBeLessThan(16);
  });

  it("buildIndex is paid once (not per keystroke) — index reused across the sequence", () => {
    // Build the index ONCE; every keystroke reuses it. This is the structural
    // guarantee that the normalise regex never runs per keystroke. We assert the
    // index entry count matches the library and the normalised fields are present.
    const lib = makeLib(500);
    const index = buildIndex(lib);
    expect(index.length).toBe(lib.length);
    expect(index[0]!.nameN).toBe(normaliseSeps(lib[0]!.name));
    expect(index[0]!.mfgN).toBe(normaliseSeps(lib[0]!.manufacturer));
  });

  it(
    "indexed scorer is materially faster than re-normalising per keystroke (relative guard)",
    () => {
    // RELATIVE guard — immune to absolute machine speed and CI parallel
    // contention. Compares, in the SAME run, the shipped indexed scorer against
    // a deliberately un-indexed variant that re-runs the normalise regex over
    // every field per keystroke (the OLD cost structure). A regression that
    // reintroduces per-keystroke normalisation collapses this ratio and fails.
    const plugins = makeLib(2000);
    const index = buildIndex(plugins);

    // Un-indexed reference: normalise all 4 fields of every plugin per keystroke.
    const unindexedKeystrokeMs = (raw: string): number => {
      const N = 10;
      let total = 0;
      for (let run = 0; run < N; run++) {
        const t0 = performance.now();
        const qNorm = normaliseSeps(raw);
        const aliasSig = aliasSignalFor(raw);
        const scored: Array<{ s: number }> = [];
        for (const p of plugins) {
          // Re-normalise here (the old per-keystroke cost) before scoring.
          const e = {
            plugin: p,
            nameN: normaliseSeps(p.name),
            rawCatN: normaliseSeps(p.rawCategory),
            mfgN: normaliseSeps(p.manufacturer),
            catN: normaliseSeps(p.category),
          };
          const s = scoreEntry(e, qNorm, aliasSig);
          if (s !== null) scored.push({ s });
        }
        total += performance.now() - t0;
      }
      return total / N;
    };

    // Warm up both paths.
    for (let i = 0; i < 20; i++) {
      keystrokeMs(index, "pro");
      unindexedKeystrokeMs("pro");
    }
    const indexed = Math.max(...SEQ.map((q) => keystrokeMs(index, q)));
    const unindexed = Math.max(...SEQ.map((q) => unindexedKeystrokeMs(q)));

    // Indexed must be clearly faster (≥1.5×). Measured ratio is ~3–5×; 1.5× is a
    // wide margin so the test is stable, while still failing on a regression
    // that puts the normalise back in the hot loop.
    expect(indexed).toBeLessThan(unindexed / 1.5);
    // Generous absolute catastrophe catch (NOT the budget — that's the 1000 test).
    expect(indexed).toBeLessThan(48);
  }, 15000);
});
