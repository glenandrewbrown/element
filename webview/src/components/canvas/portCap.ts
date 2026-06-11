/**
 * portCap — pure helpers for capping the number of essential (audio/MIDI) port
 * rows a Block renders per side.
 *
 * Why: some plugins expose a huge fixed I/O (Kontakt = 64 audio outputs; Audio
 * Out = 16) which, rendered one-row-per-port, produces a giant unusable column
 * that blows out the Block's proportions (Glen's Kontakt screenshot, 2026-06-10).
 * We CAP the visible essential rows per direction at {@link PORT_VISIBLE_CAP}
 * and surface an expand/collapse affordance ("+N more").
 *
 * HARD RULES (mirrored in both Block.tsx rendering and estimateBlockHeight):
 *   1. A port that carries a Cable (`connected`) is ALWAYS visible regardless of
 *      the cap — a hidden connected port would orphan its cable edge (React Flow
 *      anchors the edge to the port's Handle, which must stay laid out).
 *   2. Every Handle stays MOUNTED even when its row is visually collapsed — only
 *      the ROW is hidden (height 0 / opacity 0 / pointer-events none). React Flow
 *      keeps resolving the Handle rect so any edge to it still draws; we never
 *      unmount a Handle (that would error / drop the edge).
 *
 * Everything here is a pure function of its inputs (no React) so it is shared by
 * the renderer and the layout/collision height estimator and unit-tested alone.
 */

import type { Port } from "../../data/types";

/**
 * Max essential (audio/MIDI) port rows shown per side before the rest collapse
 * behind the "+N more" expander. Connected ports are exempt (always shown).
 */
export const PORT_VISIBLE_CAP = 8;

/** Per-side split of one direction's essential ports into shown vs collapsed. */
export interface CappedPorts {
  /** Ports rendered as normal visible rows (laid out, opacity 1). */
  shown: Port[];
  /** Ports whose row is collapsed (Handle stays mounted, row is height-0). */
  hidden: Port[];
}

/**
 * Split one side's essential ports into the rows to show vs collapse.
 *
 * When `expanded` is true (user revealed the lane) every port is `shown`.
 * Otherwise the first {@link PORT_VISIBLE_CAP} ports — PLUS any connected port
 * beyond the cap (rule 1) — are shown; the remainder are `hidden` (rule 2: their
 * Handles still mount, just in a collapsed row). Original port order is
 * preserved in `shown` so the cap reads as "the first N (and any wired ones)".
 *
 * @param ports     essential ports for ONE direction (already param-filtered).
 * @param expanded  whether the user has expanded this Block's port lane.
 * @param cap       row cap (defaults to {@link PORT_VISIBLE_CAP}).
 */
export function capPorts(
  ports: Port[],
  expanded: boolean,
  cap: number = PORT_VISIBLE_CAP,
): CappedPorts {
  if (expanded || ports.length <= cap) {
    return { shown: ports, hidden: [] };
  }
  const shown: Port[] = [];
  const hidden: Port[] = [];
  for (let i = 0; i < ports.length; i++) {
    const p = ports[i];
    // Always-visible: within the cap, OR connected (cable must keep its anchor).
    if (i < cap || p.connected) shown.push(p);
    else hidden.push(p);
  }
  return { shown, hidden };
}

/**
 * The number of VISIBLE essential rows for one side given the cap state — i.e.
 * `capPorts(...).shown.length`, but without allocating the arrays. Used by the
 * height estimator so layout/collision agree with the rendered (capped) height.
 */
export function visiblePortRowCount(
  ports: Port[],
  expanded: boolean,
  cap: number = PORT_VISIBLE_CAP,
): number {
  if (expanded || ports.length <= cap) return ports.length;
  let n = 0;
  for (let i = 0; i < ports.length; i++) {
    if (i < cap || ports[i].connected) n++;
  }
  return n;
}

/**
 * Does either side exceed the cap (so a "+N more" expander row is warranted)?
 * False when fully expanded or when neither side has hidden rows.
 */
export function hasCappedPorts(
  inputs: Port[],
  outputs: Port[],
  expanded: boolean,
  cap: number = PORT_VISIBLE_CAP,
): boolean {
  if (expanded) return false;
  return (
    capPorts(inputs, false, cap).hidden.length > 0 ||
    capPorts(outputs, false, cap).hidden.length > 0
  );
}

/** Total collapsed (hidden) essential rows across both sides — the "+N more" N. */
export function hiddenPortCount(
  inputs: Port[],
  outputs: Port[],
  expanded: boolean,
  cap: number = PORT_VISIBLE_CAP,
): number {
  if (expanded) return 0;
  return (
    capPorts(inputs, false, cap).hidden.length +
    capPorts(outputs, false, cap).hidden.length
  );
}
