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
  /**
   * IO role of this node, derived by the caller from the engine `identifier`
   * (audio.input/midi.input ⇒ "input"; audio.output/midi.output ⇒ "output").
   * Governs ONLY the placement of DISCONNECTED nodes (Glen 2026-06-10): IO
   * inputs anchor to the far LEFT edge, IO outputs to the far RIGHT, leaving a
   * wide-open middle as the workspace. Non-IO disconnected nodes (io absent)
   * are parked in a single loose row along the BOTTOM of the IO span so the
   * middle stays clear for the user's chain. Connected nodes ignore this field
   * (their position comes from signal-layer flow). Omitted ⇒ a non-IO node.
   */
  io?: "input" | "output";
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
  /**
   * Minimum flow-px span between the IO INPUT anchor (far left) and the IO
   * OUTPUT anchor (far right) for the disconnected/default-session arrangement
   * (Glen 2026-06-10). Guarantees a wide-open middle workspace so a user can
   * drop a chain BETWEEN the input and output blocks (the standard workflow).
   * The span is widened automatically if the connected signal-flow columns are
   * wider than this, so outputs never collide with the flow.
   */
  anchorSpan?: number;
  /**
   * Horizontal spacing between parked non-IO disconnected blocks in the loose
   * bottom row (px). Generous by default so the parked row reads as a relaxed
   * shelf, not a tight grid.
   */
  parkGap?: number;
}

export interface LayoutPosition {
  id: string;
  x: number;
  y: number;
}

/**
 * Map an engine node `identifier` to its IO role for the disconnected-placement
 * model (Glen 2026-06-10). The four built-in IO nodes carry the identifiers
 * `audio.input` / `midi.input` (graph INPUTS) and `audio.output` / `midi.output`
 * (graph OUTPUTS), set host-side in ionode.cpp / graphmanager.cpp. Any other
 * identifier (a plugin, a utility) is NOT an IO node → undefined. Callers feed
 * the result as `LayoutNode.io` so anchors snap to the edges.
 */
export function ioRoleFromIdentifier(
  identifier: string | undefined,
): "input" | "output" | undefined {
  if (identifier === "audio.input" || identifier === "midi.input") {
    return "input";
  }
  if (identifier === "audio.output" || identifier === "midi.output") {
    return "output";
  }
  return undefined;
}

const DEFAULT_COLUMN_GAP = 280;
const DEFAULT_ROW_GAP = 140;
const DEFAULT_ORIGIN = 80;
const BARYCENTER_SWEEPS = 4;
// Assumed row height (flow-px) when a node carries no `height` — keeps the
// running-cursor pack equivalent to the legacy uniform pitch for height-less
// callers (height-less rows advance by `rowGap` exactly, as before).
const FALLBACK_ROW_HEIGHT = 0;
// Disconnected/default-session placement model (Glen 2026-06-10 — replaces the
// hated parallel-column "aligned grid"). IO inputs anchor far LEFT, outputs far
// RIGHT, with a wide-open middle; non-IO disconnected blocks park in one loose
// row along the BOTTOM. "stacking unconnected blocks in parallel lines will
// NEVER be something a user would want."
//
// Minimum flow-px between the input anchor (left) and output anchor (right) —
// the open workspace the user drops their chain into.
const DEFAULT_ANCHOR_SPAN = 960;
// Vertical gutter between stacked IO anchors (between Audio In and MIDI In, etc.)
// — generous so the inputs read as spaced, not crammed.
const DEFAULT_IO_STACK_GAP = 80;
// Horizontal spacing between parked non-IO disconnected blocks along the bottom.
const DEFAULT_PARK_GAP = 80;
// Vertical clearance from the bottom of the lowest main-flow / IO content to the
// top of the parked loose row, so parked blocks sit clearly BELOW the flow line.
const PARK_ROW_CLEARANCE = 120;
// Assumed block width (flow-px) when a node carries no `width` — used to lay the
// parked loose row out without overlap. Mirrors autoRouteSuggestions BLOCK_REF_WIDTH.
const FALLBACK_BLOCK_WIDTH = 200;

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
  const anchorSpan = opts.anchorSpan ?? DEFAULT_ANCHOR_SPAN;
  const parkGap = opts.parkGap ?? DEFAULT_PARK_GAP;

  // IO role per node (caller-supplied, derived from the engine identifier).
  const ioById = new Map<string, "input" | "output">();
  for (const n of nodes) if (n.io) ioById.set(n.id, n.io);
  // Block width per node (flow-px) for laying out the parked loose row.
  const widthById = new Map<string, number>();
  for (const n of nodes) widthById.set(n.id, n.width ?? FALLBACK_BLOCK_WIDTH);
  const widthOf = (id: string) => widthById.get(id) ?? FALLBACK_BLOCK_WIDTH;

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

  // ── 3b. Disconnected nodes → IO-ANCHOR + parked-bottom-row model ──────────
  // (Glen 2026-06-10, replaces the parallel-column "aligned grid".)
  //   • IO INPUTS  (audio.input / midi.input)  → far LEFT column, stacked.
  //   • IO OUTPUTS (audio.output / midi.output) → far RIGHT column, stacked.
  //   • Non-IO disconnected blocks → a single LOOSE ROW along the BOTTOM of the
  //     IO span, generously spaced, so the wide middle stays clear for the
  //     user's chain ("input and output spaced apart so it's easy to place new
  //     blocks between them — the standard workflow").
  // Connected signal-flow columns (placed above) keep their layered positions;
  // we only widen the right anchor so outputs never collide with that flow.
  if (disconnectedIds.length > 0) {
    const ioInputs: string[] = [];
    const ioOutputs: string[] = [];
    const parked: string[] = [];
    for (const id of disconnectedIds) {
      const role = ioById.get(id);
      if (role === "input") ioInputs.push(id);
      else if (role === "output") ioOutputs.push(id);
      else parked.push(id);
    }

    // Left edge = the flow origin (so disconnected inputs line up with the start
    // of any connected chain). The flow already occupies columns 0..maxLayer.
    const flowRightX =
      layers.length > 0 ? originX + (layers.length - 1) * columnGap : originX;
    const leftX = originX;
    // Right anchor must clear BOTH the requested anchorSpan AND the connected
    // flow's rightmost column, so outputs are never on top of the flow.
    const rightX = Math.max(leftX + anchorSpan, flowRightX + columnGap);

    // Stack a set of IO blocks vertically at `x`, centred around originY, packed
    // by real height + the generous IO stack gutter (never overlapping).
    const stackIO = (col: string[], x: number) => {
      if (col.length === 0) return;
      let span = 0;
      for (const id of col) span += heightOf(id);
      span += (col.length - 1) * DEFAULT_IO_STACK_GAP;
      let cursor = originY - span / 2;
      for (const id of col) {
        posById.set(id, { id, x, y: cursor });
        cursor += heightOf(id) + DEFAULT_IO_STACK_GAP;
      }
    };
    stackIO(ioInputs, leftX);
    stackIO(ioOutputs, rightX);

    // Park non-IO disconnected blocks in ONE loose row along the bottom. The row
    // sits clearly BELOW the lowest content placed so far (flow columns + IO
    // anchors), spanning left→right with generous horizontal spacing. Blocks
    // share a baseline top-Y so the row reads as a flat shelf, not a stack.
    if (parked.length > 0) {
      let contentBottom = -Infinity;
      for (const p of posById.values()) {
        contentBottom = Math.max(contentBottom, p.y + heightOf(p.id));
      }
      // If nothing else was placed (board is ONLY parked blocks), anchor the row
      // at the origin instead of below empty space.
      const rowTopY = Number.isFinite(contentBottom)
        ? contentBottom + PARK_ROW_CLEARANCE
        : originY;
      let cursorX = leftX;
      for (const id of parked) {
        posById.set(id, { id, x: cursorX, y: rowTopY });
        cursorX += widthOf(id) + parkGap;
      }
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
