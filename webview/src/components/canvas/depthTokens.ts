/**
 * Depth-nav tint resolution for the U2 nested-Board chrome.
 *
 * The breadcrumb stack in `useGraphStore` is a `string[]` where index 0 is the
 * root Project and each subsequent entry is one Container/Portal dive deeper.
 * "Depth" is therefore `breadcrumbStack.length - 1` (0 at the root). Every
 * nested-chrome surface — the depth-tinted breadcrumb pills, the
 * `.nested-canvas-frame` border, the left `.depth-ribbon`, and the
 * `.depth-banner` — colours itself by the ACTIVE level's depth token so the
 * whole chrome reads as a single coherent "you are N levels down" signal.
 *
 * The `--depth-0..4` HSL triplets are frozen in `index.css` `:root`
 * (W0-TOKENS §6). This module is the single place that maps a numeric level to
 * its token so the Breadcrumb and the canvas overlay never drift apart. Levels
 * beyond 4 clamp to `--depth-4` (magenta) — diving past five is already an
 * edge case and a fixed deep-tint is honest about "very deep".
 *
 * Colour is never the SOLE depth signal (colour-blind safety, CLAUDE.md): the
 * banner always spells out "Level N" in text and the ribbon carries a Layers
 * glyph, so the tint is reinforcement, not the only carrier.
 */

/** Highest distinct depth token; levels past this clamp to it. */
export const MAX_DEPTH_LEVEL = 4;

/**
 * CSS custom-property reference for a depth level's HSL triplet, e.g.
 * `var(--depth-2)`. Clamps to the deepest token past {@link MAX_DEPTH_LEVEL}.
 */
export function depthVar(level: number): string {
  const clamped = Math.max(0, Math.min(level, MAX_DEPTH_LEVEL));
  return `var(--depth-${clamped})`;
}

/**
 * `hsl()` string for a depth level at the given alpha (0–1), composed off the
 * frozen `--depth-N` triplet — e.g. `hsl(var(--depth-2) / 0.45)`. Use this for
 * any tint/glow/border that needs an alpha (W0-TOKENS §0: alpha-composited
 * colours come from the HSL layer, not Tailwind utilities).
 */
export function depthHsl(level: number, alpha = 1): string {
  return alpha >= 1
    ? `hsl(${depthVar(level)})`
    : `hsl(${depthVar(level)} / ${alpha})`;
}

/**
 * Human-readable colour name per level — used only in tooltips / aria text so
 * the depth signal survives for users who can't perceive the tint.
 */
export const DEPTH_COLOR_NAME = [
  "blue",
  "teal",
  "purple",
  "amber",
  "magenta",
] as const;

/** Colour name for a level, clamped to the deepest token. */
export function depthColorName(level: number): string {
  const clamped = Math.max(0, Math.min(level, MAX_DEPTH_LEVEL));
  return DEPTH_COLOR_NAME[clamped];
}
