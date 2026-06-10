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
  /**
   * Estimated rendered height (flow-px). When supplied, columns are packed by a
   * running Y cursor (each row spaced by `(prevH + thisH)/2 + rowGap`) so a tall
   * multi-port Block gets proportionally more vertical room and never overlaps
   * the row below — the fix for height-blind stacking. Omitted ⇒ falls back to a
   * uniform `rowGap` pitch (legacy behaviour, used by callers without sizes).
   */
  height?: number;
  /** Estimated rendered width (flow-px). Reserved for height-aware H-packing. */
  width?: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

/**
 * T12 — auto-layout flow direction. "horizontal" lays out signal flow into
 * left-to-right columns (the classic Element default); "vertical" lays it out
 * top-to-bottom. Vertical is computed by running the horizontal layout and then
 * transposing the coordinates, so the layering/ordering logic is shared 1:1.
 */
export type LayoutDirection = "horizontal" | "vertical";

export interface AutoLayoutOptions {
  /** Horizontal gap between layer columns (px). */
  columnGap?: number;
  /** Vertical gap between rows within a column (px). */
  rowGap?: number;
  /** Top-left origin the layout is offset to. */
  originX?: number;
  originY?: number;
  /**
   * T12 — flow direction. "horizontal" (default) = left-to-right columns;
   * "vertical" = top-to-bottom. Vertical transposes the horizontal result.
   */
  direction?: LayoutDirection;
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
// Assumed row height (flow-px) when a node carries no `height` — keeps the
// running-cursor pack equivalent to the legacy uniform pitch for height-less
// callers (height-less rows advance by `rowGap` exactly, as before).
const FALLBACK_ROW_HEIGHT = 0;
// Disconnected nodes are spread into a grid this many columns wide (instead of
// one tall stacked column) so a fresh board's unconnected IO blocks read as a
// tidy block, not a pile. Kept small so the grid stays compact + scannable.
const DISCONNECTED_GRID_COLS = 2;

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

  // Estimated height per node (flow-px) for height-aware row packing. A node
  // without a `height` advances by `rowGap` exactly, so height-less callers keep
  // the legacy uniform pitch.
  const heightById = new Map<string, number>();
  for (const n of nodes) heightById.set(n.id, n.height ?? FALLBACK_ROW_HEIGHT);
  const heightOf = (id: string) => heightById.get(id) ?? FALLBACK_ROW_HEIGHT;

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

  // Split DISCONNECTED nodes (no in AND no out edge) out of the layered flow.
  // Layered longest-path leaves every one at layer 0, so they'd otherwise pile
  // into a single stacked column (the fresh-board "all IO blocks at layer 0"
  // bug). Connected nodes flow left→right by signal layer; disconnected nodes
  // get their own compact grid placed AFTER the flow columns.
  const connectedIds: string[] = [];
  const disconnectedIds: string[] = [];
  for (const id of ids) {
    if (outgoing.get(id)!.length > 0 || incoming.get(id)!.length > 0) {
      connectedIds.push(id);
    } else {
      disconnectedIds.push(id);
    }
  }

  // ── 1. Layer assignment (longest path from sources, cycle-safe) ───────────
  // Computed over the CONNECTED nodes only (disconnected nodes are gridded
  // separately, below).
  const layer = new Map<string, number>();
  for (const id of connectedIds) layer.set(id, 0);

  // Relax in input order, repeating until stable or a bounded number of
  // passes (N passes guarantees longest-path convergence on a DAG; the bound
  // also terminates if a cycle exists).
  const maxPasses = connectedIds.length;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const u of connectedIds) {
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

  // Bucket connected nodes by layer, preserving input order within each layer.
  const maxLayer = connectedIds.length
    ? Math.max(...connectedIds.map((id) => layer.get(id)!))
    : -1;
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of connectedIds) layers[layer.get(id)!].push(id);

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
  // Pack each column by a RUNNING Y cursor using the per-node height so a tall
  // multi-port Block claims proportionally more vertical room (and never
  // overlaps the row below). `rowGap` is the inter-block GUTTER here, not the
  // pitch. Each column is then centred around `originY` for balance. With
  // height-less nodes (height 0) this reduces to the legacy uniform `rowGap`
  // pitch, so existing callers/tests are unaffected.
  const posById = new Map<string, LayoutPosition>();

  /**
   * Assign Y to a vertical run of ids (top-anchored at `top`), packing each row
   * by its own height + the gutter. Returns the total height consumed so the
   * caller can centre the run. The y stored is the row's TOP-LEFT y (matching
   * how positions are consumed as React Flow node origins).
   */
  const packColumn = (col: string[], x: number, top: number): number => {
    let cursor = top;
    for (let i = 0; i < col.length; i++) {
      const id = col[i];
      const h = heightOf(id);
      posById.set(id, { id, x, y: cursor });
      cursor += h + rowGap;
    }
    // Total span = sum(heights) + gutters between rows (one fewer than rows).
    return cursor - top - (col.length > 0 ? rowGap : 0);
  };

  for (let l = 0; l < layers.length; l++) {
    const col = layers[l];
    if (col.length === 0) continue;
    // Span of this column when packed by real heights → centre around originY.
    let span = 0;
    for (const id of col) span += heightOf(id);
    span += (col.length - 1) * rowGap;
    packColumn(col, originX + l * columnGap, originY - span / 2);
  }

  // ── 3b. Disconnected nodes → ALIGNED grid (same row Y across columns) ─────
  // Placed to the RIGHT of the flow columns (or at the origin when the whole
  // board is disconnected). Nodes are sorted for readability (IO grouped by
  // type) then distributed row-major into DISCONNECTED_GRID_COLS columns.
  //
  // Alignment guarantee: row pitch[r] = max(height of all nodes in row r) +
  // rowGap, and every block in row r snaps to the SAME topY[r], regardless of
  // which column it lives in. This prevents a tall block in col-0 from pushing
  // col-0 rows out of alignment with col-1 rows (the "MIDI Out floats" bug).
  if (disconnectedIds.length > 0) {
    const gridOriginX =
      layers.length > 0 ? originX + layers.length * columnGap : originX;
    const numCols = Math.min(DISCONNECTED_GRID_COLS, disconnectedIds.length);

    // Sort disconnected nodes for a legible, intentional-looking arrangement.
    // Group: Audio I/O (name contains "audio") → MIDI I/O (name contains
    // "midi") → everything else, preserving original order within each group.
    // We only have IDs here (no display name), so sort by a simple heuristic:
    // nodes whose id contains "audio" first, then "midi", then the rest.
    const sortedIds = [...disconnectedIds].sort((a, b) => {
      const rank = (id: string) => {
        const lo = id.toLowerCase();
        if (lo.includes("audio")) return 0;
        if (lo.includes("midi")) return 1;
        return 2;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      // Within the same group keep stable original order.
      return disconnectedIds.indexOf(a) - disconnectedIds.indexOf(b);
    });

    // Distribute row-major: row = Math.floor(i / numCols), col = i % numCols.
    const numRows = Math.ceil(sortedIds.length / numCols);

    // 1. Compute row pitch[r] = max height across all nodes in row r + rowGap.
    const rowPitch: number[] = [];
    for (let r = 0; r < numRows; r++) {
      let maxH = 0;
      for (let c = 0; c < numCols; c++) {
        const idx = r * numCols + c;
        if (idx >= sortedIds.length) continue;
        maxH = Math.max(maxH, heightOf(sortedIds[idx]));
      }
      rowPitch.push(maxH + rowGap);
    }

    // 2. Compute absolute topY[r] from the running pitch sum (top-anchored).
    const rowTopY: number[] = [];
    let cursor = 0;
    for (let r = 0; r < numRows; r++) {
      rowTopY.push(cursor);
      cursor += rowPitch[r];
    }

    // 3. Place every node at (gridOriginX + c*columnGap, rowTopY[r]).
    for (let i = 0; i < sortedIds.length; i++) {
      const id = sortedIds[i];
      const r = Math.floor(i / numCols);
      const c = i % numCols;
      posById.set(id, {
        id,
        x: gridOriginX + c * columnGap,
        y: rowTopY[r],
      });
    }
  }

  // Shift everything so the minimum Y is at originY (no negative coords).
  let minY = Infinity;
  for (const p of posById.values()) minY = Math.min(minY, p.y);
  const yShift = Number.isFinite(minY) ? originY - minY : 0;

  // ── 4. Direction transpose (T12) ──────────────────────────────────────────
  // The packing above lays signal flow into left-to-right COLUMNS (x = layer
  // axis, y = order axis). For a vertical (top-to-bottom) flow we transpose the
  // coordinates about the origin: the layer axis becomes Y (flow runs down) and
  // the within-layer order becomes X. The layering/ordering work is unchanged —
  // only the final coordinate mapping differs — so both directions share one
  // deterministic core.
  const vertical = opts.direction === "vertical";

  // Return in input order for stable, predictable output.
  return ids.map((id) => {
    const p = posById.get(id)!;
    const x = p.x;
    const y = p.y + yShift;
    if (!vertical) return { id, x, y };
    // Transpose about the origin so the result still starts at (originX, originY).
    return { id, x: originX + (y - originY), y: originY + (x - originX) };
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
