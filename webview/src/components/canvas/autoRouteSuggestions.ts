/**
 * autoRouteSuggestions — pure suggestion engine for "auto-suggest cable
 * routings between nearby compatible Blocks" (FAST-building directive).
 *
 * This is a port of the legacy JUCE
 * `GraphEditorComponent::updateAutoConnectSuggestions` (src/ui/grapheditorcomponent.cpp
 * ~2270-2452). The behaviour is mirrored 1:1 so the webview canvas feels the
 * same as the native editor:
 *
 *   1. Proximity — while a Block is dragged, find other Blocks whose centre is
 *      within `PROXIMITY_THRESHOLD` px of the dragged Block's centre.
 *   2. Signal-flow direction — the upstream Block is the one further left
 *      (horizontal LTR signal flow, like JUCE's `followsSignalFlow`). Only one
 *      direction is suggested per pair → no bidirectional / feedback dupes.
 *   3. Compatibility — only a free OUTPUT→INPUT port pair of the SAME signal
 *      type (audio/midi/value) is suggested (JUCE: `PortType::canConnect`).
 *   4. Free ports — a port is "free" only if no existing Cable already uses it
 *      (JUCE skips ports that already have a connection; we read freeness from
 *      the authoritative edge list, not the per-port `connected` flag).
 *   5. No duplicate cable — skip if a Cable for that exact source-port→
 *      target-port already exists (JUCE: `Node::connectionExists`).
 *   6. No cycle — build an adjacency list from the existing Cables, add the
 *      proposed edge, DFS from the destination node; if it can reach the
 *      source node the edge would create a feedback loop and is rejected
 *      (JUCE: `wouldCreateCycle`).
 *   7. Dedupe per node-pair — at most ONE suggestion per ordered node pair
 *      (JUCE tracks `suggestedPairs`), so a busy multi-port pair surfaces a
 *      single, unambiguous ghost.
 *
 * The result is a list of {@link RouteSuggestion}s the canvas renders as faded
 * "ghost" cables; the user promotes one to a real Cable with an explicit accept
 * gesture (click the ghost / Tab|Enter / drop). Nothing is ever auto-connected.
 *
 * Everything here is a pure function of its inputs (no React, no store, no
 * bridge) so the matching logic is unit-testable in isolation.
 */

import type { BlockData, CableData, SignalType } from "../../data/types";

/**
 * Proximity radius in flow-space px — the maximum EDGE-to-edge gap between
 * two Block bounding boxes for a suggestion to fire (see blockDistance).
 */
export const PROXIMITY_THRESHOLD = 150;

/**
 * Fallback Block dimensions when a node has not yet been measured by React
 * Flow. Matches the alignment reference constants in useGraphStore so centre
 * math is consistent across the codebase.
 */
export const BLOCK_REF_WIDTH = 200;
export const BLOCK_REF_HEIGHT = 100;

/** A single suggested connection (one faded ghost cable). */
export interface RouteSuggestion {
  /** Stable id for the ghost edge — `ghost:<src>:<srcPort>->:<dst>:<dstPort>`. */
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  signalType: SignalType;
  /** Centre-to-centre distance (px) — lets callers rank the closest pair top. */
  distance: number;
}

/** Minimal geometry a Block needs to participate in proximity matching. */
export interface BlockBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve a Block's bounds from its model position plus an optional measured
 * size map (React Flow's `node.measured`). Falls back to the reference block
 * size when the live dimensions are unavailable (e.g. first frame of a drag).
 */
export function boundsOf(
  block: BlockData,
  measured?: Map<string, { width: number; height: number }>,
): BlockBounds {
  const m = measured?.get(block.id);
  return {
    x: block.position.x,
    y: block.position.y,
    width: m?.width ?? BLOCK_REF_WIDTH,
    height: m?.height ?? BLOCK_REF_HEIGHT,
  };
}

/**
 * Euclidean EDGE-to-edge gap between two Block AABBs (0 when overlapping).
 *
 * Was centre-to-centre — live QA (2026-06-06, T8) proved that made the
 * 150px threshold physically unreachable: Blocks are ~200-260 flow-px wide,
 * so two non-overlapping blocks' centres are ALWAYS further apart than the
 * threshold and ghosts only ever fired when blocks fully overlapped. The
 * gap between bounding-box edges is what "dragged near" actually means.
 */
export function blockDistance(a: BlockBounds, b: BlockBounds): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build the directed adjacency (sourceNode → Set<destNode>) from the current
 * Cables. Used by the cycle check — identical in spirit to the JUCE
 * `adjacency` map built from the Arcs ValueTree.
 */
function buildAdjacency(edges: CableData[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    let set = adj.get(e.source);
    if (!set) {
      set = new Set<string>();
      adj.set(e.source, set);
    }
    set.add(e.target);
  }
  return adj;
}

/**
 * Would adding `src → dst` create a cycle? Mirrors JUCE `wouldCreateCycle`:
 * add the proposed edge to the adjacency, then DFS from `dst`; if it can reach
 * `src` the edge closes a loop (feedback) and must not be suggested.
 *
 * `adjacency` is taken pre-built so the per-pair check stays O(V+E) rather than
 * rebuilding the map for every candidate port pair.
 */
export function wouldCreateCycle(
  adjacency: Map<string, Set<string>>,
  src: string,
  dst: string,
): boolean {
  // A self-edge is trivially a cycle.
  if (src === dst) return true;

  // Walk only the EXISTING edges from dst; reaching src means src→dst closes
  // a loop. (Equivalent to adding src→dst then DFS-ing from dst, since the
  // proposed edge dst→… is never traversed from dst itself.)
  const visited = new Set<string>();
  const stack: string[] = [dst];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === src) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const next = adjacency.get(current);
    if (next) {
      for (const n of next) stack.push(n);
    }
  }
  return false;
}

/** Does a Cable already connect this exact source-port → target-port? */
function connectionExists(
  edges: CableData[],
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
): boolean {
  return edges.some(
    (e) =>
      e.source === source &&
      e.sourcePort === sourcePort &&
      e.target === target &&
      e.targetPort === targetPort,
  );
}

/**
 * Set of port ids (across the whole board) that already carry a Cable on the
 * relevant side. Reading freeness from the edge list — not the per-port
 * `connected` flag — keeps suggestions honest while a drag is mid-flight and
 * the snapshot's `connected` booleans may be stale.
 */
function usedPorts(edges: CableData[]): {
  outputs: Set<string>;
  inputs: Set<string>;
} {
  const outputs = new Set<string>();
  const inputs = new Set<string>();
  for (const e of edges) {
    outputs.add(`${e.source}:${e.sourcePort}`);
    inputs.add(`${e.target}:${e.targetPort}`);
  }
  return { outputs, inputs };
}

/**
 * Find the single best free OUTPUT→INPUT port pair between an upstream and a
 * downstream Block of the SAME signal type that is not already connected.
 * Mirrors the inner double loop of the JUCE impl, but returns just one pair
 * (the dedupe-per-node-pair rule) — the first compatible free pair in port
 * order, which is the natural primary I/O.
 */
function firstFreePortPair(
  upstream: BlockData,
  downstream: BlockData,
  used: { outputs: Set<string>; inputs: Set<string> },
  edges: CableData[],
): { sourcePort: string; targetPort: string; signalType: SignalType } | null {
  for (const out of upstream.ports) {
    if (out.direction !== "output") continue;
    if (used.outputs.has(`${upstream.id}:${out.id}`)) continue; // not free

    for (const inp of downstream.ports) {
      if (inp.direction !== "input") continue;
      if (inp.type !== out.type) continue; // compatibility: same signal type
      if (used.inputs.has(`${downstream.id}:${inp.id}`)) continue; // not free

      // No duplicate of an existing exact cable.
      if (connectionExists(edges, upstream.id, out.id, downstream.id, inp.id))
        continue;

      return {
        sourcePort: out.id,
        targetPort: inp.id,
        signalType: out.type,
      };
    }
  }
  return null;
}

/**
 * Compute auto-route ghost suggestions for the Block currently being dragged.
 *
 * @param draggedId  id of the Block being moved.
 * @param blocks     all Blocks on the current Board (`useGraphStore.nodes`).
 * @param edges      all Cables on the current Board (`useGraphStore.edges`).
 * @param measured   optional measured node sizes (React Flow `node.measured`).
 * @returns          de-duplicated, acyclic, compatible suggestions, closest
 *                   pair first.
 */
export function computeRouteSuggestions(
  draggedId: string,
  blocks: BlockData[],
  edges: CableData[],
  measured?: Map<string, { width: number; height: number }>,
): RouteSuggestion[] {
  const dragged = blocks.find((b) => b.id === draggedId);
  if (!dragged) return [];

  const draggedBounds = boundsOf(dragged, measured);
  const adjacency = buildAdjacency(edges);
  const used = usedPorts(edges);

  // One suggestion per ordered node pair (JUCE `suggestedPairs`).
  const seenPairs = new Set<string>();
  const out: RouteSuggestion[] = [];

  for (const other of blocks) {
    if (other.id === draggedId) continue;

    const otherBounds = boundsOf(other, measured);
    const distance = blockDistance(draggedBounds, otherBounds);
    if (distance > PROXIMITY_THRESHOLD) continue;

    // Signal flows left → right: the upstream (source) Block is the one whose
    // centre is further left. Equal-X pairs are skipped (ambiguous direction,
    // mirrors JUCE's strict `<` comparison which yields no suggestion on a tie).
    const draggedCx = draggedBounds.x + draggedBounds.width / 2;
    const otherCx = otherBounds.x + otherBounds.width / 2;
    if (draggedCx === otherCx) continue;

    const draggedIsUpstream = draggedCx < otherCx;
    const upstream = draggedIsUpstream ? dragged : other;
    const downstream = draggedIsUpstream ? other : dragged;

    const pairKey = `${upstream.id}->${downstream.id}`;
    if (seenPairs.has(pairKey)) continue;

    const pair = firstFreePortPair(upstream, downstream, used, edges);
    if (!pair) continue;

    // Reject anything that would close a feedback loop.
    if (wouldCreateCycle(adjacency, upstream.id, downstream.id)) continue;

    seenPairs.add(pairKey);
    out.push({
      id: `ghost:${upstream.id}:${pair.sourcePort}->${downstream.id}:${pair.targetPort}`,
      source: upstream.id,
      sourcePort: pair.sourcePort,
      target: downstream.id,
      targetPort: pair.targetPort,
      signalType: pair.signalType,
      distance,
    });
  }

  // Closest pair first so Tab/Enter accepts the most-likely-intended cable.
  out.sort((a, b) => a.distance - b.distance);
  return out;
}
