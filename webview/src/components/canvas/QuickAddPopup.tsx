import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import { NeuInput, EmptyState, Icon } from "../neu";
import type { BlockCategory, SignalType } from "../../data/types";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { nativeGraphAddPlugin } from "../../bridge/nativeGraph";
import { EV_OPEN_PREFERENCES } from "../../events";
import { iconForCategory } from "../neu/iconForCategory";

// ── Category → hue colour ────────────────────────────────────────────────────
// Icon.tsx's `tone` only maps audio/midi/cv/primary/secondary; category hues
// use --cat-* CSS vars. We derive the colour directly from those vars so it
// always stays in sync with the design-system tokens.
const CAT_COLOR: Record<BlockCategory, string> = {
  instrument: "hsl(var(--cat-instrument))",
  audiofx:    "hsl(var(--cat-audiofx))",
  midifx:     "hsl(var(--cat-midifx))",
  modulator:  "hsl(var(--cat-modulator))",
};

// ── Category → glow CSS var (for the hover/active dopamine ring) ─────────────
const CAT_GLOW_VAR: Record<BlockCategory, string> = {
  instrument: "var(--cat-instrument)",
  audiofx:    "var(--cat-audiofx)",
  midifx:     "var(--cat-midifx)",
  modulator:  "var(--cat-modulator)",
};

// ── Signal-type metadata ─────────────────────────────────────────────────────

// ── Signal-type metadata ─────────────────────────────────────────────────────
//
// G3c item 2: port-type filtering + the signal-alias search now key off the
// REAL per-plugin signal output (BrowserPlugin.signalOut, derived in C++ from
// juce::PluginDescription isInstrument/numOutputChannels/category). The old
// category-only CATEGORY_SIGNAL map was removed — a modulator that actually
// outputs audio is no longer mis-filtered to CV.

/** Frozen signal-type accent tokens (HSL) — W0-TOKENS. */
const SIGNAL_HSL: Record<SignalType, string> = {
  audio: "var(--sig-audio)",
  midi:  "var(--sig-midi)",
  value: "var(--sig-value)",
};

/** Header label per signal type — "ADD BLOCK ACCEPTING <LABEL>". */
const SIGNAL_LABEL: Record<SignalType, string> = {
  audio: "AUDIO",
  midi:  "MIDI",
  value: "CV",
};

// ── Signal-type search aliases ────────────────────────────────────────────────
// These terms let users type signal-domain words (e.g. "audio fx", "cv",
// "midi") and find blocks by their derived signal type. Matched against the
// query before the per-field fuzzy scoring runs.
const SIGNAL_ALIASES: Record<SignalType, string[]> = {
  audio: ["audio", "audiofx", "audio fx", "audio effect", "instrument", "synth", "sampler"],
  midi:  ["midi", "midifx", "midi fx", "midi effect", "arp", "chord", "sequence"],
  value: ["cv", "value", "modulator", "lfo", "envelope", "utility"],
};

// ── Separator normaliser ──────────────────────────────────────────────────────
// Collapses hyphens, underscores, dots, and multiple spaces so that
// "Pro-Q 4", "Pro Q 4", "Pro_Q4", "pro.q4" all normalise to "pro q 4".
// Applied to BOTH the query and each field before matching so Glen's natural
// typing ("pro q", "Pro-q", "pro q4") hits "Pro-Q 4".
function normaliseSeps(s: string): string {
  return s.toLowerCase().replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
}

// ── Edit-distance (Levenshtein) ───────────────────────────────────────────────
// Used for short queries (≤6 chars) as a typo-tolerance fallback when no
// substring / subsequence match exists. Capped at 1 edit to avoid false
// positives on longer strings.
function levenshtein(a: string, b: string): number {
  if (a.length > b.length) return levenshtein(b, a);
  const row = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = row[0]!;
    row[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = row[i]!;
      row[i] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, row[i - 1]!, row[i]!);
      prev = tmp;
    }
  }
  return row[a.length]!;
}

// ── Metadata fuzzy search ────────────────────────────────────────────────────

/**
 * Scores a single text field against the query string.
 * Returns null when there is no meaningful match.
 *
 * Scoring tiers (applied to sep-normalised strings):
 *   1. Exact substring       → 100 + prefix bonus  (highest)
 *   2. All-chars ordered     → 20 + consecutive bonus  (subsequence)
 *   3. Acronym match         → 10  (initials)
 *   4. Levenshtein ≤1 edit   → 5   (typo tolerance, short queries only)
 */
function fuzzyScoreField(field: string, query: string): number | null {
  if (!query || !field) return null;

  // Apply separator normalisation to both sides so "Pro-Q 4" and "pro q" align.
  const f = normaliseSeps(field);
  const q = normaliseSeps(query);

  // 1. Exact substring match
  const idx = f.indexOf(q);
  if (idx !== -1) {
    return 100 + (idx === 0 ? 40 : 0) - idx;
  }

  // 2. All query characters appear in order (subsequence match)
  let qi = 0;
  let consecutive = 0;
  let prevMatch = -1;
  for (let fi = 0; fi < f.length && qi < q.length; fi++) {
    if (f[fi] === q[qi]) {
      consecutive += prevMatch === fi - 1 ? 1 : 0;
      prevMatch = fi;
      qi++;
    }
  }
  if (qi === q.length) {
    return 20 + consecutive * 5 - f.length;
  }

  // 3. Acronym match — initials of words match query chars
  const words = f.split(/\s+/);
  const initials = words.map((w) => w[0] ?? "").join("");
  if (initials.includes(q)) return 10;

  // 4. Typo tolerance: Levenshtein ≤1 on short queries against each word
  //    of the field. Only triggers for queries 2–6 chars to avoid false hits.
  if (q.length >= 2 && q.length <= 6) {
    for (const word of words) {
      if (word.length >= q.length - 1 && word.length <= q.length + 2) {
        if (levenshtein(q, word) <= 1) return 5;
      }
    }
  }

  return null;
}

interface PluginEntry {
  id:           string;
  name:         string;
  category:     BlockCategory;
  format:       string;
  /** Raw C++-scanned category string (e.g. "EQ", "Reverb", "Synth"). Displayed in the row. */
  rawCategory:  string;
  /** Plugin manufacturer name (e.g. "FabFilter", "Valhalla DSP"). Used for metadata fuzzy search. */
  manufacturer: string;
  /** Real per-plugin signal output (from juce::PluginDescription). Drives port-type filtering. */
  signalOut:    SignalType;
  /** Real persisted use-count (PluginUsageTracker). Drives most-used ranking. */
  usageCount:   number;
}

/**
 * Scores a PluginEntry against the query across ALL metadata fields:
 *   - name         (weight 1.0  — highest relevance)
 *   - manufacturer (weight 0.7  — "valhalla" finds ValhallaVintageVerb)
 *   - rawCategory  (weight 0.8  — "reverb" finds all reverbs)
 *   - blockCategory  (weight 0.6  — "audiofx" / "audio fx")
 *   - signal aliases (weight 0.5  — "audio", "cv", "midi" match by signal type)
 *
 * Returns null when no field produces any meaningful match.
 */
function fuzzyScoreEntry(entry: PluginEntry, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  // Signal-alias shortcut: if the query matches a signal-type alias keyword,
  // we score entries of that signal type uniformly rather than going through
  // fuzzy logic (so "reverb" → audiofx, "midi" → midifx, "cv" → modulator).
  for (const [sig, aliases] of Object.entries(SIGNAL_ALIASES) as [SignalType, string[]][]) {
    if (aliases.some((alias) => alias.includes(q) || q.includes(alias))) {
      // Real per-plugin signal output (G3c item 2), not a category guess.
      if (entry.signalOut === sig) return 55; // signal-alias match — lower than substring
    }
  }

  const scores: number[] = [];

  const nameScore = fuzzyScoreField(entry.name, q);
  if (nameScore !== null) scores.push(nameScore * 1.0);

  const rawCatScore = fuzzyScoreField(entry.rawCategory, q);
  if (rawCatScore !== null) scores.push(rawCatScore * 0.8);

  const mfgScore = fuzzyScoreField(entry.manufacturer, q);
  if (mfgScore !== null) scores.push(mfgScore * 0.7);

  const blockCatScore = fuzzyScoreField(entry.category, q);
  if (blockCatScore !== null) scores.push(blockCatScore * 0.6);

  if (scores.length === 0) return null;
  return Math.max(...scores);
}

// ── Sub-components ───────────────────────────────────────────────────────────

/**
 * Category icon — uses the iconForCategory helper (V3 bake-off verdict) rather
 * than unicode glyphs so every icon surface stays in sync. Colour is derived
 * from the category CSS var so it matches the rest of the design system.
 */
function CategoryIcon({ category, name }: { category: BlockCategory; name: string }) {
  const iconName = iconForCategory(category, name);
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center"
      style={{ color: CAT_COLOR[category] ?? CAT_COLOR.audiofx }}
      aria-hidden="true"
    >
      <Icon name={iconName} size={11} strokeWidth={1.75} />
    </span>
  );
}

/**
 * Raw category label badge — replaces the format/architecture badge (VST3/AU/CLAP).
 * Shows the plugin's functional category (EQ, Reverb, Compressor…) which is
 * more useful for discovery than the plugin format.
 */
function CategoryLabel({
  category,
  rawCategory,
}: {
  category: BlockCategory;
  rawCategory: string;
}) {
  if (!rawCategory || rawCategory === "Uncategorised" || rawCategory === "MIDI") return null;
  // Colour-coded by block category (Glen) + fixed-width so the badges align
  // into a clean right-hand column instead of ragged truncation. Opaque tint
  // (no transparency) — category hue mixed into the canvas-dark base.
  const color = CAT_COLOR[category] ?? CAT_COLOR.audiofx;
  return (
    <span
      className="shrink-0 text-[8px] px-1 py-0.5 rounded uppercase font-bold leading-none tracking-wider truncate text-center"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 15%, #1E1E22)`,
        maxWidth: 48,
        minWidth: 24,
      }}
      title={rawCategory}
    >
      {rawCategory}
    </span>
  );
}

/** Gold used for a filled favourite star (matches the native panel's accent). */
const FAV_STAR_GOLD = "#E8A838";

/**
 * Far-right favourite-star toggle. Rendered as a focusable `role="button"`
 * span (NOT a nested <button>, which is invalid inside the row's outer
 * <button>). Clicking toggles the plugin's PERSISTENT favourite status WITHOUT
 * inserting a Block — it stops propagation + prevents default so the row's
 * insert-block onClick never fires. Filled/gold when starred, hollow outline
 * otherwise. Occupies its own minimal fixed slot so row alignment stays tidy.
 */
function FavoriteStar({
  isFavorite,
  onToggle,
}: {
  isFavorite: boolean;
  onToggle: () => void;
}) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={isFavorite ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={isFavorite}
      title={isFavorite ? "Remove from favourites" : "Add to favourites"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      className={[
        "shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-sm cursor-pointer",
        "transition-colors duration-100",
        isFavorite
          ? "text-[#E8A838]"
          : "text-text-dim opacity-50 hover:opacity-100 hover:text-text-secondary",
      ].join(" ")}
    >
      <Icon
        name="Star"
        size={12}
        strokeWidth={1.75}
        style={{ fill: isFavorite ? FAV_STAR_GOLD : "none" }}
      />
    </span>
  );
}

interface PluginRowProps {
  plugin:     PluginEntry;
  isActive:   boolean;
  isFavorite: boolean;
  onSelect:   (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onHover:    () => void;
}

function PluginRow({
  plugin,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
  onHover,
}: PluginRowProps) {
  const glowVar = CAT_GLOW_VAR[plugin.category] ?? CAT_GLOW_VAR.audiofx;
  return (
    <button
      type="button"
      onClick={() => onSelect(plugin.id)}
      onMouseEnter={onHover}
      className={[
        "w-full text-left px-2.5 py-1.5 text-[11px] rounded flex items-center gap-2",
        "transition-all duration-100 cursor-pointer",
        "border-b border-white/[0.04] last:border-b-0",
        isActive
          ? "bg-elevated text-text-primary"
          : "text-text-secondary hover:text-text-primary",
      ].join(" ")}
      style={
        isActive
          ? {
              boxShadow: `inset 0 0 0 1px hsl(${glowVar} / 0.22), 0 0 8px hsl(${glowVar} / 0.18)`,
            }
          : undefined
      }
    >
      <CategoryIcon category={plugin.category} name={plugin.name} />
      {/* A7/F6 — the block NAME is the visual anchor: semibold, and it
          truncates LAST (the muted manufacturer gets a much higher flex
          shrink factor, so it gives way first when the row is tight). Both
          stay visible when space allows. */}
      <span className="truncate flex-1 min-w-0 font-semibold">
        {plugin.name}
      </span>
      {plugin.manufacturer && (
        <span className="shrink-[6] min-w-0 max-w-[72px] text-[9px] text-text-dim truncate text-right">
          {plugin.manufacturer}
        </span>
      )}
      <CategoryLabel category={plugin.category} rawCategory={plugin.rawCategory} />
      <FavoriteStar
        isFavorite={isFavorite}
        onToggle={() => onToggleFavorite(plugin.id)}
      />
    </button>
  );
}

/** Shared section header label — "Favorites" / "Recents" / "All". */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-1 pb-0.5 text-[9px] uppercase tracking-widest text-text-dim">
      {children}
    </div>
  );
}

/** Hairline divider between sections. */
function SectionDivider() {
  return <div className="mx-2 my-1 border-t border-white/5" />;
}

/**
 * Overflow affordance — shown as a sticky footer inside the scroll area when
 * the list is taller than the visible window. Shows how many items are not
 * currently in view so the user knows to scroll.
 */
function MoreCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="px-2.5 py-1 text-[9px] text-text-dim text-center tracking-wider border-t border-white/5 sticky bottom-0 bg-panel">
      ··· {count} more
    </div>
  );
}

// ── Props + main component ────────────────────────────────────────────────────

export interface QuickAddPopupProps {
  /** Viewport X (clientX) of the cursor where the popup opens; clamped to keep the popup on-screen. */
  x: number;
  /** Viewport Y (clientY) of the cursor where the popup opens; clamped to keep the popup on-screen. */
  y: number;
  /**
   * Signal type of the port a Cable was dragged off, when opened from a
   * port-drag. When set, the list is filtered to Blocks that accept/pass that
   * signal type and the header reads "ADD BLOCK ACCEPTING `TYPE`". When
   * omitted (right-click on empty canvas), the full plugin list is shown with
   * favourites pinned — the generic QuickAdd.
   *
   * ITEM 1: port-type mode now ALSO shows Favorites + Recents sections, just
   * like generic mode — they are filtered by portType like everything else.
   */
  portType?: SignalType;
  /** Called to dismiss the popup (backdrop click, Escape, or after a Block is inserted). */
  onClose: () => void;
}

/**
 * QuickAddPopup — the fastest path to add a Block to the Board.
 *
 * A small, keyboard-first search popup anchored at the cursor.
 *
 * Browse mode (empty search) — BOTH generic and port-type-aware:
 *   1. Favorites   — starred plugins, port-filtered, preserving store order
 *   2. Recents     — recently-used, port-filtered, excluding favorites
 *   3. Others      — remaining plugins, port-filtered, excluding fav+recent
 *
 * Fuzzy search mode (user has typed):
 *   Full list scored across ALL metadata fields (name, manufacturer, raw
 *   category, blockCategory, signal-type aliases). "valhalla" finds
 *   ValhallaVintageVerb; "reverb" finds all reverb plugins; "Pro q"/"Pro-q"/
 *   "pro q4" all find "Pro-Q 4" via sep-normalisation + Levenshtein fallback.
 *   Results are ranked by fuzzy score THEN by most-used — the REAL persisted
 *   usage frequency (favorite + recency are tie-breakers) — so the user's
 *   common picks float to the top on ties.
 *   Port-type filter still applies.
 *
 *   Category labels (EQ, Reverb, Compressor…) are shown in each result row;
 *   the format/architecture badge (VST3/AU/CLAP) has been removed — the
 *   category is more useful for discovery.
 *
 * Overflow: when results exceed the visible scroll area height an inline
 *   "··· N more" count appears at the bottom of the scroll container.
 *
 * Two modes:
 *  - Generic (no portType)    — right-click empty canvas, full list.
 *  - Port-type-aware (portType) — dragged off a port, filtered + tinted header.
 *    Both modes show Favorites → Recents → Others in browse, and both use
 *    the same fuzzy search in search mode.
 */
export function QuickAddPopup({ x, y, portType, onClose }: QuickAddPopupProps) {
  const [search, setSearch]           = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [overflowCount, setOverflowCount] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  const nativePlugins        = usePluginBrowserStore((s) => s.plugins);
  const favoriteIdentifiers  = usePluginBrowserStore((s) => s.favoriteIdentifiers);
  const recentIdentifiers    = usePluginBrowserStore((s) => s.recentIdentifiers);
  const refreshPlugins       = usePluginBrowserStore((s) => s.refresh);
  const toggleFavorite       = usePluginBrowserStore((s) => s.toggleFavorite);

  useEffect(() => {
    void refreshPlugins();
  }, [refreshPlugins]);

  /** Full plugin list as flat PluginEntry array — includes metadata fields. */
  const plugins = useMemo((): PluginEntry[] => {
    return nativePlugins.map((p) => ({
      id:           p.identifier,
      name:         p.name,
      category:     p.blockCategory,
      format:       p.format,
      rawCategory:  p.category,       // e.g. "EQ", "Reverb", "Synth"
      manufacturer: p.manufacturer,   // e.g. "FabFilter", "Valhalla DSP"
      signalOut:    p.signalOut,      // real per-plugin signal (G3c item 2)
      usageCount:   p.usageCount,     // real persisted use-count (G3c item 3)
    }));
  }, [nativePlugins]);

  /** Quick lookup map: identifier → PluginEntry (for recents ordering). */
  const pluginById = useMemo((): Map<string, PluginEntry> => {
    const m = new Map<string, PluginEntry>();
    for (const p of plugins) m.set(p.id, p);
    return m;
  }, [plugins]);

  /**
   * Most-used weight for a plugin — driven by the REAL persisted use-count
   * (G3c item 3: PluginUsageTracker.useCount, surfaced on BrowserPlugin as
   * `usageCount`). Frequency is now the dominant term; favorite + recency are
   * tie-breakers so a starred-but-never-added plugin still ranks above an
   * unstarred one on an equal fuzzy score:
   *   - usageCount   → ×4 (real frequency, the primary signal)
   *   - favorite     → +60 (user explicitly starred it)
   *   - recent rank  → up to +30 for the most-recent, tapering by index
   */
  const mostUsedWeight = useCallback(
    (id: string): number => {
      let w = (pluginById.get(id)?.usageCount ?? 0) * 4;
      if (favoriteIdentifiers.has(id)) w += 60;
      const recIdx = recentIdentifiers.indexOf(id);
      if (recIdx !== -1) {
        // Decay: position 0 (most recent) → 30, position 9 → ~3
        w += Math.max(30 - recIdx * 3, 0);
      }
      return w;
    },
    [pluginById, favoriteIdentifiers, recentIdentifiers],
  );

  /**
   * Port-type predicate — keeps only Blocks whose REAL signal output matches
   * the dragged port when portType is set (G3c item 2). This is the real
   * per-plugin signalOut, so e.g. a modulator that actually outputs audio now
   * correctly appears under an audio port rather than being forced to CV by a
   * category-only guess.
   */
  const passesPortFilter = useCallback(
    (p: PluginEntry) => {
      if (!portType) return true;
      return p.signalOut === portType;
    },
    [portType],
  );

  /**
   * Display list. Two modes:
   *
   * EMPTY SEARCH (browse mode) — applies to BOTH generic and port-type:
   *   Favorites → Recents → Others (port-filtered throughout).
   *   Port-type-aware mode gets the same Favorites + Recents sections,
   *   just pre-filtered to the compatible signal type.
   *
   * TYPED SEARCH (fuzzy metadata mode):
   *   All plugins scored across name + manufacturer + rawCategory +
   *   blockCategory + signal-type aliases + sep-normalisation + Levenshtein
   *   fallback for short typos. Results ranked by fuzzy score, then by
   *   most-used weight (real usage count, with favorite + recency as
   *   tie-breakers) so common picks surface first.
   *   Port-filter still applies. Section headers collapse to a flat scored list.
   */
  const { favorites, recents, others, fuzzyResults, isSearching } =
    useMemo(() => {
      const isSearching = search.trim().length > 0;

      if (!isSearching) {
        // ── Browse mode: Favorites → Recents → Others ─────────────────────────
        const favSet    = favoriteIdentifiers;
        const recentSet = new Set(recentIdentifiers);

        const favs: PluginEntry[]  = [];
        const recs: PluginEntry[]  = [];
        const rest: PluginEntry[]  = [];

        // Favorites: preserve stable plugin order, filter to starred
        for (const p of plugins) {
          if (!passesPortFilter(p)) continue;
          if (favSet.has(p.id)) favs.push(p);
        }

        // Recents: ordered by recentIdentifiers (most recent first),
        // skip favorites (they already appear above)
        for (const id of recentIdentifiers) {
          const p = pluginById.get(id);
          if (!p || !passesPortFilter(p) || favSet.has(p.id)) continue;
          recs.push(p);
        }

        // Others: everything that is neither a favorite nor recent
        for (const p of plugins) {
          if (!passesPortFilter(p)) continue;
          if (favSet.has(p.id) || recentSet.has(p.id)) continue;
          rest.push(p);
        }

        return {
          favorites:    favs,
          recents:      recs,
          others:       rest,
          fuzzyResults: [] as PluginEntry[],
          isSearching:  false,
        };
      }

      // ── Fuzzy-search mode: score across all metadata fields ───────────────
      const scored: Array<{ plugin: PluginEntry; score: number; usedWeight: number }> = [];
      for (const p of plugins) {
        if (!passesPortFilter(p)) continue;
        const score = fuzzyScoreEntry(p, search);
        if (score !== null) {
          scored.push({ plugin: p, score, usedWeight: mostUsedWeight(p.id) });
        }
      }
      // Primary sort: fuzzy score DESC; secondary: most-used weight DESC
      scored.sort((a, b) =>
        b.score !== a.score ? b.score - a.score : b.usedWeight - a.usedWeight
      );

      return {
        favorites:    [] as PluginEntry[],
        recents:      [] as PluginEntry[],
        others:       [] as PluginEntry[],
        fuzzyResults: scored.map((s) => s.plugin),
        isSearching:  true,
      };
    }, [
      search,
      plugins,
      pluginById,
      favoriteIdentifiers,
      recentIdentifiers,
      passesPortFilter,
      mostUsedWeight,
    ]);

  /** Flat ordered list used for keyboard navigation. */
  const flatList = useMemo(() => {
    if (isSearching) return fuzzyResults;
    return [...favorites, ...recents, ...others];
  }, [isSearching, fuzzyResults, favorites, recents, others]);

  // A4/F4 — type-ahead race fix. Two halves:
  //  1. SYNCHRONOUS autofocus (useLayoutEffect, no rAF): the input owns the
  //     keyboard before the browser paints, so the window where keystrokes
  //     can be lost shrinks to the open-trigger → React-commit gap.
  //  2. Pre-focus keystroke buffer: a capture-phase window keydown listener
  //     catches anything typed while the input does NOT yet have focus
  //     (slow WKWebView focus handoff) and injects it into the search state,
  //     so the first characters of a fast "right-click + type" gesture are
  //     never dropped.
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onCaptureKeyDown = (e: globalThis.KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return; // input owns it
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave shortcuts alone
      if (e.key.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        setSearch((s) => s + e.key);
        inputRef.current?.focus();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        setSearch((s) => s.slice(0, -1));
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onCaptureKeyDown, true);
    return () => window.removeEventListener("keydown", onCaptureKeyDown, true);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // ── Overflow count: count rows below the visible fold ────────────────────
  // Recalculates whenever the flat list length changes.
  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      setOverflowCount(0);
      return;
    }
    function measure() {
      if (!list) return;
      const containerBottom = list.scrollTop + list.clientHeight;
      let hidden = 0;
      // list.children includes section labels + dividers; we only count button rows
      for (const child of Array.from(list.children)) {
        const el = child as HTMLElement;
        if (el.tagName === "BUTTON" && el.offsetTop + el.offsetHeight > containerBottom) {
          hidden++;
        }
      }
      setOverflowCount(hidden);
    }
    measure();
    list.addEventListener("scroll", measure, { passive: true });
    return () => list.removeEventListener("scroll", measure);
  }, [flatList]);

  const handleSelect = useCallback(
    (id: string) => {
      void nativeGraphAddPlugin(id);
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatList[activeIndex]) {
            handleSelect(flatList[activeIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatList, activeIndex, handleSelect, onClose],
  );

  const popupW    = 224;
  const popupMaxH = 320;
  const clampedX  = Math.max(8, Math.min(x, window.innerWidth  - popupW    - 8));
  const clampedY  = Math.max(8, Math.min(y, window.innerHeight - popupMaxH - 8));

  const signalHsl = portType ? SIGNAL_HSL[portType] : null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50"
        style={{ left: clampedX, top: clampedY }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="w-56 bg-panel rounded overflow-hidden"
          style={{
            boxShadow:
              "-4px -4px 8px rgba(255,255,255,0.04), 8px 8px 24px rgba(0,0,0,0.5)",
            outline: "1px solid rgba(139, 145, 156, 0.15)",
          }}
        >
          {/* Port-type-aware header — only when opened from a cable drag. */}
          {portType && signalHsl && (
            <div
              className="flex items-center justify-between px-2.5 pt-2 pb-1.5 border-b border-white/5"
              style={{ borderColor: `hsl(${signalHsl} / 0.18)` }}
            >
              <span className="text-[8.5px] uppercase tracking-[0.16em] text-text-dim leading-none">
                Add block accepting
              </span>
              <span
                className="text-[9px] font-bold tabular px-1.5 py-0.5 rounded uppercase leading-none"
                style={{
                  backgroundColor: `hsl(${signalHsl} / 0.18)`,
                  color:           `hsl(${signalHsl})`,
                  boxShadow:       `0 0 6px hsl(${signalHsl} / 0.35)`,
                }}
              >
                {SIGNAL_LABEL[portType]}
              </span>
            </div>
          )}

          <div className="p-2">
            <NeuInput
              ref={inputRef}
              placeholder="Add block..."
              value={search}
              onChange={setSearch}
            />
          </div>

          <div
            ref={listRef}
            className="max-h-52 overflow-y-auto px-1 pb-1.5"
          >
            {plugins.length === 0 ? (
              <div className="px-2 py-3">
                <EmptyState
                  illustration="no-plugins"
                  size="sm"
                  tone="audio"
                  title="No plugins scanned"
                  description="Open Preferences to scan AU/VST3/CLAP/LV2 plugins."
                  action={
                    <button
                      type="button"
                      className="px-3 py-1 rounded bg-pressed text-[10px] uppercase tracking-widest text-accent-blue hover:bg-elevated transition-colors cursor-pointer"
                      onClick={() => {
                        window.dispatchEvent(new Event(EV_OPEN_PREFERENCES));
                        onClose();
                      }}
                    >
                      Open Preferences
                    </button>
                  }
                />
              </div>
            ) : flatList.length === 0 ? (
              <div className="px-2 py-3 text-[10px] text-text-dim text-center uppercase tracking-widest">
                {portType ? "No compatible blocks" : "No matches"}
              </div>
            ) : null}

            {/* ── BROWSE MODE (no search typed) — generic AND port-type ───── */}
            {/* Both modes now show Favorites → Recents → Others.             */}
            {/* In port-type mode the sections are pre-filtered by portType.  */}
            {!isSearching && (
              <>
                {favorites.length > 0 && (
                  <>
                    <SectionLabel>Favorites</SectionLabel>
                    <div>
                      {favorites.map((plugin, i) => (
                        <PluginRow
                          key={plugin.id}
                          plugin={plugin}
                          isActive={i === activeIndex}
                          isFavorite={favoriteIdentifiers.has(plugin.id)}
                          onSelect={handleSelect}
                          onToggleFavorite={toggleFavorite}
                          onHover={() => setActiveIndex(i)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {recents.length > 0 && (
                  <>
                    {favorites.length > 0 && <SectionDivider />}
                    <SectionLabel>Recents</SectionLabel>
                    <div>
                      {recents.map((plugin, i) => {
                        const flatIndex = favorites.length + i;
                        return (
                          <PluginRow
                            key={plugin.id}
                            plugin={plugin}
                            isActive={flatIndex === activeIndex}
                            isFavorite={favoriteIdentifiers.has(plugin.id)}
                            onSelect={handleSelect}
                            onToggleFavorite={toggleFavorite}
                            onHover={() => setActiveIndex(flatIndex)}
                          />
                        );
                      })}
                    </div>
                  </>
                )}

                {others.length > 0 && (
                  <>
                    {(favorites.length > 0 || recents.length > 0) && (
                      <SectionDivider />
                    )}
                    {(favorites.length > 0 || recents.length > 0) && (
                      <SectionLabel>All</SectionLabel>
                    )}
                    <div>
                      {others.map((plugin, i) => {
                        const flatIndex =
                          favorites.length + recents.length + i;
                        return (
                          <PluginRow
                            key={plugin.id}
                            plugin={plugin}
                            isActive={flatIndex === activeIndex}
                            isFavorite={favoriteIdentifiers.has(plugin.id)}
                            onSelect={handleSelect}
                            onToggleFavorite={toggleFavorite}
                            onHover={() => setActiveIndex(flatIndex)}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── FUZZY SEARCH MODE (user has typed) ─────────────────────── */}
            {isSearching && fuzzyResults.length > 0 && (
              <div>
                {fuzzyResults.map((plugin, i) => (
                  <PluginRow
                    key={plugin.id}
                    plugin={plugin}
                    isActive={i === activeIndex}
                    isFavorite={favoriteIdentifiers.has(plugin.id)}
                    onSelect={handleSelect}
                    onToggleFavorite={toggleFavorite}
                    onHover={() => setActiveIndex(i)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Overflow count — sticky footer inside scroll area ─────────── */}
          <MoreCount count={overflowCount} />
        </div>
      </div>
    </>
  );
}
