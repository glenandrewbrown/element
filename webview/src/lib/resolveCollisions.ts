/**
 * resolveCollisions — Task 2.3 "Blocks must NEVER overlap".
 *
 * A PURE, framework-free rectangular collision resolver. Owner feedback #1:
 * Blocks overlap by default. Blocks are RECTANGLES at varying collapse-tier
 * heights, so this separates overlapping axis-aligned bounding boxes (AABBs) —
 * it deliberately does NOT use a circular `forceCollide`, which would mis-handle
 * the wide/short and tall/narrow tiers.
 *
 * Used as the per-drop NUDGE under ELK "Tidy": GraphCanvas runs it ONCE on
 * `onNodeDragStop` (never per-tick) and once when a freshly-added Block appears,
 * then persists the nudged positions through the existing
 * `nativeGraphMoveNodes` / `updateNodePositions` path. ELK Tidy remains the
 * structural layout layer; this is the local "don't leave two Blocks on top of
 * each other" guarantee.
 *
 * Algorithm — bounded iterative separation (the React Flow `collision.js`
 * pattern):
 *   1. For every overlapping pair, compute the overlap depth on each axis
 *      (inflated by `margin` so resolved Blocks keep a gutter).
 *   2. Push the pair apart along the axis of MINIMUM penetration (the cheapest
 *      separation), splitting the push between the two rects — unless one is
 *      `fixed` (e.g. the Block the user just dropped ONTO), in which case the
 *      other absorbs the whole push.
 *   3. Repeat until no pair overlaps or a bounded iteration cap is hit (so a
 *      dense pile-up always terminates).
 *
 * Determinism: pairs are visited in a fixed (id-stable input) order and exactly
 * coincident rects are nudged along a deterministic diagonal, so the same input
 * always yields the same output (required by the unit tests + so a re-resolve of
 * an unchanged Board is a no-op).
 */

export interface CollisionRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolveCollisionsOptions {
  /** Minimum gutter (px) to leave between resolved Blocks. Default 15. */
  margin?: number;
  /**
   * Ids that must NOT move (their position is pinned). Typically the Block the
   * user just dropped ONTO, or already-settled neighbours during a spawn pass —
   * so the freshly-moved/added Block is the one that gets nudged clear.
   */
  fixed?: ReadonlySet<string>;
  /**
   * Iteration cap for the relaxation loop. Bounds the worst case for a dense
   * pile-up; the loop also exits early once nothing overlaps. Default 32.
   */
  maxIterations?: number;
}

/** Resolved position for one input rect (id + nudged x/y). */
export interface ResolvedPosition {
  id: string;
  x: number;
  y: number;
}

/** Plan default gutter between Blocks (px). */
export const DEFAULT_COLLISION_MARGIN = 15;

const DEFAULT_MAX_ITERATIONS = 32;
// A tiny deterministic separation applied to exactly-coincident rects so the
// resolver has a non-zero axis to push along (two rects at the identical point
// have zero overlap-vector). Sub-pixel, along a fixed diagonal.
const COINCIDENT_NUDGE = 0.01;

/**
 * AABB overlap test with a margin gutter. Two rects "overlap" when their
 * bounding boxes — each inflated by `margin/2` on every side — intersect, i.e.
 * they share area OR sit closer than `margin` apart. Touching edges at margin 0
 * do NOT count as overlapping.
 */
export function rectsOverlap(
  a: CollisionRect,
  b: CollisionRect,
  margin = 0,
): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width + margin > b.x &&
    a.y < b.y + b.height + margin &&
    a.y + a.height + margin > b.y
  );
}

/**
 * Separate overlapping rectangles so no two are closer than `margin`.
 *
 * Pure: never mutates the input. Returns one {id,x,y} per input rect, in input
 * order. Non-overlapping inputs are returned with their positions unchanged.
 */
export function resolveCollisions(
  rects: readonly CollisionRect[],
  options: ResolveCollisionsOptions = {},
): ResolvedPosition[] {
  const margin = options.margin ?? DEFAULT_COLLISION_MARGIN;
  const fixed = options.fixed ?? EMPTY_SET;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  // ≤1 rect can never overlap — return untouched (and don't allocate work).
  if (rects.length <= 1) {
    return rects.map((r) => ({ id: r.id, x: r.x, y: r.y }));
  }

  // Mutable working copy of positions (input is never mutated).
  const work = rects.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    fixed: fixed.has(r.id),
  }));

  for (let iter = 0; iter < maxIterations; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < work.length; i++) {
      for (let j = i + 1; j < work.length; j++) {
        const a = work[i];
        const b = work[j];

        // Two fixed rects can't be resolved against each other — skip the pair
        // (honest: we don't move pinned Blocks; their layout is the caller's).
        if (a.fixed && b.fixed) continue;
        if (!rectsOverlap(a, b, margin)) continue;
        anyOverlap = true;

        // Overlap depth on each axis (how far they'd need to part to clear the
        // margin gutter). Both are > 0 here because rectsOverlap passed.
        const overlapX =
          Math.min(a.x + a.width, b.x + b.width) -
          Math.max(a.x, b.x) +
          margin;
        const overlapY =
          Math.min(a.y + a.height, b.y + b.height) -
          Math.max(a.y, b.y) +
          margin;

        // Centre vector decides the push DIRECTION on the separating axis.
        const aCx = a.x + a.width / 2;
        const aCy = a.y + a.height / 2;
        const bCx = b.x + b.width / 2;
        const bCy = b.y + b.height / 2;

        let pushX = 0;
        let pushY = 0;
        if (overlapX < overlapY) {
          // Cheapest separation is horizontal.
          const dir = signOrDefault(aCx - bCx, true);
          pushX = overlapX * dir;
        } else {
          // Cheapest separation is vertical.
          const dir = signOrDefault(aCy - bCy, false);
          pushY = overlapY * dir;
        }

        // Split the push between the two rects (each moves half), unless one is
        // fixed — then the movable one absorbs the whole displacement.
        applyPush(a, b, pushX, pushY);
      }
    }

    if (!anyOverlap) break;
  }

  return work.map((r) => ({ id: r.id, x: r.x, y: r.y }));
}

const EMPTY_SET: ReadonlySet<string> = new Set();

interface WorkRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fixed: boolean;
}

/**
 * Sign of `delta`, but when the two centres coincide on this axis (delta ≈ 0)
 * fall back to a deterministic direction + a sub-pixel nudge so exactly-stacked
 * rects still separate. `horizontal` picks which way the tie breaks (so a
 * coincident pair splits along a stable diagonal, not on top of each other).
 */
function signOrDefault(delta: number, horizontal: boolean): number {
  if (delta > 1e-9) return 1;
  if (delta < -1e-9) return -1;
  // Coincident on this axis: push deterministically (+ for X, − for Y) so two
  // rects dropped at the IDENTICAL point part along a fixed diagonal.
  return horizontal ? 1 : -1;
}

/**
 * Move `a` and `b` apart by (pushX, pushY). `a` takes +half, `b` −half; a fixed
 * rect stays put and the movable partner absorbs the full push. When both are
 * movable and the push is zero on an axis but the rects are coincident there,
 * a tiny deterministic nudge keeps the relaxation making progress.
 */
function applyPush(
  a: WorkRect,
  b: WorkRect,
  pushX: number,
  pushY: number,
): void {
  // Coincident-on-both-axes safety net: ensure a non-zero displacement exists
  // so the pair never stalls perfectly on top of each other.
  if (pushX === 0 && pushY === 0) {
    pushX = COINCIDENT_NUDGE;
  }

  if (a.fixed) {
    // a pinned → b absorbs the FULL push (in the opposite direction to a's
    // half, i.e. away from a).
    b.x -= pushX;
    b.y -= pushY;
  } else if (b.fixed) {
    a.x += pushX;
    a.y += pushY;
  } else {
    a.x += pushX / 2;
    a.y += pushY / 2;
    b.x -= pushX / 2;
    b.y -= pushY / 2;
  }
}
