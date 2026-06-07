/**
 * autoFitExtent — hysteresis logic for the auto-fit translate extent (Feedback
 * #3a-W2, Gemini G4).
 *
 * As Blocks are added/moved the React Flow `translateExtent` should grow to keep
 * the whole Board reachable — but a NAIVE "extent = bounds + pad, every frame"
 * yanks the viewport on every tiny change (the jerk Gemini + the prior
 * viewport-jump lesson warn against). So expansion is gated by HYSTERESIS: the
 * extent only grows when a block lands within an outer padding *band* (i.e. it's
 * getting close to the current edge), and it then expands with a margin so it
 * doesn't re-trigger on the very next pixel. When nothing is near the edge the
 * extent is held steady (the predicate returns `null`).
 *
 * Pure + framework-free so it unit-tests without mounting React Flow.
 *
 * Tuning (spec): outer band ≈ 100px; the grown extent adds a larger margin so a
 * single expansion clears the band (no oscillation).
 */

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A translate extent in React Flow's `[[minX,minY],[maxX,maxY]]` shape. */
export type Extent = [[number, number], [number, number]];

export interface AutoFitOptions {
  /** Outer band (px) inside the current extent edge that triggers a grow. */
  band?: number;
  /** Margin (px) the grown extent adds beyond the block bounds (> band so one
   *  grow clears the band and we don't oscillate). */
  margin?: number;
}

/** ~100px band (spec); margin generously larger so a grow clears it. */
export const DEFAULT_BAND = 100;
export const DEFAULT_MARGIN = 800;

/**
 * Build the steady-state extent for a set of block bounds — bounds padded by
 * `margin` on every side. This is the extent used at mount / on an explicit fit.
 */
export function extentForBounds(
  bounds: Bounds,
  margin: number = DEFAULT_MARGIN,
): Extent {
  return [
    [bounds.minX - margin, bounds.minY - margin],
    [bounds.maxX + margin, bounds.maxY + margin],
  ];
}

/**
 * Hysteresis predicate: given the CURRENT extent and the latest block bounds,
 * decide whether the extent should expand.
 *
 * Returns `true` when ANY edge of `bounds` has crept within `band` px of (or
 * past) the matching current-extent edge — i.e. a block is close enough to the
 * boundary that the user could be pushed against a wall. Returns `false` when
 * every edge still has more than `band` px of slack, so the extent is held
 * steady (no pan, no churn). This is the single tested predicate the spec asks
 * for.
 */
export function shouldExpandExtent(
  current: Extent,
  bounds: Bounds,
  band: number = DEFAULT_BAND,
): boolean {
  const [[curMinX, curMinY], [curMaxX, curMaxY]] = current;
  // Distance from each block edge to the matching extent wall. A SMALL (or
  // negative) distance means the block is in the band / has crossed the wall.
  const slackLeft = bounds.minX - curMinX; // shrinks as block nears left wall
  const slackTop = bounds.minY - curMinY;
  const slackRight = curMaxX - bounds.maxX; // shrinks as block nears right wall
  const slackBottom = curMaxY - bounds.maxY;
  return (
    slackLeft < band ||
    slackTop < band ||
    slackRight < band ||
    slackBottom < band
  );
}

/**
 * Compute the NEXT extent given the current one and the latest bounds, applying
 * hysteresis. Returns the grown `Extent` when expansion is warranted, or `null`
 * when the current extent already comfortably contains the bounds (caller keeps
 * the existing extent and does NOT pan — the steady state).
 *
 * The grown extent is the UNION of the current extent and the bounds-plus-margin
 * box, so the extent only ever grows (never snaps smaller mid-session, which
 * would itself be a jerk) and always clears the band by `margin - band`.
 */
export function nextAutoFitExtent(
  current: Extent,
  bounds: Bounds,
  opts: AutoFitOptions = {},
): Extent | null {
  const band = opts.band ?? DEFAULT_BAND;
  const margin = opts.margin ?? DEFAULT_MARGIN;
  if (!shouldExpandExtent(current, bounds, band)) return null;

  const grown = extentForBounds(bounds, margin);
  const [[curMinX, curMinY], [curMaxX, curMaxY]] = current;
  // Union with the current extent → monotonic growth (never shrink).
  return [
    [Math.min(curMinX, grown[0][0]), Math.min(curMinY, grown[0][1])],
    [Math.max(curMaxX, grown[1][0]), Math.max(curMaxY, grown[1][1])],
  ];
}
