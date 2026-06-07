/**
 * QuickAdd fuzzy-search engine — extracted from QuickAddPopup.tsx (N3).
 *
 * Same scoring SEMANTICS as the original inline scorer (exact-substring →
 * subsequence → acronym → Levenshtein≤1 tiers, signal-alias shortcut,
 * multi-field weighting), but restructured for the ≤16ms/keystroke budget:
 *
 *   1. Fields are sep-normalised ONCE per plugin into a `QuickAddIndexEntry`
 *      (the `buildIndex` pass), so a keystroke never re-runs the normalise
 *      regex over every field of every plugin — the dominant cost in the old
 *      inline scorer (4 fields × N plugins × regex, every keystroke).
 *   2. Levenshtein is capped at 1 edit with an early-exit single-scan
 *      implementation (`levenshtein1`) — no full DP matrix allocation.
 *   3. The signal-type alias for the query is resolved ONCE per keystroke
 *      (`aliasSignalFor`) instead of looping the alias table inside the
 *      per-entry hot loop.
 *
 * Profiled (synthetic 2000-plugin lib, V8): old inline scorer ~12.8ms/keystroke
 * → this indexed scorer ~3.9ms/keystroke (~3.3× faster). See w1-n3-report.md.
 *
 * Kept pure (no React, no store) so it is unit- and perf-testable in isolation
 * and shareable with the sidebar browser (research DECISION §"unify the
 * engine, fork the chrome").
 */

import type { BlockCategory, SignalType } from "../../../data/types";

// ── Source plugin shape (mapped from the store's BrowserPlugin) ───────────────

export interface QuickAddPlugin {
  id: string;
  name: string;
  category: BlockCategory;
  format: string;
  /** Raw C++-scanned category string (e.g. "EQ", "Reverb", "Synth"). */
  rawCategory: string;
  /** Plugin manufacturer name (e.g. "FabFilter", "Valhalla DSP"). */
  manufacturer: string;
  /** Real per-plugin signal output (from juce::PluginDescription). */
  signalOut: SignalType;
  /** Real persisted use-count (PluginUsageTracker), aggregated across aliases. */
  usageCount: number;
  /**
   * GROUP-level favourite (N2 alias-aware): true when ANY format-variant of this
   * plugin family is starred, so a starred AU keeps the family favourited even
   * when its VST3 primary row is the one shown.
   */
  isFavorite: boolean;
  /**
   * GROUP-level best (lowest) Recents rank across the family's aliases, or -1
   * when no variant is recent (N2). Lower = more recent.
   */
  recentRank: number;
}

// ── Indexed entry (fields pre-normalised once) ────────────────────────────────

export interface QuickAddIndexEntry {
  /** The source plugin (carried through for rendering + selection). */
  plugin: QuickAddPlugin;
  /** Sep-normalised name. */
  nameN: string;
  /** Sep-normalised raw category. */
  rawCatN: string;
  /** Sep-normalised manufacturer. */
  mfgN: string;
  /** Sep-normalised block category. */
  catN: string;
}

// ── Separator normaliser ──────────────────────────────────────────────────────
// Collapses hyphens, underscores, dots, and multiple spaces so that
// "Pro-Q 4", "Pro Q 4", "Pro_Q4", "pro.q4" all normalise to "pro q 4".
// Applied to BOTH the query and each field before matching.
export function normaliseSeps(s: string): string {
  return s.toLowerCase().replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Builds the search index: normalises every field of every plugin exactly once.
 * Called from a `useMemo` keyed on the plugin list, so it only re-runs when the
 * scanned plugin set changes — NOT on every keystroke.
 */
export function buildIndex(plugins: QuickAddPlugin[]): QuickAddIndexEntry[] {
  const out: QuickAddIndexEntry[] = new Array(plugins.length);
  for (let i = 0; i < plugins.length; i++) {
    const p = plugins[i]!;
    out[i] = {
      plugin: p,
      nameN: normaliseSeps(p.name),
      rawCatN: normaliseSeps(p.rawCategory),
      mfgN: normaliseSeps(p.manufacturer),
      catN: normaliseSeps(p.category),
    };
  }
  return out;
}

// ── Capped Levenshtein (≤1 edit, early-exit, no DP matrix) ────────────────────
// Returns the edit distance when it is 0 or 1, else 2 (= "more than 1 edit").
// Single-scan: counts mismatches, allowing exactly one insert/delete/substitute.
export function levenshtein1(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return 2; // can't bridge >1 length gap in 1 edit
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return 2;
    if (la > lb) i++; // deletion from a
    else if (lb > la) j++; // insertion into a
    else {
      i++;
      j++;
    } // substitution
  }
  edits += la - i + (lb - j); // trailing tail
  return edits <= 1 ? edits : 2;
}

/**
 * Scores a single PRE-NORMALISED field against an already-normalised query.
 * Returns null when there is no meaningful match. Scoring tiers identical to
 * the original (exact-substring → subsequence → acronym → Levenshtein≤1).
 */
export function fuzzyScoreFieldNorm(fieldN: string, q: string): number | null {
  if (!q || !fieldN) return null;

  // 1. Exact substring match
  const idx = fieldN.indexOf(q);
  if (idx !== -1) return 100 + (idx === 0 ? 40 : 0) - idx;

  // 2. Subsequence — all query chars appear in order
  let qi = 0;
  let consecutive = 0;
  let prevMatch = -1;
  for (let fi = 0; fi < fieldN.length && qi < q.length; fi++) {
    if (fieldN[fi] === q[qi]) {
      consecutive += prevMatch === fi - 1 ? 1 : 0;
      prevMatch = fi;
      qi++;
    }
  }
  if (qi === q.length) return 20 + consecutive * 5 - fieldN.length;

  // 3. Acronym — initials of words match the query
  const words = fieldN.split(" ");
  let initials = "";
  for (const w of words) initials += w[0] ?? "";
  if (initials.includes(q)) return 10;

  // 4. Typo tolerance: capped Levenshtein ≤1 on short queries (2–6 chars)
  if (q.length >= 2 && q.length <= 6) {
    for (const word of words) {
      if (word.length >= q.length - 1 && word.length <= q.length + 2) {
        if (levenshtein1(q, word) <= 1) return 5;
      }
    }
  }

  return null;
}

// ── Signal-type search aliases ────────────────────────────────────────────────
// Typing a signal-domain word (e.g. "audio fx", "cv", "midi") finds blocks by
// their derived signal type.
export const SIGNAL_ALIASES: Record<SignalType, string[]> = {
  audio: ["audio", "audiofx", "audio fx", "audio effect", "instrument", "synth", "sampler"],
  midi: ["midi", "midifx", "midi fx", "midi effect", "arp", "chord", "sequence"],
  value: ["cv", "value", "modulator", "lfo", "envelope", "utility"],
};

/**
 * Resolves which signal type (if any) a raw query matches as an alias keyword.
 * Computed ONCE per keystroke (not inside the per-entry loop). Returns null when
 * the query is not a signal-alias term.
 */
export function aliasSignalFor(rawQuery: string): SignalType | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return null;
  for (const sig of Object.keys(SIGNAL_ALIASES) as SignalType[]) {
    for (const alias of SIGNAL_ALIASES[sig]) {
      if (alias.includes(q) || q.includes(alias)) return sig;
    }
  }
  return null;
}

/**
 * Scores one indexed entry against a normalised query + the pre-resolved alias
 * signal. Mirrors the original multi-field weighting (name 1.0, rawCat 0.8,
 * mfg 0.7, blockCat 0.6) and the signal-alias shortcut (uniform 55).
 *
 * @param entry   the indexed (pre-normalised) plugin
 * @param qNorm   the sep-normalised query
 * @param aliasSig the signal type the RAW query matched as an alias, or null
 */
export function scoreEntry(
  entry: QuickAddIndexEntry,
  qNorm: string,
  aliasSig: SignalType | null,
): number | null {
  if (!qNorm) return 0;

  // Signal-alias shortcut — score entries of that signal type uniformly.
  if (aliasSig !== null && entry.plugin.signalOut === aliasSig) return 55;

  let best: number | null = null;

  const n = fuzzyScoreFieldNorm(entry.nameN, qNorm);
  if (n !== null) best = n * 1.0;

  const rc = fuzzyScoreFieldNorm(entry.rawCatN, qNorm);
  if (rc !== null) {
    const v = rc * 0.8;
    if (best === null || v > best) best = v;
  }

  const mf = fuzzyScoreFieldNorm(entry.mfgN, qNorm);
  if (mf !== null) {
    const v = mf * 0.7;
    if (best === null || v > best) best = v;
  }

  const bc = fuzzyScoreFieldNorm(entry.catN, qNorm);
  if (bc !== null) {
    const v = bc * 0.6;
    if (best === null || v > best) best = v;
  }

  return best;
}
