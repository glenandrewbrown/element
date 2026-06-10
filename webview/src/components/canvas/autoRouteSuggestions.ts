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

import type { BlockData, CableData, Port, SignalType } from "../../data/types";
import {
  resolveCollisions,
  rectsOverlap,
  DEFAULT_COLLISION_MARGIN,
  type CollisionRect,
} from "../../lib/resolveCollisions";

/**
 * Proximity radius in flow-space px — the maximum EDGE-to-edge gap between
 * two Block bounding boxes for a suggestion to fire (see blockDistance).
 */
export const PROXIMITY_THRESHOLD = 150;

/**
 * Squared proximity threshold — compared against the squared edge-gap BEFORE
 * any `Math.sqrt`, so the proximity loop short-circuits far blocks without a
 * sqrt per pair (architect-perf-plan §2.1c). `blockDistance` is only computed
 * for the survivors that need the real distance for ranking.
 */
const PROXIMITY_THRESHOLD_SQ = PROXIMITY_THRESHOLD * PROXIMITY_THRESHOLD;

/**
 * Above this Block count the whole drag-suggestion compute is skipped
 * (architect-perf-plan §2.1e). The matcher is O(N²·…) and on a huge Board the
 * per-tick cost would dominate a drag; the ghost-hint affordance is a nicety,
 * not load-bearing, so it degrades gracefully to "off" on very large boards.
 */
export const SUGGEST_MAX_BLOCKS = 60;

/**
 * Fallback Block dimensions when a node has not yet been measured by React
 * Flow. Matches the alignment reference constants in useGraphStore so centre
 * math is consistent across the codebase.
 */
export const BLOCK_REF_WIDTH = 200;
export const BLOCK_REF_HEIGHT = 100;

// ── Block height estimator (port-count based) ────────────────────────────────
// A Block's rendered height scales with its port count, so a fixed fallback
// (BLOCK_REF_HEIGHT = 100) under-spaces a tall multi-port IO block by >150px —
// the root cause of the overlapping-block layout (default-board IO blocks have
// up to 16 audio lanes → ~300px tall). This estimator mirrors the EXACT render
// arithmetic in Block.tsx so the layout/collision estimate and the real measured
// height agree, letting de-overlap know the true height BEFORE React Flow
// measures. Constants below are the literal values used by Block.tsx.

/** One port row in the port lane (Block.tsx PORT_LANE_H). */
const PORT_LANE_H = 16;
/** Port-lane div padding added once below the rows (Block.tsx:1882 `+ 6`). */
const PORT_LANE_PAD = 6;
/** Block header band (title + chrome) — single title row ≈ 28px. */
const HEADER_H = 28;
/** Activity well (title/macro single bar) above the port lane ≈ 12px. */
const ACTIVITY_H = 12;
/** Load bar — thin status rail at the chassis foot (Block.tsx:1953 `height: 2`). */
const LOADBAR_H = 2;

/**
 * Essential (audio/MIDI) port count on one side. Mirrors Block.tsx's
 * `isParamPort = p.type === "value"` — essential ports are the non-`value`
 * (audio + MIDI) I/O that always render at every tier; the orange `value`
 * (param/CV) ports collapse behind the "▸ N params" toggle and only add height
 * at the EXPANDED tier (the default fresh-load tier is `macro`, where they are
 * hidden). Excludes hidden params, matching the render's `hiddenParams` filter.
 */
function essentialPortCount(ports: Port[], direction: "input" | "output"): number {
  let n = 0;
  for (const p of ports) {
    if (p.direction !== direction) continue;
    if (p.type === "value") continue; // param/CV port — hidden at macro tier
    n++;
  }
  return n;
}

/**
 * Estimate a Block's rendered height (flow-px) from its port counts, mirroring
 * Block.tsx so an un-measured Block still gets a realistic AABB. Computed for
 * the DEFAULT (`macro`) tier — header + activity + essential-port lane + load
 * bar — which is the tier a freshly-loaded Block renders at (`collapseTier`
 * absent ⇒ macro, where the param-port wall is collapsed). A loading node shows
 * no port lane, so it falls back to the minimum 1-row height (honest: it has no
 * connectable ports yet). NOTHING-fake: uses the real port array off the block.
 */
export function estimateBlockHeight(block: BlockData): number {
  const ports = block.ports ?? [];
  const essentialRows =
    block.loadState === "loading"
      ? 0
      : Math.max(
          essentialPortCount(ports, "input"),
          essentialPortCount(ports, "output"),
        );
  // Block.tsx:1882 — lane height = max(shownRows, 1) * PORT_LANE_H + 6. At the
  // macro tier shownRows === essentialRows (param lane + toggle hidden).
  const laneH = Math.max(essentialRows, 1) * PORT_LANE_H + PORT_LANE_PAD;
  return HEADER_H + ACTIVITY_H + laneH + LOADBAR_H;
}

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
  return Math.sqrt(blockDistanceSq(a, b));
}

/**
 * SQUARED edge-to-edge gap — the sqrt-free core of {@link blockDistance}. The
 * proximity loop compares this against `PROXIMITY_THRESHOLD_SQ` first and only
 * pays the `Math.sqrt` (via blockDistance) for the survivors it must rank
 * (architect-perf-plan §2.1c). Monotonic in the real distance, so the
 * pre-filter is exactly equivalent to the old `distance > THRESHOLD` test.
 */
export function blockDistanceSq(a: BlockBounds, b: BlockBounds): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return dx * dx + dy * dy;
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
 * Per-drag derived state that is a pure function of the `edges` array and never
 * changes mid-drag (a drag moves Blocks, not topology). Built once per drag and
 * reused on every throttled tick via {@link computeRouteSuggestions}'s `cache`
 * arg, so the adjacency map + used-port Sets are NOT rebuilt ~10×/s
 * (architect-perf-plan §2.1b). Keyed by the `edges` array identity: if the
 * caller passes a different array (topology changed) the matcher rebuilds.
 */
export interface RouteSuggestionCache {
  /** The `edges` array this cache was built from (identity key). */
  edges: CableData[];
  adjacency: Map<string, Set<string>>;
  used: { outputs: Set<string>; inputs: Set<string> };
}

/**
 * Build (or reuse) the per-drag {@link RouteSuggestionCache} for `edges`. When
 * `cache` was built from the SAME `edges` array it is returned untouched (the
 * memoised hot path); otherwise the adjacency + used-port Sets are rebuilt and
 * a fresh cache is returned. Callers stash the returned cache in a ref keyed by
 * the edges identity and hand it back each tick.
 */
export function buildRouteSuggestionCache(
  edges: CableData[],
  cache?: RouteSuggestionCache | null,
): RouteSuggestionCache {
  if (cache && cache.edges === edges) return cache;
  return { edges, adjacency: buildAdjacency(edges), used: usedPorts(edges) };
}

// Module-level scratch for the per-call dedupe set. Reused (cleared, not
// re-allocated) on every call because computeRouteSuggestions runs ~10Hz during
// a drag (architect-perf-plan §2.1d). The Set is transient — it holds only the
// ordered node-pair keys seen during one synchronous compute and is cleared on
// entry, so reuse is safe (the function is never re-entrant).
const scratchSeenPairs = new Set<string>();

/**
 * Compute auto-route ghost suggestions for the Block currently being dragged.
 *
 * @param draggedId  id of the Block being moved.
 * @param blocks     all Blocks on the current Board (`useGraphStore.nodes`).
 * @param edges      all Cables on the current Board (`useGraphStore.edges`).
 * @param measured   optional measured node sizes (React Flow `node.measured`).
 * @param cache      optional per-drag {@link RouteSuggestionCache} (adjacency +
 *                   used ports) reused across throttled ticks; rebuilt when the
 *                   `edges` identity differs. Omit to derive it per call.
 * @returns          de-duplicated, acyclic, compatible suggestions, closest
 *                   pair first. Always a FRESH array (it becomes React state —
 *                   reusing it would defeat the consumer's reference check).
 */
export function computeRouteSuggestions(
  draggedId: string,
  blocks: BlockData[],
  edges: CableData[],
  measured?: Map<string, { width: number; height: number }>,
  cache?: RouteSuggestionCache | null,
): RouteSuggestion[] {
  // Big-board cap (§2.1e): the O(N²·…) matcher is skipped wholesale on very
  // large Boards — the ghost hint is a nicety, never load-bearing.
  if (blocks.length > SUGGEST_MAX_BLOCKS) return [];

  const dragged = blocks.find((b) => b.id === draggedId);
  if (!dragged) return [];

  const draggedBounds = boundsOf(dragged, measured);
  // Reuse the per-drag adjacency + used-port Sets when the topology (edges
  // identity) is unchanged (§2.1b) — they are pure functions of `edges`.
  const { adjacency, used } = buildRouteSuggestionCache(edges, cache);

  // One suggestion per ordered node pair (JUCE `suggestedPairs`). Reused
  // module scratch, cleared per call (§2.1d).
  scratchSeenPairs.clear();
  const out: RouteSuggestion[] = [];

  for (const other of blocks) {
    if (other.id === draggedId) continue;

    const otherBounds = boundsOf(other, measured);
    // Squared pre-filter BEFORE any sqrt (§2.1c): reject far blocks without a
    // sqrt. Only survivors pay `blockDistance` for the ranking distance.
    const distanceSq = blockDistanceSq(draggedBounds, otherBounds);
    if (distanceSq > PROXIMITY_THRESHOLD_SQ) continue;

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
    if (scratchSeenPairs.has(pairKey)) continue;

    const pair = firstFreePortPair(upstream, downstream, used, edges);
    if (!pair) continue;

    // Reject anything that would close a feedback loop.
    if (wouldCreateCycle(adjacency, upstream.id, downstream.id)) continue;

    scratchSeenPairs.add(pairKey);
    out.push({
      id: `ghost:${upstream.id}:${pair.sourcePort}->${downstream.id}:${pair.targetPort}`,
      source: upstream.id,
      sourcePort: pair.sourcePort,
      target: downstream.id,
      targetPort: pair.targetPort,
      signalType: pair.signalType,
      distance: Math.sqrt(distanceSq),
    });
  }

  // Closest pair first so Tab/Enter accepts the most-likely-intended cable.
  out.sort((a, b) => a.distance - b.distance);
  return out;
}

// ── T10: responsive push-on-hover (preview a placement before the add) ──────

/** A neighbour's transient preview move while a ghost placement is hovering. */
export interface GhostNeighbourMove {
  id: string;
  x: number;
  y: number;
}

/**
 * Result of a ghost-placement resolve: the neighbour moves to PREVIEW (not yet
 * persisted) plus whether the ghost rect overlapped anything at all. The ghost
 * itself never moves — it is pinned at the hover position; only neighbours part.
 */
export interface GhostResolveResult {
  /** Neighbour ids + their previewed positions (only ids that actually moved). */
  moves: GhostNeighbourMove[];
  /** True when the ghost overlapped ≥1 neighbour (so a preview was produced). */
  overlapped: boolean;
}

/**
 * Compute the transient neighbour moves to PREVIEW when a new Block is about to
 * be placed at `ghost`. Pure + framework-free: pins the ghost rect, runs the
 * shared AABB resolver, and returns only the neighbours whose position changed.
 *
 * The caller (GraphCanvas) applies these to React Flow transiently (NOT through
 * `nativeGraphMoveNodes`) while the QuickAdd / drag-preview hovers, restores the
 * originals on cancel, and commits them via `nativeGraphMoveNodes` ONLY when the
 * add actually happens. The ghost id is excluded from the returned moves so the
 * caller never tries to move a node that does not exist yet.
 *
 * @param ghost  The about-to-be-placed Block's AABB at the hover position.
 * @param neighbours  The current Block AABBs (the ghost id, if present, is
 *   ignored — neighbours only).
 * @param margin  Gutter to keep between the ghost and its neighbours.
 */
export function resolveGhostNeighbours(
  ghost: CollisionRect,
  neighbours: readonly CollisionRect[],
  margin: number = DEFAULT_COLLISION_MARGIN,
): GhostResolveResult {
  // Exclude any rect sharing the ghost's id (defensive — the ghost is not a
  // real neighbour) and keep a stable, id-keyed map of the originals.
  const others = neighbours.filter((n) => n.id !== ghost.id);
  if (others.length === 0) return { moves: [], overlapped: false };

  // Cheap early-out: if the ghost clears every neighbour by the margin already,
  // there is nothing to preview (no churn while the cursor is in open space).
  const overlapped = others.some((n) => rectsOverlap(ghost, n, margin));
  if (!overlapped) return { moves: [], overlapped: false };

  // Pin the ghost so ONLY neighbours move; resolve the whole set together so a
  // pushed neighbour that now collides with a further one cascades correctly.
  const rects: CollisionRect[] = [ghost, ...others];
  const resolved = resolveCollisions(rects, {
    margin,
    fixed: new Set([ghost.id]),
  });

  const origById = new Map(others.map((n) => [n.id, n]));
  const moves: GhostNeighbourMove[] = [];
  for (const r of resolved) {
    if (r.id === ghost.id) continue; // never move the ghost.
    const o = origById.get(r.id);
    if (!o) continue;
    const nx = Math.round(r.x);
    const ny = Math.round(r.y);
    if (o.x !== nx || o.y !== ny) moves.push({ id: r.id, x: nx, y: ny });
  }
  return { moves, overlapped: true };
}
