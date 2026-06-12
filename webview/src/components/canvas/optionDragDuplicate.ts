/**
 * Option-drag duplicate — pure helpers (no React, no bridge, no store).
 *
 * macOS Option-drag semantics: drag with Option held at drag-START →
 * originals stay at their pre-drag positions, duplicates land at
 * (originalPosition + dragDelta).
 *
 * These helpers are extracted as pure functions so they can be unit-tested
 * without React Flow or the native bridge.
 */

/** Per-node original position captured at drag start. */
export interface OriginalPositionMap {
  [id: string]: { x: number; y: number };
}

/**
 * Compute the positions to move the newly-created duplicate nodes to.
 *
 * @param originals  Map of id → pre-drag {x,y} for every node that was dragged.
 * @param delta      The {dx,dy} the user dragged (computed from one node's
 *                   final position minus its original position).
 * @param newIds     The ids of the newly-created duplicate nodes (returned in
 *                   the same order they appear in the engine snapshot).
 * @param draggedIds The ordered list of ids that were duplicated (same order the
 *                   host created the duplicates for).
 * @returns          Moves to feed into nativeGraphMoveNodes so each duplicate
 *                   lands at (original + delta).
 */
export function computeOptionDragPlan(
  originals: OriginalPositionMap,
  delta: { dx: number; dy: number },
  newIds: string[],
  draggedIds: string[],
): Array<{ id: string; x: number; y: number }> {
  const moves: Array<{ id: string; x: number; y: number }> = [];
  for (let i = 0; i < newIds.length; i++) {
    const srcId = draggedIds[i];
    if (!srcId) break;
    const orig = originals[srcId];
    if (!orig) continue;
    moves.push({
      id: newIds[i],
      x: Math.round(orig.x + delta.dx),
      y: Math.round(orig.y + delta.dy),
    });
  }
  return moves;
}

/**
 * Compute the drag delta from the first dragged node's current (post-drag)
 * position vs its original.
 */
export function computeDragDelta(
  originals: OriginalPositionMap,
  draggedIds: string[],
  finalPositions: { [id: string]: { x: number; y: number } },
): { dx: number; dy: number } {
  for (const id of draggedIds) {
    const orig = originals[id];
    const fin = finalPositions[id];
    if (orig && fin) {
      return { dx: fin.x - orig.x, dy: fin.y - orig.y };
    }
  }
  return { dx: 0, dy: 0 };
}
