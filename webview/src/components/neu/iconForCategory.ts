/**
 * iconForCategory — single source of truth for category + function icons.
 *
 * Every surface that renders a category glyph (Block header, ToolPalette chips,
 * collapsed rail, QuickAdd, Inspector, ContextMenu) imports from here so the
 * mapping never diverges.
 *
 * Design rationale (V3.0 bake-off verdict — icon P0):
 *   instrument  → Piano          keyboard = synth/sampler/audio-in (universal DAW read)
 *   audiofx     → SlidersHorizontal  horizontal fader array = EQ / processing / mixing
 *   midifx      → GitBranch      branching paths = MIDI routing / transform / I/O
 *   modulator   → Waves          undulating sine = LFO / CV / modulation
 *
 * Colour-blind safety: distinct icons carry the semantic load; category hues
 * (Blue/Orange/Teal/Purple) remain for dopamine micro-glow only.
 *
 * All returned names are in the Icon.tsx allowlist — no HelpCircle fallback
 * will ever fire for values returned by this module.
 */

import type { BlockCategory } from "../../data/types";

// ── Category icon map ─────────────────────────────────────────────────────────

/**
 * Icon name for each of the 4 Element categories.
 * Returned values are guaranteed to be in the Icon.tsx ICON_MAP allowlist.
 */
const CATEGORY_ICON_MAP = {
  instrument: "Piano",
  audiofx:    "SlidersHorizontal",
  midifx:     "GitBranch",
  modulator:  "Waves",
} as const satisfies Record<BlockCategory, string>;

/**
 * Returns the canonical Icon name for a given Block category.
 *
 * Usage:
 *   <Icon name={categoryIconName(category)} tone={catTone} size={13} />
 */
export function categoryIconName(category: BlockCategory): string {
  return CATEGORY_ICON_MAP[category] ?? "Waves";
}

// ── Function-specific icon map (keyword → lucide name) ────────────────────────
//
// Maps common plugin name keywords to more specific icons. Falls back to the
// category icon when no keyword matches. All values in the Icon.tsx allowlist.

const FUNCTION_KEYWORDS: Array<{ test: (n: string) => boolean; icon: string }> = [
  // Instruments
  { test: (n) => /piano|keyboard|keys/i.test(n),                        icon: "Piano" },
  { test: (n) => /drum|kick|snare|hat|perc|beat/i.test(n),              icon: "Activity" },
  { test: (n) => /sampl|kontakt|battery/i.test(n),                      icon: "Layers" },
  { test: (n) => /bass|sub/i.test(n),                                    icon: "Waves" },
  { test: (n) => /mic|voice|vocal/i.test(n),                            icon: "AudioWaveform" },

  // Audio FX
  { test: (n) => /eq|equal|parametr/i.test(n),                          icon: "SlidersHorizontal" },
  { test: (n) => /comp|limit|gate|expan|dyn/i.test(n),                  icon: "Activity" },
  { test: (n) => /reverb|verb|plate|hall|room|spring/i.test(n),         icon: "Waves" },
  { test: (n) => /delay|echo|tape|ping/i.test(n),                       icon: "Clock" },
  { test: (n) => /chorus|flange|phaser|trem|vibrat/i.test(n),           icon: "Waves" },
  { test: (n) => /sat|drive|dist|crush|fuzz|overdrive/i.test(n),        icon: "Activity" },
  { test: (n) => /filter|ladder|svf|lowpass|highpass/i.test(n),         icon: "SlidersHorizontal" },
  { test: (n) => /stereo|imager|width|m\/s|ms proc/i.test(n),           icon: "Layers" },
  { test: (n) => /meter|analys|scope|tuner|spectrum/i.test(n),          icon: "Activity" },
  { test: (n) => /gain|volume|trim|level/i.test(n),                     icon: "SlidersHorizontal" },

  // MIDI FX
  { test: (n) => /arp|arpegg/i.test(n),                                 icon: "Music" },
  { test: (n) => /chord|harmoniz/i.test(n),                             icon: "Music" },
  { test: (n) => /rout|split|merge|multi|fan/i.test(n),                 icon: "GitBranch" },
  { test: (n) => /transpose|pitchbend/i.test(n),                        icon: "GitBranch" },
  { test: (n) => /quantiz|groove/i.test(n),                             icon: "Clock" },

  // Modulators / Utilities
  { test: (n) => /lfo|low.freq/i.test(n),                               icon: "Waves" },
  { test: (n) => /env|adsr|envelope/i.test(n),                          icon: "Activity" },
  { test: (n) => /cv|control.volt|sequenc/i.test(n),                    icon: "Waves" },
  { test: (n) => /script|lua|code/i.test(n),                            icon: "Settings" },
  { test: (n) => /osc|network|send|receive/i.test(n),                   icon: "Network" },
];

/**
 * Returns the most specific Icon name for a given block name + category.
 * Falls back to `categoryIconName(category)` when no keyword matches.
 *
 * Signature is stable for other agents to import:
 *
 *   import { iconForCategory } from "@/components/neu/iconForCategory";
 *   const iconName = iconForCategory(category, blockName);
 *   <Icon name={iconName} tone={catTone} size={13} />
 *
 * @param category  The 4-category taxonomy value from BlockData.
 * @param blockType Optional block name / type string for keyword matching.
 */
export function iconForCategory(
  category: BlockCategory,
  blockType?: string,
): string {
  if (blockType) {
    const match = FUNCTION_KEYWORDS.find((entry) => entry.test(blockType));
    if (match) return match.icon;
  }
  return categoryIconName(category);
}

export default iconForCategory;
