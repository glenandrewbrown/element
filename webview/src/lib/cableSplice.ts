/**
 * cableSplice — type-gated logic for splicing a Block INTO an existing cable
 * (Feedback #1b, Glen Q7: "adding blocks into existing wires/chains needs to be
 * seamless").
 *
 * Dropping a compatible Block onto a cable `A → B` splices it into the chain so
 * the signal flows `A → new → B`. This module is the PURE decision layer:
 *   - `canBlockSpliceCable`  — is the Block type-compatible (NOTHING-fake gate)?
 *   - `pickSplicePorts`      — which exact in/out ports does the splice use?
 *   - `planSplice`           — the ordered native ops (disconnect + 2 connects).
 *
 * The compatibility rule is strict (NOTHING-fake — no false drop targets): the
 * Block must have BOTH a free-or-usable INPUT port AND an OUTPUT port of the
 * cable's signal type. An audio cable never highlights for a MIDI-only block; a
 * source-only or sink-only block (e.g. an instrument with no audio in, or an
 * Audio Output with no out) can't splice and must not light up.
 *
 * Framework-free + side-effect-free so it unit-tests without React Flow or the
 * bridge. The caller (GraphCanvas) executes the returned ops via the existing
 * `nativeGraphDisconnect` / `nativeGraphConnect` natives.
 */

import type { CableData, Port, SignalType } from "../data/types";

/** Minimal block shape the splice logic needs (subset of BlockData). */
export interface SpliceBlock {
  id: string;
  ports: Port[];
}

/** A 2D point in flow space. */
export interface Point {
  x: number;
  y: number;
}

/** Default hit radius (flow px) for dropping a block onto a cable. */
export const DEFAULT_SPLICE_HIT_RADIUS = 36;

/**
 * Perpendicular distance from point `p` to the finite segment `a→b`. Returns the
 * distance to the nearest endpoint when the projection falls outside the
 * segment, so a block hovering NEAR a cable but well past either end is not a
 * hit. Pure geometry — unit-testable.
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** One cable's geometry + identity for the drag hit-test. */
export interface CableGeometry {
  id: string;
  source: string;
  target: string;
  signalType: SignalType;
  /** Centre of the source node (flow space). */
  a: Point;
  /** Centre of the target node (flow space). */
  b: Point;
}

/**
 * Given the dragged block, its live centre, and the on-canvas cable geometries,
 * find the SINGLE best splice-target cable id — the type-compatible cable whose
 * segment the block centre is closest to, within `hitRadius`. Returns `null`
 * when no compatible cable is within range (NOTHING-fake: an incompatible or
 * far cable never becomes a target). The block's own incident cables are
 * skipped (you can't splice into a cable you're already on).
 */
export function findSpliceCandidate(
  block: SpliceBlock,
  blockCenter: Point,
  cables: CableGeometry[],
  hitRadius: number = DEFAULT_SPLICE_HIT_RADIUS,
): string | null {
  let bestId: string | null = null;
  let bestDist = hitRadius;
  for (const c of cables) {
    // Skip cables the block already terminates (no self-splice).
    if (c.source === block.id || c.target === block.id) continue;
    if (!canBlockSpliceCable(block, c)) continue;
    const d = distanceToSegment(blockCenter, c.a, c.b);
    if (d <= bestDist) {
      bestDist = d;
      bestId = c.id;
    }
  }
  return bestId;
}

/**
 * The chosen ports for a splice: the new block's input (receives from A) and
 * output (sends to B), both of the cable's signal type.
 */
export interface SplicePorts {
  inPortId: string;
  outPortId: string;
}

/**
 * One native graph mutation, in the shape the existing bridge natives take.
 * `disconnect` → nativeGraphDisconnect(...args); `connect` → nativeGraphConnect.
 */
export type SpliceOp =
  | { kind: "disconnect"; source: string; sourcePort: string; target: string; targetPort: string }
  | { kind: "connect"; source: string; sourcePort: string; target: string; targetPort: string };

/**
 * Pick the input + output ports on `block` that can carry `signalType`. Returns
 * the first matching input and the first matching output, or `null` if the block
 * lacks EITHER (so it can't bridge a cable of this type). The block may not be
 * the cable's own endpoint — caller guards that separately.
 */
export function pickSplicePorts(
  block: SpliceBlock,
  signalType: SignalType,
): SplicePorts | null {
  let inPortId: string | null = null;
  let outPortId: string | null = null;
  for (const p of block.ports) {
    if (p.type !== signalType) continue;
    if (p.direction === "input" && inPortId === null) inPortId = p.id;
    else if (p.direction === "output" && outPortId === null) outPortId = p.id;
  }
  if (inPortId === null || outPortId === null) return null;
  return { inPortId, outPortId };
}

/**
 * True iff `block` can be spliced into `cable` (NOTHING-fake highlight gate).
 * Requires:
 *   - the block is NOT already an endpoint of the cable (splicing A→B with A or
 *     B itself is meaningless), AND
 *   - the block has both an input AND an output port of the cable's signal type.
 */
export function canBlockSpliceCable(
  block: SpliceBlock,
  cable: Pick<CableData, "source" | "target" | "signalType">,
): boolean {
  if (block.id === cable.source || block.id === cable.target) return false;
  return pickSplicePorts(block, cable.signalType) !== null;
}

/**
 * Build the ordered ops that splice `block` into `cable` (`A → B` ⇒ `A → new →
 * B`). Returns `null` when the block is not compatible (caller must not have
 * highlighted it). Order matters: disconnect the original FIRST, then connect
 * the two new segments, so the engine never momentarily sees both the old A→B
 * and the new path fighting over B's input.
 *
 * NOTE on undo (documented, not faked): these are THREE independent native ops.
 * Element's webview bridge has no compound-undo grouping reachable from here
 * (each native pushes its own undo step), so an undo after a splice takes up to
 * 3 steps. This is recorded in the task report; the splice still produces the
 * correct final topology and every step is individually undoable.
 */
export function planSplice(
  block: SpliceBlock,
  cable: Pick<CableData, "source" | "sourcePort" | "target" | "targetPort" | "signalType">,
): SpliceOp[] | null {
  if (block.id === cable.source || block.id === cable.target) return null;
  const ports = pickSplicePorts(block, cable.signalType);
  if (!ports) return null;
  return [
    {
      kind: "disconnect",
      source: cable.source,
      sourcePort: cable.sourcePort,
      target: cable.target,
      targetPort: cable.targetPort,
    },
    {
      kind: "connect",
      source: cable.source,
      sourcePort: cable.sourcePort,
      target: block.id,
      targetPort: ports.inPortId,
    },
    {
      kind: "connect",
      source: block.id,
      sourcePort: ports.outPortId,
      target: cable.target,
      targetPort: cable.targetPort,
    },
  ];
}

/**
 * The flattened argument set for the ATOMIC splice — one native call
 * (`nativeGraphSpliceCable`) instead of `planSplice`'s three. The host posts a
 * single `SpliceConnectionMessage` whose actions (remove A→B, add A→new, add
 * new→B) all land in ONE `GuiService` undo transaction, so a single undo
 * restores the original cable (task #23 — Glen Q7 "seamless"). `planSplice`
 * remains the back-compat fallback for hosts without the splice native.
 *
 * `a*` = the original cable's source side, `b*` = its target side, `new*` = the
 * spliced block's chosen in/out ports (same ports `planSplice` picks).
 */
export interface AtomicSplicePlan {
  aId: string;
  aPort: string;
  newId: string;
  newInPort: string;
  newOutPort: string;
  bId: string;
  bPort: string;
}

/**
 * Build the single-call plan that splices `block` into `cable` atomically.
 * Returns `null` under exactly the same conditions as {@link planSplice} (the
 * block is a cable endpoint, or lacks an in/out port of the cable's type) so
 * the highlight gate and the executed plan never disagree.
 */
export function planSpliceAtomic(
  block: SpliceBlock,
  cable: Pick<
    CableData,
    "source" | "sourcePort" | "target" | "targetPort" | "signalType"
  >,
): AtomicSplicePlan | null {
  if (block.id === cable.source || block.id === cable.target) return null;
  const ports = pickSplicePorts(block, cable.signalType);
  if (!ports) return null;
  return {
    aId: cable.source,
    aPort: cable.sourcePort,
    newId: block.id,
    newInPort: ports.inPortId,
    newOutPort: ports.outPortId,
    bId: cable.target,
    bPort: cable.targetPort,
  };
}
