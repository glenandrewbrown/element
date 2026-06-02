/**
 * autoLayout — deterministic layered (Sugiyama-lite) graph layout.
 *
 * G3c item 4. Computes left-to-right layered positions for the REAL current
 * Board graph (React Flow nodes + edges from useGraphStore) so the
 * "Auto-Layout" action can arrange a tangled patch into readable signal-flow
 * columns. No new dependency — pure TS over the existing node/edge arrays. The
 * output is consumed by nativeGraphAutoLayout / nativeGraphMoveNodes, which
 * call the real n.setPosition() path (so positions persist with the project).
 *
 * Algorithm (deterministic for a given input — same graph → same positions):
 *   1. Layer assignment: longest-path from source nodes over the edge DAG.
 *      Cycles are broken by ignoring back-edges encountered during the
 *      longest-path relaxation (a node never moves left of an already-assigned
 *      layer), so a feedback cable can't loop the computation forever.
 *   2. Within-layer ordering: a fixed number of barycenter sweeps that order
 *      each layer by the mean position of its predecessors, reducing crossings.
 *      Ties (and the first layer) keep input order — fully deterministic.
 *   3. Coordinate assignment: layer index → X (column), order index → Y (row),
 *      using fixed gaps. The whole block is offset to a small positive origin.
 */

export interface LayoutNode {
  id: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface AutoLayoutOptions {
  /** Horizontal gap between layer columns (px). */
  columnGap?: number;
  /** Vertical gap between rows within a column (px). */
  rowGap?: number;
  /** Top-left origin the layout is offset to. */
  originX?: number;
  originY?: number;
}

export interface LayoutPosition {
  id: string;
  x: number;
  y: number;
}

const DEFAULT_COLUMN_GAP = 280;
const DEFAULT_ROW_GAP = 140;
const DEFAULT_ORIGIN = 80;
const BARYCENTER_SWEEPS = 4;

/**
 * Compute deterministic layered positions for the given nodes + edges.
 * Returns one {id,x,y} per input node (order matches input node order).
 * For 0 nodes returns an empty array — the caller treats that as the honest
 * "Board is empty" disabled state rather than fabricating positions.
 */
export function computeAutoLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: AutoLayoutOptions = {},
): LayoutPosition[] {
  if (nodes.length === 0) return [];

  const columnGap = opts.columnGap ?? DEFAULT_COLUMN_GAP;
  const rowGap = opts.rowGap ?? DEFAULT_ROW_GAP;
  const originX = opts.originX ?? DEFAULT_ORIGIN;
  const originY = opts.originY ?? DEFAULT_ORIGIN;

  // Stable node id list (preserves caller order → deterministic ordering ties).
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);

  // Adjacency over edges whose endpoints both exist (ignore dangling cables).
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of ids) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const e of edges) {
    if (e.source === e.target) continue; // self-loop: not a layering edge
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
  }

  // ── 1. Layer assignment (longest path from sources, cycle-safe) ───────────
  const layer = new Map<string, number>();
  for (const id of ids) layer.set(id, 0);

  // Relax in input order, repeating until stable or a bounded number of
  // passes (N passes guarantees longest-path convergence on a DAG; the bound
  // also terminates if a cycle exists).
  const maxPasses = ids.length;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const u of ids) {
      const lu = layer.get(u)!;
      for (const v of outgoing.get(u)!) {
        if (layer.get(v)! < lu + 1) {
          layer.set(v, lu + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Bucket nodes by layer, preserving input order within each layer.
  const maxLayer = Math.max(...ids.map((id) => layer.get(id)!));
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of ids) layers[layer.get(id)!].push(id);

  // ── 2. Within-layer ordering: barycenter sweeps to reduce crossings ───────
  // order.get(id) = the node's index within its layer.
  const order = new Map<string, number>();
  for (const col of layers) col.forEach((id, i) => order.set(id, i));

  for (let sweep = 0; sweep < BARYCENTER_SWEEPS; sweep++) {
    // Forward sweep: order each layer by mean order of its predecessors.
    for (let l = 1; l < layers.length; l++) {
      sortLayerByBarycenter(layers[l], order, incoming);
      layers[l].forEach((id, i) => order.set(id, i));
    }
    // Backward sweep: order by mean order of successors.
    for (let l = layers.length - 2; l >= 0; l--) {
      sortLayerByBarycenter(layers[l], order, outgoing);
      layers[l].forEach((id, i) => order.set(id, i));
    }
  }

  // ── 3. Coordinate assignment ──────────────────────────────────────────────
  const posById = new Map<string, LayoutPosition>();
  for (let l = 0; l < layers.length; l++) {
    const col = layers[l];
    // Centre each column vertically around the tallest column for balance.
    const colHeight = (col.length - 1) * rowGap;
    const colTop = originY - colHeight / 2;
    col.forEach((id, i) => {
      posById.set(id, {
        id,
        x: originX + l * columnGap,
        y: colTop + i * rowGap,
      });
    });
  }

  // Shift everything so the minimum Y is at originY (no negative coords).
  let minY = Infinity;
  for (const p of posById.values()) minY = Math.min(minY, p.y);
  const yShift = Number.isFinite(minY) ? originY - minY : 0;

  // Return in input order for stable, predictable output.
  return ids.map((id) => {
    const p = posById.get(id)!;
    return { id, x: p.x, y: p.y + yShift };
  });
}

/**
 * Sort a layer in place by the barycenter (mean neighbour order) of each
 * node's neighbours in `neighbours`. Nodes with no neighbours keep their
 * current relative order (stable), so the result is deterministic.
 */
function sortLayerByBarycenter(
  col: string[],
  order: Map<string, number>,
  neighbours: Map<string, string[]>,
): void {
  // Precompute barycenter once per node so the comparator is pure/stable.
  const bary = new Map<string, number>();
  col.forEach((id, idx) => {
    const ns = neighbours.get(id) ?? [];
    if (ns.length === 0) {
      // Keep in place: use current index so it doesn't jump.
      bary.set(id, idx);
      return;
    }
    let sum = 0;
    for (const n of ns) sum += order.get(n) ?? 0;
    bary.set(id, sum / ns.length);
  });
  // Stable sort by barycenter; ties fall back to current index.
  const indexed = col.map((id, idx) => ({ id, idx, b: bary.get(id)! }));
  indexed.sort((a, b) => (a.b !== b.b ? a.b - b.b : a.idx - b.idx));
  for (let i = 0; i < indexed.length; i++) col[i] = indexed[i].id;
}
